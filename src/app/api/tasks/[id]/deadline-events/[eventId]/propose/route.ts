import { NextResponse } from 'next/server'
import { validate as isUuid } from 'uuid'
import { queryOne, withTransaction } from '@/lib/db'
import { requireTeamMemberByTeamId } from '@/lib/auth/team-access'
import {
  DeadlineChoiceValidationError,
  resolveDeadlineChoiceInput,
  type StoredDeadlineSuggestion,
} from '@/lib/task-deadline-events'

class ProposalConflictError extends Error {}

export async function POST(req: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const { id, eventId } = await params
  if (!isUuid(id) || !isUuid(eventId)) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const event = await queryOne<{ task_id: string; phase: string; round: number; resolved_at: string | null; suggestions: StoredDeadlineSuggestion[] }>(
    'SELECT task_id, phase, round, resolved_at, suggestions FROM task_deadline_events WHERE id = $1',
    [eventId]
  )
  if (!event || event.task_id !== id) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const task = await queryOne<{ team_id: string }>('SELECT team_id FROM tasks WHERE id = $1', [id])
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const membership = await requireTeamMemberByTeamId(task.team_id)
  if (!membership) return NextResponse.json({ error: 'Not authorized for this team' }, { status: 403 })

  if (event.resolved_at || event.phase !== 'proposing') {
    return NextResponse.json({ error: 'The team is still voting — nothing to propose yet' }, { status: 409 })
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
      // Advisory-locked re-check so two members proposing at once don't both
      // create a pending proposal for the same round.
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [eventId])

      const eventRows = await tx.query<{ round: number; resolved_at: string | null; phase: string }>(
        'SELECT round, resolved_at, phase FROM task_deadline_events WHERE id = $1',
        [eventId]
      )
      const current = eventRows[0]
      if (!current || current.resolved_at || current.phase !== 'proposing') throw new ProposalConflictError()

      const pending = await tx.query(
        `SELECT id FROM task_deadline_proposals WHERE event_id = $1 AND round = $2 AND status = 'pending'`,
        [eventId, current.round]
      )
      if (pending.length > 0) throw new ProposalConflictError()

      // Only an option that actually got a vote in round 1 can be proposed.
      const votedKeys = await tx.query<{ choice_key: string }>(
        'SELECT DISTINCT choice_key FROM task_deadline_votes WHERE event_id = $1',
        [eventId]
      )
      if (!votedKeys.some(v => v.choice_key === choice.choiceKey)) {
        throw new DeadlineChoiceValidationError("That option wasn't voted for in the previous round")
      }

      await tx.query(
        `INSERT INTO task_deadline_proposals (event_id, round, proposed_by, choice_key, choice_payload)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [eventId, current.round, membership.memberId, choice.choiceKey, JSON.stringify(choice.choicePayload)]
      )
    })
  } catch (err) {
    if (err instanceof ProposalConflictError) {
      return NextResponse.json({ error: 'A proposal is already pending for this round' }, { status: 409 })
    }
    if (err instanceof DeadlineChoiceValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    throw err
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
