'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { loadMember } from '@/lib/member-store'
import { CHAT_COMPONENTS, COMPONENT_LABELS, ChatComponent } from '@/lib/chat-components'

interface Agreement {
  component: string
  resolution_note: string | null
  draft_text: string | null
  final_text: string | null
}

interface Approval {
  component: string
  member_id: string
}

export default function AgreePage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const identity = loadMember()

  const [teamId, setTeamId] = useState('')
  const [teamSize, setTeamSize] = useState(2)
  const [flaggedComponents, setFlaggedComponents] = useState<string[]>([])
  const [agreements, setAgreements] = useState<Record<ChatComponent, Agreement | null>>({} as Record<ChatComponent, Agreement | null>)
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [activeComponent, setActiveComponent] = useState<ChatComponent>('object')
  const [resolutionNote, setResolutionNote] = useState('')
  const [editText, setEditText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [members, setMembers] = useState<{ id: string; display_name: string }[]>([])

  useEffect(() => {
    if (!identity) { router.replace('/'); return }
    loadAll()
    const interval = setInterval(loadAll, 4000)
    return () => clearInterval(interval)
  }, [code, identity])

  async function loadAll() {
    const teamRes = await fetch(`/api/teams/${code.toUpperCase()}`)
    if (!teamRes.ok) return
    const teamData = await teamRes.json()
    setTeamId(teamData.id)
    setTeamSize(teamData.status.teamSize)
    setMembers(teamData.members)

    const aiRes = await fetch(`/api/reveal-ai/${code.toUpperCase()}`)
    if (aiRes.ok) {
      const aiData = await aiRes.json()
      setFlaggedComponents(aiData.flagged_components ?? [])
    }

    const agRes = await fetch(`/api/agreements?teamId=${teamData.id}`)
    if (agRes.ok) {
      const agData = await agRes.json()
      const map: Record<ChatComponent, Agreement | null> = {} as Record<ChatComponent, Agreement | null>
      for (const comp of CHAT_COMPONENTS) map[comp] = null
      for (const ag of agData.agreements) map[ag.component as ChatComponent] = ag
      setAgreements(map)
      setApprovals(agData.approvals)
    }
  }

  useEffect(() => {
    const ag = agreements[activeComponent]
    setEditText(ag?.final_text ?? '')
    setResolutionNote(n => n || ag?.resolution_note || '')
  }, [activeComponent])

  useEffect(() => {
    const ag = agreements[activeComponent]
    setEditText(ag?.final_text ?? '')
  }, [agreements, activeComponent])

  // Check if all 6 components are fully approved
  useEffect(() => {
    const allDone = CHAT_COMPONENTS.every(comp => {
      const ag = agreements[comp]
      if (!ag?.final_text) return false
      const compApprovals = approvals.filter(a => a.component === comp)
      return compApprovals.length >= teamSize
    })
    if (allDone && teamId) {
      setTimeout(() => router.push(`/${code}/checkin/1`), 1000)
    }
  }, [agreements, approvals, teamSize, teamId, code, router])

  async function handleGenerateDraft() {
    if (!teamId) return
    setGenerating(true)
    await fetch('/api/agreements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamId,
        component: activeComponent,
        resolutionNote: resolutionNote.trim() || undefined,
        memberId: identity!.memberId,
      }),
    })
    await loadAll()
    setGenerating(false)
  }

  async function handleSaveText() {
    if (!teamId || !editText.trim()) return
    setSaving(true)
    await fetch('/api/agreements', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId, component: activeComponent, finalText: editText, memberId: identity!.memberId }),
    })
    await loadAll()
    setSaving(false)
  }

  async function handleApprove() {
    if (!teamId) return
    await fetch('/api/agreements/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId, component: activeComponent, memberId: identity!.memberId }),
    })
    await loadAll()
  }

  async function handleUnapprove() {
    if (!teamId) return
    await fetch('/api/agreements/approve', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId, component: activeComponent, memberId: identity!.memberId }),
    })
    await loadAll()
  }

  const ag = agreements[activeComponent]
  const isFlagged = flaggedComponents.includes(activeComponent)
  const compApprovals = approvals.filter(a => a.component === activeComponent)
  const myApproval = compApprovals.some(a => a.member_id === identity?.memberId)
  const fullyApproved = compApprovals.length >= teamSize
  const hasDraft = !!ag?.final_text

  const totalApproved = CHAT_COMPONENTS.filter(comp => {
    const compAg = agreements[comp]
    if (!compAg?.final_text) return false
    return approvals.filter(a => a.component === comp).length >= teamSize
  }).length

  return (
    <main className="min-h-screen bg-stone-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-stone-800">Group Agreements</h1>
          <p className="text-stone-500 text-sm mt-1">
            {totalApproved}/{CHAT_COMPONENTS.length} components agreed · {teamSize} approvals needed per component
          </p>
        </div>

        {/* Component tabs */}
        <div className="flex gap-2 flex-wrap mb-6">
          {CHAT_COMPONENTS.map(comp => {
            const compAg = agreements[comp]
            const approved = approvals.filter(a => a.component === comp).length >= teamSize
            const hasDraftComp = !!compAg?.final_text
            return (
              <button
                key={comp}
                onClick={() => setActiveComponent(comp)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                  activeComponent === comp
                    ? 'bg-green-700 text-white'
                    : approved
                    ? 'bg-green-100 text-green-800 border border-green-300'
                    : isFlagged && comp === activeComponent
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
                }`}
              >
                {approved ? '✓ ' : flaggedComponents.includes(comp) ? '⚠ ' : ''}{COMPONENT_LABELS[comp]}
              </button>
            )
          })}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-stone-800">{COMPONENT_LABELS[activeComponent]}</h2>
            {isFlagged && !fullyApproved && (
              <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                Flagged — needs resolution
              </span>
            )}
            {fullyApproved && (
              <span className="bg-green-100 text-green-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                ✓ Agreed
              </span>
            )}
          </div>

          {/* Resolution note (for flagged components) */}
          {isFlagged && !fullyApproved && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Resolution note <span className="text-stone-400 font-normal">(what did you discuss and decide?)</span>
              </label>
              <textarea
                className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm text-stone-800 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                rows={2}
                value={resolutionNote}
                onChange={e => setResolutionNote(e.target.value)}
                placeholder="e.g. We agreed Annie takes backend, Michael takes frontend…"
              />
            </div>
          )}

          {/* Generate / regenerate draft */}
          {!fullyApproved && (
            <button
              onClick={handleGenerateDraft}
              disabled={generating || (isFlagged && !resolutionNote.trim())}
              className="w-full border border-green-600 text-green-700 rounded-lg py-2 text-sm font-medium hover:bg-green-50 disabled:opacity-40 transition mb-4"
            >
              {generating ? 'Generating draft…' : ag?.draft_text ? 'Regenerate AI draft' : 'Generate AI draft'}
            </button>
          )}

          {/* Editable draft */}
          {hasDraft && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-stone-700 mb-1">Agreement text</label>
              <textarea
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800 resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
                rows={4}
                value={editText}
                onChange={e => setEditText(e.target.value)}
                disabled={fullyApproved}
              />
              {!fullyApproved && editText !== ag?.final_text && (
                <button
                  onClick={handleSaveText}
                  disabled={saving}
                  className="mt-2 text-sm text-green-700 hover:underline"
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              )}
            </div>
          )}

          {/* Approval */}
          {hasDraft && (
            <div className="border-t border-stone-100 pt-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-stone-600">
                  Approvals: {compApprovals.length}/{teamSize}
                </span>
                <div className="flex gap-2">
                  {members.map(m => (
                    <span
                      key={m.id}
                      className={`text-xs px-2 py-1 rounded-full ${
                        compApprovals.some(a => a.member_id === m.id)
                          ? 'bg-green-100 text-green-700'
                          : 'bg-stone-100 text-stone-400'
                      }`}
                    >
                      {m.display_name}
                    </span>
                  ))}
                </div>
              </div>

              {!fullyApproved && (
                myApproval ? (
                  <button
                    onClick={handleUnapprove}
                    className="w-full border border-stone-200 text-stone-500 rounded-lg py-2 text-sm hover:bg-stone-50 transition"
                  >
                    Withdraw approval
                  </button>
                ) : (
                  <button
                    onClick={handleApprove}
                    className="w-full bg-green-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-800 transition"
                  >
                    Approve this agreement
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
