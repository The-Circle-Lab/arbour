import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { generateRevealComparison, MemberReflection } from '@/lib/ai'
import { ChatComponent } from '@/lib/chat-components'

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

  // Kick off AI generation server-side if not already done (fire-and-forget, no await)
  const existing = await queryOne('SELECT id FROM reveal_ai WHERE team_id = $1', [team.id])
  if (!existing) {
    const memberMap = new Map<string, MemberReflection>()
    for (const row of reflections) {
      if (!memberMap.has(row.member_id)) {
        memberMap.set(row.member_id, { displayName: row.display_name, responses: {} as MemberReflection['responses'] })
      }
      memberMap.get(row.member_id)!.responses[row.component as ChatComponent] = row.response_data
    }
    generateRevealComparison(Array.from(memberMap.values()))
      .then(result => query(
        `INSERT INTO reveal_ai (team_id, per_component, flagged_components)
         VALUES ($1, $2, $3) ON CONFLICT (team_id) DO NOTHING`,
        [team.id, JSON.stringify(result.perComponent), result.flaggedComponents]
      ))
      .catch(e => console.error('reveal-ai generation error:', e))
  }

  return NextResponse.json({ ready: true, reflections, teamSize: team_size })
}
