import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireInstructorTeam } from '@/lib/auth/instructor'
import { levelToState, type PlantHealthSource } from '@/lib/plant-health'

// Direct data source for the health-over-time chart.
export async function GET(_req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  try {
    const { teamId } = await params
    const access = await requireInstructorTeam(teamId)
    if (!access) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const events = await query<{
      occurred_at: string
      level: number
      delta: number
      source: PlantHealthSource
      cycle_number: number | null
    }>(
      'SELECT occurred_at, level, delta, source, cycle_number FROM plant_health_events WHERE team_id = $1 ORDER BY occurred_at',
      [teamId]
    )

    const currentState = levelToState(events[events.length - 1]?.level ?? 3)

    return NextResponse.json({ events, currentState })
  } catch (e) {
    console.error('GET /api/instructor/teams/[teamId]/health error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
