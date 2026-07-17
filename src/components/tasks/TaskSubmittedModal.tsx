'use client'

import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { TaskSummary, TaskSubmission } from '@/lib/tasks-types'

const TRUNCATE_AT = 180

type Mode = 'idle' | 'declining' | 'commenting'

interface TaskSubmittedModalProps {
  task: TaskSummary
  submission: TaskSubmission
  onApprove: () => void | Promise<void>
  onDecline: (reason: string) => void | Promise<void>
  onCommentOnly: (comment: string) => void | Promise<void>
}

// Mount to show, unmount to dismiss — there's no `open` prop, so the pending
// decision's state can't outlive the decision it belongs to.
export function TaskSubmittedModal({
  task,
  submission,
  onApprove,
  onDecline,
  onCommentOnly,
}: TaskSubmittedModalProps) {
  const [mode, setMode] = useState<Mode>('idle')
  const [text, setText] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)

  const truncated = submission.summary.length > TRUNCATE_AT
  const shownSummary =
    expanded || !truncated ? submission.summary : `${submission.summary.slice(0, TRUNCATE_AT).trimEnd()}…`

  const submittedLabel = new Date(submission.submittedAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  function switchMode(next: Mode) {
    setMode(next)
    setText('')
  }

  async function run(action: () => void | Promise<void>) {
    if (busy) return
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open>
      <div className="p-5">
        <p className="text-xs text-stone-400 uppercase tracking-wide font-medium mb-1">Task submitted</p>
        <h2 className="text-lg font-bold text-stone-800">{task.title}</h2>
        <p className="text-sm text-stone-500 mt-0.5">
          Submitted by {task.assignedTo.displayName} · {submittedLabel}
        </p>

        <div className="bg-stone-50 border border-stone-100 rounded-xl p-4 mt-4">
          <p className="text-sm text-stone-700 whitespace-pre-wrap">{shownSummary}</p>
          {truncated && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-sm text-green-700 hover:underline mt-2"
            >
              {expanded ? 'Hide submission' : 'View submission'}
            </button>
          )}
        </div>

        {mode === 'idle' ? (
          <>
            <p className="text-sm font-medium text-stone-700 mt-5 mb-3">What would you like to do?</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => run(onApprove)}
                disabled={busy}
                className="w-full bg-green-700 text-white rounded-xl py-3 font-medium hover:bg-green-800 disabled:opacity-40 transition"
              >
                Approve
              </button>
              <button
                onClick={() => switchMode('declining')}
                disabled={busy}
                className="w-full bg-amber-50 border border-amber-200 text-amber-800 rounded-xl py-3 hover:bg-amber-100 disabled:opacity-40 transition"
              >
                Decline
              </button>
              <button
                onClick={() => switchMode('commenting')}
                disabled={busy}
                className="w-full border border-stone-200 text-stone-600 rounded-xl py-3 hover:bg-stone-50 disabled:opacity-40 transition"
              >
                Comment only
              </button>
            </div>
          </>
        ) : (
          <div className="mt-5">
            <label className="block text-sm font-medium text-stone-700 mb-2">
              {mode === 'declining' ? 'Why are you declining this?' : 'Your comment'}
            </label>
            <textarea
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800 resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
              rows={4}
              autoFocus
              placeholder={
                mode === 'declining'
                  ? 'Explain what still needs work…'
                  : 'Leave feedback without approving or declining…'
              }
              value={text}
              onChange={e => setText(e.target.value)}
            />
            {mode === 'commenting' && (
              <p className="text-xs text-stone-400 mt-2">
                The task stays pending — this neither approves nor declines it.
              </p>
            )}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => switchMode('idle')}
                disabled={busy}
                className="px-4 border border-stone-200 text-stone-600 rounded-xl py-3 hover:bg-stone-50 disabled:opacity-40 transition"
              >
                Back
              </button>
              <button
                onClick={() =>
                  run(() => (mode === 'declining' ? onDecline(text.trim()) : onCommentOnly(text.trim())))
                }
                disabled={busy || !text.trim()}
                className="flex-1 bg-green-700 text-white rounded-xl py-3 font-medium hover:bg-green-800 disabled:opacity-40 transition"
              >
                {mode === 'declining' ? 'Decline and send back' : 'Send comment'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
