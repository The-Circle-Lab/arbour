import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { requireUser } from '@/lib/auth/jwt'

export async function GET() {
  const userId = await requireUser()
  if (!userId) {
    return NextResponse.json({ user: null, memberships: [] })
  }

  const user = await queryOne<{ id: string; email: string }>(
    'SELECT id, email FROM users WHERE id = $1',
    [userId]
  )
  if (!user) {
    return NextResponse.json({ user: null, memberships: [] })
  }

  const memberships = await query<{
    member_id: string
    team_id: string
    join_code: string
    team_name: string
    display_name: string
    pronouns: string | null
  }>(
    `SELECT m.id AS member_id, m.team_id, t.join_code, t.name AS team_name, m.display_name, m.pronouns
     FROM members m
     JOIN teams t ON t.id = m.team_id
     WHERE m.user_id = $1
     ORDER BY m.joined_at`,
    [userId]
  )

  return NextResponse.json({ user, memberships })
}
