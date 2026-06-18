import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  const team = await queryOne<{ id: string }>(
    'SELECT id FROM teams WHERE join_code = $1',
    [code.toUpperCase()]
  )
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const [{ team_size }] = await query<{ team_size: number }>(
    'SELECT COUNT(*)::int AS team_size FROM members WHERE team_id = $1',
    [team.id]
  )

  // Count members who submitted all 6 components
  const submittedRows = await query<{ member_id: string; count: number }>(
    `SELECT ir.member_id, COUNT(DISTINCT ir.component)::int AS count
     FROM individual_reflections ir
     JOIN members m ON m.id = ir.member_id
     WHERE m.team_id = $1
     GROUP BY ir.member_id`,
    [team.id]
  )
  const submitted = submittedRows.filter(r => r.count >= 6).length

  if (submitted < team_size) {
    return NextResponse.json({ ready: false, submitted, teamSize: team_size }, { status: 403 })
  }

  // Return all reflections with member names
  const reflections = await query<{
    member_id: string
    display_name: string
    component: string
    response_data: Record<string, unknown>
  }>(
    `SELECT ir.member_id, m.display_name, ir.component, ir.response_data
     FROM individual_reflections ir
     JOIN members m ON m.id = ir.member_id
     WHERE m.team_id = $1
     ORDER BY m.joined_at, ir.component`,
    [team.id]
  )

  return NextResponse.json({ ready: true, reflections, teamSize: team_size })
}
