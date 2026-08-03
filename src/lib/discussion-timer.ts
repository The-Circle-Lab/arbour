import { query, queryOne } from './db'
import { getTeamStatus } from './phase'

// Single owning module for discussion_timers / discussion_timer_extensions —
// same convention as agreement-approvals.ts and task-approvals.ts.

export type DiscussionStep = 'AGREEING' | 'CHECKIN_AGREE'

const DISCUSSION_STEPS: readonly string[] = ['AGREEING', 'CHECKIN_AGREE']

export function isDiscussionStep(value: unknown): value is DiscussionStep {
  return typeof value === 'string' && DISCUSSION_STEPS.includes(value)
}

export function isValidCycleNumber(value: unknown): value is number | null {
  return value === null || value === 1 || value === 2
}

export interface DiscussionTimerState {
  startedAt: string
  expiresAt: string
  extensionCount: number
}

const EXTENSION_MINUTES = 5

export async function getActiveTimer(
  teamId: string,
  step: DiscussionStep,
  cycleNumber: number | null
): Promise<DiscussionTimerState | null> {
  const row = await queryOne<{ started_at: string; expires_at: string; extension_count: number }>(
    `SELECT dt.started_at, dt.expires_at,
            (SELECT COUNT(*)::int FROM discussion_timer_extensions e WHERE e.timer_id = dt.id) AS extension_count
     FROM discussion_timers dt
     WHERE dt.team_id = $1 AND dt.step = $2 AND dt.cycle_number IS NOT DISTINCT FROM $3 AND dt.resolved_at IS NULL`,
    [teamId, step, cycleNumber]
  )
  if (!row) return null
  return { startedAt: row.started_at, expiresAt: row.expires_at, extensionCount: row.extension_count }
}

// Insert-or-get: ON CONFLICT targets the partial unique index on (team_id,
// step, cycle_number) WHERE resolved_at IS NULL, so a second call (or a
// concurrent one) is a no-op rather than a duplicate active timer.
export async function startTimer(
  teamId: string,
  step: DiscussionStep,
  cycleNumber: number | null
): Promise<DiscussionTimerState> {
  await query(
    `INSERT INTO discussion_timers (team_id, step, cycle_number, started_at, expires_at)
     VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '15 minutes')
     ON CONFLICT (team_id, step, cycle_number) WHERE resolved_at IS NULL DO NOTHING`,
    [teamId, step, cycleNumber]
  )
  return (await getActiveTimer(teamId, step, cycleNumber))!
}

// Only succeeds once the timer has actually expired — rejects (returns
// null) a stray double-click that would otherwise extend a timer that
// still has time left.
export async function extendTimer(
  teamId: string,
  step: DiscussionStep,
  cycleNumber: number | null
): Promise<DiscussionTimerState | null> {
  const updated = await queryOne<{ id: string }>(
    `UPDATE discussion_timers SET expires_at = expires_at + make_interval(mins => $4)
     WHERE team_id = $1 AND step = $2 AND cycle_number IS NOT DISTINCT FROM $3
       AND resolved_at IS NULL AND expires_at <= NOW()
     RETURNING id`,
    [teamId, step, cycleNumber, EXTENSION_MINUTES]
  )
  if (!updated) return null

  await query(
    'INSERT INTO discussion_timer_extensions (timer_id, minutes_added) VALUES ($1, $2)',
    [updated.id, EXTENSION_MINUTES]
  )
  return getActiveTimer(teamId, step, cycleNumber)
}

// Interim team-leader rule: earliest joined_at. Isolated in this one
// function so the future real role/leader column only needs to change
// here, not at every call site.
export async function isTeamLeader(teamId: string, memberId: string): Promise<boolean> {
  const leader = await queryOne<{ id: string }>(
    'SELECT id FROM members WHERE team_id = $1 ORDER BY joined_at ASC LIMIT 1',
    [teamId]
  )
  return leader?.id === memberId
}

// Called after recording an agreement approval. Reuses getTeamStatus's
// existing allAgreed / plantNResolved conditions (the same ones that
// advance phase) rather than re-deriving them, and resolves whichever
// timer scope just became satisfied.
export async function resolveDiscussionTimersIfDone(teamId: string): Promise<void> {
  const status = await getTeamStatus(teamId)
  if (status.allAgreed) await resolveTimer(teamId, 'AGREEING', null)
  if (status.hasFlagsAfterCycle1 && status.plant1Resolved) await resolveTimer(teamId, 'CHECKIN_AGREE', 1)
  if (status.hasFlagsAfterCycle2 && status.plant2Resolved) await resolveTimer(teamId, 'CHECKIN_AGREE', 2)
}

async function resolveTimer(teamId: string, step: DiscussionStep, cycleNumber: number | null): Promise<void> {
  await query(
    `UPDATE discussion_timers SET resolved_at = NOW()
     WHERE team_id = $1 AND step = $2 AND cycle_number IS NOT DISTINCT FROM $3 AND resolved_at IS NULL`,
    [teamId, step, cycleNumber]
  )
}
