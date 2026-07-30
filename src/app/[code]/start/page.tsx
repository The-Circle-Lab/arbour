'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession, getMembership } from '@/lib/session'
import { PlantVisual, PLANT_TYPES, PlantState, PlantType } from '@/components/PlantVisual'

const PLANT_STATES: PlantState[] = ['thriving', 'doing_okay', 'wilting', 'dead']

const HEADLINE: Record<PlantState, string> = {
  thriving: 'is thriving.',
  doing_okay: 'is doing okay.',
  wilting: 'needs attention.',
  dead: 'needs a reset.',
}

const FOOTNOTE: Record<PlantState, string> = {
  thriving: 'Run a check-in after each working session to keep the plant healthy.',
  doing_okay: 'Run a check-in after each working session to keep the plant healthy.',
  wilting: "Check in with your team — some agreements aren't holding.",
  dead: 'Revisit your collaboration agreement and re-align as a team.',
}

export default function StartPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const { loading, user, memberships } = useSession()
  const membership = getMembership(memberships, code)
  const [teamName, setTeamName] = useState('')
  const [nextCycle, setNextCycle] = useState<number | null>(null)
  const [done, setDone] = useState(false)
  const [plantType, setPlantType] = useState<PlantType>('default')
  // 'thriving' matches DEFAULT_LEVEL in plant-health.ts, so this is the right
  // pre-load value — no pessimistic flash before the first response.
  const [plantState, setPlantState] = useState<PlantState>('thriving')

  useEffect(() => {
    if (loading) return
    if (!user || !membership) { router.replace('/'); return }

    let ignore = false

    async function loadTeam() {
      const res = await fetch(`/api/teams/${code.toUpperCase()}`)
      if (!res.ok || ignore) return
      const d = await res.json()
      if (ignore) return
      setTeamName(d.name)
      if (PLANT_TYPES.includes(d.plant_type)) setPlantType(d.plant_type as PlantType)
      if (PLANT_STATES.includes(d.plant_state)) setPlantState(d.plant_state as PlantState)
      const phase: string = d.status?.phase ?? 'CHECKIN_1'
      if (phase === 'DONE') { setDone(true); return }
      if (phase === 'CHECKIN_2' || phase === 'PLANT_2') setNextCycle(2)
      else setNextCycle(1)
    }

    loadTeam()
    const interval = setInterval(loadTeam, 4000)
    return () => { ignore = true; clearInterval(interval) }
  }, [loading, user, membership, router, code])

  return (
    <main className="min-h-screen bg-green-700 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <PlantVisual state={plantState} plantType={plantType} size={180} />
        <h1 className="text-2xl font-bold text-white mt-6 mb-2">
          {teamName || 'Your team'} {HEADLINE[plantState]}
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
            onClick={() => router.push(`/${code}/tasks`)}
            className="w-full bg-white/10 text-white border border-white/20 rounded-xl py-3 text-sm font-medium hover:bg-white/20 transition"
          >
            View tasks
          </button>
          <button
            onClick={() => router.push(`/${code}/charter`)}
            className="w-full bg-white/10 text-white border border-white/20 rounded-xl py-3 text-sm font-medium hover:bg-white/20 transition"
          >
            View collaboration agreement
          </button>
          {done && (
            <button
              onClick={() => router.push(`/${code}/report`)}
              className="w-full bg-white/10 text-white border border-white/20 rounded-xl py-3 text-sm font-medium hover:bg-white/20 transition"
            >
              View final report →
            </button>
          )}
        </div>

        <p className="text-green-300 text-xs mt-6">
          {FOOTNOTE[plantState]}
        </p>
      </div>
    </main>
  )
}
