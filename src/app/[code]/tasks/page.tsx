'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession, getMembership } from '@/lib/session'
import { STATUS_LABELS, STATUS_COLORS, isSubmittable, type TaskStatus, type TaskSubmission } from '@/lib/task-status'
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
  submissions: TaskSubmission[]
}

interface TeamData {
  name: string
}

export default function TaskListPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const { loading, user, memberships } = useSession()
  const membership = getMembership(memberships, code)

  const [team, setTeam] = useState<TeamData | null>(null)
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [filter, setFilter] = useState<'mine' | 'all'>('mine')
  const [error, setError] = useState<string | null>(null)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [submitContent, setSubmitContent] = useState('')
  const [submitUrl, setSubmitUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!user || !membership) { router.replace('/'); return }
    loadAll()
    const interval = setInterval(loadAll, 4000)
    return () => clearInterval(interval)
  }, [code, loading, user, membership])

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
      setTasks(tasksData.tasks)
    }
  }

  function openSubmit(taskId: string) {
    setExpandedId(taskId)
    setSubmitContent('')
    setSubmitUrl('')
    setError(null)
  }

  function closeSubmit() {
    setExpandedId(null)
    setSubmitContent('')
    setSubmitUrl('')
  }

  async function handleSubmitTask(taskId: string) {
    if (!submitContent.trim()) return
    setSubmitting(true)
    setError(null)
    const result = await apiRequest(`/api/tasks/${taskId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: submitContent.trim(), url: submitUrl.trim() || undefined }),
    })
    setSubmitting(false)
    if (!result.ok) { setError(result.error); return }
    closeSubmit()
    await loadAll()
  }

  if (!team || !membership) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-stone-50">
        <p className="text-stone-400">Loading…</p>
      </main>
    )
  }

  const visibleTasks = filter === 'mine'
    ? tasks.filter(t => t.assigned_to === membership.member_id)
    : tasks

  return (
    <main className="min-h-screen bg-stone-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-stone-800">Tasks</h1>
          <p className="text-stone-500 text-sm mt-1">{team.name}</p>
        </div>

        {error && (
          <div className="mb-4 flex items-start justify-between gap-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="shrink-0 text-red-400 hover:text-red-600" aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        <div className="flex gap-2 mb-5">
          <button
            onClick={() => setFilter('mine')}
            className={`text-sm font-medium rounded-lg px-4 py-2 transition ${
              filter === 'mine' ? 'bg-green-700 text-white' : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-100'
            }`}
          >
            My tasks
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`text-sm font-medium rounded-lg px-4 py-2 transition ${
              filter === 'all' ? 'bg-green-700 text-white' : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-100'
            }`}
          >
            All tasks
          </button>
        </div>

        {visibleTasks.length === 0 && (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-6 text-center text-sm text-stone-500">
            {filter === 'mine' ? 'No tasks are assigned to you.' : 'No tasks yet.'}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {visibleTasks.map(task => {
            const canSubmit = isSubmittable(task.status)
            const isExpanded = expandedId === task.id
            return (
              <div key={task.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h2 className="flex-1 font-semibold text-stone-800 text-sm">{task.title}</h2>
                  <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_COLORS[task.status]}`}>
                    {STATUS_LABELS[task.status]}
                  </span>
                </div>

                {task.description && (
                  <p className="text-sm text-stone-600 mb-3 whitespace-pre-wrap">{task.description}</p>
                )}

                <div className="flex flex-wrap gap-3 text-xs text-stone-500 mb-3">
                  <span>{task.assignee_display_name ?? 'Unassigned'}</span>
                  {task.deadline_local && <span>Due {task.deadline_local.replace('T', ' ')}</span>}
                </div>

                {task.submissions.length > 0 && (
                  <div className="flex flex-col gap-2 mb-3">
                    {task.submissions.map((s, i) => {
                      const isLatest = i === 0
                      return (
                        <div
                          key={s.id}
                          className={`border rounded-lg p-3 ${isLatest ? 'bg-purple-50 border-purple-100' : 'bg-stone-50 border-stone-100'}`}
                        >
                          <p className={`text-xs font-medium mb-1 ${isLatest ? 'text-purple-700' : 'text-stone-500'}`}>
                            {isLatest ? 'Submitted' : 'Earlier submission'} by {s.submitter_display_name ?? 'a former member'} · {new Date(s.submitted_at).toLocaleString()}
                          </p>
                          {s.content && (
                            <p className="text-sm text-stone-700 whitespace-pre-wrap">{s.content}</p>
                          )}
                          {s.url && (
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-purple-700 underline break-all"
                            >
                              {s.url}
                            </a>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {canSubmit && !isExpanded && (
                  <button
                    onClick={() => openSubmit(task.id)}
                    className="text-sm text-green-700 border border-green-600 rounded-lg px-4 py-2 hover:bg-green-50 transition"
                  >
                    Submit this task
                  </button>
                )}

                {canSubmit && isExpanded && (
                  <div className="border-t border-stone-100 pt-3 mt-1 flex flex-col gap-2">
                    <textarea
                      className="w-full text-sm text-stone-800 border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                      rows={3}
                      placeholder="Your submission *"
                      value={submitContent}
                      onChange={e => setSubmitContent(e.target.value)}
                    />
                    <input
                      className="w-full text-sm text-stone-800 border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="Link to your work (optional)"
                      value={submitUrl}
                      onChange={e => setSubmitUrl(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSubmitTask(task.id)}
                        disabled={submitting || !submitContent.trim()}
                        className="flex-1 bg-green-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-800 disabled:opacity-40 transition"
                      >
                        {submitting ? 'Submitting…' : 'Submit'}
                      </button>
                      <button
                        onClick={closeSubmit}
                        disabled={submitting}
                        className="text-sm text-stone-500 border border-stone-200 rounded-lg px-4 py-2 hover:bg-stone-50 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
