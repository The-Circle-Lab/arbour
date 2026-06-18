'use client'

import { useEffect, useState } from 'react'

interface WaitingRoomProps {
  message: string
  subMessage?: string
  onReady?: () => void
  pollUrl?: string
  pollIntervalMs?: number
  readyCheck?: (data: unknown) => boolean
}

export function WaitingRoom({
  message,
  subMessage,
  onReady,
  pollUrl,
  pollIntervalMs = 4000,
  readyCheck,
}: WaitingRoomProps) {
  const [dots, setDots] = useState('.')

  useEffect(() => {
    const dotTimer = setInterval(() => {
      setDots(d => (d.length >= 3 ? '.' : d + '.'))
    }, 600)
    return () => clearInterval(dotTimer)
  }, [])

  useEffect(() => {
    if (!pollUrl || !onReady || !readyCheck) return
    const timer = setInterval(async () => {
      try {
        const res = await fetch(pollUrl)
        const data = await res.json()
        if (readyCheck(data)) onReady()
      } catch {
        // ignore transient errors
      }
    }, pollIntervalMs)
    return () => clearInterval(timer)
  }, [pollUrl, pollIntervalMs, onReady, readyCheck])

  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 text-center">
      <div className="text-4xl">🌱</div>
      <p className="text-lg font-medium text-gray-700">
        {message}{dots}
      </p>
      {subMessage && <p className="text-sm text-gray-400">{subMessage}</p>}
    </div>
  )
}
