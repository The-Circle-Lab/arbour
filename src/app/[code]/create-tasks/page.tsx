'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession, getMembership } from '@/lib/session'
import type { Phase } from '@/lib/phase'
import { type TaskStatus, STATUS_LABELS, STATUS_COLORS, EDITABLE_STATUSES } from '@/lib/task-status'
import { apiRequest } from '@/lib/api-client'

interface TaskRow {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  deadline: string | null
  deadline_local: string | null
  assigned_to: string | null
  assignee_display_name: string | null
}

const DEFAULT_DEADLINE_TIME = '23:59'

interface Member {
  id: string
  display_name: string
}

interface TeamData {
  id: string
  name: string
  project_title: string | null
  deadline: string | null
  assignment_brief: string | null
  project_manager_id: string | null
  members: Member[]
  status: { phase: Phase; teamSize: number; tasksApproved: boolean }
}

export default function TasksPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const { loading, user, memberships } = useSession()
  const membership = getMembership(memberships, code)

  const [team, setTeam] = useState<TeamData | null>(null)
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [approvals, setApprovals] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, { title: string; description: string }>>({})
  const dirtyRef = useRef<Set<string>>(new Set())
  const [deadlineDrafts, setDeadlineDrafts] = useState<Record<string, { date: string; time: string }>>({})
  const deadlineDirtyRef = useRef<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  // Every mutation funnels through here instead of calling apiRequest directly,
  // so a rejected request (stale data, validation failure, a race with
  // another member's edit) surfaces to the user instead of failing silently.
  async function mutate(url: string, opts: RequestInit): Promise<boolean> {
    setError(null)
    const result = await apiRequest(url, opts)
    if (!result.ok) { setError(result.error); return false }
    return true
  }

  async function loadAll() {
    const [teamRes, tasksRes] = await Promise.all([
      fetch(`/api/teams/${code.toUpperCase()}`),
      fetch(`/api/tasks?code=${code.toUpperCase()}`),
    ])

    if (teamRes.ok) {
      const teamData: TeamData = await teamRes.json()
      setTeam(teamData)
    }

    if (tasksRes.ok) {
      const tasksData = await tasksRes.json()
      const rows: TaskRow[] = tasksData.tasks
      setTasks(rows)
      setApprovals(tasksData.approvals ?? [])

      setDrafts(prev => {
        const next = { ...prev }
        for (const t of rows) {
          if (dirtyRef.current.has(t.id)) continue
          next[t.id] = { title: t.title, description: t.description ?? '' }
        }
        return next
      })

      setDeadlineDrafts(prev => {
        const next = { ...prev }
        for (const t of rows) {
          if (deadlineDirtyRef.current.has(t.id)) continue
          const [d, tm] = (t.deadline_local ?? '').split('T')
          next[t.id] = { date: d ?? '', time: tm ?? DEFAULT_DEADLINE_TIME }
        }
        return next
      })
    }
  }

  useEffect(() => {
    if (loading) return
    if (!user || !membership) { router.replace('/'); return }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the actual trigger is loadAll's setDrafts(prev => ...) updater reading dirtyRef.current (to skip overwriting an in-progress edit), which the lint rule treats as impure. Declaring loadAll after this effect doesn't clear it — it just swaps this warning for react-hooks/immutability ("accessed before declared") on the same block, since the analyzer can no longer resolve the setDrafts call at all. agree/page.tsx's loadAll has no set-state-with-ref-read updater, which is why its otherwise-identical effect needs no suppression.
    loadAll()
    const interval = setInterval(loadAll, 4000)
    return () => clearInterval(interval)
  }, [code, loading, user, membership])

  async function handleGenerate() {
    if (!team) return
    setGenerating(true)
    await mutate('/api/tasks/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: team.id }),
    })
    await loadAll()
    setGenerating(false)
  }

  async function handleAddTask() {
    if (!team || !newTitle.trim()) return
    setAdding(true)
    const ok = await mutate('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: team.id, title: newTitle.trim() }),
    })
    if (ok) setNewTitle('')
    await loadAll()
    setAdding(false)
  }

  async function handleSaveText(taskId: string) {
    const draft = drafts[taskId]
    if (!draft) return
    const ok = await mutate(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: draft.title, description: draft.description }),
    })
    if (ok) dirtyRef.current.delete(taskId)
    await loadAll()
  }

  async function handleSaveDeadline(taskId: string) {
    const draft = deadlineDrafts[taskId]
    if (!draft) return
    const task = tasks.find(t => t.id === taskId)
    const newDeadline = draft.date ? `${draft.date}T${draft.time || DEFAULT_DEADLINE_TIME}` : null
    if (newDeadline === (task?.deadline_local ?? null)) {
      deadlineDirtyRef.current.delete(taskId)
      return
    }
    const ok = await mutate(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deadline: newDeadline }),
    })
    if (ok) deadlineDirtyRef.current.delete(taskId)
    await loadAll()
  }

  async function handleFieldPatch(taskId: string, body: Record<string, unknown>) {
    await mutate(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await loadAll()
  }

  async function handleDelete(taskId: string) {
    if (!confirm('Remove this task?')) return
    await mutate(`/api/tasks/${taskId}`, { method: 'DELETE' })
    await loadAll()
  }

  async function handleApprove() {
    if (!team) return
    await mutate('/api/tasks/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: team.id }),
    })
    await loadAll()
  }

  async function handleWithdraw() {
    if (!team) return
    await mutate('/api/tasks/approve', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: team.id }),
    })
    await loadAll()
  }

  if (!team) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-stone-50">
        <p className="text-stone-400">Loading…</p>
      </main>
    )
  }

  const teamSize = team.status.teamSize
  const myApproval = membership ? approvals.includes(membership.member_id) : false
  const tasksApproved = team.status.tasksApproved
  const isProjectManager = !!team.project_manager_id && team.project_manager_id === membership?.member_id
  const incompleteCount = tasks.filter(t => !t.assigned_to || !t.deadline).length
  const allTasksReady = tasks.length > 0 && incompleteCount === 0

  return (
    <main className="min-h-screen bg-stone-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-stone-800">Tasks</h1>
          <p className="text-stone-500 text-sm mt-1">
            {tasks.length > 0
              ? `${approvals.length} of ${teamSize} approved the current list`
              : 'Break your project into a task list, then agree on it as a team.'}
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-start justify-between gap-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="shrink-0 text-red-400 hover:text-red-600" aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        {(team.project_title || team.assignment_brief || team.deadline) && (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-5">
            <p className="text-xs text-stone-400 uppercase tracking-wide font-medium mb-2">Project context</p>
            {team.project_title && <p className="text-sm font-semibold text-stone-800">{team.project_title}</p>}
            {team.deadline && <p className="text-xs text-stone-500 mt-1">Deadline: {team.deadline.slice(0, 10)}</p>}
            {team.assignment_brief && <p className="text-sm text-stone-600 mt-2 whitespace-pre-wrap">{team.assignment_brief}</p>}
          </div>
        )}

        {tasks.length === 0 && (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-6 mb-5 text-center">
            <p className="text-sm text-stone-500 mb-4">
              Arbour can suggest a task list based on your project details and what each of you said about the role you want — or just add tasks yourself below.
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full bg-green-700 text-white rounded-lg py-3 text-sm font-medium hover:bg-green-800 disabled:opacity-40 transition"
            >
              {generating ? 'Suggesting tasks…' : 'Suggest tasks for us'}
            </button>
          </div>
        )}

        <div className="flex flex-col gap-3 mb-5">
            {tasks.map(task => {
              const draft = drafts[task.id] ?? { title: task.title, description: task.description ?? '' }
              const deadlineDraft = deadlineDrafts[task.id] ?? { date: '', time: DEFAULT_DEADLINE_TIME }
              return (
                <div key={task.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <input
                      className="flex-1 font-semibold text-stone-800 text-sm border-none focus:outline-none focus:ring-2 focus:ring-green-500 rounded px-1 -mx-1"
                      value={draft.title}
                      onChange={e => {
                        dirtyRef.current.add(task.id)
                        setDrafts(d => ({ ...d, [task.id]: { ...draft, title: e.target.value } }))
                      }}
                      onBlur={() => handleSaveText(task.id)}
                    />
                    <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_COLORS[task.status]}`}>
                      {STATUS_LABELS[task.status]}
                    </span>
                    {isProjectManager && (
                      <button
                        onClick={() => handleDelete(task.id)}
                        className="shrink-0 text-xs text-stone-300 hover:text-red-500 transition"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <textarea
                    className="w-full text-sm text-stone-600 border-none resize-none focus:outline-none focus:ring-2 focus:ring-green-500 rounded px-1 -mx-1 mb-3"
                    rows={2}
                    placeholder="Add a description…"
                    value={draft.description}
                    onChange={e => {
                      dirtyRef.current.add(task.id)
                      setDrafts(d => ({ ...d, [task.id]: { ...draft, description: e.target.value } }))
                    }}
                    onBlur={() => handleSaveText(task.id)}
                  />

                  <div className="flex flex-wrap gap-3">
                    <select
                      className="text-xs border border-stone-200 rounded-lg px-2 py-1.5 text-stone-600 focus:outline-none focus:ring-2 focus:ring-green-500"
                      value={task.status}
                      onChange={e => handleFieldPatch(task.id, { status: e.target.value })}
                    >
                      {task.status === 'submitted' && (
                        <option value="submitted" disabled>{STATUS_LABELS.submitted}</option>
                      )}
                      {EDITABLE_STATUSES.map(s => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>

                    <input
                      type="date"
                      className={`text-xs border rounded-lg px-2 py-1.5 text-stone-600 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-40 ${
                        task.deadline ? 'border-stone-200' : 'border-amber-300 bg-amber-50'
                      }`}
                      value={deadlineDraft.date}
                      disabled={!isProjectManager}
                      title={isProjectManager ? undefined : 'Only the project manager can set deadlines'}
                      onChange={e => {
                        // Buffer locally instead of PATCHing on every keystroke — a
                        // controlled native date/time input reset mid-typing (from an
                        // immediate save-and-refetch round trip) wipes out the
                        // browser's in-progress segment buffer. Commit on blur instead.
                        deadlineDirtyRef.current.add(task.id)
                        setDeadlineDrafts(d => ({ ...d, [task.id]: { ...deadlineDraft, date: e.target.value } }))
                      }}
                      onBlur={() => handleSaveDeadline(task.id)}
                    />

                    <input
                      type="time"
                      className={`text-xs border rounded-lg px-2 py-1.5 text-stone-600 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-40 ${
                        task.deadline ? 'border-stone-200' : 'border-amber-300 bg-amber-50'
                      }`}
                      value={deadlineDraft.time}
                      disabled={!deadlineDraft.date || !isProjectManager}
                      title={isProjectManager ? undefined : 'Only the project manager can set deadlines'}
                      onChange={e => {
                        deadlineDirtyRef.current.add(task.id)
                        setDeadlineDrafts(d => ({ ...d, [task.id]: { ...deadlineDraft, time: e.target.value } }))
                      }}
                      onBlur={() => handleSaveDeadline(task.id)}
                    />

                    <select
                      className={`text-xs border rounded-lg px-2 py-1.5 text-stone-600 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-40 ${
                        task.assigned_to ? 'border-stone-200' : 'border-amber-300 bg-amber-50'
                      }`}
                      value={task.assigned_to ?? ''}
                      disabled={!isProjectManager}
                      title={isProjectManager ? undefined : 'Only the project manager can assign tasks'}
                      onChange={e => handleFieldPatch(task.id, { assignedTo: e.target.value || null })}
                    >
                      <option value="">Unassigned</option>
                      {team.members.map(m => (
                        <option key={m.id} value={m.id}>{m.display_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )
            })}

            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 flex gap-3">
              <input
                className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Add a task…"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddTask() }}
              />
              <button
                onClick={handleAddTask}
                disabled={adding || !newTitle.trim()}
                className="text-sm text-green-700 border border-green-600 rounded-lg px-4 py-2 hover:bg-green-50 disabled:opacity-40 transition"
              >
                Add
              </button>
            </div>

            {tasks.length > 0 && (
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-stone-600">Approvals: {approvals.length} / {teamSize}</span>
                  <div className="flex gap-2 flex-wrap">
                    {team.members.map(m => (
                      <span
                        key={m.id}
                        className={`text-xs px-2 py-1 rounded-full ${
                          approvals.includes(m.id) ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-400'
                        }`}
                      >
                        {m.display_name}
                      </span>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-stone-400 mb-3">Any change to the list clears everyone&apos;s approval — review and approve again.</p>
                {!allTasksReady ? (
                  <div className="text-center text-amber-700 bg-amber-50 border border-amber-200 rounded-lg text-sm py-2 px-3">
                    {`${incompleteCount} task${incompleteCount !== 1 ? 's' : ''} still need${incompleteCount === 1 ? 's' : ''} an assignee and a deadline before the list can be approved`}
                  </div>
                ) : tasksApproved ? (
                  <div className="text-center text-green-700 font-medium text-sm py-2">✓ Everyone has approved this list</div>
                ) : myApproval ? (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 text-sm text-green-700 font-medium">✓ You approved this list</div>
                    <button onClick={handleWithdraw} className="text-xs text-stone-400 hover:text-stone-600 hover:underline">
                      Withdraw
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleApprove}
                    className="w-full bg-green-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-green-800 transition"
                  >
                    Approve task list
                  </button>
                )}
              </div>
            )}
        </div>

        {tasks.length > 0 && (tasksApproved ? (
          <button
            onClick={() => router.push(`/${code}/plant-intro`)}
            className="w-full bg-green-700 text-white rounded-xl py-4 text-lg font-medium hover:bg-green-800 transition"
          >
            Meet your plant →
          </button>
        ) : (
          <div className="text-center text-sm text-stone-400 py-2">
            Everyone needs to approve the task list before continuing
          </div>
        ))}
      </div>
    </main>
  )
}
