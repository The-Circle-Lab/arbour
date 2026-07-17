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
