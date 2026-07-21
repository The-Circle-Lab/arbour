import { validate as isUuid } from 'uuid'
import { query, queryOne, withTransaction, TransactionQuery } from './db'
import { generateDeadlineActionSuggestions, DeadlineTaskContext } from './ai'
import { ChatComponent } from './chat-components'
import { toDeadlineUtc } from './dates'
import { applyPlantHealthDelta } from './plant-health'

export interface StoredDeadlineSuggestion {
  id: string
  label: string
  rationale: string
  choiceKey: string
  choicePayload: Record<string, unknown>
}

export interface DeadlineEventRow {
  id: string
  deadline: string
  detected_at: string
  phase: 'voting' | 'proposing'
  round: number
  resolved_at: string | null
  suggestions: StoredDeadlineSuggestion[]
}

const EVENT_COLUMNS = 'id, deadline, detected_at, phase, round, resolved_at, suggestions'

function sameInstant(a: string, b: string): boolean {
  return new Date(a).getTime() === new Date(b).getTime()
}

async function fetchLatestEvent(taskId: string): Promise<DeadlineEventRow | null> {
  return queryOne<DeadlineEventRow>(
    `SELECT ${EVENT_COLUMNS} FROM task_deadline_events WHERE task_id = $1 ORDER BY detected_at DESC LIMIT 1`,
    [taskId]
  )
}

interface DetectionContext {
  teamId: string
  task: DeadlineTaskContext
  agreements: Partial<Record<ChatComponent, string>>
  members: { id: string; displayName: string }[]
  currentAssigneeId: string | null
}

// Returns the open (unresolved) deadline event for this task's *current*
// deadline value, creating one if this is the first time it's been seen
// overdue. Once an event for a given deadline value is resolved, it stays
// suppressed — the deadline hasn't changed, so re-surfacing it on the very
// next poll would undo whatever the team just decided (e.g. Ignore would
// "un-ignore" itself every 4 seconds).
export interface DetectionBudget {
  remaining: number
}

export async function getOrCreateOpenDeadlineEvent(
  taskId: string,
  currentDeadlineIso: string,
  context: DetectionContext,
  // Caps how many *new* events (and their AI suggestion calls) a single caller
  // will create in one pass — a poll that finds several tasks newly overdue
  // at once shouldn't fire N inline AI calls; the rest get picked up on the
  // next 4s poll instead.
  budget?: DetectionBudget
): Promise<DeadlineEventRow | null> {
  const latest = await fetchLatestEvent(taskId)
  if (latest && sameInstant(latest.deadline, currentDeadlineIso)) {
    return latest.resolved_at ? null : latest
  }

  if (budget && budget.remaining <= 0) return null

  const { row, isNew } = await withTransaction(async tx => {
    // Advisory-locked re-check so two members polling at the same instant
    // don't both insert a fresh event row for the same missed deadline.
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [taskId])
    const recheck = await tx.query<DeadlineEventRow>(
      `SELECT ${EVENT_COLUMNS} FROM task_deadline_events WHERE task_id = $1 ORDER BY detected_at DESC LIMIT 1`,
      [taskId]
    )
    const existing = recheck[0]
    if (existing && sameInstant(existing.deadline, currentDeadlineIso)) {
      return { row: existing, isNew: false }
    }
    const inserted = await tx.query<DeadlineEventRow>(
      `INSERT INTO task_deadline_events (task_id, deadline) VALUES ($1, $2::timestamptz)
       RETURNING ${EVENT_COLUMNS}`,
      [taskId, currentDeadlineIso]
    )

    // A newly-detected miss always dings the plant by one level, on top of
    // whatever the current level already is.
    await applyPlantHealthDelta(tx.query, {
      teamId: context.teamId,
      delta: -1,
      source: 'deadline_missed',
      taskId,
    })

    return { row: inserted[0], isNew: true }
  })

  if (!isNew) {
    return row.resolved_at ? null : row
  }

  if (budget) budget.remaining -= 1

  // AI call happens after the transaction has committed — holding the
  // advisory lock across a network round-trip would block every other
  // poller touching this task for the duration of the call.
  try {
    const suggestions = await generateDeadlineActionSuggestions(
      context.task, context.agreements, context.members, context.currentAssigneeId
    )
    const stored: StoredDeadlineSuggestion[] = suggestions.map((s, i) => {
      const id = `${row.id}-${i}`
      if (s.action === 'extend' && s.extendDeadline) {
        // The AI may propose a specific time (e.g. a meeting slot implied by
        // the agreement text) — validated before trusting it, same as any
        // other AI-sourced prefill. Falls back to end-of-day otherwise, so
        // its choiceKey format still matches a manually cast extend vote's
        // date+time when both land on the same default.
        const time = s.extendTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.extendTime) ? s.extendTime : '23:59'
        const deadline = `${s.extendDeadline}T${time}`
        return { id, label: s.label, rationale: s.rationale, choiceKey: `extend:${deadline}`, choicePayload: { type: 'extend', deadline } }
      }
      if (s.action === 'reassign' && s.reassignMemberId) {
        return { id, label: s.label, rationale: s.rationale, choiceKey: `reassign:${s.reassignMemberId}`, choicePayload: { type: 'reassign', memberId: s.reassignMemberId } }
      }
      return { id, label: s.label, rationale: s.rationale, choiceKey: `custom:${id}`, choicePayload: { type: 'custom', label: s.label } }
    })
    await query('UPDATE task_deadline_events SET suggestions = $2::jsonb WHERE id = $1', [row.id, JSON.stringify(stored)])
    row.suggestions = stored
  } catch {
    // Best-effort — the event still exists with an empty suggestions list,
    // so the static Extend/Reassign/Ignore options remain usable immediately.
  }

  return row
}

export class DeadlineChoiceValidationError extends Error {}

export type DeadlineChoicePayload =
  | { type: 'extend'; deadline: string }
  | { type: 'reassign'; memberId: string }
  | { type: 'ignore' }
  | { type: 'custom'; label: string }

// Shared by the vote and propose endpoints — a client's raw choice input
// (a static option it filled in itself, or a reference to one of the event's
// AI suggestions) is always resolved server-side into a canonical
// choiceKey/choicePayload pair, never trusted verbatim from the request body.
export async function resolveDeadlineChoiceInput(
  input: unknown,
  opts: { teamId: string; suggestions: StoredDeadlineSuggestion[] }
): Promise<{ choiceKey: string; choicePayload: DeadlineChoicePayload }> {
  const body = (input ?? {}) as Record<string, unknown>

  if (body.type === 'extend') {
    const deadline = body.deadline
    if (typeof deadline !== 'string' || !deadline) {
      throw new DeadlineChoiceValidationError('A new deadline is required')
    }
    const utc = toDeadlineUtc(deadline)
    if (!utc || new Date(utc).getTime() <= Date.now()) {
      throw new DeadlineChoiceValidationError('New deadline must be in the future')
    }
    return { choiceKey: `extend:${deadline}`, choicePayload: { type: 'extend', deadline } }
  }

  if (body.type === 'reassign') {
    const memberId = body.memberId
    if (typeof memberId !== 'string' || !isUuid(memberId)) {
      throw new DeadlineChoiceValidationError('A teammate is required')
    }
    const member = await queryOne('SELECT id FROM members WHERE id = $1 AND team_id = $2', [memberId, opts.teamId])
    if (!member) throw new DeadlineChoiceValidationError('That member is not on this team')
    return { choiceKey: `reassign:${memberId}`, choicePayload: { type: 'reassign', memberId } }
  }

  if (body.type === 'ignore') {
    return { choiceKey: 'ignore', choicePayload: { type: 'ignore' } }
  }

  if (body.type === 'suggestion') {
    const match = opts.suggestions.find(s => s.id === body.suggestionId)
    if (!match) throw new DeadlineChoiceValidationError('That suggestion is no longer available')
    return { choiceKey: match.choiceKey, choicePayload: match.choicePayload as DeadlineChoicePayload }
  }

  throw new DeadlineChoiceValidationError('Invalid choice')
}

export function resolutionFromPayload(payload: DeadlineChoicePayload): 'extended' | 'reassigned' | 'dismissed' | 'custom' {
  if (payload.type === 'extend') return 'extended'
  if (payload.type === 'reassign') return 'reassigned'
  if (payload.type === 'ignore') return 'dismissed'
  return 'custom'
}

// Applies the winning ballot's effect (if any) to the task itself. Mirrors
// PATCH /api/tasks/[id]'s "reassigning a submitted task reopens it" rule so
// the two code paths can't drift apart.
export async function applyDeadlineChoiceEffect(
  tx: TransactionQuery,
  taskId: string,
  task: { status: string; assigned_to: string | null },
  payload: DeadlineChoicePayload
): Promise<void> {
  if (payload.type === 'extend') {
    const utc = toDeadlineUtc(payload.deadline)
    await tx.query('UPDATE tasks SET deadline = $2::timestamptz, updated_at = NOW() WHERE id = $1', [taskId, utc])
    return
  }
  if (payload.type === 'reassign') {
    const reopensSubmitted = task.status === 'submitted' && payload.memberId !== task.assigned_to
    if (reopensSubmitted) {
      await tx.query(`UPDATE tasks SET assigned_to = $2, status = 'todo', updated_at = NOW() WHERE id = $1`, [taskId, payload.memberId])
    } else {
      await tx.query('UPDATE tasks SET assigned_to = $2, updated_at = NOW() WHERE id = $1', [taskId, payload.memberId])
    }
    return
  }
  // 'ignore' and 'custom' carry no task mutation — just recorded on the event.
}
