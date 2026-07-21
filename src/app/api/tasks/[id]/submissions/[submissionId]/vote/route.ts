import { NextResponse } from 'next/server'
import { validate as isUuid } from 'uuid'
import { queryOne, withTransaction } from '@/lib/db'
import { requireTeamMemberByTeamId } from '@/lib/auth/team-access'
import { applyPlantHealthDelta } from '@/lib/plant-health'

class AlreadyResolvedError extends Error {}

export async function POST(req: Request, { params }: { params: Promise<{ id: string; submissionId: string }> }) {
  const { id, submissionId } = await params
  if (!isUuid(id) || !isUuid(submissionId)) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  const submission = await queryOne<{ task_id: string; submitted_by: string | null }>(
    'SELECT task_id, submitted_by FROM task_submissions WHERE id = $1',
    [submissionId]
  )
  if (!submission || submission.task_id !== id) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  }

  const task = await queryOne<{ team_id: string }>('SELECT team_id FROM tasks WHERE id = $1', [id])
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const membership = await requireTeamMemberByTeamId(task.team_id)
  if (!membership) return NextResponse.json({ error: 'Not authorized for this team' }, { status: 403 })

  if (submission.submitted_by && submission.submitted_by === membership.memberId) {
    return NextResponse.json({ error: "You can't review your own submission" }, { status: 403 })
  }

  const { vote, reason } = await req.json()
  if (vote !== 'approve' && vote !== 'decline') {
    return NextResponse.json({ error: 'vote must be "approve" or "decline"' }, { status: 400 })
  }
  const trimmedReason = typeof reason === 'string' ? reason.trim() : ''
  if (vote === 'decline' && !trimmedReason) {
    return NextResponse.json({ error: 'A reason is required to decline' }, { status: 400 })
  }

  try {
    await withTransaction(async tx => {
      const rows = await tx.query<{ status: string }>('SELECT status FROM tasks WHERE id = $1 FOR UPDATE', [id])
      if (rows[0]?.status !== 'submitted') throw new AlreadyResolvedError()

      await tx.query(
        `INSERT INTO task_submission_votes (submission_id, member_id, vote, reason)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (submission_id, member_id) WHERE member_id IS NOT NULL DO UPDATE
           SET vote = EXCLUDED.vote, reason = EXCLUDED.reason, updated_at = NOW()`,
        [submissionId, membership.memberId, vote, vote === 'decline' ? trimmedReason : null]
      )

      if (vote === 'decline') {
        // A single decline is a veto — no need to wait on other pending votes.
        await tx.query(`UPDATE tasks SET status = 'in_progress', updated_at = NOW() WHERE id = $1`, [id])
        return
      }

      // Eligible voters are the current roster, excluding the submitter — if
      // the submitter has since left the team, submitted_by is NULL and
      // everyone currently on the team is eligible.
      const eligibleRows = await tx.query<{ eligible: number }>(
        'SELECT COUNT(*)::int AS eligible FROM members WHERE team_id = $1 AND id IS DISTINCT FROM $2',
        [task.team_id, submission.submitted_by]
      )
      const approvedRows = await tx.query<{ approved: number }>(
        `SELECT COUNT(*)::int AS approved FROM task_submission_votes WHERE submission_id = $1 AND vote = 'approve'`,
        [submissionId]
      )
      if (approvedRows[0].approved >= eligibleRows[0].eligible) {
        await tx.query(`UPDATE tasks SET status = 'done', updated_at = NOW() WHERE id = $1`, [id])

        // Only tasks that actually missed a deadline have anything to recover
        // from — finishing a task that was never late doesn't move the plant.
        const outstandingRows = await tx.query<{ outstanding: number }>(
          `SELECT (COUNT(*) FILTER (WHERE source = 'deadline_missed')
                 - COUNT(*) FILTER (WHERE source = 'task_recovered'))::int AS outstanding
           FROM plant_health_events WHERE team_id = $1 AND task_id = $2`,
          [task.team_id, id]
        )
        const outstanding = outstandingRows[0]?.outstanding ?? 0
        if (outstanding > 0) {
          await applyPlantHealthDelta(tx, {
            teamId: task.team_id,
            delta: outstanding,
            source: 'task_recovered',
            taskId: id,
          })
        }
      }
    })
  } catch (err) {
    if (err instanceof AlreadyResolvedError) {
      return NextResponse.json({ error: 'This submission has already been resolved' }, { status: 409 })
    }
    throw err
  }

  return NextResponse.json({ ok: true })
}
