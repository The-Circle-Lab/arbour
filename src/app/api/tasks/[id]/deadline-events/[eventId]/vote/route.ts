import { NextResponse } from 'next/server'
import { validate as isUuid } from 'uuid'
import { queryOne, withTransaction } from '@/lib/db'
import { requireTeamMemberByTeamId } from '@/lib/auth/team-access'
import {
  DeadlineChoiceValidationError,
  applyDeadlineChoiceEffect,
  resolutionFromPayload,
  resolveDeadlineChoiceInput,
  type StoredDeadlineSuggestion,
} from '@/lib/task-deadline-events'

class NotVotableError extends Error {}

export async function POST(req: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const { id, eventId } = await params
  if (!isUuid(id) || !isUuid(eventId)) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const event = await queryOne<{ task_id: string; phase: string; resolved_at: string | null; suggestions: StoredDeadlineSuggestion[] }>(
    'SELECT task_id, phase, resolved_at, suggestions FROM task_deadline_events WHERE id = $1',
    [eventId]
  )
  if (!event || event.task_id !== id) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const task = await queryOne<{ team_id: string; status: string; assigned_to: string | null }>(
    'SELECT team_id, status, assigned_to FROM tasks WHERE id = $1',
    [id]
  )
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const membership = await requireTeamMemberByTeamId(task.team_id)
  if (!membership) return NextResponse.json({ error: 'Not authorized for this team' }, { status: 403 })

  if (event.resolved_at || event.phase !== 'voting') {
    return NextResponse.json({ error: 'Voting has closed for this event' }, { status: 409 })
  }

  let choice
  try {
    const body = await req.json()
    choice = await resolveDeadlineChoiceInput(body, { teamId: task.team_id, suggestions: event.suggestions })
  } catch (err) {
    if (err instanceof DeadlineChoiceValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    throw err
  }

  try {
    await withTransaction(async tx => {
      const rows = await tx.query<{ phase: string; resolved_at: string | null }>(
        'SELECT phase, resolved_at FROM task_deadline_events WHERE id = $1 FOR UPDATE',
        [eventId]
      )
      const current = rows[0]
      if (!current || current.resolved_at || current.phase !== 'voting') throw new NotVotableError()

      await tx.query(
        `INSERT INTO task_deadline_votes (event_id, member_id, choice_key, choice_payload)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (event_id, member_id) WHERE member_id IS NOT NULL DO UPDATE
           SET choice_key = EXCLUDED.choice_key, choice_payload = EXCLUDED.choice_payload, updated_at = NOW()`,
        [eventId, membership.memberId, choice.choiceKey, JSON.stringify(choice.choicePayload)]
      )

      const teamRows = await tx.query<{ team_size: number }>(
        'SELECT COUNT(*)::int AS team_size FROM members WHERE team_id = $1',
        [task.team_id]
      )
      const votes = await tx.query<{ choice_key: string; choice_payload: Record<string, unknown> }>(
        'SELECT choice_key, choice_payload FROM task_deadline_votes WHERE event_id = $1',
        [eventId]
      )
      if (votes.length < teamRows[0].team_size) return // still waiting on others

      const distinctKeys = new Set(votes.map(v => v.choice_key))
      if (distinctKeys.size === 1) {
        const payload = votes[0].choice_payload as Parameters<typeof applyDeadlineChoiceEffect>[3]
        await applyDeadlineChoiceEffect(tx, id, task, payload)
        await tx.query(
          `UPDATE task_deadline_events
           SET resolved_at = NOW(), resolution = $2, resolution_detail = $3::jsonb, resolved_by = $4
           WHERE id = $1`,
          [eventId, resolutionFromPayload(payload), JSON.stringify(payload), membership.memberId]
        )
      } else {
        await tx.query(`UPDATE task_deadline_events SET phase = 'proposing' WHERE id = $1`, [eventId])
      }
    })
  } catch (err) {
    if (err instanceof NotVotableError) {
      return NextResponse.json({ error: 'Voting has closed for this event' }, { status: 409 })
    }
    throw err
  }

  return NextResponse.json({ ok: true })
}
