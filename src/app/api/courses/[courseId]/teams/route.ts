import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireCourseOwner } from '@/lib/auth/instructor'
import { levelToState } from '@/lib/plant-health'

export async function GET(_req: Request, { params }: { params: Promise<{ courseId: string }> }) {
  try {
    const { courseId } = await params
    const userId = await requireCourseOwner(courseId)
    if (!userId) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const rows = await query<{
      id: string
      name: string
      join_code: string
      project_title: string | null
      deadline: string | null
      plant_type: string | null
      stage: number
      level: number | null
      latest_cycle: number | null
    }>(
      `SELECT t.id, t.name, t.join_code, t.project_title, t.deadline, t.plant_type, t.stage,
        (SELECT level FROM plant_health_events WHERE team_id = t.id ORDER BY occurred_at DESC, id DESC LIMIT 1) AS level,
        (SELECT MAX(cycle_number) FROM plant_states WHERE team_id = t.id) AS latest_cycle
       FROM teams t
       WHERE t.course_id = $1
       ORDER BY t.name`,
      [courseId]
    )

    const teams = rows.map(row => ({
      id: row.id,
      name: row.name,
      joinCode: row.join_code,
      projectTitle: row.project_title,
      deadline: row.deadline,
      plantType: row.plant_type,
      stage: row.stage,
      state: levelToState(row.level ?? 3),
      latestCycle: row.latest_cycle,
    }))

    return NextResponse.json({ teams })
  } catch (e) {
    console.error('GET /api/courses/[courseId]/teams error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
