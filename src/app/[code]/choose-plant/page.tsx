'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { loadMember } from '@/lib/member-store'
import { PlantVisual, PlantType, PLANT_TYPE_LABELS } from '@/components/PlantVisual'

const PLANT_TYPES: PlantType[] = ['default', 'cactus', 'flower', 'tree']

export default function ChoosePlantPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const [identity] = useState(() => loadMember())

  const [teamId, setTeamId] = useState('')
  const [members, setMembers] = useState<{ id: string; display_name: string }[]>([])
  const [votes, setVotes] = useState<Record<string, string>>({})
  const [myVote, setMyVote] = useState<PlantType | null>(null)
  const [voting, setVoting] = useState(false)

  useEffect(() => {
    if (!identity) { router.replace('/'); return }
    load()
    const interval = setInterval(load, 3000)
    return () => clearInterval(interval)
  }, [code, identity])

  async function load() {
    const res = await fetch(`/api/teams/${code.toUpperCase()}`)
    if (!res.ok) return
    const data = await res.json()
    setTeamId(data.id)
    setMembers(data.members)
    const v: Record<string, string> = data.plant_votes ?? {}
    setVotes(v)
    if (identity && v[identity.memberId]) setMyVote(v[identity.memberId] as PlantType)

    // If team already has agreed plant_type, skip to reflect
    if (data.plant_type) {
      router.push(`/${code}/reflect`)
    }
  }

  async function castVote(plantType: PlantType) {
    if (!teamId || !identity || voting) return
    setVoting(true)
    setMyVote(plantType)
    const res = await fetch('/api/teams', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId, plantVote: { memberId: identity.memberId, plantType } }),
    })
    const data = await res.json()
    if (data.agreed) {
      router.push(`/${code}/reflect`)
      return
    }
    await load()
    setVoting(false)
  }

  const teammate = members.find(m => m.id !== identity?.memberId)
  const teammateVote = teammate ? votes[teammate.id] : null
  const split = myVote && teammateVote && myVote !== teammateVote

  return (
    <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-stone-800">Choose your plant</h1>
          <p className="text-stone-500 text-sm mt-1">
            Pick the one that feels right for your team. Both of you need to agree.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {PLANT_TYPES.map(type => {
            const isMyVote = myVote === type
            const isTeammateVote = teammateVote === type
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
                <div className="flex gap-1 mt-1 min-h-[20px]">
                  {isMyVote && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">You</span>
                  )}
                  {isTeammateVote && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      {teammate?.display_name}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {!myVote && (
          <p className="text-center text-sm text-stone-400">Tap a plant to cast your vote.</p>
        )}

        {myVote && !teammateVote && (
          <div className="text-center text-sm text-stone-500 bg-white rounded-xl border border-stone-100 py-4">
            Waiting for {teammate?.display_name ?? 'your teammate'} to vote…
          </div>
        )}

        {split && (
          <div className="text-center text-sm text-amber-700 bg-amber-50 rounded-xl border border-amber-100 py-4 px-5">
            You picked <strong>{PLANT_TYPE_LABELS[myVote!]}</strong>, {teammate?.display_name} picked <strong>{PLANT_TYPE_LABELS[teammateVote as PlantType]}</strong>. Talk it over and tap to change your vote.
          </div>
        )}
      </div>
    </main>
  )
}
