export type TaskStatus = 'todo' | 'in_progress' | 'submitted' | 'done'

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  submitted: 'Submitted',
  done: 'Done',
}

export const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: 'bg-stone-100 text-stone-600 border-stone-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  submitted: 'bg-purple-50 text-purple-700 border-purple-200',
  done: 'bg-green-100 text-green-700 border-green-200',
}

// Statuses a user can manually set from a status dropdown or PATCH request —
// 'submitted' is set exclusively by the /[code]/tasks submit flow. Shared by
// the create-tasks dropdown and the PATCH endpoint's validation so the two
// can't drift apart.
export const EDITABLE_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done']

// Statuses from which a task can still be submitted — shared by the submit
// endpoint's rejection check and the client's "Submit this task" button so
// the two can't drift apart.
export function isSubmittable(status: TaskStatus): boolean {
  return status === 'todo' || status === 'in_progress'
}

export interface TaskSubmission {
  id: string
  submitted_by: string | null
  submitter_display_name: string | null
  submitted_at: string
  content: string
  url: string | null
  summary: string | null
}
