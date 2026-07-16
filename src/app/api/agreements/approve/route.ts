import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { requireOwnedMember } from '@/lib/auth/team-access'

export async function POST(req: Request) {
  const { teamId, component, memberId } = await req.json()

  const owned = await requireOwnedMember(memberId)
  if (!owned || owned.teamId !== teamId) {
    return NextResponse.json({ error: 'Not authorized for this member' }, { status: 403 })
  }

  const agreement = await queryOne(
    'SELECT id FROM agreements WHERE team_id = $1 AND component = $2 AND final_text IS NOT NULL',
    [teamId, component]
  )
  if (!agreement) return NextResponse.json({ error: 'No agreement draft to approve' }, { status: 400 })

  await query(
    `INSERT INTO agreement_approvals (team_id, component, member_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (team_id, component, member_id) DO NOTHING`,
    [teamId, component, memberId]
  )

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const { teamId, component, memberId } = await req.json()

  const owned = await requireOwnedMember(memberId)
  if (!owned || owned.teamId !== teamId) {
    return NextResponse.json({ error: 'Not authorized for this member' }, { status: 403 })
  }

  await query(
    'DELETE FROM agreement_approvals WHERE team_id = $1 AND component = $2 AND member_id = $3',
    [teamId, component, memberId]
  )

  return NextResponse.json({ ok: true })
}
