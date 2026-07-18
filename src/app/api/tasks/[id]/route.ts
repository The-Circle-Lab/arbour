import { NextResponse } from 'next/server'
import { validate as isUuid } from 'uuid'
import { query, queryOne } from '@/lib/db'
import { requireTeamMemberByTeamId } from '@/lib/auth/team-access'
import { toDeadlineUtc } from '@/lib/dates'
import { clearTaskApprovals } from '@/lib/task-approvals'

const VALID_STATUSES = ['todo', 'in_progress', 'done']

async function loadTask(id: string) {
  if (!isUuid(id)) return null // malformed id, not a real task — same "not found" response as a valid-but-unknown id
  return queryOne<{ team_id: string }>('SELECT team_id FROM tasks WHERE id = $1', [id])
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { title, description, status, deadline, assignedTo } = await req.json()

  const task = await loadTask(id)
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const membership = await requireTeamMemberByTeamId(task.team_id)
  if (!membership) return NextResponse.json({ error: 'Not authorized for this team' }, { status: 403 })

  const titleProvided = title !== undefined
  if (titleProvided && !title.trim()) {
    return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 })
  }
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }
  if (assignedTo) {
    if (!isUuid(assignedTo)) {
      return NextResponse.json({ error: 'assignedTo must be a member of this team' }, { status: 400 })
    }
    const assignee = await queryOne('SELECT id FROM members WHERE id = $1 AND team_id = $2', [assignedTo, task.team_id])
    if (!assignee) return NextResponse.json({ error: 'assignedTo must be a member of this team' }, { status: 400 })
  }

  await query(
    `UPDATE tasks SET
       title = CASE WHEN $2::boolean THEN $3 ELSE title END,
       description = CASE WHEN $4::boolean THEN NULLIF($5, '') ELSE description END,
       status = COALESCE($6::task_status, status),
       deadline = CASE WHEN $7::boolean THEN $8::timestamptz ELSE deadline END,
       assigned_to = CASE WHEN $9::boolean THEN $10::uuid ELSE assigned_to END,
       updated_at = NOW()
     WHERE id = $1`,
    [
      id,
      titleProvided,
      titleProvided ? title.trim() : null,
      description !== undefined,
      description ?? null,
      status ?? null,
      deadline !== undefined,
      toDeadlineUtc(deadline),
      assignedTo !== undefined,
      assignedTo || null,
    ]
  )

  await clearTaskApprovals(task.team_id)

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const task = await loadTask(id)
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const membership = await requireTeamMemberByTeamId(task.team_id)
  if (!membership) return NextResponse.json({ error: 'Not authorized for this team' }, { status: 403 })

  await query('DELETE FROM tasks WHERE id = $1', [id])
  await clearTaskApprovals(task.team_id)

  return NextResponse.json({ ok: true })
}
