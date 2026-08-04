import { validate as isUuid } from 'uuid'
import { queryOne } from '@/lib/db'
import { requireUser } from './jwt'

export interface TeamMembership {
  userId: string
  memberId: string
  teamId: string
}

export interface OwnedMember {
  userId: string
  teamId: string
}

export async function requireTeamMember(code: string): Promise<TeamMembership | null> {
  const userId = await requireUser()
  if (!userId) return null

  const row = await queryOne<{ team_id: string; member_id: string }>(
    `SELECT t.id AS team_id, m.id AS member_id
     FROM teams t
     JOIN members m ON m.team_id = t.id AND m.user_id = $2
     WHERE t.join_code = $1`,
    [code.toUpperCase(), userId]
  )
  if (!row) return null // team doesn't exist, or user isn't a member — deliberately indistinguishable

  return { userId, memberId: row.member_id, teamId: row.team_id }
}

export async function requireTeamMemberByTeamId(teamId: string): Promise<TeamMembership | null> {
  if (!isUuid(teamId)) return null // malformed id, not a real team — same "not found" response as a valid-but-unknown id

  const userId = await requireUser()
  if (!userId) return null

  const row = await queryOne<{ member_id: string }>(
    'SELECT id AS member_id FROM members WHERE team_id = $1 AND user_id = $2',
    [teamId, userId]
  )
  if (!row) return null

  return { userId, memberId: row.member_id, teamId }
}

export async function requireOwnedMember(memberId: string): Promise<OwnedMember | null> {
  if (!isUuid(memberId)) return null

  const userId = await requireUser()
  if (!userId) return null

  const row = await queryOne<{ team_id: string }>(
    'SELECT team_id FROM members WHERE id = $1 AND user_id = $2',
    [memberId, userId]
  )
  if (!row) return null

  return { userId, teamId: row.team_id }
}

// Elected via /choose-project-manager and fixed for the life of the group —
// see teams.project_manager_id.
export async function isProjectManager(teamId: string, memberId: string): Promise<boolean> {
  const row = await queryOne<{ project_manager_id: string | null }>(
    'SELECT project_manager_id FROM teams WHERE id = $1',
    [teamId]
  )
  return row?.project_manager_id === memberId
}
