'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession, getMembership } from '@/lib/session'
import { PlantVisual, PlantType, PLANT_TYPE_LABELS } from '@/components/PlantVisual'

const PLANT_TYPES: PlantType[] = ['default', 'cactus', 'flower', 'tree']

export default function ChoosePlantPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const { loading, user, memberships } = useSession()
  const membership = getMembership(memberships, code)

  const [teamId, setTeamId] = useState('')
  const [members, setMembers] = useState<{ id: string; display_name: string }[]>([])
  const [votes, setVotes] = useState<Record<string, string>>({})
  const [myVote, setMyVote] = useState<PlantType | null>(null)
  const [voting, setVoting] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!user || !membership) { router.replace('/'); return }
    load()
    const interval = setInterval(load, 3000)
    return () => clearInterval(interval)
  }, [code, loading, user, membership])

  async function load() {
    const res = await fetch(`/api/teams/${code.toUpperCase()}`)
    if (!res.ok) return
    const data = await res.json()
    setTeamId(data.id)
    setMembers(data.members)

    // A project manager must be chosen first — guards against landing here
    // directly (e.g. a stale link) without going through that step.
    if (!data.project_manager_id) {
      router.push(`/${code}/choose-project-manager`)
      return
    }

    const v: Record<string, string> = data.plant_votes ?? {}
    setVotes(v)
    if (membership && v[membership.member_id]) setMyVote(v[membership.member_id] as PlantType)

    // Skip if team already agreed on a plant type via voting
    const hasVotes = data.plant_votes && Object.keys(data.plant_votes).length > 0
    if (data.plant_type && hasVotes) {
      router.push(`/${code}/reflect`)
    }
  }

  async function castVote(plantType: PlantType) {
    if (!teamId || !membership || voting) return
    setVoting(true)
    setMyVote(plantType)
    const res = await fetch('/api/teams', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId, plantVote: { memberId: membership.member_id, plantType } }),
    })
    const data = await res.json()
    if (data.agreed) {
      router.push(`/${code}/reflect`)
      return
    }
    await load()
    setVoting(false)
  }

  const notYetVoted = members.filter(m => !votes[m.id])
  const distinctChoices = new Set(Object.values(votes))
  const everyoneVoted = members.length > 0 && notYetVoted.length === 0
  const split = everyoneVoted && distinctChoices.size > 1

  return (
    <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-stone-800">Choose your plant</h1>
          <p className="text-stone-500 text-sm mt-1">
            Pick the one that feels right for your team. Everyone needs to agree.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {PLANT_TYPES.map(type => {
            const isMyVote = myVote === type
            const voters = members.filter(m => votes[m.id] === type)
            return (
              <button
                key={type}
                onClick={() => castVote(type)}
                disabled={voting}
                className={`rounded-2xl p-4 flex flex-col items-center border-2 transition ${
                  isMyVote
                    ? 'border-green-600 bg-green-50'
                    : 'border-stone-200 bg-white hover:border-stone-300'
                }`}
              >
                <PlantVisual state="thriving" plantType={type} size={80} hideLabel />
                <p className="text-sm font-semibold text-stone-700 mt-2">{PLANT_TYPE_LABELS[type]}</p>
                <div className="flex gap-1 mt-1 min-h-[20px] flex-wrap justify-center">
                  {voters.map(v => (
                    <span
                      key={v.id}
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        v.id === membership?.member_id
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {v.id === membership?.member_id ? 'You' : v.display_name}
                    </span>
                  ))}
                </div>
              </button>
            )
          })}
        </div>

        {!myVote && (
          <p className="text-center text-sm text-stone-400">Tap a plant to cast your vote.</p>
        )}

        {myVote && !everyoneVoted && (
          <div className="text-center text-sm text-stone-500 bg-white rounded-xl border border-stone-100 py-4 px-5">
            {`Waiting for ${notYetVoted.map(m => m.display_name).join(', ')} to vote…`}
          </div>
        )}

        {split && (
          <div className="text-center text-sm text-amber-700 bg-amber-50 rounded-xl border border-amber-100 py-4 px-5">
            {`The team is split across ${distinctChoices.size} plants. Talk it over and tap to consolidate on one.`}
          </div>
        )}
      </div>
    </main>
  )
}
