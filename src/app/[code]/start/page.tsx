'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { loadMember } from '@/lib/member-store'
import { PlantVisual } from '@/components/PlantVisual'

export default function StartPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const identity = loadMember()
  const [teamName, setTeamName] = useState('')
  const [nextCycle, setNextCycle] = useState<number | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!identity) { router.replace('/'); return }
    fetch(`/api/teams/${code.toUpperCase()}`)
      .then(r => r.json())
      .then(d => {
        setTeamName(d.name)
        const phase: string = d.status?.phase ?? 'CHECKIN_1'
        if (phase === 'DONE') { setDone(true); return }
        // CHECKIN_2 means cycle 1 is done, next is cycle 2
        if (phase === 'CHECKIN_2' || phase === 'PLANT_2') setNextCycle(2)
        else setNextCycle(1)
      })
  }, [code, identity, router])

  return (
    <main className="min-h-screen bg-green-700 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <PlantVisual state="thriving" size={180} />
        <h1 className="text-2xl font-bold text-white mt-6 mb-2">
          {teamName || 'Your team'} is aligned.
        </h1>
        <p className="text-green-200 text-sm mb-8">
          You've worked through your activity system and established working agreements. Now go build something great.
        </p>

        <div className="space-y-3">
          {!done && nextCycle && (
            <button
              onClick={() => router.push(`/${code}/checkin-intro`)}
              className="w-full bg-white text-green-800 rounded-xl py-3.5 text-sm font-semibold hover:bg-green-50 transition"
            >
              Start a check-in →
            </button>
          )}
          {done && (
            <div className="bg-white/10 text-white rounded-xl py-3.5 text-sm font-medium border border-white/20">
              All check-ins complete
            </div>
          )}
          <button
            onClick={() => router.push(`/${code}/charter`)}
            className="w-full bg-white/10 text-white border border-white/20 rounded-xl py-3 text-sm font-medium hover:bg-white/20 transition"
          >
            View collaboration agreement
          </button>
        </div>

        <p className="text-green-300 text-xs mt-6">
          Run a check-in after each working session to keep the plant healthy.
        </p>
      </div>
    </main>
  )
}
