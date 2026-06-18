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

  useEffect(() => {
    if (!identity) { router.replace('/'); return }
    fetch(`/api/teams/${code.toUpperCase()}`)
      .then(r => r.json())
      .then(d => setTeamName(d.name))
  }, [code, identity, router])

  return (
    <main className="min-h-screen bg-green-700 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <PlantVisual state="thriving" size={200} />
        <h1 className="text-3xl font-bold text-white mt-6 mb-3">
          {teamName} is aligned.
        </h1>
        <p className="text-green-200 text-lg mb-8">
          You've worked through your activity system, surfaced tensions, and resolved them together.
          Now go build something great.
        </p>
        <div className="bg-white/10 rounded-2xl p-5 text-left">
          <p className="text-green-100 text-sm font-semibold uppercase tracking-wide mb-2">What you established</p>
          <ul className="text-green-200 text-sm space-y-1">
            <li>✓ A shared understanding of your goal (Object)</li>
            <li>✓ Individual motivations and roles (Subject)</li>
            <li>✓ Who does what (Division of Labor)</li>
            <li>✓ How you'll work together (Rules)</li>
            <li>✓ Your shared toolset (Tools)</li>
            <li>✓ Your project ecosystem (Community)</li>
          </ul>
        </div>
      </div>
    </main>
  )
}
