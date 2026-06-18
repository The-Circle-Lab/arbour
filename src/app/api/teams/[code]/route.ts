import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { getTeamStatus } from '@/lib/phase'

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const team = await queryOne<{ id: string; name: string; join_code: string }>(
    'SELECT id, name, join_code FROM teams WHERE join_code = $1',
    [code.toUpperCase()]
  )
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const members = await query<{ id: string; display_name: string; joined_at: string }>(
    'SELECT id, display_name, joined_at FROM members WHERE team_id = $1 ORDER BY joined_at',
    [team.id]
  )

  const status = await getTeamStatus(team.id)

  return NextResponse.json({ ...team, members, status })
}
