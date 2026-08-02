'use client'

import { useId, useState } from 'react'
import { Modal } from '@/components/Modal'

interface DiscussionTimerExpiredModalProps {
  isLeader: boolean
  onExtend: () => void | Promise<void>
}

export function DiscussionTimerExpiredModal({ isLeader, onExtend }: DiscussionTimerExpiredModalProps) {
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
        <h2 id={headingId} className="text-lg font-bold text-stone-800">Need more time?</h2>

        {isLeader ? (
          <button
            onClick={() => run(onExtend)}
            disabled={busy}
            className="w-full bg-green-700 text-white rounded-xl py-3 mt-4 font-medium hover:bg-green-800 disabled:opacity-40 transition"
          >
            {busy ? 'Adding time…' : 'Add 5 minutes'}
          </button>
        ) : (
          <p className="text-sm text-stone-400 mt-4">Waiting on your team leader to add more time.</p>
        )}
      </div>
    </Modal>
  )
}
