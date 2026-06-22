import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { displayName, pronouns } = await req.json()

  if (!displayName?.trim()) return NextResponse.json({ error: 'Display name required' }, { status: 400 })

  const team = await queryOne<{ id: string }>(
    'SELECT id FROM teams WHERE join_code = $1',
    [code.toUpperCase()]
  )
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const member = await queryOne<{ id: string; display_name: string; pronouns: string | null }>(
    'INSERT INTO members (team_id, display_name, pronouns) VALUES ($1, $2, $3) RETURNING id, display_name, pronouns',
    [team.id, displayName.trim(), pronouns?.trim() || null]
  )

  return NextResponse.json({ ...member, teamId: team.id, joinCode: code.toUpperCase() }, { status: 201 })
}
