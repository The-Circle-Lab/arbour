import { NextResponse } from 'next/server'
import { validate as isUuid } from 'uuid'
import { queryOne, query } from '@/lib/db'
import { requireTeamMemberByTeamId } from '@/lib/auth/team-access'

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

  const task = await queryOne<{ team_id: string; status: string }>('SELECT team_id, status FROM tasks WHERE id = $1', [id])
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const membership = await requireTeamMemberByTeamId(task.team_id)
  if (!membership) return NextResponse.json({ error: 'Not authorized for this team' }, { status: 403 })

  if (submission.submitted_by && submission.submitted_by === membership.memberId) {
    return NextResponse.json({ error: "You can't comment on your own submission" }, { status: 403 })
  }

  if (task.status !== 'submitted') {
    return NextResponse.json({ error: 'This submission has already been resolved' }, { status: 409 })
  }

  const { comment } = await req.json()
  const trimmed = typeof comment === 'string' ? comment.trim() : ''
  if (!trimmed) return NextResponse.json({ error: 'comment required' }, { status: 400 })

  await query(
    'INSERT INTO task_submission_comments (submission_id, member_id, comment) VALUES ($1, $2, $3)',
    [submissionId, membership.memberId, trimmed]
  )

  return NextResponse.json({ ok: true }, { status: 201 })
}
