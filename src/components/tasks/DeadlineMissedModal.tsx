'use client'

import { useId, useState } from 'react'
import { Modal } from '@/components/Modal'
import { TaskSummary, TaskAction, TaskActionSuggestion, TeamMemberOption } from '@/lib/tasks-types'

interface DeadlineMissedModalProps {
  task: TaskSummary
  overdueDurationLabel: string
  members: TeamMemberOption[]
  // Generated server-side with the deadline-passed event and delivered alongside
  // it, so every member sees the same recommendation and nothing is fetched here.
  // Absent or empty when the backend produced none — the options below stand alone.
  suggestions?: TaskActionSuggestion[]
  onExtend: (newDeadline: string) => void | Promise<void>
  onReassign: (memberId: string) => void | Promise<void>
  onIgnore: () => void | Promise<void>
}

// Local calendar date. toISOString() would report yesterday west of UTC.
function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDate(isoDate: string): string {
  // Parsed at local midnight — bare 'YYYY-MM-DD' is treated as UTC and can render as the day before.
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function DeadlineMissedModal({
  task,
  overdueDurationLabel,
  members,
  suggestions = [],
  onExtend,
  onReassign,
  onIgnore,
}: DeadlineMissedModalProps) {
  const [selected, setSelected] = useState<TaskAction | null>(null)
  const [deadline, setDeadline] = useState('')
  const [memberId, setMemberId] = useState('')
  const [busy, setBusy] = useState(false)
  const headingId = useId()
  const promptId = useId()

  const today = todayISO()
  // Reassigning to whoever already missed it isn't a reassignment.
  const otherMembers = members.filter(m => m.id !== task.assignedTo.id)

  // Drop suggestions whose action can't be carried out at all — recommending a
  // reassign with nobody to reassign to is noise. The static Reassign option
  // still renders below and says why it's unavailable.
  const visibleSuggestions = suggestions.filter(s => s.action !== 'reassign' || otherMembers.length > 0)

  const canSubmit =
    selected === 'ignore' ||
    (selected === 'extend' && !!deadline && deadline >= today) ||
    (selected === 'reassign' && !!memberId)

  const submitLabel =
    selected === 'extend'
      ? 'Save new deadline'
      : selected === 'reassign'
        ? 'Reassign'
        : selected === 'ignore'
          ? 'Dismiss'
          : 'Choose an option'

  // Prefills are validated, not trusted: a suggestion naming a past date or
  // someone not on the team selects the action and leaves the input to the user.
  function applySuggestion(s: TaskActionSuggestion) {
    setSelected(s.action)
    if (s.prefill?.deadline && s.prefill.deadline >= today) setDeadline(s.prefill.deadline)
    if (s.prefill?.memberId && otherMembers.some(m => m.id === s.prefill?.memberId)) {
      setMemberId(s.prefill.memberId)
    }
  }

  async function handleSubmit() {
    if (busy || !canSubmit) return
    setBusy(true)
    try {
      if (selected === 'extend') await onExtend(deadline)
      else if (selected === 'reassign') await onReassign(memberId)
      else if (selected === 'ignore') await onIgnore()
    } finally {
      setBusy(false)
    }
  }

  function option(action: TaskAction, label: string, hint: string) {
    const active = selected === action
    return (
      <label
        className={`flex gap-3 items-start border rounded-xl p-4 cursor-pointer transition ${
          active ? 'border-green-600 bg-green-50' : 'border-stone-200 hover:bg-stone-50'
        }`}
      >
        <input
          type="radio"
          name="deadline-action"
          className="mt-1 accent-green-700"
          checked={active}
          disabled={busy}
          onChange={() => setSelected(action)}
        />
        <span className="flex-1">
          <span className="block text-sm font-medium text-stone-800">{label}</span>
          <span className="block text-xs text-stone-400 mt-0.5">{hint}</span>
        </span>
      </label>
    )
  }

  return (
    <Modal open labelledBy={headingId}>
      <div className="bg-amber-50 border-b border-amber-100 p-5">
        <p className="text-xs text-amber-700 uppercase tracking-wide font-semibold mb-1">Deadline missed</p>
        <h2 id={headingId} className="text-lg font-bold text-stone-800">{task.title}</h2>
        <p className="text-sm text-amber-800 mt-1">
          Assigned to {task.assignedTo.displayName} · {overdueDurationLabel}
        </p>
      </div>

      <div className="p-5">
        <p id={promptId} className="text-sm font-medium text-stone-700 mb-3">What should happen next?</p>

        {visibleSuggestions.length > 0 && (
          <div className="flex flex-col gap-2 mb-3">
            {visibleSuggestions.map(s => (
              <button
                key={s.id}
                onClick={() => applySuggestion(s)}
                disabled={busy}
                className="w-full text-left bg-green-50 border border-green-200 rounded-xl p-4 hover:bg-green-100 disabled:opacity-40 transition"
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
          {option('extend', 'Extend deadline', task.deadline ? `Was due ${formatDate(task.deadline)}` : 'Give it more time')}
          {selected === 'extend' && (
            <div className="pl-4 pb-1">
              <input
                type="date"
                min={today}
                value={deadline}
                disabled={busy}
                aria-label="New due date"
                onChange={e => setDeadline(e.target.value)}
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <p className="text-xs text-stone-400 mt-1">Pick a new due date.</p>
            </div>
          )}

          {option('reassign', 'Reassign', 'Hand this to someone else on the team')}
          {selected === 'reassign' && (
            <div className="pl-4 pb-1">
              {otherMembers.length === 0 ? (
                <p className="text-xs text-stone-400">No one else is on this team.</p>
              ) : (
                <select
                  value={memberId}
                  disabled={busy}
                  aria-label="Reassign to"
                  onChange={e => setMemberId(e.target.value)}
                  className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Choose a teammate…</option>
                  {otherMembers.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {option('ignore', 'Ignore', 'Leave the task as it is')}
        </div>

        <button
          onClick={handleSubmit}
          disabled={busy || !canSubmit}
          className="w-full bg-green-700 text-white rounded-xl py-3 mt-5 font-medium hover:bg-green-800 disabled:opacity-40 transition"
        >
          {submitLabel}
        </button>
      </div>
    </Modal>
  )
}
