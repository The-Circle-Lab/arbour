import { NextResponse } from 'next/server'
import { validate as isUuid } from 'uuid'
import { query, queryOne } from '@/lib/db'
import { requireTeamMemberByTeamId, isProjectManager } from '@/lib/auth/team-access'
import { toDeadlineUtc } from '@/lib/dates'
import { clearTaskApprovals } from '@/lib/task-approvals'
import { EDITABLE_STATUSES, type TaskStatus } from '@/lib/task-status'

async function loadTask(id: string) {
  if (!isUuid(id)) return null // malformed id, not a real task — same "not found" response as a valid-but-unknown id
  return queryOne<{ team_id: string; status: TaskStatus; assigned_to: string | null }>(
    'SELECT team_id, status, assigned_to FROM tasks WHERE id = $1',
    [id]
  )
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { title, description, status, deadline, assignedTo } = await req.json()

  const task = await loadTask(id)
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const membership = await requireTeamMemberByTeamId(task.team_id)
  if (!membership) return NextResponse.json({ error: 'Not authorized for this team' }, { status: 403 })

  const assignedToProvided = assignedTo !== undefined
  const deadlineProvided = deadline !== undefined
  if (assignedToProvided || deadlineProvided) {
    const pm = await isProjectManager(task.team_id, membership.memberId)
    if (!pm) return NextResponse.json({ error: 'Only the project manager can assign tasks or set deadlines' }, { status: 403 })
  }

  const titleProvided = title !== undefined
  if (titleProvided && (typeof title !== 'string' || !title.trim())) {
    return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 })
  }
  if (status !== undefined && !EDITABLE_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }
  if (assignedTo) {
    if (!isUuid(assignedTo)) {
      return NextResponse.json({ error: 'assignedTo must be a member of this team' }, { status: 400 })
    }
    const assignee = await queryOne('SELECT id FROM members WHERE id = $1 AND team_id = $2', [assignedTo, task.team_id])
    if (!assignee) return NextResponse.json({ error: 'assignedTo must be a member of this team' }, { status: 400 })
  }

  // Reassigning a submitted task to someone else re-opens it for the new
  // assignee — otherwise status stays 'submitted' forever and nothing else
  // in the app ever lets the new assignee submit their own work for it.
  const reopensOnReassign =
    assignedToProvided && (assignedTo || null) !== task.assigned_to && task.status === 'submitted' && status === undefined
  const effectiveStatus = reopensOnReassign ? 'todo' : (status ?? null)

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
      effectiveStatus,
      deadline !== undefined,
      toDeadlineUtc(deadline),
      assignedToProvided,
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

  const pm = await isProjectManager(task.team_id, membership.memberId)
  if (!pm) return NextResponse.json({ error: 'Only the project manager can remove tasks' }, { status: 403 })

  await query('DELETE FROM tasks WHERE id = $1', [id])
  await clearTaskApprovals(task.team_id)

  return NextResponse.json({ ok: true })
}
