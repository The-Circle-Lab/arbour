import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { requireTeamMemberByTeamId } from '@/lib/auth/team-access'
import { recordTaskApproval, withdrawTaskApproval } from '@/lib/task-approvals'

export async function POST(req: Request) {
  const { teamId } = await req.json()
  if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 })

  const membership = await requireTeamMemberByTeamId(teamId)
  if (!membership) return NextResponse.json({ error: 'Not authorized for this team' }, { status: 403 })

  const hasTasks = await queryOne('SELECT id FROM tasks WHERE team_id = $1', [teamId])
  if (!hasTasks) return NextResponse.json({ error: 'No tasks to approve' }, { status: 400 })

  const incomplete = await queryOne(
    'SELECT id FROM tasks WHERE team_id = $1 AND (assigned_to IS NULL OR deadline IS NULL)',
    [teamId]
  )
  if (incomplete) {
    return NextResponse.json({ error: 'Every task needs an assignee and a deadline before the list can be approved' }, { status: 400 })
  }

  await recordTaskApproval(teamId, membership.memberId)

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const { teamId } = await req.json()
  if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 })

  const membership = await requireTeamMemberByTeamId(teamId)
  if (!membership) return NextResponse.json({ error: 'Not authorized for this team' }, { status: 403 })

  await withdrawTaskApproval(teamId, membership.memberId)

  return NextResponse.json({ ok: true })
}
