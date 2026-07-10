import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { requireUser } from '@/lib/auth/jwt'

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { displayName, pronouns } = await req.json()

  if (!displayName?.trim()) return NextResponse.json({ error: 'Display name required' }, { status: 400 })

  const userId = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const team = await queryOne<{ id: string }>(
    'SELECT id FROM teams WHERE join_code = $1',
    [code.toUpperCase()]
  )
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  // Already a member of this team — return the existing row instead of a duplicate.
  const existing = await queryOne<{ id: string; display_name: string; pronouns: string | null }>(
    'SELECT id, display_name, pronouns FROM members WHERE team_id = $1 AND user_id = $2',
    [team.id, userId]
  )
  if (existing) {
    return NextResponse.json({ ...existing, teamId: team.id, joinCode: code.toUpperCase() })
  }

  const member = await queryOne<{ id: string; display_name: string; pronouns: string | null }>(
    'INSERT INTO members (team_id, display_name, pronouns, user_id) VALUES ($1, $2, $3, $4) RETURNING id, display_name, pronouns',
    [team.id, displayName.trim(), pronouns?.trim() || null, userId]
  )

  return NextResponse.json({ ...member, teamId: team.id, joinCode: code.toUpperCase() }, { status: 201 })
}
