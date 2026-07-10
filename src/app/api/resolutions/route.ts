import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireOwnedMember, requireTeamMemberByTeamId } from '@/lib/auth/team-access'

export async function POST(req: Request) {
  const { teamId, component, cycleNumber, resolutionNote, memberId } = await req.json()

  const owned = await requireOwnedMember(memberId)
  if (!owned || owned.teamId !== teamId) {
    return NextResponse.json({ error: 'Not authorized for this member' }, { status: 403 })
  }

  await query(
    `INSERT INTO resolutions (team_id, component, cycle_number, resolution_note, resolved_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (team_id, component, cycle_number) DO UPDATE
       SET resolution_note = $4, resolved_by = $5, resolved_at = NOW()`,
    [teamId, component, cycleNumber, resolutionNote ?? null, memberId]
  )

  return NextResponse.json({ ok: true })
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const teamId = searchParams.get('teamId')
  const cycle = searchParams.get('cycle')

  if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 })

  const membership = await requireTeamMemberByTeamId(teamId)
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const rows = await query<{ component: string; cycle_number: number; resolution_note: string; resolved_at: string }>(
    cycle
      ? 'SELECT component, cycle_number, resolution_note, resolved_at FROM resolutions WHERE team_id = $1 AND cycle_number = $2'
      : 'SELECT component, cycle_number, resolution_note, resolved_at FROM resolutions WHERE team_id = $1',
    cycle ? [teamId, cycle] : [teamId]
  )

  return NextResponse.json({ resolutions: rows })
}
