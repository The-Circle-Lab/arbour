import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { requireUser } from '@/lib/auth/jwt'

const UNIQUE_VIOLATION = '23505'

export async function POST(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  const userId = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const team = await queryOne<{ id: string }>(
    'SELECT id FROM teams WHERE join_code = $1',
    [code.toUpperCase()]
  )
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  // Already a member of this team — return the existing row instead of a duplicate.
  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM members WHERE team_id = $1 AND user_id = $2',
    [team.id, userId]
  )
  if (existing) {
    return NextResponse.json({ ...existing, teamId: team.id, joinCode: code.toUpperCase() })
  }

  try {
    const member = await queryOne<{ id: string }>(
      'INSERT INTO members (team_id, user_id) VALUES ($1, $2) RETURNING id',
      [team.id, userId]
    )
    return NextResponse.json({ ...member, teamId: team.id, joinCode: code.toUpperCase() }, { status: 201 })
  } catch (e) {
    if (!isUniqueViolation(e)) throw e
    // Concurrent request already inserted this same membership — return it.
    const race = await queryOne<{ id: string }>(
      'SELECT id FROM members WHERE team_id = $1 AND user_id = $2',
      [team.id, userId]
    )
    return NextResponse.json({ ...race, teamId: team.id, joinCode: code.toUpperCase() })
  }
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === UNIQUE_VIOLATION
}
