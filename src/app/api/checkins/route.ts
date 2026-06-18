import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { CHAT_COMPONENTS } from '@/lib/chat-components'

export async function POST(req: Request) {
  const { memberId, cycleNumber, responses } = await req.json()

  const member = await queryOne<{ id: string; team_id: string }>(
    'SELECT id, team_id FROM members WHERE id = $1',
    [memberId]
  )
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

  for (const component of CHAT_COMPONENTS) {
    if (!responses[component]) continue
    await query(
      `INSERT INTO checkins (member_id, cycle_number, component, response_data)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (member_id, cycle_number, component) DO UPDATE
         SET response_data = $4, submitted_at = NOW()`,
      [memberId, cycleNumber, component, JSON.stringify(responses[component])]
    )
  }

  return NextResponse.json({ ok: true })
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const teamId = searchParams.get('teamId')
  const cycle = searchParams.get('cycle')
  if (!teamId || !cycle) return NextResponse.json({ error: 'teamId and cycle required' }, { status: 400 })

  const checkins = await query<{
    member_id: string
    display_name: string
    component: string
    response_data: Record<string, unknown>
  }>(
    `SELECT ci.member_id, m.display_name, ci.component, ci.response_data
     FROM checkins ci
     JOIN members m ON m.id = ci.member_id
     WHERE m.team_id = $1 AND ci.cycle_number = $2
     ORDER BY m.joined_at`,
    [teamId, cycle]
  )

  return NextResponse.json({ checkins })
}
