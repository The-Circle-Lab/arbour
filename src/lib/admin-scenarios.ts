import { validate as isUuid } from 'uuid'
import { withTransaction } from './db'
import { CHAT_COMPONENTS, CHECKIN_QUESTIONS, type ChatComponent } from './chat-components'
import { getCurrentPlantLevel, levelToState } from './plant-health'
import { recordTaskApprovalsForAllMembers } from './task-approvals'

export class AdminScenarioError extends Error {}

// response_data shape must match what plant-logic.ts's getWorstRating reads:
// a single `rating` for components with one hasRating question, or a
// `ratings` map for components with more than one (only `rules` today).
// Derived from CHECKIN_QUESTIONS rather than hardcoded so it can't drift.
function alignedResponseData(component: ChatComponent): Record<string, unknown> {
  const ratingQuestions = CHECKIN_QUESTIONS[component].filter(q => q.hasRating)
  if (ratingQuestions.length <= 1) {
    return { rating: 'aligned', notes: {} }
  }
  const ratings: Record<string, string> = {}
  for (const q of ratingQuestions) ratings[q.id] = 'aligned'
  return { ratings, notes: {} }
}

export interface Scenario3Result {
  taskTitle: string
  deadline: string
  approvals: number
}

export async function runScenario3(teamId: string, taskId: string): Promise<Scenario3Result> {
  if (!isUuid(teamId) || !isUuid(taskId)) throw new AdminScenarioError('Invalid team or task id')

  return withTransaction(async tx => {
    const [task] = await tx.query<{ team_id: string; title: string }>(
      'SELECT team_id, title FROM tasks WHERE id = $1',
      [taskId]
    )
    if (!task || task.team_id !== teamId) {
      throw new AdminScenarioError('That task does not belong to the selected team')
    }

    const [updated] = await tx.query<{ deadline: string }>(
      `UPDATE tasks SET deadline = NOW() + interval '2 minutes', updated_at = NOW()
       WHERE id = $1 RETURNING deadline`,
      [taskId]
    )

    // "Everyone also agrees" — guarantees tasksApproved stays true so the
    // team's phase never falls back to TASKS (see PATCH /api/tasks/[id],
    // which this scenario deliberately avoids for the same reason).
    const approvals = await recordTaskApprovalsForAllMembers(tx, teamId)

    return { taskTitle: task.title, deadline: updated.deadline, approvals }
  })
}

export interface Scenario5Result {
  checkinsSeeded: number
  plantState: string
  tasksCompleted: number
  tasksLeftInReview: number
  approvals: number
  grade: string
}

export async function runScenario5(teamId: string, grade: string): Promise<Scenario5Result> {
  if (!isUuid(teamId)) throw new AdminScenarioError('Invalid team id')
  const trimmedGrade = grade.trim()
  if (!trimmedGrade) throw new AdminScenarioError('A grade is required')

  return withTransaction(async tx => {
    const members = await tx.query<{ id: string }>('SELECT id FROM members WHERE team_id = $1', [teamId])
    if (members.length === 0) throw new AdminScenarioError('That team has no members')

    let checkinsSeeded = 0
    for (const member of members) {
      for (const component of CHAT_COMPONENTS) {
        await tx.query(
          `INSERT INTO checkins (member_id, cycle_number, component, response_data)
           VALUES ($1, 2, $2, $3)
           ON CONFLICT (member_id, cycle_number, component) DO UPDATE
             SET response_data = $3, submitted_at = NOW()`,
          [member.id, component, JSON.stringify(alignedResponseData(component))]
        )
        checkinsSeeded += 1
      }
    }

    // The team's real current ledger level, not a hardcoded 'thriving' — no
    // plant_health_events row is written here, which is what keeps this
    // check-in out of the final report (it only reads events with
    // source = 'checkin').
    const level = await getCurrentPlantLevel(tx.query, teamId)
    const plantState = levelToState(level)

    await tx.query(
      `INSERT INTO plant_states (team_id, cycle_number, computed_state, flagged_components, ai_nudge_text, per_component)
       VALUES ($1, 2, $2, '{}', NULL, '{}'::jsonb)
       ON CONFLICT (team_id, cycle_number) DO UPDATE SET
         computed_state = EXCLUDED.computed_state,
         flagged_components = '{}', per_component = '{}'::jsonb, computed_at = NOW()`,
      [teamId, plantState]
    )

    // Leaves 'submitted' tasks in real review and already-'done' tasks
    // untouched; marking 'todo'/'in_progress' tasks done is also enough to
    // stop the missed-deadline modal, since buildDeadlineEvent short-circuits
    // on status === 'done'.
    const completed = await tx.query<{ id: string }>(
      `UPDATE tasks SET status = 'done', updated_at = NOW()
       WHERE team_id = $1 AND status IN ('todo', 'in_progress')
       RETURNING id`,
      [teamId]
    )
    const [{ in_review }] = await tx.query<{ in_review: number }>(
      `SELECT COUNT(*)::int AS in_review FROM tasks WHERE team_id = $1 AND status = 'submitted'`,
      [teamId]
    )

    const approvals = await recordTaskApprovalsForAllMembers(tx, teamId)

    await tx.query('UPDATE teams SET grade = $2 WHERE id = $1', [teamId, trimmedGrade])

    return {
      checkinsSeeded,
      plantState,
      tasksCompleted: completed.length,
      tasksLeftInReview: in_review,
      approvals,
      grade: trimmedGrade,
    }
  })
}
