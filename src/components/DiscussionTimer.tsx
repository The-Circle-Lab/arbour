'use client'

import { useEffect, useState } from 'react'
import { DiscussionTimerStartModal } from '@/components/DiscussionTimerStartModal'
import { DiscussionTimerExpiredModal } from '@/components/DiscussionTimerExpiredModal'
import type { DiscussionTimerState } from '@/lib/discussion-timer'

export type { DiscussionTimerState }

interface DiscussionTimerProps {
  loading: boolean
  timer: DiscussionTimerState | null
  isLeader: boolean
  onStart: () => void | Promise<void>
  onExtend: () => void | Promise<void>
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

// Fetching is owned by the parent page — it already polls team/agreement
// state on the same 4s cadence, so folding the timer into that call keeps
// both in sync from a single snapshot instead of two independent polls.
export function DiscussionTimer({ loading, timer, isLeader, onStart, onExtend }: DiscussionTimerProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  if (loading) return null

  if (!timer) {
    return <DiscussionTimerStartModal isLeader={isLeader} onStart={onStart} />
  }

  const remainingMs = new Date(timer.expiresAt).getTime() - now

  return (
    <>
      <div className="sticky top-0 z-40 bg-amber-50 border-b border-amber-200 text-amber-900 text-center py-2 text-sm font-semibold tracking-wide">
        {remainingMs > 0 ? `Time remaining: ${formatRemaining(remainingMs)}` : "Time's up"}
      </div>
      {remainingMs <= 0 && <DiscussionTimerExpiredModal isLeader={isLeader} onExtend={onExtend} />}
    </>
  )
}
