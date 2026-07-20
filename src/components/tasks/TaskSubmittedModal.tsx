'use client'

import { useId, useState } from 'react'
import { Modal } from '@/components/Modal'
import type { SubmissionComment, SubmissionVote } from '@/lib/tasks-types'

type Mode = 'idle' | 'declining'

interface TaskSubmittedModalProps {
  taskTitle: string
  submitterName: string
  submittedAt: string
  summary: string | null
  content: string
  url: string | null
  votes: SubmissionVote[]
  comments: SubmissionComment[]
  eligibleVoters: number
  myVote: 'approve' | 'decline' | null
  onApprove: () => void | Promise<void>
  onDecline: (reason: string) => void | Promise<void>
  onCommentOnly: (comment: string) => void | Promise<void>
}

// Mount to show, unmount to dismiss — there's no `open` prop, so the pending
// decision's state can't outlive the decision it belongs to.
export function TaskSubmittedModal({
  taskTitle,
  submitterName,
  submittedAt,
  summary,
  content,
  url,
  votes,
  comments,
  eligibleVoters,
  myVote,
  onApprove,
  onDecline,
  onCommentOnly,
}: TaskSubmittedModalProps) {
  const [mode, setMode] = useState<Mode>('idle')
  const [reason, setReason] = useState('')
  const [commentText, setCommentText] = useState('')
  const [showFull, setShowFull] = useState(false)
  const [busy, setBusy] = useState(false)
  const headingId = useId()
  const reasonFieldId = useId()
  const commentFieldId = useId()

  const submittedLabel = new Date(submittedAt).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })

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
    <Modal open labelledBy={headingId}>
      <div className="p-5">
        <p className="text-xs text-stone-400 uppercase tracking-wide font-medium mb-1">Task submitted</p>
        <h2 id={headingId} className="text-lg font-bold text-stone-800">{taskTitle}</h2>
        <p className="text-sm text-stone-500 mt-0.5">
          Submitted by {submitterName} · {submittedLabel}
        </p>

        <div className="bg-stone-50 border border-stone-100 rounded-xl p-4 mt-4">
          <p className="text-sm text-stone-700 whitespace-pre-wrap">{summary ?? content}</p>
          {summary && (
            <button
              onClick={() => setShowFull(v => !v)}
              aria-expanded={showFull}
              className="text-sm text-green-700 hover:underline mt-2"
            >
              {showFull ? 'Hide submission' : 'View submission'}
            </button>
          )}
          {(showFull || !summary) && (
            <>
              {summary && <p className="text-sm text-stone-700 whitespace-pre-wrap mt-2 pt-2 border-t border-stone-200">{content}</p>}
              {url && (
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-purple-700 underline break-all mt-2 block">
                  {url}
                </a>
              )}
            </>
          )}
        </div>

        {votes.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-stone-400 uppercase tracking-wide font-medium mb-2">
              {votes.filter(v => v.vote === 'approve').length} of {eligibleVoters} approved
            </p>
            <div className="flex flex-col gap-1.5">
              {votes.map((v, i) => (
                <div key={v.memberId ?? i} className="flex items-start gap-2 text-sm">
                  <span className={`shrink-0 font-medium ${v.vote === 'approve' ? 'text-green-700' : 'text-amber-700'}`}>
                    {v.vote === 'approve' ? '✓' : '✗'}
                  </span>
                  <span className="text-stone-600">
                    <span className="font-medium text-stone-700">{v.displayName}</span>
                    {' '}{v.vote === 'approve' ? 'approved' : `declined — ${v.reason}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {comments.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {comments.map((c, i) => (
              <div key={i} className="bg-stone-50 border border-stone-100 rounded-lg p-3">
                <p className="text-xs font-medium text-stone-500 mb-1">{c.displayName}</p>
                <p className="text-sm text-stone-700 whitespace-pre-wrap">{c.comment}</p>
              </div>
            ))}
          </div>
        )}

        {myVote === null && (
          mode === 'idle' ? (
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
                  onClick={() => setMode('declining')}
                  disabled={busy}
                  className="w-full bg-amber-50 border border-amber-200 text-amber-800 rounded-xl py-3 hover:bg-amber-100 disabled:opacity-40 transition"
                >
                  Decline
                </button>
              </div>
            </>
          ) : (
            <div className="mt-5">
              <label htmlFor={reasonFieldId} className="block text-sm font-medium text-stone-700 mb-2">
                Why are you declining this?
              </label>
              <textarea
                id={reasonFieldId}
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800 resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
                rows={4}
                autoFocus
                placeholder="Explain what still needs work…"
                value={reason}
                onChange={e => setReason(e.target.value)}
              />
              <p className="text-xs text-stone-400 mt-2">
                A single decline sends this back — it doesn&apos;t wait on anyone else&apos;s vote.
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setMode('idle')}
                  disabled={busy}
                  className="px-4 border border-stone-200 text-stone-600 rounded-xl py-3 hover:bg-stone-50 disabled:opacity-40 transition"
                >
                  Back
                </button>
                <button
                  onClick={() => run(() => onDecline(reason.trim()))}
                  disabled={busy || !reason.trim()}
                  className="flex-1 bg-green-700 text-white rounded-xl py-3 font-medium hover:bg-green-800 disabled:opacity-40 transition"
                >
                  Decline and send back
                </button>
              </div>
            </div>
          )
        )}

        {myVote !== null && (
          <p className="text-sm text-stone-500 mt-5">
            You already {myVote === 'approve' ? 'approved' : 'declined'} this submission.
          </p>
        )}

        <div className="mt-4 pt-4 border-t border-stone-100">
          <label htmlFor={commentFieldId} className="block text-sm font-medium text-stone-700 mb-2">
            Leave a comment
          </label>
          <p className="text-xs text-stone-400 mb-2">A comment doesn&apos;t approve, decline, or block anything — it&apos;s just visible to the team.</p>
          <div className="flex gap-2">
            <textarea
              id={commentFieldId}
              className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800 resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
              rows={2}
              placeholder="Flag something without deciding for the team…"
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
            />
            <button
              onClick={() => run(async () => { await onCommentOnly(commentText.trim()); setCommentText('') })}
              disabled={busy || !commentText.trim()}
              className="shrink-0 self-end border border-stone-200 text-stone-600 rounded-lg px-4 py-2 text-sm hover:bg-stone-50 disabled:opacity-40 transition"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
