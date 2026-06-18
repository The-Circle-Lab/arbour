import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export async function POST(req: Request) {
  try {
    const { name } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

    let join_code = randomCode()
    let attempts = 0
    while (attempts < 10) {
      const existing = await queryOne('SELECT id FROM teams WHERE join_code = $1', [join_code])
      if (!existing) break
      join_code = randomCode()
      attempts++
    }

    const team = await queryOne<{ id: string; name: string; join_code: string }>(
      'INSERT INTO teams (name, join_code) VALUES ($1, $2) RETURNING id, name, join_code',
      [name.trim(), join_code]
    )

    return NextResponse.json(team, { status: 201 })
  } catch (e) {
    console.error('POST /api/teams error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const { teamId, projectTitle, deadline, assignmentBrief } = await req.json()
    if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 })

    await query(
      `UPDATE teams SET
        project_title = COALESCE($2, project_title),
        deadline = COALESCE($3::date, deadline),
        assignment_brief = COALESCE($4, assignment_brief)
       WHERE id = $1`,
      [teamId, projectTitle ?? null, deadline ?? null, assignmentBrief ?? null]
    )

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('PATCH /api/teams error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
