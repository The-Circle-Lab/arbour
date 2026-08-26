import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { computePlantState, CheckinRow } from '@/lib/plant-logic'
import { ChatComponent } from '@/lib/chat-components'
import { requireInstructorTeam } from '@/lib/auth/instructor'

function isValidCycle(cycle: string): boolean {
  return cycle === '1' || cycle === '2'
}

// Team-scoped, no join-code membership check — instructor auth already
// scopes access, same shape of query as src/app/api/plant/[code]/[cycle]/route.ts
// but recomputed on demand rather than persisted, since nothing today
// persists componentScores.
export async function GET(_req: Request, { params }: { params: Promise<{ teamId: string; cycle: string }> }) {
  try {
    const { teamId, cycle } = await params
    const access = await requireInstructorTeam(teamId)
    if (!access) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    if (!isValidCycle(cycle)) return NextResponse.json({ error: 'Invalid cycle' }, { status: 400 })
    const cycleNum = Number(cycle)

    const checkinRows = await query<CheckinRow>(
      `SELECT ci.component, ci.response_data
       FROM checkins ci
       JOIN members m ON m.id = ci.member_id
       WHERE m.team_id = $1 AND ci.cycle_number = $2`,
      [teamId, cycleNum]
    )

    if (checkinRows.length === 0) return NextResponse.json({ ready: false }, { status: 202 })

    const [{ team_size }] = await query<{ team_size: number }>(
      'SELECT COUNT(*)::int AS team_size FROM members WHERE team_id = $1',
      [teamId]
    )

    const plantResult = computePlantState(checkinRows, team_size)

    const cached = await queryOne<{ per_component: Record<ChatComponent, string> | null }>(
      'SELECT per_component FROM plant_states WHERE team_id = $1 AND cycle_number = $2',
      [teamId, cycleNum]
    )

    return NextResponse.json({
      state: plantResult.state,
      flaggedComponents: plantResult.flaggedComponents,
      componentScores: plantResult.componentScores,
      perComponentNotes: cached?.per_component ?? null,
    })
  } catch (e) {
    console.error('GET /api/instructor/teams/[teamId]/tension/[cycle] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
