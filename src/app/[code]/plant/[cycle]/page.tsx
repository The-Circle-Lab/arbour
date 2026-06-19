'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { loadMember } from '@/lib/member-store'
import { PlantVisual, PlantState } from '@/components/PlantVisual'
import { WaitingRoom } from '@/components/WaitingRoom'
import { COMPONENT_LABELS, ChatComponent } from '@/lib/chat-components'

interface PlantData {
  computed_state: PlantState
  flagged_components: ChatComponent[]
  ai_nudge_text: string | string[]
}

interface Resolution {
  component: string
  cycle_number: number
}

export default function PlantPage() {
  const { code, cycle } = useParams<{ code: string; cycle: string }>()
  const router = useRouter()
  const identity = loadMember()
  const cycleNum = parseInt(cycle)

  const [plantData, setPlantData] = useState<PlantData | null>(null)
  const [resolutions, setResolutions] = useState<Resolution[]>([])
  const [teamId, setTeamId] = useState('')
  const [teamSize, setTeamSize] = useState(2)
  const [revealed, setRevealed] = useState(false)
  const [resolutionNote, setResolutionNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!identity) { router.replace('/'); return }
    loadAll()
    const interval = setInterval(loadAll, 4000)
    return () => clearInterval(interval)
  }, [code, identity, cycleNum])

  async function loadAll() {
    const teamRes = await fetch(`/api/teams/${code.toUpperCase()}`)
    if (!teamRes.ok) return
    const teamData = await teamRes.json()
    setTeamId(teamData.id)
    setTeamSize(teamData.status.teamSize)

    const plantRes = await fetch(`/api/plant/${code.toUpperCase()}/${cycleNum}`)
    if (plantRes.ok) {
      const data = await plantRes.json()
      if (data.computed_state) setPlantData(data)
    }

    const resRes = await fetch(`/api/resolutions?teamId=${teamData.id}&cycle=${cycleNum}`)
    if (resRes.ok) {
      const resData = await resRes.json()
      setResolutions(resData.resolutions)
    }
  }

  async function handleResolveAll() {
    if (!teamId) return
    setSaving(true)
    try {
      await Promise.all(flagged.map(component =>
        fetch('/api/resolutions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teamId,
            component,
            cycleNumber: cycleNum,
            resolutionNote: resolutionNote || null,
            memberId: identity!.memberId,
          }),
        })
      ))
    } catch (e) {
      console.error('resolve error', e)
    }
    setSaving(false)
    if (cycleNum === 1) router.push(`/${code}/checkin/2`)
    else router.push(`/${code}/start`)
  }

  useEffect(() => {
    if (!plantData) return
    const flagged = plantData.flagged_components
    if (flagged.length === 0) {
      if (cycleNum === 1) setTimeout(() => router.push(`/${code}/checkin/2`), 2000)
      else setTimeout(() => router.push(`/${code}/start`), 2000)
      return
    }
    const allResolved = flagged.every(f => resolutions.some(r => r.component === f))
    if (allResolved) {
      if (cycleNum === 1) setTimeout(() => router.push(`/${code}/checkin/2`), 1500)
      else setTimeout(() => router.push(`/${code}/start`), 1500)
    }
  }, [plantData, resolutions, cycleNum, code, router])

  if (!plantData) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <WaitingRoom
          message="Computing plant state"
          subMessage="Analysing your team's check-in responses…"
        />
      </main>
    )
  }

  const flagged = plantData.flagged_components
  const resolvedComponents = resolutions.map(r => r.component)
  const allFlagsResolved = flagged.every(f => resolvedComponents.includes(f))

  // Normalise nudge to array of bullets — handle string, JSON string array, or array
  function parseNudge(raw: string | string[]): string[] {
    if (Array.isArray(raw)) return raw.filter(Boolean)
    if (typeof raw === 'string') {
      const trimmed = raw.trim()
      if (trimmed.startsWith('[')) {
        try { return (JSON.parse(trimmed) as string[]).filter(Boolean) } catch { /* fall through */ }
      }
      return trimmed.split(/\n|(?<=\.)\s+(?=[A-Z])/).map(s => s.trim()).filter(Boolean)
    }
    return []
  }
  const nudgeBullets = parseNudge(plantData.ai_nudge_text)

  const STATE_BG: Record<PlantState, string> = {
    thriving: 'bg-green-50',
    doing_okay: 'bg-amber-50',
    wilting: 'bg-orange-50',
    dead: 'bg-red-50',
  }

  return (
    <main className={`min-h-screen ${STATE_BG[plantData.computed_state]} p-6 flex flex-col items-center`}>
      <div className="w-full max-w-xl">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-stone-400 uppercase tracking-wide font-medium">Cycle {cycleNum} · Team health</p>
          <button
            onClick={() => router.push(`/${code}/charter`)}
            className="text-xs text-stone-400 hover:text-stone-600 underline"
          >
            View charter
          </button>
        </div>

        <div className="flex flex-col items-center my-8">
          <PlantVisual
            state={plantData.computed_state}
            onClick={flagged.length > 0 ? () => setRevealed(r => !r) : undefined}
            size={180}
          />
          {flagged.length > 0 && !revealed && (
            <p className="text-sm text-stone-400 mt-3">Tap the plant to see what's off</p>
          )}
        </div>

        {(revealed || flagged.length === 0) && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 mb-4">
            {flagged.length === 0 ? (
              <p className="text-green-700 font-medium text-center">Your team is aligned — no tensions detected.</p>
            ) : (
              <>
                {/* Nudge as bullet points */}
                {nudgeBullets.length > 0 && (
                  <div className="bg-amber-50 rounded-xl p-4 mb-5">
                    <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">Team nudge</p>
                    <ul className="space-y-2">
                      {nudgeBullets.map((bullet, i) => (
                        <li key={i} className="flex gap-2 text-sm text-amber-900">
                          <span className="text-amber-400 mt-0.5">•</span>
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <h3 className="text-sm font-semibold text-stone-700 mb-3">What's off</h3>
                <div className="flex flex-col gap-2 mb-5">
                  {flagged.map(comp => {
                    const resolved = resolvedComponents.includes(comp)
                    return (
                      <div
                        key={comp}
                        className={`flex items-center justify-between border rounded-xl px-4 py-3 ${resolved ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}
                      >
                        <span className="text-sm font-medium text-stone-800">{COMPONENT_LABELS[comp as ChatComponent]}</span>
                        {resolved && <span className="text-xs text-green-700 font-semibold">✓ Resolved</span>}
                      </div>
                    )
                  })}
                </div>

                {!allFlagsResolved && (
                  <>
                    <textarea
                      className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm text-stone-800 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400 mb-3"
                      rows={2}
                      placeholder="Anything else you discussed and decided? (optional)"
                      value={resolutionNote}
                      onChange={e => setResolutionNote(e.target.value)}
                    />
                    <button
                      onClick={handleResolveAll}
                      disabled={saving || !teamId}
                      className="w-full bg-stone-800 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-stone-900 disabled:opacity-40 transition"
                    >
                      {saving ? 'Saving…' : 'We\'ve talked through everything →'}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {allFlagsResolved && flagged.length > 0 && (
          <div className="bg-green-700 text-white rounded-2xl p-5 text-center">
            <p className="font-semibold">All tensions resolved ✓</p>
            <p className="text-sm text-green-200 mt-1">
              {cycleNum === 1 ? 'Moving to check-in cycle 2…' : 'Moving to Start Working…'}
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
