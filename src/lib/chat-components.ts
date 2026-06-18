export const CHAT_COMPONENTS = [
  'object',
  'subject',
  'division_of_labor',
  'rules',
  'tools',
  'community',
] as const

export type ChatComponent = (typeof CHAT_COMPONENTS)[number]

export const COMPONENT_LABELS: Record<ChatComponent, string> = {
  object: 'Object',
  subject: 'Subject',
  division_of_labor: 'Division of Labor',
  rules: 'Rules',
  tools: 'Tools',
  community: 'Community',
}

export const COMPONENT_DESCRIPTIONS: Record<ChatComponent, string> = {
  object: 'The shared goal — what success looks like for this project',
  subject: 'What each person wants to get out of doing this',
  division_of_labor: 'Who does what, and what fair contribution looks like',
  rules: 'How the team communicates, meets, decides, and maintains quality',
  tools: 'Platforms and tools the team will use',
  community: 'Who is part of this project\'s ecosystem and who has a say',
}

export const REFLECTION_QUESTIONS: Record<ChatComponent, { id: string; question: string; type: 'text' | 'multiselect'; options?: string[] }[]> = {
  object: [
    { id: 'success_vision', question: 'What does a successful outcome look like to you, specifically?', type: 'text' },
    { id: 'must_achieve', question: 'If you had to pick one thing this project must achieve for you to call it a success, what is it?', type: 'text' },
  ],
  subject: [
    { id: 'personal_goal', question: 'What do you want to get out of doing this project — beyond the grade/deliverable?', type: 'text' },
    { id: 'contributor_style', question: 'What kind of contributor are you in group work — and is that the role you want this time?', type: 'text' },
  ],
  division_of_labor: [
    { id: 'expected_role', question: 'What role do you expect or want to take on?', type: 'text' },
    { id: 'fair_workload', question: 'What does a fair workload distribution look like to you?', type: 'text' },
    { id: 'ownership', question: 'Is there anything you strongly want to own, or strongly want to avoid?', type: 'text' },
  ],
  rules: [
    { id: 'communication', question: 'Communication: where, and what response time is reasonable?', type: 'text' },
    { id: 'meetings', question: 'Meetings: how often, and what counts as showing up prepared?', type: 'text' },
    { id: 'decisions', question: 'Decision-making: consensus, majority, or role-based — and how should conflict be resolved?', type: 'text' },
    { id: 'quality', question: 'Work quality: what\'s your bar for "good enough" vs. "not acceptable"?', type: 'text' },
  ],
  tools: [
    { id: 'expected_tools', question: 'What tools/platforms do you expect to use for this project?', type: 'text' },
    { id: 'personal_tools', question: 'Is there a tool you rely on that others might not be using?', type: 'text' },
  ],
  community: [
    {
      id: 'ecosystem',
      question: 'Who do you consider part of this project\'s ecosystem?',
      type: 'multiselect',
      options: ['Group members', 'Instructor', 'TA', 'Client or external stakeholder', 'Other'],
    },
    {
      id: 'no_say',
      question: 'Who do you think has no real say in how the group operates?',
      type: 'multiselect',
      options: ['Instructor', 'TA', 'Client or external stakeholder', 'A specific group member', 'Nobody outside the group', 'Other'],
    },
  ],
}

export const CHECKIN_QUESTIONS: Record<ChatComponent, { id: string; question: string; hasRating: boolean }[]> = {
  object: [
    { id: 'shared_outcome', question: 'Do you still feel like the group is working toward the same outcome you agreed on?', hasRating: true },
  ],
  subject: [
    { id: 'role_satisfaction', question: 'Are you getting the kind of role/contribution you wanted out of this?', hasRating: true },
  ],
  division_of_labor: [
    { id: 'workload_fair', question: 'Does the current workload feel fair, given what was agreed?', hasRating: true },
    { id: 'unexpected_work', question: 'Is there anything you\'ve ended up doing that wasn\'t part of your expected role?', hasRating: false },
  ],
  rules: [
    { id: 'communication_match', question: 'Has communication matched what was agreed?', hasRating: true },
    { id: 'meetings_match', question: 'Have meetings happened the way you expected?', hasRating: true },
    { id: 'decision_handling', question: 'Has a decision or disagreement come up — if so, was it handled the way you agreed?', hasRating: false },
  ],
  tools: [
    { id: 'tools_used', question: 'Has everyone been using the tools you agreed on, or has something shifted?', hasRating: true },
  ],
  community: [
    { id: 'outside_influence', question: 'Has anyone outside the group started influencing decisions in a way that wasn\'t expected?', hasRating: true },
  ],
}

export type Rating = 'aligned' | 'slightly_off' | 'very_off'

export const RATING_LABELS: Record<Rating, string> = {
  aligned: 'Aligned',
  slightly_off: 'Slightly off',
  very_off: 'Very off',
}

export const RATING_VALUES: Record<Rating, number> = {
  aligned: 0,
  slightly_off: 1,
  very_off: 2,
}
