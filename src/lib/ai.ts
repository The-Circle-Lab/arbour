import Anthropic from '@anthropic-ai/sdk'
import { ChatComponent, COMPONENT_LABELS } from './chat-components'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL_FAST = 'claude-haiku-4-5-20251001'
const MODEL = 'claude-sonnet-4-6'

export interface MemberReflection {
  displayName: string
  responses: Record<ChatComponent, Record<string, unknown>>
}

export interface RevealAIResult {
  perComponent: Record<ChatComponent, string>
  flaggedComponents: ChatComponent[]
}

export async function generateRevealComparison(members: MemberReflection[]): Promise<RevealAIResult> {
  const memberSummaries = members.map(m => {
    const sections = Object.entries(m.responses).map(([comp, data]) =>
      `[${COMPONENT_LABELS[comp as ChatComponent]}]\n${JSON.stringify(data, null, 2)}`
    ).join('\n\n')
    return `=== ${m.displayName} ===\n${sections}`
  }).join('\n\n')

  const prompt = `You are analyzing a student team's individual reflections using CHAT (Cultural-Historical Activity Theory).

The team has ${members.length} members. Their individual reflections across six CHAT components are below.

${memberSummaries}

For each of the six CHAT components (object, subject, division_of_labor, rules, tools, community), do two things:
1. Write a 2-3 sentence plain-language comment on where the members align or where a gap exists. Name the CHAT component explicitly. Do not tell the team what to do — only name the gap or alignment. No jargon beyond the component name itself.
2. Decide if this component should be FLAGGED (true/false). Flag it if there is a meaningful gap or potential misalignment that the team should discuss before proceeding.

Respond with valid JSON only, no markdown:
{
  "components": {
    "object": { "comment": "...", "flagged": true/false },
    "subject": { "comment": "...", "flagged": true/false },
    "division_of_labor": { "comment": "...", "flagged": true/false },
    "rules": { "comment": "...", "flagged": true/false },
    "tools": { "comment": "...", "flagged": true/false },
    "community": { "comment": "...", "flagged": true/false }
  }
}`

  const message = await client.messages.create({
    model: MODEL_FAST,
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = (message.content[0] as { type: string; text: string }).text
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  const parsed = JSON.parse(text)

  const perComponent: Record<ChatComponent, string> = {} as Record<ChatComponent, string>
  const flaggedComponents: ChatComponent[] = []

  for (const [comp, val] of Object.entries(parsed.components)) {
    const v = val as { comment: string; flagged: boolean }
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

Draft a 1-2 sentence group agreement in first-person plural (starting with "We...") that captures what this team has decided about ${COMPONENT_LABELS[component]}. Plain language, no jargon. Be specific to what they actually wrote — do not add things they didn't say.

Respond with just the agreement text, no quotes or extra formatting.`

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  })

  return (message.content[0] as { type: string; text: string }).text.trim()
}

export interface CheckinSummary {
  displayName: string
  checkins: Record<ChatComponent, { rating?: string; notes?: Record<string, string> }>
}

export interface NudgeResult {
  flaggedComponents: ChatComponent[]
  nudgeText: string
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

Then write ONE short nudge: 2-3 plain-language sentences naming the specific gap without blame. Reference what was originally agreed vs. what members are now reporting. Do not tell them what to do.

Respond with valid JSON only, no markdown:
{
  "flagged_components": ["component_name", ...],
  "nudge": "..."
}`

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = (message.content[0] as { type: string; text: string }).text
  const parsed = JSON.parse(text)

  return {
    flaggedComponents: parsed.flagged_components as ChatComponent[],
    nudgeText: parsed.nudge as string,
  }
}
