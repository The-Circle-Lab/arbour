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
