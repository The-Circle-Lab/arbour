'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { loadMember } from '@/lib/member-store'
import { CHAT_COMPONENTS, COMPONENT_LABELS, COMPONENT_DESCRIPTIONS, ChatComponent } from '@/lib/chat-components'

interface Agreement {
  component: string
  final_text: string | null
  resolution_note: string | null
}

interface Resolution {
  component: string
  cycle_number: number
  resolution_note: string | null
  resolved_at: string
}

export default function CharterPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const [identity] = useState(() => loadMember())

  const [teamName, setTeamName] = useState('')
  const [teamId, setTeamId] = useState('')
  const [agreements, setAgreements] = useState<Agreement[]>([])
  const [resolutions, setResolutions] = useState<Resolution[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!identity) { router.replace('/'); return }
    async function load() {
      const teamRes = await fetch(`/api/teams/${code.toUpperCase()}`)
      if (!teamRes.ok) return
      const teamData = await teamRes.json()
      setTeamName(teamData.name)
      setTeamId(teamData.id)

      const [agRes, resRes] = await Promise.all([
        fetch(`/api/agreements?teamId=${teamData.id}`),
        fetch(`/api/resolutions?teamId=${teamData.id}`),
      ])

      if (agRes.ok) {
        const agData = await agRes.json()
        setAgreements(agData.agreements)
      }
      if (resRes.ok) {
        const resData = await resRes.json()
        setResolutions(resData.resolutions)
      }
      setLoading(false)
    }
    load()
  }, [code, identity, router])

  if (loading) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center">
        <p className="text-stone-400 text-sm">Loading…</p>
      </main>
    )
  }

  const agreementMap = Object.fromEntries(agreements.map(a => [a.component, a]))

  // Group check-in updates by cycle
  const cycles = [...new Set(resolutions.map(r => r.cycle_number))].sort()

  return (
    <main className="min-h-screen bg-stone-50 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="text-xs text-stone-400 hover:text-stone-600 mb-4 block"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-bold text-stone-800">{teamName}: Collaboration Charter</h1>
          <p className="text-stone-500 text-sm mt-1">Your team's working agreements, updated over time.</p>
        </div>

        {/* Base agreements */}
        <div className="space-y-4 mb-10">
          <p className="text-xs text-stone-400 uppercase tracking-wide font-medium">Initial agreements</p>
          {CHAT_COMPONENTS.map(comp => {
            const ag = agreementMap[comp]
            return (
              <div key={comp} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                <div className="flex items-start justify-between gap-4 mb-1">
                  <h2 className="text-sm font-semibold text-stone-700">{COMPONENT_LABELS[comp]}</h2>
                  <span className="text-xs text-stone-400 shrink-0">{COMPONENT_DESCRIPTIONS[comp]}</span>
                </div>
                {ag?.final_text ? (
                  <p className="text-stone-800 text-sm leading-relaxed">{ag.final_text}</p>
                ) : (
                  <p className="text-stone-400 text-sm italic">No agreement recorded yet.</p>
                )}
              </div>
            )
          })}
        </div>

        {/* Check-in updates per cycle */}
        {cycles.length > 0 && (
          <div className="space-y-8">
            <p className="text-xs text-stone-400 uppercase tracking-wide font-medium">Check-in updates</p>
            {cycles.map(cycle => {
              const cycleRes = resolutions.filter(r => r.cycle_number === cycle)
              const withNotes = cycleRes.filter(r => r.resolution_note)
              return (
                <div key={cycle}>
                  <p className="text-xs font-semibold text-stone-500 mb-3">Cycle {cycle}</p>
                  {withNotes.length === 0 ? (
                    <p className="text-sm text-stone-400 italic">No discussion notes recorded for this cycle.</p>
                  ) : (
                    <div className="space-y-3">
                      {withNotes.map(r => (
                        <div key={r.component} className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                          <p className="text-xs font-semibold text-amber-600 mb-1">{COMPONENT_LABELS[r.component as ChatComponent]}</p>
                          <p className="text-sm text-stone-700">{r.resolution_note}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {cycles.length === 0 && (
          <p className="text-sm text-stone-400 text-center py-6">No check-in updates yet. They'll appear here after each check-in.</p>
        )}
      </div>
    </main>
  )
}
