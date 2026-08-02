'use client'

import { useId, useState } from 'react'
import { Modal } from '@/components/Modal'

interface DiscussionTimerStartModalProps {
  isLeader: boolean
  onStart: () => void | Promise<void>
}

export function DiscussionTimerStartModal({ isLeader, onStart }: DiscussionTimerStartModalProps) {
  const [busy, setBusy] = useState(false)
  const headingId = useId()

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
        <h2 id={headingId} className="text-lg font-bold text-stone-800">Get ready for a discussion</h2>
        <p className="text-sm text-stone-500 mt-1">You will have 15 minutes to discuss your disagreements.</p>

        {isLeader ? (
          <button
            onClick={() => run(onStart)}
            disabled={busy}
            className="w-full bg-green-700 text-white rounded-xl py-3 mt-5 font-medium hover:bg-green-800 disabled:opacity-40 transition"
          >
            {busy ? 'Starting…' : 'Start timer'}
          </button>
        ) : (
          <p className="text-sm text-stone-400 mt-5">Waiting on your team leader to start this.</p>
        )}
      </div>
    </Modal>
  )
}
