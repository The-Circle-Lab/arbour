import { NextResponse } from 'next/server'
import { validate as isUuid } from 'uuid'
import { queryOne, withTransaction } from '@/lib/db'
import { requireTeamMemberByTeamId } from '@/lib/auth/team-access'
import { applyDeadlineChoiceEffect, resolutionFromPayload, type DeadlineChoicePayload } from '@/lib/task-deadline-events'

class ProposalNotPendingError extends Error {}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; eventId: string; proposalId: string }> }
) {
  const { id, eventId, proposalId } = await params
  if (!isUuid(id) || !isUuid(eventId) || !isUuid(proposalId)) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  }

  const event = await queryOne<{ task_id: string }>('SELECT task_id FROM task_deadline_events WHERE id = $1', [eventId])
  if (!event || event.task_id !== id) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const task = await queryOne<{ team_id: string; status: string; assigned_to: string | null }>(
    'SELECT team_id, status, assigned_to FROM tasks WHERE id = $1',
    [id]
  )
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const membership = await requireTeamMemberByTeamId(task.team_id)
  if (!membership) return NextResponse.json({ error: 'Not authorized for this team' }, { status: 403 })

  const proposal = await queryOne<{ event_id: string; proposed_by: string | null; status: string; choice_payload: DeadlineChoicePayload }>(
    'SELECT event_id, proposed_by, status, choice_payload FROM task_deadline_proposals WHERE id = $1',
    [proposalId]
  )
  if (!proposal || proposal.event_id !== eventId) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })

  if (proposal.proposed_by && proposal.proposed_by === membership.memberId) {
    return NextResponse.json({ error: 'You proposed this option — no need to respond' }, { status: 403 })
  }

  const { response } = await req.json()
  if (response !== 'agree' && response !== 'disagree') {
    return NextResponse.json({ error: 'response must be "agree" or "disagree"' }, { status: 400 })
  }

  try {
    await withTransaction(async tx => {
      const rows = await tx.query<{ status: string }>('SELECT status FROM task_deadline_proposals WHERE id = $1 FOR UPDATE', [proposalId])
      if (rows[0]?.status !== 'pending') throw new ProposalNotPendingError()

      await tx.query(
        `INSERT INTO task_deadline_proposal_responses (proposal_id, member_id, response)
         VALUES ($1, $2, $3)
         ON CONFLICT (proposal_id, member_id) WHERE member_id IS NOT NULL DO UPDATE SET response = EXCLUDED.response`,
        [proposalId, membership.memberId, response]
      )

      if (response === 'disagree') {
        await tx.query(`UPDATE task_deadline_proposals SET status = 'rejected' WHERE id = $1`, [proposalId])
        await tx.query('UPDATE task_deadline_events SET round = round + 1 WHERE id = $1', [eventId])
        return
      }

      // Every current team member except the proposer must agree.
      const teamRows = await tx.query<{ team_size: number }>(
        'SELECT COUNT(*)::int AS team_size FROM members WHERE team_id = $1 AND id IS DISTINCT FROM $2',
        [task.team_id, proposal.proposed_by]
      )
      const agreeRows = await tx.query<{ agreed: number }>(
        `SELECT COUNT(*)::int AS agreed FROM task_deadline_proposal_responses WHERE proposal_id = $1 AND response = 'agree'`,
        [proposalId]
      )
      if (agreeRows[0].agreed < teamRows[0].team_size) return // still waiting on others

      await tx.query(`UPDATE task_deadline_proposals SET status = 'accepted' WHERE id = $1`, [proposalId])
      await applyDeadlineChoiceEffect(tx, id, task, proposal.choice_payload)
      await tx.query(
        `UPDATE task_deadline_events
         SET resolved_at = NOW(), resolution = $2, resolution_detail = $3::jsonb, resolved_by = $4
         WHERE id = $1`,
        [eventId, resolutionFromPayload(proposal.choice_payload), JSON.stringify(proposal.choice_payload), proposal.proposed_by]
      )
    })
  } catch (err) {
    if (err instanceof ProposalNotPendingError) {
      return NextResponse.json({ error: 'This proposal is no longer active' }, { status: 409 })
    }
    throw err
  }

  return NextResponse.json({ ok: true })
}
