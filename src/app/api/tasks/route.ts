import { NextResponse } from 'next/server'
import { validate as isUuid } from 'uuid'
import { query, queryOne } from '@/lib/db'
import { requireTeamMember, requireTeamMemberByTeamId } from '@/lib/auth/team-access'
import { toDeadlineUtc, formatDeadlineLocal } from '@/lib/dates'
import { clearTaskApprovals, listTaskApprovers } from '@/lib/task-approvals'
import type { TaskSubmission } from '@/lib/task-status'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 })

  const membership = await requireTeamMember(code)
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const tasks = await query<{
    id: string
    title: string
    description: string | null
    status: string
    deadline: string | null
    assigned_to: string | null
    assignee_display_name: string | null
    created_by: string | null
    created_at: string
    updated_at: string
    submissions: TaskSubmission[]
  }>(
    `SELECT t.id, t.title, t.description, t.status, t.deadline, t.assigned_to,
            au.display_name AS assignee_display_name, t.created_by, t.created_at, t.updated_at,
            COALESCE(s.submissions, '[]'::json) AS submissions
     FROM tasks t
     LEFT JOIN members am ON am.id = t.assigned_to
     LEFT JOIN users au ON au.id = am.user_id
     LEFT JOIN LATERAL (
       SELECT json_agg(
         json_build_object(
           'id', ts.id,
           'submitted_by', ts.submitted_by,
           'submitter_display_name', su.display_name,
           'submitted_at', ts.submitted_at,
           'content', ts.content,
           'url', ts.url
         ) ORDER BY ts.submitted_at DESC
       ) AS submissions
       FROM task_submissions ts
       LEFT JOIN members sm ON sm.id = ts.submitted_by
       LEFT JOIN users su ON su.id = sm.user_id
       WHERE ts.task_id = t.id
     ) s ON TRUE
     WHERE t.team_id = $1
     ORDER BY t.deadline ASC NULLS LAST, t.created_at ASC`,
    [membership.teamId]
  )

  const approvals = await listTaskApprovers(membership.teamId)

  const tasksWithLocalDeadline = tasks.map(t => ({ ...t, deadline_local: formatDeadlineLocal(t.deadline) }))

  return NextResponse.json({ tasks: tasksWithLocalDeadline, approvals })
}

export async function POST(req: Request) {
  const { teamId, title, description, deadline, assignedTo } = await req.json()
  if (!teamId || !title?.trim()) {
    return NextResponse.json({ error: 'teamId and title required' }, { status: 400 })
  }

  const membership = await requireTeamMemberByTeamId(teamId)
  if (!membership) return NextResponse.json({ error: 'Not authorized for this team' }, { status: 403 })

  if (assignedTo) {
    if (!isUuid(assignedTo)) {
      return NextResponse.json({ error: 'assignedTo must be a member of this team' }, { status: 400 })
    }
    const assignee = await queryOne('SELECT id FROM members WHERE id = $1 AND team_id = $2', [assignedTo, teamId])
    if (!assignee) return NextResponse.json({ error: 'assignedTo must be a member of this team' }, { status: 400 })
  }

  const task = await queryOne(
    `INSERT INTO tasks (team_id, title, description, deadline, assigned_to, created_by)
     VALUES ($1, $2, $3, $4::timestamptz, $5, $6)
     RETURNING id`,
    [teamId, title.trim(), description?.trim() || null, toDeadlineUtc(deadline), assignedTo || null, membership.memberId]
  )

  await clearTaskApprovals(teamId)

  return NextResponse.json(task, { status: 201 })
}
