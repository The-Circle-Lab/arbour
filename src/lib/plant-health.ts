import { query } from './db'

export type PlantState = 'thriving' | 'doing_okay' | 'wilting' | 'dead'
export type PlantHealthSource = 'deadline_missed' | 'task_recovered' | 'checkin'

// Index = level. New teams with no ledger rows yet default to level 3 (thriving).
const LEVEL_STATES: PlantState[] = ['dead', 'wilting', 'doing_okay', 'thriving']
const DEFAULT_LEVEL = 3

export function levelToState(level: number): PlantState {
  return LEVEL_STATES[level]
}

type QueryFn = <T = unknown>(text: string, params?: unknown[]) => Promise<T[]>

export async function getCurrentPlantLevel(db: QueryFn, teamId: string): Promise<number> {
  const rows = await db<{ level: number }>(
    'SELECT level FROM plant_health_events WHERE team_id = $1 ORDER BY occurred_at DESC, id DESC LIMIT 1',
    [teamId]
  )
  return rows[0]?.level ?? DEFAULT_LEVEL
}

export interface ApplyPlantHealthDeltaParams {
  teamId: string
  delta: number
  source: PlantHealthSource
  taskId?: string | null
  cycleNumber?: number | null
  detail?: Record<string, unknown>
}

// Callers run this inside their own single-fire guard (an already-inserted
// row, a FOR UPDATE check, etc.) — this function itself does not dedupe.
export async function applyPlantHealthDelta(
  db: QueryFn,
  params: ApplyPlantHealthDeltaParams
): Promise<{ level: number; state: PlantState }> {
  const current = await getCurrentPlantLevel(db, params.teamId)
  const level = Math.min(3, Math.max(0, current + params.delta))

  await db(
    `INSERT INTO plant_health_events (team_id, level, delta, source, task_id, cycle_number, detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [params.teamId, level, params.delta, params.source, params.taskId ?? null, params.cycleNumber ?? null, JSON.stringify(params.detail ?? {})]
  )

  return { level, state: levelToState(level) }
}

export async function getCurrentPlantState(teamId: string): Promise<PlantState> {
  const level = await getCurrentPlantLevel(query, teamId)
  return levelToState(level)
}
