'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { loadMember } from '@/lib/member-store'
import { CHAT_COMPONENTS, COMPONENT_LABELS, CHECKIN_QUESTIONS, ChatComponent, Rating, RATING_LABELS } from '@/lib/chat-components'
import { WaitingRoom } from '@/components/WaitingRoom'

type CheckinResponses = Record<ChatComponent, {
  rating?: Rating
  ratings?: Record<string, Rating>
  notes?: Record<string, string>
}>

const RATINGS: Rating[] = ['aligned', 'slightly_off', 'very_off']

const RATING_COLORS: Record<Rating, string> = {
  aligned: 'bg-green-100 text-green-800 border-green-300',
  slightly_off: 'bg-amber-100 text-amber-800 border-amber-300',
  very_off: 'bg-red-100 text-red-800 border-red-300',
}

export default function CheckinPage() {
  const { code, cycle } = useParams<{ code: string; cycle: string }>()
  const router = useRouter()
  const identity = loadMember()
  const cycleNum = parseInt(cycle)

  const [responses, setResponses] = useState<Partial<CheckinResponses>>({})
  const [currentIdx, setCurrentIdx] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!identity) router.replace('/')
  }, [identity, router])

  const currentComponent = CHAT_COMPONENTS[currentIdx]
  const questions = CHECKIN_QUESTIONS[currentComponent]
  const isLast = currentIdx === CHAT_COMPONENTS.length - 1

  function setRating(component: ChatComponent, questionId: string, rating: Rating, isSubQuestion: boolean) {
    setResponses(prev => {
      const existing = prev[component] ?? {}
      if (isSubQuestion) {
        return { ...prev, [component]: { ...existing, ratings: { ...(existing.ratings ?? {}), [questionId]: rating } } }
      }
      return { ...prev, [component]: { ...existing, rating } }
    })
  }

  function setNote(component: ChatComponent, questionId: string, text: string) {
    setResponses(prev => {
      const existing = prev[component] ?? {}
      return { ...prev, [component]: { ...existing, notes: { ...(existing.notes ?? {}), [questionId]: text } } }
    })
  }

  function canAdvance() {
    const comp = responses[currentComponent] ?? {}
    const ratingQuestions = questions.filter(q => q.hasRating)
    if (ratingQuestions.length === 0) return true
    if (ratingQuestions.length === 1) return !!comp.rating
    return ratingQuestions.every(q => comp.ratings?.[q.id])
  }

  async function handleSubmit() {
    setSubmitting(true)
    // Normalize: components with one rating question → rating field, multiple → ratings field
    const normalized: Record<string, unknown> = {}
    for (const comp of CHAT_COMPONENTS) {
      const data = responses[comp] ?? {}
      const ratingQs = CHECKIN_QUESTIONS[comp].filter(q => q.hasRating)
      if (ratingQs.length === 1) {
        normalized[comp] = { rating: data.rating, notes: data.notes }
      } else {
        normalized[comp] = { ratings: data.ratings, notes: data.notes }
      }
    }
    await fetch('/api/checkins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: identity!.memberId, cycleNumber: cycleNum, responses: normalized }),
    })
    setSubmitting(false)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <WaitingRoom
          message="Waiting for teammates"
          subMessage="You'll see the plant state once everyone has checked in."
          pollUrl={`/api/plant/${code.toUpperCase()}/${cycleNum}`}
          readyCheck={(d: unknown) => !(d as { ready?: boolean }).ready === false && !!(d as { computed_state?: string }).computed_state}
          onReady={() => router.push(`/${code}/plant/${cycleNum}`)}
        />
      </main>
    )
  }

  const comp = responses[currentComponent] ?? {}
  const ratingQs = questions.filter(q => q.hasRating)
  const multiRating = ratingQs.length > 1

  return (
    <main className="min-h-screen bg-stone-50 p-6 flex flex-col items-center">
      <div className="w-full max-w-xl">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-stone-400 font-medium uppercase tracking-wide">
              Check-in · Cycle {cycleNum} · {currentIdx + 1}/{CHAT_COMPONENTS.length}
            </span>
          </div>
          <div className="w-full bg-stone-200 rounded-full h-1.5">
            <div
              className="bg-green-600 h-1.5 rounded-full transition-all"
              style={{ width: `${((currentIdx + 1) / CHAT_COMPONENTS.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6">
          <h2 className="text-xl font-bold text-stone-800 mb-4">{COMPONENT_LABELS[currentComponent]}</h2>

          <div className="flex flex-col gap-6">
            {questions.map(q => (
              <div key={q.id}>
                <p className="text-sm font-medium text-stone-700 mb-3">{q.question}</p>

                {q.hasRating && (
                  <div className="flex gap-2 flex-wrap mb-2">
                    {RATINGS.map(r => {
                      const currentRating = multiRating ? comp.ratings?.[q.id] : comp.rating
                      const selected = currentRating === r
                      return (
                        <button
                          key={r}
                          onClick={() => setRating(currentComponent, q.id, r, multiRating)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                            selected ? RATING_COLORS[r] : 'border-stone-200 text-stone-500 hover:bg-stone-50'
                          }`}
                        >
                          {RATING_LABELS[r]}
                        </button>
                      )
                    })}
                  </div>
                )}

                <textarea
                  className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800 resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
                  rows={2}
                  value={comp.notes?.[q.id] ?? ''}
                  onChange={e => setNote(currentComponent, q.id, e.target.value)}
                  placeholder={q.hasRating ? 'Optional: add context…' : 'Optional notes…'}
                />
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
                {submitting ? 'Submitting…' : 'Submit check-in'}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
