'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { loadMember } from '@/lib/member-store'
import { PlantVisual } from '@/components/PlantVisual'

export default function CheckinIntroPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const identity = loadMember()

  useEffect(() => {
    if (!identity) router.replace('/')
  }, [identity, router])

  return (
    <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center mb-8">
          <PlantVisual state="doing_okay" size={140} />
        </div>

        <h1 className="text-2xl font-bold text-stone-800 mb-3">Time to check in.</h1>
        <p className="text-stone-500 text-sm leading-relaxed mb-2">
          You've had a working session. Let's see how the collaboration is holding up.
        </p>
        <p className="text-stone-500 text-sm leading-relaxed mb-8">
          Each person answers independently, then Arbor shows you where things are aligned and where tension is building.
        </p>

        <button
          onClick={() => router.push(`/${code}/checkin/2`)}
          className="w-full bg-green-700 text-white rounded-xl py-4 text-base font-medium hover:bg-green-800 transition"
        >
          Start check-in →
        </button>
        <button
          onClick={() => router.push(`/${code}`)}
          className="mt-3 w-full text-sm text-stone-400 hover:text-stone-600 transition"
        >
          Come back later
        </button>
      </div>
    </main>
  )
}
