import { CHAT_COMPONENTS, ChatComponent, COMPONENT_LABELS } from './chat-components'
import { sendAiApiRequest } from './ai-api'

interface ComponentAnalysisResponse {
  components: Record<ChatComponent, { comment: string; flagged: boolean }>
}

const componentAnalysisSchema = {
  type: 'object',
  properties: {
    components: {
      type: 'object',
      properties: Object.fromEntries(CHAT_COMPONENTS.map(c => [c, {
        type: 'object',
        properties: {
          comment: { type: 'string' },
          flagged: { type: 'boolean' },
        },
        required: ['comment', 'flagged'],
        additionalProperties: false,
      }])),
      required: [...CHAT_COMPONENTS],
      additionalProperties: false,
    },
  },
  required: ['components'],
  additionalProperties: false,
}

const agreementSchema = {
  type: 'object',
  properties: {
    agreement: { type: 'string' },
  },
  required: ['agreement'],
  additionalProperties: false,
}

const nudgeSchema = {
  type: 'object',
  properties: {
    flagged_components: { type: 'array', items: { type: 'string', enum: [...CHAT_COMPONENTS] } },
    nudge_bullets: { type: 'array', items: { type: 'string' } },
  },
  required: ['flagged_components', 'nudge_bullets'],
  additionalProperties: false,
}

export interface MemberReflection {
  displayName: string
  responses: Record<ChatComponent, Record<string, unknown>>
}

export interface RevealAIResult {
  perComponent: Record<ChatComponent, string>
  flaggedComponents: ChatComponent[]
}

export async function generateRevealComparison(members: MemberReflection[], projectContext?: string): Promise<RevealAIResult> {
  const memberSummaries = members.map(m => {
    const sections = Object.entries(m.responses).map(([comp, data]) =>
      `[${COMPONENT_LABELS[comp as ChatComponent]}]\n${JSON.stringify(data, null, 2)}`
    ).join('\n\n')
    return `=== ${m.displayName} ===\n${sections}`
  }).join('\n\n')

  const contextSection = projectContext
    ? `\nProject context: ${projectContext}\n`
    : ''

  const prompt = `You are analyzing a student team's individual reflections using CHAT (Cultural-Historical Activity Theory).
${contextSection}
The team has ${members.length} members. Their individual reflections across six CHAT components are below.

${memberSummaries}

For each of the six CHAT components (object, subject, division_of_labor, rules, tools, community), do two things:
1. Write a 2-3 sentence plain-language comment on where the members align or where a gap exists. Name the CHAT component explicitly. Do not tell the team what to do — only name the gap or alignment. No jargon beyond the component name itself.
2. Decide if this component should be FLAGGED (true/false). Flag it if there is a meaningful gap or potential misalignment that the team should discuss before proceeding.`

  const message = await sendAiApiRequest<ComponentAnalysisResponse>('fast_model', 1500, prompt, componentAnalysisSchema)

  const perComponent: Record<ChatComponent, string> = {} as Record<ChatComponent, string>
  const flaggedComponents: ChatComponent[] = []

  for (const [comp, v] of Object.entries(message.components)) {
    perComponent[comp as ChatComponent] = v.comment
    if (v.flagged) flaggedComponents.push(comp as ChatComponent)
  }

  return { perComponent, flaggedComponents }
}

export async function generateAgreementDraft(
  component: ChatComponent,
  memberResponses: MemberReflection[],
  resolutionNote?: string
): Promise<string> {
  const responseText = memberResponses.map(m => {
    const data = m.responses[component]
    return `${m.displayName}: ${JSON.stringify(data)}`
  }).join('\n')

  const resolutionSection = resolutionNote
    ? `\nAfter discussion, the team noted: "${resolutionNote}"`
    : ''

  const prompt = `You are helping a student team draft a group agreement for one component of their activity system.

CHAT Component: ${COMPONENT_LABELS[component]}

Individual reflections:
${responseText}${resolutionSection}

Draft a 1-2 sentence group agreement in first-person plural (starting with "We...") that captures what this team has decided about ${COMPONENT_LABELS[component]}. Plain language, no jargon. Be specific to what they actually wrote — do not add things they didn't say.`

  const message = await sendAiApiRequest<{ agreement: string }>('default_model', 300, prompt, agreementSchema)

  return message.agreement
}

export async function reviseAgreement(
  component: ChatComponent,
  currentAgreement: string,
  resolutionNote: string,
): Promise<string> {
  const prompt = `A student team is updating one group agreement after a check-in revealed tension.

CHAT Component: ${COMPONENT_LABELS[component]}

Their current agreement:
"${currentAgreement}"

After discussing the tension, the team noted:
"${resolutionNote}"

Rewrite the agreement as 1-2 sentences in first-person plural (starting with "We...") so it reflects what the team has now decided. Keep what still holds from the current agreement and fold in the new decision. Plain language, no jargon. Be specific to what they actually wrote — do not add things they didn't say.`

  const message = await sendAiApiRequest<{ agreement: string }>('default_model', 300, prompt, agreementSchema)

  return message.agreement
}

export interface CheckinSummary {
  displayName: string
  checkins: Record<ChatComponent, { rating?: string; notes?: Record<string, string> }>
}

export interface CheckinComparisonResult {
  perComponent: Record<ChatComponent, string>
  flaggedComponents: ChatComponent[]
}

export async function generateCheckinComparison(
  members: CheckinSummary[],
  agreements: Record<ChatComponent, string>,
  cycleNumber: number,
): Promise<CheckinComparisonResult> {
  const agreementText = Object.entries(agreements)
    .map(([comp, text]) => `${COMPONENT_LABELS[comp as ChatComponent]}: ${text}`)
    .join('\n')

  const checkinText = members.map(m => {
    const lines = Object.entries(m.checkins).map(([comp, data]) => {
      const r = data.rating ?? 'no rating'
      const notes = data.notes ? Object.entries(data.notes).map(([k, v]) => `  ${k}: ${v}`).join('\n') : ''
      return `  ${COMPONENT_LABELS[comp as ChatComponent]}: ${r}${notes ? '\n' + notes : ''}`
    }).join('\n')
    return `=== ${m.displayName} ===\n${lines}`
  }).join('\n\n')

  const prompt = `You are analyzing a student team's check-in (cycle ${cycleNumber}) using CHAT (Cultural-Historical Activity Theory).

Their original group agreements:
${agreementText}

Their check-in responses:
${checkinText}

For each of the six CHAT components (object, subject, division_of_labor, rules, tools, community), do two things:
1. Write a 2-3 sentence plain-language comment on whether the team is holding to what they agreed, or where tension has appeared since. Reference the original agreement vs. what members now report. Name the CHAT component. Do not tell the team what to do — only name the gap or the alignment. No jargon beyond the component name.
2. Decide if this component should be FLAGGED (true/false). Flag it if there is a "very_off" rating, a divergence between members, or drift from the original agreement that the team should discuss.`

  const message = await sendAiApiRequest<ComponentAnalysisResponse>('fast_model', 1500, prompt, componentAnalysisSchema)

  const perComponent: Record<ChatComponent, string> = {} as Record<ChatComponent, string>
  const flaggedComponents: ChatComponent[] = []
  for (const [comp, v] of Object.entries(message.components)) {
    perComponent[comp as ChatComponent] = v.comment
    if (v.flagged) flaggedComponents.push(comp as ChatComponent)
  }

  return { perComponent, flaggedComponents }
}

export interface NudgeResult {
  flaggedComponents: ChatComponent[]
  nudgeBullets: string[]
}

export async function generateCheckinNudge(
  members: CheckinSummary[],
  agreements: Record<ChatComponent, string>,
  cycleNumber: number
): Promise<NudgeResult> {
  const agreementText = Object.entries(agreements)
    .map(([comp, text]) => `${COMPONENT_LABELS[comp as ChatComponent]}: ${text}`)
    .join('\n')

  const checkinText = members.map(m => {
    const lines = Object.entries(m.checkins).map(([comp, data]) => {
      const r = data.rating ?? 'no rating'
      const notes = data.notes ? Object.entries(data.notes).map(([k, v]) => `  ${k}: ${v}`).join('\n') : ''
      return `  ${COMPONENT_LABELS[comp as ChatComponent]}: ${r}${notes ? '\n' + notes : ''}`
    }).join('\n')
    return `${m.displayName}:\n${lines}`
  }).join('\n\n')

  const prompt = `You are a collaborative learning coach using CHAT (Cultural-Historical Activity Theory). A student team is in check-in cycle ${cycleNumber}.

Their original group agreements:
${agreementText}

Their check-in responses:
${checkinText}

Identify which CHAT components show tension — any "very_off" rating, OR divergence between members' ratings for the same component (one says aligned, another says very_off).

Then write 2-4 short nudge bullets naming specific gaps without blame. Reference what was originally agreed vs. what members are now reporting. Do not tell them what to do. Each bullet is one plain sentence.`

  const message = await sendAiApiRequest<{ flagged_components: ChatComponent[]; nudge_bullets: string[] }>('fast_model', 500, prompt, nudgeSchema)

  return {
    flaggedComponents: message.flagged_components,
    nudgeBullets: message.nudge_bullets,
  }
}

export interface TaskProjectContext {
  title: string | null
  brief: string | null
  deadline: string | null
}

export interface TaskMemberInput {
  id: string
  displayName: string
  subject: Record<string, unknown>
  divisionOfLabor: Record<string, unknown>
}

export interface TaskSuggestion {
  title: string
  description: string
  assigneeMemberId: string | null
  deadline: string | null
}

function buildTaskSuggestionsSchema(memberIds: string[]) {
  return {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            assignee_member_id: { type: ['string', 'null'], enum: [...memberIds, null] },
            deadline: { type: ['string', 'null'] },
          },
          required: ['title', 'description', 'assignee_member_id', 'deadline'],
          additionalProperties: false,
        },
      },
    },
    required: ['tasks'],
    additionalProperties: false,
  }
}

export async function generateTaskSuggestions(
  project: TaskProjectContext,
  agreements: Partial<Record<ChatComponent, string>>,
  members: TaskMemberInput[],
): Promise<TaskSuggestion[]> {
  const projectSection = [
    project.title ? `Project title: ${project.title}` : '',
    project.brief ? `Assignment brief: ${project.brief}` : '',
    project.deadline ? `Team deadline: ${project.deadline}` : '',
  ].filter(Boolean).join('\n') || 'No project details were provided.'

  const agreementSection = (['object', 'division_of_labor'] as ChatComponent[])
    .filter(c => agreements[c])
    .map(c => `${COMPONENT_LABELS[c]}: ${agreements[c]}`)
    .join('\n') || 'No agreement text available yet.'

  const memberSection = members.map(m => {
    const bits = [
      m.subject.preferred_role ? `Preferred contributor style: ${Array.isArray(m.subject.preferred_role) ? (m.subject.preferred_role as string[]).join(', ') : m.subject.preferred_role}` : '',
      m.divisionOfLabor.expected_role ? `Wants to lead: ${m.divisionOfLabor.expected_role}` : '',
      m.divisionOfLabor.fair_split ? `Fair split preference: ${m.divisionOfLabor.fair_split}` : '',
      m.divisionOfLabor.avoid ? `Wants to avoid: ${m.divisionOfLabor.avoid}` : '',
    ].filter(Boolean).join('\n  ')
    return `- ${m.displayName} (id: ${m.id})${bits ? `\n  ${bits}` : ''}`
  }).join('\n')

  const prompt = `You are helping a student team break their project into a concrete task list.

${projectSection}

What the team agreed on:
${agreementSection}

Team members and what they said about the role/contribution they want:
${memberSection}

Suggest 5 to 10 concrete tasks that would make progress on this project. For each task:
- Give a short title and a 1-2 sentence description.
- Suggest one owner by picking their id from the member list above, based on what they said about the role they want — leave assignee_member_id null if no member is a clear fit.
- Suggest a deadline (YYYY-MM-DD) that falls on or before the team deadline if one was given; otherwise use your judgement based on the project timeline implied above, or leave it null if there's not enough information to guess.`

  const schema = buildTaskSuggestionsSchema(members.map(m => m.id))
  const message = await sendAiApiRequest<{
    tasks: { title: string; description: string; assignee_member_id: string | null; deadline: string | null }[]
  }>('default_model', 1800, prompt, schema)

  return message.tasks.map(t => ({
    title: t.title,
    description: t.description,
    assigneeMemberId: t.assignee_member_id,
    deadline: t.deadline,
  }))
}

const submissionSummarySchema = {
  type: 'object',
  properties: { summary: { type: 'string' } },
  required: ['summary'],
  additionalProperties: false,
}

export async function generateSubmissionSummary(
  task: { title: string; description: string | null },
  submission: { content: string; url: string | null }
): Promise<string | null> {
  const prompt = `A team member submitted work for a task. Write a 1-2 sentence plain-language summary of what they submitted, for teammates who need to review it quickly.

Task: ${task.title}${task.description ? `\n${task.description}` : ''}

Submission:
${submission.content}${submission.url ? `\nLink: ${submission.url}` : ''}

Be specific to what they actually wrote — do not add things they didn't say.`

  try {
    const message = await sendAiApiRequest<{ summary: string }>('fast_model', 300, prompt, submissionSummarySchema)
    return message.summary
  } catch {
    return null
  }
}

export interface DeadlineTaskContext {
  title: string
  description: string | null
  deadline: string
}

export interface DeadlineActionSuggestion {
  label: string
  rationale: string
  action: 'extend' | 'reassign' | 'custom'
  extendDeadline: string | null
  extendTime: string | null
  reassignMemberId: string | null
}

function buildDeadlineSuggestionsSchema(candidateMemberIds: string[]) {
  return {
    type: 'object',
    properties: {
      suggestions: {
        type: 'array',
        maxItems: 2,
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            rationale: { type: 'string' },
            action: { type: 'string', enum: ['extend', 'reassign', 'custom'] },
            extend_deadline: { type: ['string', 'null'] },
            extend_time: { type: ['string', 'null'] },
            reassign_member_id: { type: ['string', 'null'], enum: [...candidateMemberIds, null] },
          },
          required: ['label', 'rationale', 'action', 'extend_deadline', 'extend_time', 'reassign_member_id'],
          additionalProperties: false,
        },
      },
    },
    required: ['suggestions'],
    additionalProperties: false,
  }
}

// Suggestions aren't limited to extend/reassign — 'custom' carries no structured
// effect at all (e.g. "Schedule a meeting"), so a team can act on it without the
// AI needing to map every recommendation onto the two structured options.
export async function generateDeadlineActionSuggestions(
  task: DeadlineTaskContext,
  agreements: Partial<Record<ChatComponent, string>>,
  members: { id: string; displayName: string }[],
  currentAssigneeId: string | null
): Promise<DeadlineActionSuggestion[]> {
  const agreementSection = (['rules', 'division_of_labor'] as ChatComponent[])
    .filter(c => agreements[c])
    .map(c => `${COMPONENT_LABELS[c]}: ${agreements[c]}`)
    .join('\n') || 'No agreement text available.'

  // Reassigning to whoever already missed the deadline isn't a suggestion.
  const candidates = members.filter(m => m.id !== currentAssigneeId)
  const memberSection = candidates.map(m => `- ${m.displayName} (id: ${m.id})`).join('\n') || 'No other members on the team.'

  const prompt = `A student team missed a deadline on one of their tasks. Suggest 1-2 concrete next steps grounded specifically in what this team already agreed to about how they work together.

Task: ${task.title}${task.description ? `\n${task.description}` : ''}
Deadline missed: ${task.deadline}

What the team agreed on:
${agreementSection}

Other team members (for a reassignment suggestion):
${memberSection}

For each suggestion:
- Write a short label (e.g. "Extend to Friday and check in", "Hand it to Dan", "Schedule a meeting").
- Write a 1 sentence rationale that names the specific agreement text driving the suggestion — do not suggest something the team never agreed to.
- Pick an action: "extend" (propose extend_deadline as YYYY-MM-DD, after today; also propose extend_time as 24-hour HH:MM if the agreement text implies a specific time — e.g. a meeting time or work-hours cutoff — otherwise leave extend_time null and it'll default to end of day), "reassign" (propose reassign_member_id from the list above), or "custom" (anything else — leave extend_deadline, extend_time, and reassign_member_id null).
- Only suggest something the agreement text actually supports. If nothing in the agreement text supports a confident suggestion, return fewer suggestions rather than inventing one.`

  const schema = buildDeadlineSuggestionsSchema(candidates.map(m => m.id))
  const message = await sendAiApiRequest<{
    suggestions: { label: string; rationale: string; action: 'extend' | 'reassign' | 'custom'; extend_deadline: string | null; extend_time: string | null; reassign_member_id: string | null }[]
  }>('fast_model', 600, prompt, schema)

  return message.suggestions.map(s => ({
    label: s.label,
    rationale: s.rationale,
    action: s.action,
    extendDeadline: s.extend_deadline,
    extendTime: s.extend_time,
    reassignMemberId: s.reassign_member_id,
  }))
}

const finalReportSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    highlights: { type: 'array', items: { type: 'string' } },
    growth_areas: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'highlights', 'growth_areas'],
  additionalProperties: false,
}

export interface FinalReportProjectContext {
  title: string | null
  brief: string | null
}

export interface FinalReportPlantSummary {
  missedDeadlines: number
  recoveredDeadlines: number
  checkinDecrements: number
  finalState: string
}

export interface FinalReportTaskSummary {
  done: number
  total: number
  declinedSubmissions: number
}

export interface FinalReportSummaryResult {
  summary: string
  highlights: string[]
  growthAreas: string[]
}

export async function generateFinalReportSummary(
  project: FinalReportProjectContext,
  agreements: Partial<Record<ChatComponent, string>>,
  plant: FinalReportPlantSummary,
  tasks: FinalReportTaskSummary,
): Promise<FinalReportSummaryResult> {
  const projectSection = [
    project.title ? `Project title: ${project.title}` : '',
    project.brief ? `Assignment brief: ${project.brief}` : '',
  ].filter(Boolean).join('\n') || 'No project details were provided.'

  const agreementSection = CHAT_COMPONENTS
    .filter(c => agreements[c])
    .map(c => `${COMPONENT_LABELS[c]}: ${agreements[c]}`)
    .join('\n') || 'No agreement text available.'

  const prompt = `You are writing a short final wrap-up for a student team's collaboration process, at the end of their project.

${projectSection}

What the team agreed on at the start:
${agreementSection}

How the plant (the team's shared health indicator) moved over the project: ${plant.missedDeadlines} deadline(s) were missed, ${plant.recoveredDeadlines} of those were recovered by finishing and getting the work approved, and check-ins applied ${plant.checkinDecrements} additional level decrement(s) for CHAT-alignment tension. The plant ended the project in state: ${plant.finalState}.

Task delivery: ${tasks.done} of ${tasks.total} tasks were completed and approved. ${tasks.declinedSubmissions} submission(s) were declined by a teammate before being approved.

Write a 3-4 sentence plain-language narrative of how this team collaborated and delivered, covering both how they worked together and how the work actually got done. Then list 2-4 short "went well" highlight bullets, and 2-4 short constructive growth-area bullets (framed for what to watch for next time, not blame). Be specific to what actually happened above — do not invent details that weren't given.`

  const message = await sendAiApiRequest<{ summary: string; highlights: string[]; growth_areas: string[] }>('default_model', 800, prompt, finalReportSchema)

  return {
    summary: message.summary,
    highlights: message.highlights,
    growthAreas: message.growth_areas,
  }
}
