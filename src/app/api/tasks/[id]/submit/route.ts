import { NextResponse } from 'next/server'
import { validate as isUuid } from 'uuid'
import { queryOne, withTransaction } from '@/lib/db'
import { requireTeamMemberByTeamId } from '@/lib/auth/team-access'
import { isSubmittable, type TaskStatus } from '@/lib/task-status'

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const task = await queryOne<{ team_id: string; status: TaskStatus }>(
    'SELECT team_id, status FROM tasks WHERE id = $1',
    [id]
  )
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const membership = await requireTeamMemberByTeamId(task.team_id)
  if (!membership) return NextResponse.json({ error: 'Not authorized for this team' }, { status: 403 })

  if (!isSubmittable(task.status)) {
    return NextResponse.json({ error: 'Task has already been submitted' }, { status: 409 })
  }

  const { content, url } = await req.json()
  if (typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: 'content required' }, { status: 400 })
  }
  const trimmedUrl = typeof url === 'string' ? url.trim() : ''
  if (trimmedUrl && !isValidHttpUrl(trimmedUrl)) {
    return NextResponse.json({ error: 'url must be a valid http(s) URL' }, { status: 400 })
  }

  // Deliberately does not clear task_approvals — submission happens after the
  // team has approved the task list, and clearing here would flip
  // tasksApproved false and regress the team's phase (src/lib/phase.ts) back
  // from CHECKIN_1 to TASKS.
  await withTransaction(async tx => {
    await tx.query(
      `INSERT INTO task_submissions (task_id, submitted_by, content, url)
       VALUES ($1, $2, $3, $4)`,
      [id, membership.memberId, content.trim(), trimmedUrl || null]
    )
    await tx.query(
      `UPDATE tasks SET status = 'submitted', updated_at = NOW() WHERE id = $1`,
      [id]
    )
  })

  return NextResponse.json({ ok: true }, { status: 201 })
}
