'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { loadMember } from '@/lib/member-store'
import { CHAT_COMPONENTS, COMPONENT_LABELS, REFLECTION_QUESTIONS, ChatComponent } from '@/lib/chat-components'
import { WaitingRoom } from '@/components/WaitingRoom'

type Responses = Record<ChatComponent, Record<string, string | string[]>>

export default function ReflectPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const identity = loadMember()

  const [responses, setResponses] = useState<Partial<Responses>>({})
  const [currentIdx, setCurrentIdx] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [teamSize, setTeamSize] = useState(2)

  useEffect(() => {
    if (!identity) { router.replace('/'); return }
    fetch(`/api/teams/${code.toUpperCase()}`)
      .then(r => r.json())
      .then(d => setTeamSize(d.status?.teamSize ?? 2))
  }, [code, identity, router])

  const currentComponent = CHAT_COMPONENTS[currentIdx]
  const questions = REFLECTION_QUESTIONS[currentComponent]
  const isLast = currentIdx === CHAT_COMPONENTS.length - 1

  function setValue(component: ChatComponent, key: string, value: string | string[]) {
    setResponses(prev => ({
      ...prev,
      [component]: { ...(prev[component] ?? {}), [key]: value },
    }))
  }

  function toggleMultiselect(component: ChatComponent, key: string, option: string) {
    const current = (responses[component]?.[key] as string[] | undefined) ?? []
    const next = current.includes(option) ? current.filter(o => o !== option) : [...current, option]
    setValue(component, key, next)
  }

  function canAdvance() {
    const compResponses = responses[currentComponent] ?? {}
    return questions.every(q => {
      if (q.type === 'multiselect') return ((compResponses[q.id] as string[]) ?? []).length > 0
      return (compResponses[q.id] as string | undefined)?.trim()
    })
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      await fetch('/api/reflections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: identity!.memberId, responses }),
      })
      setSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <WaitingRoom
          message="Waiting for your teammates"
          subMessage="You'll be taken to the reveal once everyone has submitted."
          pollUrl={`/api/reflections/${code.toUpperCase()}`}
          readyCheck={(d: unknown) => (d as { ready: boolean }).ready}
          onReady={() => router.push(`/${code}/reveal`)}
        />
      </main>
    )
  }

  const compResponses = responses[currentComponent] ?? {}

  return (
    <main className="min-h-screen bg-stone-50 p-6 flex flex-col items-center">
      <div className="w-full max-w-xl">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-stone-400 font-medium uppercase tracking-wide">
              {currentIdx + 1} / {CHAT_COMPONENTS.length}
            </span>
            <span className="text-xs text-stone-400">Individual reflection</span>
          </div>
          <div className="w-full bg-stone-200 rounded-full h-1.5">
            <div
              className="bg-green-600 h-1.5 rounded-full transition-all"
              style={{ width: `${((currentIdx + 1) / CHAT_COMPONENTS.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6">
          <h2 className="text-xl font-bold text-stone-800 mb-1">{COMPONENT_LABELS[currentComponent]}</h2>
          <div className="flex flex-col gap-5 mt-4">
            {questions.map(q => (
              <div key={q.id}>
                <label className="block text-sm font-medium text-stone-700 mb-2">{q.question}</label>

                {q.type === 'text' && (
                  <textarea
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800 resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
                    rows={3}
                    value={(compResponses[q.id] as string) ?? ''}
                    onChange={e => setValue(currentComponent, q.id, e.target.value)}
                    placeholder="Your answer…"
                  />
                )}

                {q.type === 'multiselect' && q.options && (
                  <div className="flex flex-col gap-2">
                    {q.options.map(opt => {
                      const selected = ((compResponses[q.id] as string[]) ?? []).includes(opt)
                      return (
                        <label key={opt} className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleMultiselect(currentComponent, q.id, opt)}
                            className="w-4 h-4 accent-green-600"
                          />
                          <span className="text-sm text-stone-700">{opt}</span>
                          {opt === 'Other' && selected && (
                            <input
                              className="border border-stone-200 rounded px-2 py-1 text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-green-500"
                              placeholder="Specify…"
                              value={(compResponses[`${q.id}_other`] as string) ?? ''}
                              onChange={e => setValue(currentComponent, `${q.id}_other`, e.target.value)}
                            />
                          )}
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-between mt-6 gap-3">
            {currentIdx > 0 && (
              <button
                onClick={() => setCurrentIdx(i => i - 1)}
                className="px-4 py-2 text-sm text-stone-500 border border-stone-200 rounded-lg hover:bg-stone-50"
              >
                Back
              </button>
            )}
            <div className="flex-1" />
            {!isLast ? (
              <button
                onClick={() => setCurrentIdx(i => i + 1)}
                disabled={!canAdvance()}
                className="px-5 py-2 bg-green-700 text-white text-sm rounded-lg hover:bg-green-800 disabled:opacity-40 transition"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canAdvance() || submitting}
                className="px-5 py-2 bg-green-700 text-white text-sm rounded-lg hover:bg-green-800 disabled:opacity-40 transition"
              >
                {submitting ? 'Submitting…' : 'Submit reflection'}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
