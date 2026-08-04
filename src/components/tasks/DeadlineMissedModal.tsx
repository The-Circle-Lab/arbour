'use client'

import { useId, useState, type ReactNode } from 'react'
import { Modal } from '@/components/Modal'
import {
  parseChoiceKey,
  type ChoiceInput,
  type DeadlineActionSuggestion,
  type DeadlineProposal,
  type DeadlineVote,
  type TeamMemberOption,
} from '@/lib/tasks-types'

type Selection = { kind: 'extend' } | { kind: 'reassign' } | { kind: 'ignore' } | { kind: 'suggestion'; id: string }

interface DeadlineMissedModalProps {
  taskTitle: string
  assigneeName: string
  currentAssigneeId: string | null
  overdueDurationLabel: string
  deadline: string | null
  members: TeamMemberOption[]
  suggestions: DeadlineActionSuggestion[]
  phase: 'voting' | 'proposing'
  votes: DeadlineVote[]
  currentMemberId: string
  proposal: DeadlineProposal | null
  onVote: (input: ChoiceInput) => void | Promise<void>
  onRespond: (response: 'agree' | 'disagree') => void | Promise<void>
}

const DEFAULT_EXTEND_TIME = '23:59'

// Local calendar date. toISOString() would report yesterday west of UTC.
function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// `deadline` here is the task's stored UTC instant — shown in the viewer's
// own browser timezone, same convention as submission timestamps elsewhere
// on this page (only *entering* a deadline is anchored to America/Toronto).
function formatDeadlineInstant(utcIso: string): string {
  return new Date(utcIso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function DeadlineMissedModal({
  taskTitle,
  assigneeName,
  currentAssigneeId,
  overdueDurationLabel,
  deadline,
  members,
  suggestions,
  phase,
  votes,
  currentMemberId,
  proposal,
  onVote,
  onRespond,
}: DeadlineMissedModalProps) {
  const [selection, setSelection] = useState<Selection | null>(null)
  const [extendDate, setExtendDate] = useState('')
  const [extendTime, setExtendTime] = useState(DEFAULT_EXTEND_TIME)
  const [reassignMemberId, setReassignMemberId] = useState('')
  const [busy, setBusy] = useState(false)
  const headingId = useId()
  const promptId = useId()

  const today = todayISO()
  const otherMembers = members.filter(m => m.id !== currentAssigneeId)

  const myVote = votes.find(v => v.memberId === currentMemberId) ?? null

  async function run(action: () => void | Promise<void>) {
    if (busy) return
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  function castSelection() {
    if (!selection) return
    if (selection.kind === 'extend') {
      if (!extendDate || extendDate < today || !extendTime) return
      run(() => onVote({ type: 'extend', deadline: `${extendDate}T${extendTime}` }))
    } else if (selection.kind === 'reassign') {
      if (!reassignMemberId) return
      run(() => onVote({ type: 'reassign', memberId: reassignMemberId }))
    } else if (selection.kind === 'ignore') {
      run(() => onVote({ type: 'ignore' }))
    } else {
      run(() => onVote({ type: 'suggestion', suggestionId: selection.id }))
    }
  }

  const canCast =
    selection?.kind === 'ignore' ||
    (selection?.kind === 'extend' && !!extendDate && extendDate >= today && !!extendTime) ||
    (selection?.kind === 'reassign' && !!reassignMemberId) ||
    selection?.kind === 'suggestion'

  // The expandable fields render *inside* this same card (not as a sibling
  // element below it) so there's exactly one bordered box per option — a
  // separate sibling that gets added/removed right under an animated
  // border-color transition was leaving a stray seam behind when switching
  // between options.
  function optionCard(kind: Selection['kind'], label: string, hint: string, expanded?: ReactNode) {
    const active = selection?.kind === kind
    return (
      <label
        className={`flex flex-col border rounded-xl p-4 cursor-pointer transition ${
          active ? 'border-green-600 bg-green-50' : 'border-stone-200 hover:bg-stone-50'
        }`}
      >
        <span className="flex gap-3 items-start">
          <input
            type="radio"
            name="deadline-action"
            className="mt-1 accent-green-700"
            checked={active}
            disabled={busy}
            onChange={() => setSelection({ kind } as Selection)}
          />
          <span className="flex-1">
            <span className="block text-sm font-medium text-stone-800">{label}</span>
            <span className="block text-xs text-stone-400 mt-0.5">{hint}</span>
          </span>
        </span>
        {active && expanded && <span className="block pl-7 pt-3">{expanded}</span>}
      </label>
    )
  }

  function tally() {
    if (votes.length === 0) return null
    return (
      <div className="bg-stone-50 border border-stone-100 rounded-xl p-3 mb-4">
        <p className="text-xs text-stone-400 uppercase tracking-wide font-medium mb-2">Votes so far</p>
        <div className="flex flex-col gap-1">
          {votes.map((v, i) => (
            <p key={v.memberId ?? i} className="text-sm text-stone-600">
              <span className="font-medium text-stone-700">{v.displayName}</span> → {v.label}
            </p>
          ))}
        </div>
      </div>
    )
  }

  // Only options that actually got a vote in round 1 can be (re-)proposed.
  const narrowedOptions = phase === 'proposing'
    ? Array.from(new Map(votes.map(v => [v.choiceKey, v])).values())
    : []

  return (
    <Modal open labelledBy={headingId}>
      <div className="bg-amber-50 border-b border-amber-100 p-5">
        <p className="text-xs text-amber-700 uppercase tracking-wide font-semibold mb-1">Deadline missed</p>
        <h2 id={headingId} className="text-lg font-bold text-stone-800">{taskTitle}</h2>
        <p className="text-sm text-amber-800 mt-1">
          {`Assigned to ${assigneeName} · ${overdueDurationLabel}`}
        </p>
      </div>

      <div className="p-5">
        {phase === 'voting' && (
          <>
            <p id={promptId} className="text-sm font-medium text-stone-700 mb-3">
              {myVote ? 'You can change your vote until everyone has voted.' : 'What should happen next? Cast your vote.'}
            </p>

            {tally()}

            {suggestions.length > 0 && (
              <div className="flex flex-col gap-2 mb-3">
                {suggestions.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSelection({ kind: 'suggestion', id: s.id })}
                    disabled={busy}
                    className={`w-full text-left border rounded-xl p-4 transition disabled:opacity-40 ${
                      selection?.kind === 'suggestion' && selection.id === s.id
                        ? 'border-green-600 bg-green-100'
                        : 'bg-green-50 border-green-200 hover:bg-green-100'
                    }`}
                  >
                    <span className="inline-block text-[10px] uppercase tracking-wide font-semibold text-green-800 bg-green-100 border border-green-200 rounded px-1.5 py-0.5 mb-1.5">
                      Suggested
                    </span>
                    <span className="block text-sm font-medium text-stone-800">{s.label}</span>
                    <span className="block text-xs text-stone-500 mt-0.5">{s.rationale}</span>
                  </button>
                ))}
              </div>
            )}

            <div role="radiogroup" aria-labelledby={promptId} className="flex flex-col gap-2">
              {optionCard(
                'extend',
                'Extend deadline',
                deadline ? `Was due ${formatDeadlineInstant(deadline)}` : 'Give it more time',
                <div className="flex gap-2">
                  <input
                    type="date"
                    min={today}
                    value={extendDate}
                    disabled={busy}
                    aria-label="New due date"
                    onChange={e => setExtendDate(e.target.value)}
                    className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <input
                    type="time"
                    value={extendTime}
                    disabled={busy}
                    aria-label="New due time"
                    onChange={e => setExtendTime(e.target.value)}
                    className="w-32 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              )}

              {optionCard(
                'reassign',
                'Reassign',
                'Hand this to someone else on the team',
                otherMembers.length === 0 ? (
                  <p className="text-xs text-stone-400">No one else is on this team.</p>
                ) : (
                  <select
                    value={reassignMemberId}
                    disabled={busy}
                    aria-label="Reassign to"
                    onChange={e => setReassignMemberId(e.target.value)}
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">Choose a teammate…</option>
                    {otherMembers.map(m => (
                      <option key={m.id} value={m.id}>{m.displayName}</option>
                    ))}
                  </select>
                )
              )}

              {optionCard('ignore', 'Ignore', 'Leave the task as it is')}
            </div>

            <button
              onClick={castSelection}
              disabled={busy || !canCast}
              className="w-full bg-green-700 text-white rounded-xl py-3 mt-5 font-medium hover:bg-green-800 disabled:opacity-40 transition"
            >
              {myVote ? 'Update your vote' : 'Cast vote'}
            </button>
          </>
        )}

        {phase === 'proposing' && !proposal && (
          <>
            <p className="text-sm font-medium text-stone-700 mb-1">The team didn&apos;t agree unanimously.</p>
            <p className="text-xs text-stone-500 mb-3">Pick one of the options that got a vote, to propose it to the team.</p>
            <div className="flex flex-col gap-2">
              {narrowedOptions.map(opt => {
                const supporters = votes.filter(v => v.choiceKey === opt.choiceKey).map(v => v.displayName).join(', ')
                return (
                  <button
                    key={opt.choiceKey}
                    onClick={() => run(() => {
                      const input = parseChoiceKey(opt.choiceKey)
                      if (input) return onVote(input)
                    })}
                    disabled={busy}
                    className="w-full text-left border border-stone-200 rounded-xl p-4 hover:bg-stone-50 disabled:opacity-40 transition"
                  >
                    <span className="block text-sm font-medium text-stone-800">{opt.label}</span>
                    <span className="block text-xs text-stone-400 mt-0.5">Voted by {supporters}</span>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {phase === 'proposing' && proposal && proposal.proposedBy === currentMemberId && (
          <>
            <p className="text-sm font-medium text-stone-700 mb-1">Waiting on the team</p>
            <p className="text-sm text-stone-600 mb-3">You proposed: <span className="font-medium">{proposal.label}</span></p>
            <div className="flex flex-col gap-1">
              {proposal.responses.map((r, i) => (
                <p key={r.memberId ?? i} className="text-sm text-stone-600">
                  <span className="font-medium text-stone-700">{r.displayName}</span> {r.response === 'agree' ? 'agreed' : 'disagreed'}
                </p>
              ))}
            </div>
          </>
        )}

        {phase === 'proposing' && proposal && proposal.proposedBy !== currentMemberId && (
          <>
            <p className="text-sm font-medium text-stone-700 mb-1">
              {proposal.proposedByName} proposed: <span className="font-normal">{proposal.label}</span>
            </p>
            <div className="flex flex-col gap-1 mb-4">
              {proposal.responses.map((r, i) => (
                <p key={r.memberId ?? i} className="text-sm text-stone-500">
                  <span className="font-medium text-stone-600">{r.displayName}</span> {r.response === 'agree' ? 'agreed' : 'disagreed'}
                </p>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => run(() => onRespond('agree'))}
                disabled={busy}
                className="flex-1 bg-green-700 text-white rounded-xl py-3 font-medium hover:bg-green-800 disabled:opacity-40 transition"
              >
                Agree
              </button>
              <button
                onClick={() => run(() => onRespond('disagree'))}
                disabled={busy}
                className="flex-1 border border-stone-200 text-stone-600 rounded-xl py-3 hover:bg-stone-50 disabled:opacity-40 transition"
              >
                Disagree
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
