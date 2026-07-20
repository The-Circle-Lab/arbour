import { NextResponse } from 'next/server'
import { validate as isUuid } from 'uuid'
import { query, queryOne } from '@/lib/db'
import { requireTeamMember, requireTeamMemberByTeamId } from '@/lib/auth/team-access'
import { toDeadlineUtc, formatDeadlineLocal } from '@/lib/dates'
import { clearTaskApprovals, listTaskApprovers } from '@/lib/task-approvals'
import type { TaskSubmission } from '@/lib/task-status'
import { ChatComponent } from '@/lib/chat-components'
import {
  getOrCreateOpenDeadlineEvent,
  type DetectionBudget,
  type DeadlineChoicePayload,
} from '@/lib/task-deadline-events'

interface SubmissionVoteRow {
  member_id: string | null
  display_name: string | null
  vote: 'approve' | 'decline'
  reason: string | null
}

interface SubmissionCommentRow {
  member_id: string | null
  display_name: string | null
  comment: string
  created_at: string
}

async function buildReview(task: { id: string; status: string; submissions: TaskSubmission[] }, memberCount: number, callerMemberId: string) {
  if (task.status !== 'submitted' || task.submissions.length === 0) return null
  const submission = task.submissions[0]

  const votes = await query<SubmissionVoteRow>(
    `SELECT v.member_id, u.display_name, v.vote, v.reason
     FROM task_submission_votes v
     LEFT JOIN members m ON m.id = v.member_id
     LEFT JOIN users u ON u.id = m.user_id
     WHERE v.submission_id = $1
     ORDER BY v.created_at ASC`,
    [submission.id]
  )
  const comments = await query<SubmissionCommentRow>(
    `SELECT c.member_id, u.display_name, c.comment, c.created_at
     FROM task_submission_comments c
     LEFT JOIN members m ON m.id = c.member_id
     LEFT JOIN users u ON u.id = m.user_id
     WHERE c.submission_id = $1
     ORDER BY c.created_at ASC`,
    [submission.id]
  )

  const eligibleVoters = submission.submitted_by ? memberCount - 1 : memberCount
  const myVote = votes.find(v => v.member_id === callerMemberId)?.vote ?? null

  return {
    submissionId: submission.id,
    submittedBy: submission.submitted_by,
    votes: votes.map(v => ({ memberId: v.member_id, displayName: v.display_name ?? 'a former member', vote: v.vote, reason: v.reason })),
    comments: comments.map(c => ({ memberId: c.member_id, displayName: c.display_name ?? 'a former member', comment: c.comment, createdAt: c.created_at })),
    eligibleVoters,
    myVote,
  }
}

// payload.deadline is a wall-clock reading ("YYYY-MM-DD" or "YYYY-MM-DDTHH:mm"),
// the same shape toDeadlineUtc accepts — never a UTC instant.
function formatChoiceDeadline(raw: string): string {
  const hasTime = raw.includes('T')
  const iso = hasTime ? `${raw}:00` : `${raw}T00:00:00`
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleString('en-US', hasTime
    ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric' })
}

function labelForChoice(payload: DeadlineChoicePayload, membersById: Map<string, string>): string {
  if (payload.type === 'extend') return `Extend to ${formatChoiceDeadline(payload.deadline)}`
  if (payload.type === 'reassign') return `Reassign to ${membersById.get(payload.memberId) ?? 'a former member'}`
  if (payload.type === 'ignore') return 'Ignore'
  return payload.label
}

async function buildDeadlineEvent(
  task: { id: string; status: string; deadline: string | null; title: string; description: string | null; assigned_to: string | null },
  membersById: Map<string, string>,
  members: { id: string; displayName: string }[],
  agreements: Partial<Record<ChatComponent, string>>,
  budget: DetectionBudget
) {
  if (task.status === 'done' || !task.deadline) return null
  if (new Date(task.deadline).getTime() >= Date.now()) return null

  const event = await getOrCreateOpenDeadlineEvent(
    task.id,
    task.deadline,
    {
      task: { title: task.title, description: task.description, deadline: task.deadline },
      agreements,
      members,
      currentAssigneeId: task.assigned_to,
    },
    budget
  )
  if (!event) return null

  const votes = await query<{ member_id: string | null; choice_key: string; choice_payload: DeadlineChoicePayload }>(
    'SELECT member_id, choice_key, choice_payload FROM task_deadline_votes WHERE event_id = $1 ORDER BY created_at ASC',
    [event.id]
  )

  let proposal = null
  if (event.phase === 'proposing') {
    const pending = await queryOne<{ id: string; proposed_by: string | null; choice_key: string; choice_payload: DeadlineChoicePayload }>(
      `SELECT id, proposed_by, choice_key, choice_payload FROM task_deadline_proposals
       WHERE event_id = $1 AND round = $2 AND status = 'pending'`,
      [event.id, event.round]
    )
    if (pending) {
      const responses = await query<{ member_id: string | null; response: 'agree' | 'disagree' }>(
        'SELECT member_id, response FROM task_deadline_proposal_responses WHERE proposal_id = $1 ORDER BY created_at ASC',
        [pending.id]
      )
      proposal = {
        id: pending.id,
        proposedBy: pending.proposed_by,
        proposedByName: (pending.proposed_by && membersById.get(pending.proposed_by)) ?? 'a former member',
        choiceKey: pending.choice_key,
        label: labelForChoice(pending.choice_payload, membersById),
        responses: responses.map(r => ({ memberId: r.member_id, displayName: (r.member_id && membersById.get(r.member_id)) ?? 'a former member', response: r.response })),
      }
    }
  }

  return {
    id: event.id,
    deadline: event.deadline,
    detectedAt: event.detected_at,
    phase: event.phase,
    round: event.round,
    suggestions: event.suggestions,
    votes: votes.map(v => ({
      memberId: v.member_id,
      displayName: (v.member_id && membersById.get(v.member_id)) ?? 'a former member',
      choiceKey: v.choice_key,
      label: labelForChoice(v.choice_payload, membersById),
    })),
    proposal,
  }
}

// Derived from the team's currently-open deadline events, not a separate
// stored value — it always reflects live state, never goes stale. Any single
// unresolved deadline miss wilts the plant; once every open event resolves,
// this goes back to null.
function computePlantDistressSeverity(
  tasksWithEvents: { deadlineEvent: unknown }[]
): 'wilting' | null {
  const hasOpenEvent = tasksWithEvents.some(t => t.deadlineEvent !== null)
  return hasOpenEvent ? 'wilting' : null
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 })

  const membership = await requireTeamMember(code)
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const tasks = await query<{
    id: string
    title: string
    description: string | null
    status: string
    deadline: string | null
    assigned_to: string | null
    assignee_display_name: string | null
    created_by: string | null
    created_at: string
    updated_at: string
    submissions: TaskSubmission[]
  }>(
    `SELECT t.id, t.title, t.description, t.status, t.deadline, t.assigned_to,
            au.display_name AS assignee_display_name, t.created_by, t.created_at, t.updated_at,
            COALESCE(s.submissions, '[]'::json) AS submissions
     FROM tasks t
     LEFT JOIN members am ON am.id = t.assigned_to
     LEFT JOIN users au ON au.id = am.user_id
     LEFT JOIN LATERAL (
       SELECT json_agg(
         json_build_object(
           'id', ts.id,
           'submitted_by', ts.submitted_by,
           'submitter_display_name', su.display_name,
           'submitted_at', ts.submitted_at,
           'content', ts.content,
           'url', ts.url,
           'summary', ts.summary
         ) ORDER BY ts.submitted_at DESC
       ) AS submissions
       FROM task_submissions ts
       LEFT JOIN members sm ON sm.id = ts.submitted_by
       LEFT JOIN users su ON su.id = sm.user_id
       WHERE ts.task_id = t.id
     ) s ON TRUE
     WHERE t.team_id = $1
     ORDER BY t.deadline ASC NULLS LAST, t.created_at ASC`,
    [membership.teamId]
  )

  const approvals = await listTaskApprovers(membership.teamId)

  const memberRows = await query<{ id: string; display_name: string }>(
    `SELECT m.id, u.display_name FROM members m JOIN users u ON u.id = m.user_id WHERE m.team_id = $1`,
    [membership.teamId]
  )
  const members = memberRows.map(m => ({ id: m.id, displayName: m.display_name }))
  const membersById = new Map(members.map(m => [m.id, m.displayName]))

  const agreementRows = await query<{ component: string; final_text: string | null }>(
    'SELECT component, final_text FROM agreements WHERE team_id = $1',
    [membership.teamId]
  )
  const agreements: Partial<Record<ChatComponent, string>> = {}
  for (const row of agreementRows) {
    if (row.final_text) agreements[row.component as ChatComponent] = row.final_text
  }

  const budget: DetectionBudget = { remaining: 1 }

  // Sequential, not Promise.all — the shared detection budget above needs a
  // deterministic decrement order, not a best-effort race between tasks.
  const tasksWithExtras = []
  for (const t of tasks) {
    const review = await buildReview(t, members.length, membership.memberId)
    const deadlineEvent = await buildDeadlineEvent(t, membersById, members, agreements, budget)
    tasksWithExtras.push({ ...t, deadline_local: formatDeadlineLocal(t.deadline), review, deadlineEvent })
  }

  const plantDistress = computePlantDistressSeverity(tasksWithExtras)

  return NextResponse.json({ tasks: tasksWithExtras, approvals, plantDistress })
}

export async function POST(req: Request) {
  const { teamId, title, description, deadline, assignedTo } = await req.json()
  if (!teamId || !title?.trim()) {
    return NextResponse.json({ error: 'teamId and title required' }, { status: 400 })
  }

  const membership = await requireTeamMemberByTeamId(teamId)
  if (!membership) return NextResponse.json({ error: 'Not authorized for this team' }, { status: 403 })

  if (assignedTo) {
    if (!isUuid(assignedTo)) {
      return NextResponse.json({ error: 'assignedTo must be a member of this team' }, { status: 400 })
    }
    const assignee = await queryOne('SELECT id FROM members WHERE id = $1 AND team_id = $2', [assignedTo, teamId])
    if (!assignee) return NextResponse.json({ error: 'assignedTo must be a member of this team' }, { status: 400 })
  }

  const task = await queryOne(
    `INSERT INTO tasks (team_id, title, description, deadline, assigned_to, created_by)
     VALUES ($1, $2, $3, $4::timestamptz, $5, $6)
     RETURNING id`,
    [teamId, title.trim(), description?.trim() || null, toDeadlineUtc(deadline), assignedTo || null, membership.memberId]
  )

  await clearTaskApprovals(teamId)

  return NextResponse.json(task, { status: 201 })
}
