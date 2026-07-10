import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { getTeamStatus } from '@/lib/phase'
import { requireTeamMember } from '@/lib/auth/team-access'

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  const membership = await requireTeamMember(code)
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const team = await queryOne<{ id: string; name: string; join_code: string; project_title: string | null; deadline: string | null; assignment_brief: string | null; plant_type: string | null; plant_votes: Record<string, string> | null }>(
    'SELECT id, name, join_code, project_title, deadline, assignment_brief, plant_type, plant_votes FROM teams WHERE join_code = $1',
    [code.toUpperCase()]
  )
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const members = await query<{ id: string; display_name: string; pronouns: string | null; joined_at: string }>(
    'SELECT id, display_name, pronouns, joined_at FROM members WHERE team_id = $1 ORDER BY joined_at',
    [team.id]
  )

  const status = await getTeamStatus(team.id)

  return NextResponse.json({ ...team, members, status })
}
