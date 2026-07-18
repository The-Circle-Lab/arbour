import { query } from './db'

// Single owning module for task_approvals — every route that reads, records,
// or invalidates task-list approval goes through here instead of hand-writing
// the same queries, so the "any list change clears approval" invariant lives
// in one place instead of being copy-pasted per mutation route.

export async function countTaskApprovals(teamId: string): Promise<number> {
  const rows = await query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM task_approvals WHERE team_id = $1',
    [teamId]
  )
  return rows[0]?.count ?? 0
}

export async function listTaskApprovers(teamId: string): Promise<string[]> {
  const rows = await query<{ member_id: string }>(
    'SELECT member_id FROM task_approvals WHERE team_id = $1',
    [teamId]
  )
  return rows.map(r => r.member_id)
}

export async function clearTaskApprovals(teamId: string): Promise<void> {
  await query('DELETE FROM task_approvals WHERE team_id = $1', [teamId])
}

export async function recordTaskApproval(teamId: string, memberId: string): Promise<void> {
  await query(
    `INSERT INTO task_approvals (team_id, member_id)
     VALUES ($1, $2)
     ON CONFLICT (team_id, member_id) DO NOTHING`,
    [teamId, memberId]
  )
}

export async function withdrawTaskApproval(teamId: string, memberId: string): Promise<void> {
  await query('DELETE FROM task_approvals WHERE team_id = $1 AND member_id = $2', [teamId, memberId])
}
