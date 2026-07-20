'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession, getMembership } from '@/lib/session'
import { STATUS_LABELS, STATUS_COLORS, isSubmittable, type TaskStatus, type TaskSubmission } from '@/lib/task-status'
import { apiRequest } from '@/lib/api-client'
import { TaskSubmittedModal } from '@/components/tasks/TaskSubmittedModal'
import { DeadlineMissedModal } from '@/components/tasks/DeadlineMissedModal'
import { PlantDistressModal } from '@/components/tasks/PlantDistressModal'
import { PLANT_TYPES, type PlantType } from '@/components/PlantVisual'
import type { ChoiceInput, PendingDeadlineEvent, PendingReview, TeamMemberOption } from '@/lib/tasks-types'

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
  review: PendingReview | null
  deadlineEvent: PendingDeadlineEvent | null
}

interface TeamData {
  name: string
  members: TeamMemberOption[]
  plantType: PlantType
}

function formatOverdue(deadlineIso: string): string {
  const ms = Date.now() - new Date(deadlineIso).getTime()
  const hours = Math.floor(ms / (1000 * 60 * 60))
  if (hours < 1) return 'Just missed'
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} overdue`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} overdue`
}

export default function TaskListPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const { loading, user, memberships } = useSession()
  const membership = getMembership(memberships, code)

  const [team, setTeam] = useState<TeamData | null>(null)
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [plantDistress, setPlantDistress] = useState<'wilting' | null>(null)
  const [filter, setFilter] = useState<'mine' | 'all'>('mine')
  const [error, setError] = useState<string | null>(null)
  const [sawDistressReason, setSawDistressReason] = useState(false)
  const [lastSeenDeadlineEventId, setLastSeenDeadlineEventId] = useState<string | null>(null)

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
      const teamData = await teamRes.json()
      const plantType: PlantType = PLANT_TYPES.includes(teamData.plant_type) ? teamData.plant_type : 'default'
      setTeam({
        name: teamData.name,
        members: (teamData.members ?? []).map((m: { id: string; display_name: string }) => ({ id: m.id, displayName: m.display_name })),
        plantType,
      })
    }

    if (tasksRes.ok) {
      const tasksData = await tasksRes.json()
      setTasks(tasksData.tasks)
      setPlantDistress(tasksData.plantDistress ?? null)
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

  // A 409 just means someone else already acted (or the round moved on) —
  // the next poll's fresh data is the fix, no error banner needed.
  async function callOrRefresh(url: string, body: unknown) {
    const result = await apiRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!result.ok) { await loadAll(); return }
    await loadAll()
  }

  // Submission-review modals (excluding my own submissions, which I can't
  // vote or comment on) take priority over deadline-missed ones — completed
  // work awaiting judgment is more actionable than a standing overdue notice.
  const reviewCandidates = tasks
    .filter(t => t.review && t.review.submittedBy !== membership?.member_id)
    .sort((a, b) => new Date(a.submissions[0].submitted_at).getTime() - new Date(b.submissions[0].submitted_at).getTime())
  const deadlineCandidates = tasks
    .filter(t => t.deadlineEvent)
    .sort((a, b) => new Date(a.deadlineEvent!.detectedAt).getTime() - new Date(b.deadlineEvent!.detectedAt).getTime())

  const reviewTask = reviewCandidates[0]
  const deadlineTask = reviewTask ? undefined : deadlineCandidates[0]
  const currentDeadlineEventId = deadlineTask?.deadlineEvent?.id ?? null

  // The plant-distress interstitial shows once per distinct deadline event —
  // dismissing it via "See the reason" shouldn't hide it again the moment a
  // genuinely new deadline is missed later. Adjusted during render (React's
  // documented alternative to an effect for "reset state when a derived
  // value changes") rather than in a useEffect, so there's no extra
  // render-commit-effect round trip for what's really just derived state.
  if (currentDeadlineEventId !== lastSeenDeadlineEventId) {
    setLastSeenDeadlineEventId(currentDeadlineEventId)
    setSawDistressReason(false)
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

  const showPlantDistress = !!deadlineTask && !!plantDistress && !sawDistressReason

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

      {reviewTask && reviewTask.review && (
        <TaskSubmittedModal
          taskTitle={reviewTask.title}
          submitterName={reviewTask.submissions[0]?.submitter_display_name ?? 'a former member'}
          submittedAt={reviewTask.submissions[0]?.submitted_at}
          summary={reviewTask.submissions[0]?.summary ?? null}
          content={reviewTask.submissions[0]?.content ?? ''}
          url={reviewTask.submissions[0]?.url ?? null}
          votes={reviewTask.review.votes}
          comments={reviewTask.review.comments}
          eligibleVoters={reviewTask.review.eligibleVoters}
          myVote={reviewTask.review.myVote}
          onApprove={() => callOrRefresh(`/api/tasks/${reviewTask.id}/submissions/${reviewTask.review!.submissionId}/vote`, { vote: 'approve' })}
          onDecline={reason => callOrRefresh(`/api/tasks/${reviewTask.id}/submissions/${reviewTask.review!.submissionId}/vote`, { vote: 'decline', reason })}
          onCommentOnly={comment => callOrRefresh(`/api/tasks/${reviewTask.id}/submissions/${reviewTask.review!.submissionId}/comment`, { comment })}
        />
      )}

      {showPlantDistress && (
        <PlantDistressModal
          plantType={team.plantType}
          onSeeReason={() => setSawDistressReason(true)}
        />
      )}

      {deadlineTask && deadlineTask.deadlineEvent && !showPlantDistress && (
        <DeadlineMissedModal
          taskTitle={deadlineTask.title}
          assigneeName={deadlineTask.assignee_display_name ?? 'Unassigned'}
          currentAssigneeId={deadlineTask.assigned_to}
          overdueDurationLabel={formatOverdue(deadlineTask.deadlineEvent.deadline)}
          deadline={deadlineTask.deadlineEvent.deadline}
          members={team.members}
          suggestions={deadlineTask.deadlineEvent.suggestions}
          phase={deadlineTask.deadlineEvent.phase}
          votes={deadlineTask.deadlineEvent.votes}
          currentMemberId={membership.member_id}
          proposal={deadlineTask.deadlineEvent.proposal}
          onVote={(input: ChoiceInput) => callOrRefresh(
            deadlineTask.deadlineEvent!.phase === 'voting'
              ? `/api/tasks/${deadlineTask.id}/deadline-events/${deadlineTask.deadlineEvent!.id}/vote`
              : `/api/tasks/${deadlineTask.id}/deadline-events/${deadlineTask.deadlineEvent!.id}/propose`,
            input
          )}
          onRespond={response => callOrRefresh(
            `/api/tasks/${deadlineTask.id}/deadline-events/${deadlineTask.deadlineEvent!.id}/proposals/${deadlineTask.deadlineEvent!.proposal!.id}/respond`,
            { response }
          )}
        />
      )}
    </main>
  )
}
