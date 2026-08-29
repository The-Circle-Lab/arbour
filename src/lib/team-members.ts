import { query } from './db'

export interface TeamMember {
  id: string
  display_name: string
  pronouns: string | null
  joined_at: string
}

// Shared by src/app/api/teams/[code]/route.ts (student-facing) and
// src/app/api/instructor/teams/[teamId]/route.ts (instructor-facing) so the
// member list can't silently drift between the two views of the same team.
export async function getTeamMembers(teamId: string): Promise<TeamMember[]> {
  return query<TeamMember>(
    `SELECT m.id, u.display_name, u.pronouns, m.joined_at
     FROM members m
     JOIN users u ON u.id = m.user_id
     WHERE m.team_id = $1
     ORDER BY m.joined_at`,
    [teamId]
  )
}
