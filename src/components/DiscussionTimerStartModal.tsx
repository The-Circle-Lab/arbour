'use client'

import { useId, useState } from 'react'
import { Modal } from '@/components/Modal'

interface DiscussionTimerStartModalProps {
  isProjectManager: boolean
  onStart: () => void | Promise<void>
}

export function DiscussionTimerStartModal({ isProjectManager, onStart }: DiscussionTimerStartModalProps) {
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
      <div className="p-6">
        <div className="flex items-center gap-3 mb-3">
          <span
            className="flex-none w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xl"
            aria-hidden
          >
            ⚠
          </span>
          <h2 id={headingId} className="text-lg font-bold text-stone-800">Time to talk it through</h2>
        </div>
        <p className="text-sm text-stone-600">
          Your team has real differences to work out. Clicking the button will start a timer for a <span className="font-semibold text-amber-700">15-minute</span> discussion. This gives your team limited time to have a discussion and come up with resolution steps for <span className="font-semibold text-amber-700">all categories</span>.
        </p>

        {isProjectManager ? (
          <button
            onClick={() => run(onStart)}
            disabled={busy}
            className="w-full bg-amber-600 text-white rounded-xl py-3.5 mt-5 font-semibold hover:bg-amber-700 disabled:opacity-40 transition"
          >
            {busy ? 'Starting…' : 'Start timer'}
          </button>
        ) : (
          <p className="text-sm text-stone-400 mt-5 text-center">Waiting on your project manager to start the timer…</p>
        )}
      </div>
    </Modal>
  )
}
