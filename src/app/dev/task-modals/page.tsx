'use client'

import { useState } from 'react'
import { TaskSubmittedModal } from '@/components/tasks/TaskSubmittedModal'
import { TaskSummary, TaskSubmission } from '@/lib/tasks-types'

// Temporary harness so the modals are clickable before /[code]/tasks exists.
// Delete once the real tasks page wires these components in.

const TASK: TaskSummary = {
  id: 'task-1',
  title: 'Draft the methods section',
  assignedTo: { id: 'member-1', displayName: 'Priya' },
  deadline: '2026-07-20',
}

const LONG_SUBMISSION: TaskSubmission = {
  summary:
    'Wrote the full methods section covering the survey design, the sampling frame, and how we handled non-responses. ' +
    'I leaned on the pilot data for the reliability numbers rather than the full set, since the full set is still being cleaned. ' +
    'Left a TODO in the shared doc where the final Cronbach alpha needs to go once cleaning finishes. ' +
    'Also reformatted the citations to APA 7 while I was in there.',
  submittedAt: '2026-07-17T15:04:00Z',
}

const SHORT_SUBMISSION: TaskSubmission = {
  summary: 'Done — pushed to the shared doc.',
  submittedAt: '2026-07-17T15:04:00Z',
}

export default function TaskModalsDevPage() {
  const [submission, setSubmission] = useState<TaskSubmission | null>(null)
  const [log, setLog] = useState<{ id: string; text: string }[]>([])

  function record(text: string) {
    setLog(l => [{ id: crypto.randomUUID(), text }, ...l])
    setSubmission(null)
  }

  return (
    <main className="min-h-screen bg-stone-50 p-6">
      <div className="max-w-md mx-auto flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-stone-800">Task modals</h1>
        <p className="text-sm text-stone-500">Dev harness — fixture data, no backend.</p>

        <button
          onClick={() => setSubmission(LONG_SUBMISSION)}
          className="w-full bg-green-700 text-white rounded-xl py-3 font-medium hover:bg-green-800 transition"
        >
          Variant A — long submission (truncates)
        </button>
        <button
          onClick={() => setSubmission(SHORT_SUBMISSION)}
          className="w-full border border-stone-200 text-stone-600 rounded-xl py-3 hover:bg-white transition"
        >
          Variant A — short submission (no toggle)
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

      {submission && (
        <TaskSubmittedModal
          task={TASK}
          submission={submission}
          onApprove={() => record('approve()')}
          onDecline={reason => record(`decline(${JSON.stringify(reason)})`)}
          onCommentOnly={comment => record(`commentOnly(${JSON.stringify(comment)})`)}
        />
      )}
    </main>
  )
}
