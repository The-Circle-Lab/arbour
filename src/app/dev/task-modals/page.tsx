'use client'

import { useState } from 'react'
import { TaskSubmittedModal } from '@/components/tasks/TaskSubmittedModal'
import { DeadlineMissedModal } from '@/components/tasks/DeadlineMissedModal'
import { TaskSummary, TaskSubmission, TeamMemberOption } from '@/lib/tasks-types'

// Temporary harness so the modals are clickable before /[code]/tasks exists.
// Delete once the real tasks page wires these components in.

const MEMBERS: TeamMemberOption[] = [
  { id: 'member-1', displayName: 'Priya' },
  { id: 'member-2', displayName: 'Dan' },
  { id: 'member-3', displayName: 'Sam' },
]

const TASK: TaskSummary = {
  id: 'task-1',
  title: 'Draft the methods section',
  assignedTo: MEMBERS[0],
  deadline: '2026-07-20',
}

const OVERDUE_TASK: TaskSummary = {
  id: 'task-2',
  title: 'Run the pilot analysis',
  assignedTo: MEMBERS[0],
  deadline: '2026-07-13',
}

const SOLO_TASK: TaskSummary = {
  ...OVERDUE_TASK,
  id: 'task-3',
  title: 'Book the lab slot',
}

const LONG_SUBMISSION: TaskSubmission = {
  summary:
    'Wrote the full methods section covering the survey design, the sampling frame, and how we handled non-responses. ' +
    'I leaned on the pilot data for the reliability numbers rather than the full set, since the full set is still being cleaned. ' +
    'Left a TODO in the shared doc where the final alpha value needs to go once cleaning finishes. ' +
    'Also reformatted the citations to APA 7 while I was in there.',
  submittedAt: '2026-07-17T15:04:00Z',
}

const SHORT_SUBMISSION: TaskSubmission = {
  summary: 'Done — pushed to the shared doc.',
  submittedAt: '2026-07-17T15:04:00Z',
}

type DemoModal =
  | { kind: 'submitted'; submission: TaskSubmission }
  | { kind: 'deadline_missed'; task: TaskSummary; members: TeamMemberOption[] }
  | null

export default function TaskModalsDevPage() {
  const [modal, setModal] = useState<DemoModal>(null)
  const [log, setLog] = useState<{ id: string; text: string }[]>([])

  function record(text: string) {
    setLog(l => [{ id: crypto.randomUUID(), text }, ...l])
    setModal(null)
  }

  const primary = 'w-full bg-green-700 text-white rounded-xl py-3 font-medium hover:bg-green-800 transition'
  const secondary = 'w-full border border-stone-200 text-stone-600 rounded-xl py-3 hover:bg-white transition'

  return (
    <main className="min-h-screen bg-stone-50 p-6">
      <div className="max-w-md mx-auto flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-stone-800">Task modals</h1>
        <p className="text-sm text-stone-500">Dev harness — fixture data, no backend.</p>

        <p className="text-xs text-stone-400 uppercase tracking-wide font-medium mt-2">Variant A — submitted</p>
        <button onClick={() => setModal({ kind: 'submitted', submission: LONG_SUBMISSION })} className={primary}>
          Long submission (truncates)
        </button>
        <button onClick={() => setModal({ kind: 'submitted', submission: SHORT_SUBMISSION })} className={secondary}>
          Short submission (no toggle)
        </button>

        <p className="text-xs text-stone-400 uppercase tracking-wide font-medium mt-2">Variant B — deadline missed</p>
        <button
          onClick={() => setModal({ kind: 'deadline_missed', task: OVERDUE_TASK, members: MEMBERS })}
          className={primary}
        >
          Overdue task
        </button>
        <button
          onClick={() => setModal({ kind: 'deadline_missed', task: SOLO_TASK, members: [MEMBERS[0]] })}
          className={secondary}
        >
          Overdue, no other members (reassign empty)
        </button>

        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mt-2">
          <p className="text-xs text-stone-400 uppercase tracking-wide font-medium mb-3">Actions fired</p>
          {log.length === 0 ? (
            <p className="text-sm text-stone-400 italic">Nothing yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {log.map(entry => (
                <li key={entry.id} className="text-sm text-stone-700 font-mono break-words">
                  {entry.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {modal?.kind === 'submitted' && (
        <TaskSubmittedModal
          task={TASK}
          submission={modal.submission}
          onApprove={() => record('approve()')}
          onDecline={reason => record(`decline(${JSON.stringify(reason)})`)}
          onCommentOnly={comment => record(`commentOnly(${JSON.stringify(comment)})`)}
        />
      )}

      {modal?.kind === 'deadline_missed' && (
        <DeadlineMissedModal
          task={modal.task}
          overdueDurationLabel="4 days overdue"
          members={modal.members}
          onExtend={date => record(`extend(${JSON.stringify(date)})`)}
          onReassign={id => record(`reassign(${JSON.stringify(id)})`)}
          onIgnore={() => record('ignore()')}
        />
      )}
    </main>
  )
}
