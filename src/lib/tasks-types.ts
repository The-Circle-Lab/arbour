// Shapes the task consensus modals render. Nothing here touches the database —
// these mirror (a subset of / a light transform over) the real API response
// shapes from GET /api/tasks, described in the review/deadlineEvent fields.

export interface TeamMemberOption {
  id: string
  displayName: string
}

export interface SubmissionVote {
  memberId: string | null
  displayName: string
  vote: 'approve' | 'decline'
  reason: string | null
}

export interface SubmissionComment {
  memberId: string | null
  displayName: string
  comment: string
  createdAt: string
}

export interface PendingReview {
  submissionId: string
  submittedBy: string | null
  votes: SubmissionVote[]
  comments: SubmissionComment[]
  eligibleVoters: number
  myVote: 'approve' | 'decline' | null
}

export interface DeadlineActionSuggestion {
  id: string
  label: string
  rationale: string
  choiceKey: string
}

export interface DeadlineVote {
  memberId: string | null
  displayName: string
  choiceKey: string
  label: string
}

export interface DeadlineProposalResponse {
  memberId: string | null
  displayName: string
  response: 'agree' | 'disagree'
}

export interface DeadlineProposal {
  id: string
  proposedBy: string | null
  proposedByName: string
  choiceKey: string
  label: string
  responses: DeadlineProposalResponse[]
}

export interface PendingDeadlineEvent {
  id: string
  deadline: string
  detectedAt: string
  phase: 'voting' | 'proposing'
  round: number
  suggestions: DeadlineActionSuggestion[]
  votes: DeadlineVote[]
  proposal: DeadlineProposal | null
}

export type ChoiceInput =
  | { type: 'extend'; deadline: string }
  | { type: 'reassign'; memberId: string }
  | { type: 'ignore' }
  | { type: 'suggestion'; suggestionId: string }

// choiceKey is the canonical string the backend uses for exact-match
// unanimity checks (e.g. 'extend:2026-07-24', 'reassign:<memberId>',
// 'ignore', 'custom:<suggestionId>') — parsing it back out lets the round-2
// "propose one of round 1's distinct choices" UI resubmit an exact vote
// without needing to separately track each ballot's original input shape.
export function parseChoiceKey(choiceKey: string): ChoiceInput | null {
  if (choiceKey === 'ignore') return { type: 'ignore' }
  const [prefix, ...rest] = choiceKey.split(':')
  const value = rest.join(':')
  if (prefix === 'extend' && value) return { type: 'extend', deadline: value }
  if (prefix === 'reassign' && value) return { type: 'reassign', memberId: value }
  if (prefix === 'custom' && value) return { type: 'suggestion', suggestionId: value }
  return null
}
