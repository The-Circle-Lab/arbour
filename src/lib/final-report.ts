import { query } from './db'
import { CHAT_COMPONENTS, ChatComponent, COMPONENT_LABELS } from './chat-components'
import { levelToState, type PlantState } from './plant-health'
import type { TaskStatus } from './task-status'
import type { DeadlineChoicePayload } from './task-deadline-events'

export interface FinalReportTeam {
  id: string
  name: string
  projectTitle: string | null
  deadline: string | null
  plantType: string | null
}

export interface PlantHealthEntry {
  occurredAt: string
  level: number
  state: PlantState
  delta: number
  source: 'deadline_missed' | 'task_recovered' | 'checkin'
  taskId: string | null
  taskTitle: string | null
  cycleNumber: number | null
  flaggedComponents: ChatComponent[] | null
  perComponent: Record<ChatComponent, string> | null
}

export interface AgreementEntry {
  component: ChatComponent
  finalText: string | null
}

export interface SubmissionVoteEntry {
  memberId: string | null
  displayName: string
  vote: 'approve' | 'decline'
  reason: string | null
  createdAt: string
}

export interface SubmissionCommentEntry {
  memberId: string | null
  displayName: string
  comment: string
  createdAt: string
}

export interface TaskSubmissionEntry {
  id: string
  submittedBy: string | null
  submitterDisplayName: string | null
  submittedAt: string
  content: string
  url: string | null
  summary: string | null
  votes: SubmissionVoteEntry[]
  comments: SubmissionCommentEntry[]
}

function labelForChoicePayload(payload: DeadlineChoicePayload, membersById: Map<string, string>): string {
  if (payload.type === 'extend') return `Extend to ${new Date(payload.deadline).toLocaleString('en-US', { month: 'short', day: 'numeric' })}`
  if (payload.type === 'reassign') return `Reassign to ${membersById.get(payload.memberId) ?? 'a former member'}`
  if (payload.type === 'ignore') return 'Ignore'
  return payload.label
}

export interface DeadlineVoteEntry {
  memberId: string | null
  displayName: string
  label: string
  createdAt: string
}

export interface DeadlineProposalResponseEntry {
  memberId: string | null
  displayName: string
  response: 'agree' | 'disagree'
  createdAt: string
}

export interface DeadlineProposalEntry {
  id: string
  round: number
  proposedBy: string | null
  proposedByName: string
  label: string
  status: 'pending' | 'accepted' | 'rejected'
  responses: DeadlineProposalResponseEntry[]
}

export interface DeadlineEventEntry {
  id: string
  deadline: string
  detectedAt: string
  resolvedAt: string | null
  resolution: 'extended' | 'reassigned' | 'dismissed' | 'custom' | null
  resolvedByName: string | null
  votes: DeadlineVoteEntry[]
  proposals: DeadlineProposalEntry[]
}

export interface TaskWorkflowEntry {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  deadline: string | null
  assigneeDisplayName: string | null
  submissions: TaskSubmissionEntry[]
  deadlineEvents: DeadlineEventEntry[]
}

export interface DecisionTimelineEntry {
  type: 'agreement_reached' | 'tension_resolved' | 'work_declined' | 'deadline_consensus'
  at: string
  component?: ChatComponent
  label: string
  detail: string
}

export interface FinalReportContext {
  team: FinalReportTeam
  agreements: AgreementEntry[]
  plantHealthHistory: PlantHealthEntry[]
  taskWorkflow: TaskWorkflowEntry[]
  taskStats: Record<TaskStatus, number>
  resolutions: { component: ChatComponent; cycleNumber: number; resolutionNote: string | null; resolvedAt: string }[]
  declinedSubmissions: { taskTitle: string; displayName: string; reason: string; createdAt: string }[]
}

export async function buildFinalReportContext(teamId: string): Promise<FinalReportContext> {
  const teamRow = await query<{ id: string; name: string; project_title: string | null; deadline: string | null; plant_type: string | null }>(
    'SELECT id, name, project_title, deadline, plant_type FROM teams WHERE id = $1',
    [teamId]
  )
  const team: FinalReportTeam = {
    id: teamRow[0].id,
    name: teamRow[0].name,
    projectTitle: teamRow[0].project_title,
    deadline: teamRow[0].deadline,
    plantType: teamRow[0].plant_type,
  }

  const membersRows = await query<{ id: string; display_name: string }>(
    'SELECT m.id, u.display_name FROM members m JOIN users u ON u.id = m.user_id WHERE m.team_id = $1',
    [teamId]
  )
  const membersById = new Map(membersRows.map(m => [m.id, m.display_name]))

  const agreementRows = await query<{ component: ChatComponent; final_text: string | null }>(
    'SELECT component, final_text FROM agreements WHERE team_id = $1',
    [teamId]
  )
  const agreementByComponent = new Map(agreementRows.map(a => [a.component, a.final_text]))
  const agreements: AgreementEntry[] = CHAT_COMPONENTS.map(c => ({ component: c, finalText: agreementByComponent.get(c) ?? null }))

  const plantEventRows = await query<{
    occurred_at: string
    level: number
    delta: number
    source: 'deadline_missed' | 'task_recovered' | 'checkin'
    task_id: string | null
    cycle_number: number | null
    detail: { flaggedComponents?: ChatComponent[] }
    task_title: string | null
    per_component: Record<ChatComponent, string> | null
  }>(
    `SELECT phe.occurred_at, phe.level, phe.delta, phe.source, phe.task_id, phe.cycle_number, phe.detail,
            t.title AS task_title, ps.per_component
     FROM plant_health_events phe
     LEFT JOIN tasks t ON t.id = phe.task_id
     LEFT JOIN plant_states ps ON ps.team_id = phe.team_id AND ps.cycle_number = phe.cycle_number AND phe.source = 'checkin'
     WHERE phe.team_id = $1
     ORDER BY phe.occurred_at`,
    [teamId]
  )
  const plantHealthHistory: PlantHealthEntry[] = plantEventRows.map(r => ({
    occurredAt: r.occurred_at,
    level: r.level,
    state: levelToState(r.level),
    delta: r.delta,
    source: r.source,
    taskId: r.task_id,
    taskTitle: r.task_title,
    cycleNumber: r.cycle_number,
    flaggedComponents: r.detail?.flaggedComponents ?? null,
    perComponent: r.per_component,
  }))

  const resolutionRows = await query<{ component: ChatComponent; cycle_number: number; resolution_note: string | null; resolved_at: string }>(
    'SELECT component, cycle_number, resolution_note, resolved_at FROM resolutions WHERE team_id = $1 ORDER BY resolved_at',
    [teamId]
  )
  const resolutions = resolutionRows.map(r => ({ component: r.component, cycleNumber: r.cycle_number, resolutionNote: r.resolution_note, resolvedAt: r.resolved_at }))

  const declineRows = await query<{ task_title: string; display_name: string | null; reason: string; created_at: string }>(
    `SELECT t.title AS task_title, u.display_name, v.reason, v.created_at
     FROM task_submission_votes v
     JOIN task_submissions ts ON ts.id = v.submission_id
     JOIN tasks t ON t.id = ts.task_id
     LEFT JOIN members m ON m.id = v.member_id
     LEFT JOIN users u ON u.id = m.user_id
     WHERE t.team_id = $1 AND v.vote = 'decline'
     ORDER BY v.created_at`,
    [teamId]
  )
  const declinedSubmissions = declineRows.map(r => ({
    taskTitle: r.task_title,
    displayName: r.display_name ?? 'a former member',
    reason: r.reason,
    createdAt: r.created_at,
  }))

  const taskRows = await query<{
    id: string; title: string; description: string | null; status: TaskStatus; deadline: string | null; assignee_display_name: string | null; created_at: string
  }>(
    `SELECT t.id, t.title, t.description, t.status, t.deadline, au.display_name AS assignee_display_name, t.created_at
     FROM tasks t
     LEFT JOIN members am ON am.id = t.assigned_to
     LEFT JOIN users au ON au.id = am.user_id
     WHERE t.team_id = $1
     ORDER BY t.created_at`,
    [teamId]
  )
  const taskIds = taskRows.map(t => t.id)

  const taskStatsRows = await query<{ status: TaskStatus; count: number }>(
    'SELECT status, COUNT(*)::int AS count FROM tasks WHERE team_id = $1 GROUP BY status',
    [teamId]
  )
  const taskStats = { todo: 0, in_progress: 0, submitted: 0, done: 0 } as Record<TaskStatus, number>
  for (const r of taskStatsRows) taskStats[r.status] = r.count

  if (taskIds.length === 0) {
    return { team, agreements, plantHealthHistory, taskWorkflow: [], taskStats, resolutions, declinedSubmissions }
  }

  const submissionRows = await query<{
    id: string; task_id: string; submitted_by: string | null; submitter_display_name: string | null; submitted_at: string; content: string; url: string | null; summary: string | null
  }>(
    `SELECT ts.id, ts.task_id, ts.submitted_by, su.display_name AS submitter_display_name, ts.submitted_at, ts.content, ts.url, ts.summary
     FROM task_submissions ts
     LEFT JOIN members sm ON sm.id = ts.submitted_by
     LEFT JOIN users su ON su.id = sm.user_id
     WHERE ts.task_id = ANY($1::uuid[])
     ORDER BY ts.submitted_at`,
    [taskIds]
  )
  const submissionIds = submissionRows.map(s => s.id)

  const voteRows = submissionIds.length === 0 ? [] : await query<{ submission_id: string; member_id: string | null; display_name: string | null; vote: 'approve' | 'decline'; reason: string | null; created_at: string }>(
    `SELECT v.submission_id, v.member_id, u.display_name, v.vote, v.reason, v.created_at
     FROM task_submission_votes v
     LEFT JOIN members m ON m.id = v.member_id
     LEFT JOIN users u ON u.id = m.user_id
     WHERE v.submission_id = ANY($1::uuid[])
     ORDER BY v.created_at`,
    [submissionIds]
  )
  const commentRows = submissionIds.length === 0 ? [] : await query<{ submission_id: string; member_id: string | null; display_name: string | null; comment: string; created_at: string }>(
    `SELECT c.submission_id, c.member_id, u.display_name, c.comment, c.created_at
     FROM task_submission_comments c
     LEFT JOIN members m ON m.id = c.member_id
     LEFT JOIN users u ON u.id = m.user_id
     WHERE c.submission_id = ANY($1::uuid[])
     ORDER BY c.created_at`,
    [submissionIds]
  )

  const eventRows = await query<{
    id: string; task_id: string; deadline: string; detected_at: string; resolved_at: string | null
    resolution: 'extended' | 'reassigned' | 'dismissed' | 'custom' | null; resolved_by_name: string | null
  }>(
    `SELECT e.id, e.task_id, e.deadline, e.detected_at, e.resolved_at, e.resolution, rb.display_name AS resolved_by_name
     FROM task_deadline_events e
     LEFT JOIN members m ON m.id = e.resolved_by
     LEFT JOIN users rb ON rb.id = m.user_id
     WHERE e.task_id = ANY($1::uuid[])
     ORDER BY e.detected_at`,
    [taskIds]
  )
  const eventIds = eventRows.map(e => e.id)

  const deadlineVoteRows = eventIds.length === 0 ? [] : await query<{ event_id: string; member_id: string | null; display_name: string | null; choice_payload: DeadlineChoicePayload; created_at: string }>(
    `SELECT dv.event_id, dv.member_id, u.display_name, dv.choice_payload, dv.created_at
     FROM task_deadline_votes dv
     LEFT JOIN members m ON m.id = dv.member_id
     LEFT JOIN users u ON u.id = m.user_id
     WHERE dv.event_id = ANY($1::uuid[])
     ORDER BY dv.created_at`,
    [eventIds]
  )
  const proposalRows = eventIds.length === 0 ? [] : await query<{
    id: string; event_id: string; round: number; proposed_by: string | null; proposed_by_name: string | null
    choice_payload: DeadlineChoicePayload; status: 'pending' | 'accepted' | 'rejected'
  }>(
    `SELECT p.id, p.event_id, p.round, p.proposed_by, u.display_name AS proposed_by_name, p.choice_payload, p.status
     FROM task_deadline_proposals p
     LEFT JOIN members m ON m.id = p.proposed_by
     LEFT JOIN users u ON u.id = m.user_id
     WHERE p.event_id = ANY($1::uuid[])
     ORDER BY p.created_at`,
    [eventIds]
  )
  const proposalIds = proposalRows.map(p => p.id)
  const proposalResponseRows = proposalIds.length === 0 ? [] : await query<{ proposal_id: string; member_id: string | null; display_name: string | null; response: 'agree' | 'disagree'; created_at: string }>(
    `SELECT r.proposal_id, r.member_id, u.display_name, r.response, r.created_at
     FROM task_deadline_proposal_responses r
     LEFT JOIN members m ON m.id = r.member_id
     LEFT JOIN users u ON u.id = m.user_id
     WHERE r.proposal_id = ANY($1::uuid[])
     ORDER BY r.created_at`,
    [proposalIds]
  )

  const votesBySubmission = new Map<string, SubmissionVoteEntry[]>()
  for (const v of voteRows) {
    const entry: SubmissionVoteEntry = { memberId: v.member_id, displayName: v.display_name ?? 'a former member', vote: v.vote, reason: v.reason, createdAt: v.created_at }
    if (!votesBySubmission.has(v.submission_id)) votesBySubmission.set(v.submission_id, [])
    votesBySubmission.get(v.submission_id)!.push(entry)
  }
  const commentsBySubmission = new Map<string, SubmissionCommentEntry[]>()
  for (const c of commentRows) {
    const entry: SubmissionCommentEntry = { memberId: c.member_id, displayName: c.display_name ?? 'a former member', comment: c.comment, createdAt: c.created_at }
    if (!commentsBySubmission.has(c.submission_id)) commentsBySubmission.set(c.submission_id, [])
    commentsBySubmission.get(c.submission_id)!.push(entry)
  }
  const submissionsByTask = new Map<string, TaskSubmissionEntry[]>()
  for (const s of submissionRows) {
    const entry: TaskSubmissionEntry = {
      id: s.id, submittedBy: s.submitted_by, submitterDisplayName: s.submitter_display_name, submittedAt: s.submitted_at,
      content: s.content, url: s.url, summary: s.summary,
      votes: votesBySubmission.get(s.id) ?? [], comments: commentsBySubmission.get(s.id) ?? [],
    }
    if (!submissionsByTask.has(s.task_id)) submissionsByTask.set(s.task_id, [])
    submissionsByTask.get(s.task_id)!.push(entry)
  }

  const responsesByProposal = new Map<string, DeadlineProposalResponseEntry[]>()
  for (const r of proposalResponseRows) {
    const entry: DeadlineProposalResponseEntry = { memberId: r.member_id, displayName: r.display_name ?? 'a former member', response: r.response, createdAt: r.created_at }
    if (!responsesByProposal.has(r.proposal_id)) responsesByProposal.set(r.proposal_id, [])
    responsesByProposal.get(r.proposal_id)!.push(entry)
  }
  const proposalsByEvent = new Map<string, DeadlineProposalEntry[]>()
  for (const p of proposalRows) {
    const entry: DeadlineProposalEntry = {
      id: p.id, round: p.round, proposedBy: p.proposed_by, proposedByName: p.proposed_by_name ?? 'a former member',
      label: labelForChoicePayload(p.choice_payload, membersById), status: p.status,
      responses: responsesByProposal.get(p.id) ?? [],
    }
    if (!proposalsByEvent.has(p.event_id)) proposalsByEvent.set(p.event_id, [])
    proposalsByEvent.get(p.event_id)!.push(entry)
  }
  const votesByEvent = new Map<string, DeadlineVoteEntry[]>()
  for (const v of deadlineVoteRows) {
    const entry: DeadlineVoteEntry = { memberId: v.member_id, displayName: v.display_name ?? 'a former member', label: labelForChoicePayload(v.choice_payload, membersById), createdAt: v.created_at }
    if (!votesByEvent.has(v.event_id)) votesByEvent.set(v.event_id, [])
    votesByEvent.get(v.event_id)!.push(entry)
  }
  const eventsByTask = new Map<string, DeadlineEventEntry[]>()
  for (const e of eventRows) {
    const entry: DeadlineEventEntry = {
      id: e.id, deadline: e.deadline, detectedAt: e.detected_at, resolvedAt: e.resolved_at, resolution: e.resolution,
      resolvedByName: e.resolved_by_name, votes: votesByEvent.get(e.id) ?? [], proposals: proposalsByEvent.get(e.id) ?? [],
    }
    if (!eventsByTask.has(e.task_id)) eventsByTask.set(e.task_id, [])
    eventsByTask.get(e.task_id)!.push(entry)
  }

  const taskWorkflow: TaskWorkflowEntry[] = taskRows.map(t => ({
    id: t.id, title: t.title, description: t.description, status: t.status, deadline: t.deadline,
    assigneeDisplayName: t.assignee_display_name,
    submissions: submissionsByTask.get(t.id) ?? [],
    deadlineEvents: eventsByTask.get(t.id) ?? [],
  }))

  return { team, agreements, plantHealthHistory, taskWorkflow, taskStats, resolutions, declinedSubmissions }
}

export async function buildDecisionTimeline(teamId: string, context: FinalReportContext): Promise<DecisionTimelineEntry[]> {
  const teamSizeRows = await query<{ team_size: number }>('SELECT COUNT(*)::int AS team_size FROM members WHERE team_id = $1', [teamId])
  const teamSize = teamSizeRows[0]?.team_size ?? 0

  const approvalRows = await query<{ component: ChatComponent; approved_at: string; approvals: number }>(
    `SELECT component, MAX(approved_at) AS approved_at, COUNT(*)::int AS approvals
     FROM agreement_approvals WHERE team_id = $1 GROUP BY component`,
    [teamId]
  )

  const entries: DecisionTimelineEntry[] = []

  for (const a of approvalRows) {
    if (a.approvals < teamSize) continue
    const text = context.agreements.find(ag => ag.component === a.component)?.finalText
    entries.push({
      type: 'agreement_reached',
      at: a.approved_at,
      component: a.component,
      label: `Agreed on ${COMPONENT_LABELS[a.component]}`,
      detail: text ?? 'The team reached agreement.',
    })
  }

  for (const r of context.resolutions) {
    if (!r.resolutionNote) continue
    entries.push({
      type: 'tension_resolved',
      at: r.resolvedAt,
      component: r.component,
      label: `Resolved tension on ${COMPONENT_LABELS[r.component]} (check-in ${r.cycleNumber})`,
      detail: r.resolutionNote,
    })
  }

  for (const d of context.declinedSubmissions) {
    entries.push({
      type: 'work_declined',
      at: d.createdAt,
      label: `${d.displayName} raised a concern on "${d.taskTitle}"`,
      detail: d.reason,
    })
  }

  for (const task of context.taskWorkflow) {
    for (const event of task.deadlineEvents) {
      if (!event.resolvedAt || !event.resolution) continue
      entries.push({
        type: 'deadline_consensus',
        at: event.resolvedAt,
        label: `Deadline consensus reached on "${task.title}"`,
        detail: `Resolved by ${event.resolution}${event.resolvedByName ? ` (proposed by ${event.resolvedByName})` : ''}.`,
      })
    }
  }

  return entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
}
