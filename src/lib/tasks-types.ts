// Shapes the task modals render. Nothing here touches the database — this is
// the contract the backend ticket's poll/push payload needs to satisfy.

export interface TeamMemberOption {
  id: string
  displayName: string
}

export interface TaskSummary {
  id: string
  title: string
  assignedTo: TeamMemberOption
  deadline: string | null
}

export interface TaskSubmission {
  summary: string
  submittedAt: string
}

export type TaskAction = 'extend' | 'reassign' | 'ignore'

// An AI recommendation is a shortcut onto one of the static actions, never an
// action of its own — so a slow or failed suggestion can't block anyone.
export interface TaskActionSuggestion {
  id: string
  label: string
  rationale: string
  action: TaskAction
  prefill?: { deadline?: string; memberId?: string }
}
