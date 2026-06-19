'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveMember } from '@/lib/member-store'
import { ArborLogo } from '@/components/ArborLogo'

export default function LandingPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'home' | 'create' | 'join'>('home')
  const [teamName, setTeamName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    if (!teamName.trim() || !displayName.trim()) return setError('Please fill in all fields.')
    setLoading(true)
    setError('')
    try {
      const teamRes = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: teamName }),
      })
      const team = await teamRes.json()
      if (!teamRes.ok) throw new Error(team.error)

      const joinRes = await fetch(`/api/teams/${team.join_code}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName }),
      })
      const member = await joinRes.json()
      if (!joinRes.ok) throw new Error(member.error)

      saveMember({ memberId: member.id, displayName: member.display_name, teamId: team.id, joinCode: team.join_code })
      router.push(`/${team.join_code}/lobby`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin() {
    if (!joinCode.trim() || !displayName.trim()) return setError('Please fill in all fields.')
    setLoading(true)
    setError('')
    try {
      const joinRes = await fetch(`/api/teams/${joinCode.toUpperCase()}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName }),
      })
      const member = await joinRes.json()
      if (!joinRes.ok) throw new Error(member.error)

      saveMember({ memberId: member.id, displayName: member.display_name, teamId: member.teamId, joinCode: member.joinCode })
      router.push(`/${member.joinCode}/lobby`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">

        {mode === 'home' && (
          <>
            <div className="text-center mb-10">
              <div className="flex justify-center mb-3">
                <ArborLogo size={56} />
              </div>
              <h1 className="text-4xl font-bold text-stone-800 mb-2">Arbor</h1>
              <p className="text-stone-500 text-sm mb-6">Team alignment, made visible.</p>

              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 text-left mb-8">
                <p className="text-sm text-stone-600 leading-relaxed">
                  Arbor helps teams get aligned before they start working. You each reflect privately on six areas of your collaboration, compare answers side-by-side, and write a shared agreement. As work progresses, short check-ins surface tension early, visualised as a plant that reflects your team's health.
                </p>
                <p className="text-sm text-stone-600 leading-relaxed mt-3">
                  It's built on <span className="font-medium text-stone-800">Activity Theory</span>: a framework that maps collaboration across goals, roles, rules, tools, and community.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => setMode('create')}
                className="w-full bg-green-700 text-white rounded-xl py-4 text-lg font-medium hover:bg-green-800 transition"
              >
                Create a team
              </button>
              <button
                onClick={() => setMode('join')}
                className="w-full border-2 border-green-700 text-green-700 rounded-xl py-4 text-lg font-medium hover:bg-green-50 transition"
              >
                Join a team
              </button>
            </div>
          </>
        )}

        {mode === 'create' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 mb-2">
              <ArborLogo size={32} />
              <h2 className="text-xl font-semibold text-stone-700">Create a team</h2>
            </div>
            <input
              className="border border-stone-300 rounded-lg px-4 py-3 text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-600"
              placeholder="Team name (e.g. CS446 Group 3)"
              value={teamName}
              onChange={e => setTeamName(e.target.value)}
            />
            <input
              className="border border-stone-300 rounded-lg px-4 py-3 text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-600"
              placeholder="Your name"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full bg-green-700 text-white rounded-xl py-3 font-medium hover:bg-green-800 disabled:opacity-50 transition"
            >
              {loading ? 'Creating…' : 'Create team'}
            </button>
            <button onClick={() => { setMode('home'); setError('') }} className="text-stone-400 text-sm text-center hover:underline">
              Back
            </button>
          </div>
        )}

        {mode === 'join' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 mb-2">
              <ArborLogo size={32} />
              <h2 className="text-xl font-semibold text-stone-700">Join a team</h2>
            </div>
            <input
              className="border border-stone-300 rounded-lg px-4 py-3 text-stone-800 uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-green-600"
              placeholder="Team code (e.g. AB3XYZ)"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
            />
            <input
              className="border border-stone-300 rounded-lg px-4 py-3 text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-600"
              placeholder="Your name"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              onClick={handleJoin}
              disabled={loading}
              className="w-full bg-green-700 text-white rounded-xl py-3 font-medium hover:bg-green-800 disabled:opacity-50 transition"
            >
              {loading ? 'Joining…' : 'Join team'}
            </button>
            <button onClick={() => { setMode('home'); setError('') }} className="text-stone-400 text-sm text-center hover:underline">
              Back
            </button>
          </div>
        )}

      </div>
    </main>
  )
}
