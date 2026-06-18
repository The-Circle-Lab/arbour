'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { loadMember } from '@/lib/member-store'
import { CHAT_COMPONENTS, COMPONENT_LABELS, COMPONENT_DESCRIPTIONS, ChatComponent } from '@/lib/chat-components'

interface Reflection {
  member_id: string
  display_name: string
  component: string
  response_data: Record<string, unknown>
}

interface RevealAI {
  per_component: Record<ChatComponent, string>
  flagged_components: string[]
}

export default function RevealPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()

  const [identity] = useState(() => loadMember())
  const [reflections, setReflections] = useState<Reflection[]>([])
  const [members, setMembers] = useState<string[]>([])
  const [teamId, setTeamId] = useState('')
  const [aiResult, setAiResult] = useState<RevealAI | null>(null)
  const [loadingAI, setLoadingAI] = useState(false)
  const [activeComponent, setActiveComponent] = useState<ChatComponent>('object')

  useEffect(() => {
    if (!identity) { router.replace('/'); return }

    async function load() {
      const refRes = await fetch(`/api/reflections/${code.toUpperCase()}`)
      if (!refRes.ok) { router.replace(`/${code}`); return }
      const refData = await refRes.json()
      setReflections(refData.reflections)

      const unique = Array.from(new Set<string>(refData.reflections.map((r: Reflection) => r.display_name)))
      setMembers(unique)

      const teamRes = await fetch(`/api/teams/${code.toUpperCase()}`)
      const teamData = await teamRes.json()
      setTeamId(teamData.id)

      // Trigger AI generation (idempotent — returns cached if already done)
      fetch(`/api/reveal-ai/${code.toUpperCase()}`, { method: 'POST' }).catch(() => {})
      // Poll GET until result is cached
      await pollForAI(code)
    }

    load()
  }, [code, identity, router])

  const [aiTimedOut, setAiTimedOut] = useState(false)

  async function pollForAI(teamCode: string) {
    setLoadingAI(true)
    setAiTimedOut(false)
    let aiData = null
    for (let attempt = 0; attempt < 40; attempt++) {
      const aiRes = await fetch(`/api/reveal-ai/${teamCode.toUpperCase()}`)
      if (aiRes.ok) { aiData = await aiRes.json(); break }
      await new Promise(r => setTimeout(r, 3000))
    }
    if (aiData) {
      setAiResult(aiData)
    } else {
      setAiTimedOut(true)
    }
    setLoadingAI(false)
  }

  const flagged = aiResult?.flagged_components ?? []

  function getResponsesForComponent(component: ChatComponent) {
    return reflections.filter(r => r.component === component)
  }

  function formatResponse(data: Record<string, unknown>): string {
    return Object.entries(data)
      .filter(([k]) => !k.endsWith('_other') && !k.endsWith('_open'))
      .map(([, v]) => {
        if (Array.isArray(v)) return v.join(', ')
        if (v && typeof v === 'object') {
          return Object.entries(v as Record<string, string>)
            .map(([opt, level]) => `${opt}: ${level}`)
            .join(', ')
        }
        return v as string
      })
      .filter(Boolean)
      .join('\n')
  }

  function handleProceedToAgreement() {
    router.push(`/${code}/agree`)
  }

  return (
    <main className="min-h-screen bg-stone-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-stone-800">Reveal</h1>
          <p className="text-stone-500 text-sm mt-1">
            See how your answers compare — before writing any agreement.
          </p>
        </div>

        {/* Component tabs */}
        <div className="flex gap-2 flex-wrap mb-6">
          {CHAT_COMPONENTS.map(comp => (
            <button
              key={comp}
              onClick={() => setActiveComponent(comp)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                activeComponent === comp
                  ? 'bg-green-700 text-white'
                  : flagged.includes(comp)
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
              }`}
            >
              {flagged.includes(comp) && '⚠ '}{COMPONENT_LABELS[comp]}
            </button>
          ))}
        </div>

        {/* Active component panel */}
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 mb-4">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-stone-800">{COMPONENT_LABELS[activeComponent]}</h2>
              <p className="text-xs text-stone-400 mt-0.5">{COMPONENT_DESCRIPTIONS[activeComponent]}</p>
            </div>
            {flagged.includes(activeComponent) && (
              <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                Flagged — needs resolution
              </span>
            )}
          </div>

          {/* Member answers side by side */}
          <div
            className="grid gap-4 mb-5"
            style={{ gridTemplateColumns: `repeat(${Math.max(members.length, 1)}, minmax(0, 1fr))` }}
          >
            {members.map(name => {
              const ref = getResponsesForComponent(activeComponent).find(r => r.display_name === name)
              return (
                <div key={name} className="bg-stone-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">{name}</p>
                  <p className="text-sm text-stone-700 whitespace-pre-line">
                    {ref ? formatResponse(ref.response_data) : <span className="text-stone-300 italic">No response</span>}
                  </p>
                </div>
              )
            })}
          </div>

          {/* AI comment */}
          {loadingAI && (
            <div className="bg-green-50 rounded-xl p-4 text-sm text-green-700 animate-pulse">
              Analyzing alignment…
            </div>
          )}
          {aiTimedOut && !aiResult && (
            <div className="bg-amber-50 rounded-xl p-4 text-sm text-amber-800 flex items-center justify-between">
              <span>Analysis is taking longer than expected.</span>
              <button
                onClick={() => pollForAI(code as string)}
                className="ml-4 px-3 py-1.5 bg-amber-700 text-white rounded-lg text-xs font-medium hover:bg-amber-800 transition"
              >
                Retry
              </button>
            </div>
          )}
          {aiResult && (
            <div className={`rounded-xl p-4 text-sm ${flagged.includes(activeComponent) ? 'bg-amber-50 text-amber-900' : 'bg-green-50 text-green-900'}`}>
              <p className="font-semibold mb-1 text-xs uppercase tracking-wide opacity-60">
                {flagged.includes(activeComponent) ? 'Alignment gap' : 'Arbor summary'}
              </p>
              <p>{aiResult.per_component[activeComponent]}</p>
            </div>
          )}
        </div>

        {/* Summary + proceed */}
        {aiResult && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6">
            <h3 className="font-semibold text-stone-800 mb-3">Before you continue</h3>
            {flagged.length === 0 ? (
              <p className="text-sm text-green-700 mb-4">No major gaps detected. You can proceed to write your group agreements.</p>
            ) : (
              <p className="text-sm text-amber-700 mb-4">
                {flagged.length} component{flagged.length > 1 ? 's are' : ' is'} flagged. You'll need to record a resolution and get everyone's approval on each before check-ins unlock.
              </p>
            )}
            <button
              onClick={handleProceedToAgreement}
              className="w-full bg-green-700 text-white rounded-xl py-3 font-medium hover:bg-green-800 transition"
            >
              Discuss, then write agreements →
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
