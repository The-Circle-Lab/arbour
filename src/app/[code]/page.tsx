'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useSession, getMembership } from '@/lib/session'
import { WaitingRoom } from '@/components/WaitingRoom'
import type { Phase } from '@/lib/phase'

interface TeamData {
  id: string
  name: string
  join_code: string
  members: { id: string; display_name: string }[]
  status: { phase: Phase; hasProjectManager: boolean; teamSize: number; reflectionsSubmitted: number }
  plant_type?: string | null
  plant_votes?: Record<string, string> | null
}

export default function TeamHub() {
  const router = useRouter()
  const params = useParams()
  const code = (params.code as string).toUpperCase()

  const { loading, user, memberships } = useSession()
  const membership = getMembership(memberships, code)

  const [team, setTeam] = useState<TeamData | null>(null)
  const [notMember, setNotMember] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!user || !membership) { router.replace('/'); return }
  }, [loading, user, membership, router])

  useEffect(() => {
    if (!membership) return
    const poll = async () => {
      try {
        const res = await fetch(`/api/teams/${code}`)
        if (!res.ok) return
        const data: TeamData = await res.json()
        setTeam(data)

        const memberExists = data.members.some(m => m.id === membership.member_id)
        if (!memberExists) { setNotMember(true); return }

        const phase = data.status.phase
        const plantChosen = data.plant_type && data.plant_votes && Object.keys(data.plant_votes).length > 0
        if (phase === 'REFLECTING' && !data.status.hasProjectManager) router.push(`/${code}/choose-project-manager`)
        else if (phase === 'REFLECTING' && !plantChosen) router.push(`/${code}/choose-plant`)
        else if (phase === 'REFLECTING') router.push(`/${code}/reflect`)
        else if (phase === 'REVEAL') router.push(`/${code}/reveal`)
        else if (phase === 'AGREEING') router.push(`/${code}/agree`)
        else if (phase === 'TASKS') router.push(`/${code}/create-tasks`)
        else if (phase === 'CHECKIN_1') router.push(`/${code}/checkin/1`)
        else if (phase === 'PLANT_1') router.push(`/${code}/plant/1`)
        else if (phase === 'CHECKIN_2') router.push(`/${code}/checkin-intro`)
        else if (phase === 'PLANT_2') router.push(`/${code}/plant/2`)
        else if (phase === 'DONE') router.push(`/${code}/start`)
      } catch { /* retry on next poll */ }
    }

    poll()
    const interval = setInterval(poll, 4000)
    return () => clearInterval(interval)
  }, [membership, code, router])

  if (notMember) return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-red-500">You are not a member of this team.</p>
    </main>
  )

  return (
    <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <div className="text-center">
        {team && (
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-stone-800">{team.name}</h1>
            <p className="text-stone-500 text-sm mt-1">Code: <span className="font-mono font-bold tracking-widest">{code}</span></p>
          </div>
        )}
        <WaitingRoom message="Loading your team" subMessage="Please wait a moment" />
      </div>
    </main>
  )
}
