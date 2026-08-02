'use client'

import { useCallback, useEffect, useState } from 'react'
import { DiscussionTimerStartModal } from '@/components/DiscussionTimerStartModal'
import { DiscussionTimerExpiredModal } from '@/components/DiscussionTimerExpiredModal'

type DiscussionStep = 'AGREEING' | 'CHECKIN_AGREE'

interface DiscussionTimerProps {
  code: string
  step: DiscussionStep
  cycleNumber: number | null
  isLeader: boolean
}

interface TimerState {
  startedAt: string
  expiresAt: string
  extensionCount: number
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function DiscussionTimer({ code, step, cycleNumber, isLeader }: DiscussionTimerProps) {
  const [loading, setLoading] = useState(true)
  const [timer, setTimer] = useState<TimerState | null>(null)
  const [now, setNow] = useState(() => Date.now())
  // Once a poll has returned a real timer, a later null means this step was
  // resolved — not "never started." The parent unmounts this component
  // shortly after (its own allDone/allResolved flips from the same
  // underlying approval data), but this guards the steady-state polling
  // window in between so a finished team never sees the start modal again.
  // State, not a ref, because it's read during render to decide what shows.
  const [hasSeenTimer, setHasSeenTimer] = useState(false)

  const fetchTimer = useCallback(async (): Promise<TimerState | null | undefined> => {
    const params = new URLSearchParams({ step })
    if (cycleNumber !== null) params.set('cycle', String(cycleNumber))
    const res = await fetch(`/api/teams/${code}/discussion-timer?${params.toString()}`)
    if (!res.ok) return undefined
    return res.json()
  }, [code, step, cycleNumber])

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const data = await fetchTimer()
        if (cancelled || data === undefined) return
        if (data) setHasSeenTimer(true)
        setTimer(data)
      } catch {
        // transient network error — retry on next tick
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    poll()
    const interval = setInterval(poll, 4000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [fetchTimer])

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  async function post(action: 'start' | 'extend') {
    await fetch(`/api/teams/${code}/discussion-timer/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step, cycleNumber }),
    })
    const data = await fetchTimer()
    if (data) setHasSeenTimer(true)
    if (data !== undefined) setTimer(data)
  }

  if (loading) return null

  if (!timer) {
    if (hasSeenTimer) return null
    return <DiscussionTimerStartModal isLeader={isLeader} onStart={() => post('start')} />
  }

  const remainingMs = new Date(timer.expiresAt).getTime() - now

  return (
    <>
      <div className="sticky top-0 z-40 bg-amber-50 border-b border-amber-200 text-amber-900 text-center py-2 text-sm font-semibold tracking-wide">
        {remainingMs > 0 ? `Time remaining: ${formatRemaining(remainingMs)}` : "Time's up"}
      </div>
      {remainingMs <= 0 && <DiscussionTimerExpiredModal isLeader={isLeader} onExtend={() => post('extend')} />}
    </>
  )
}
