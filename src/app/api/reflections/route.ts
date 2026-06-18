import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { CHAT_COMPONENTS, ChatComponent } from '@/lib/chat-components'

export async function POST(req: Request) {
  const { memberId, responses } = await req.json()

  const member = await queryOne<{ id: string; team_id: string }>(
    'SELECT id, team_id FROM members WHERE id = $1',
    [memberId]
  )
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

  for (const component of CHAT_COMPONENTS) {
    if (!responses[component]) continue
    await query(
      `INSERT INTO individual_reflections (member_id, component, response_data)
       VALUES ($1, $2, $3)
       ON CONFLICT (member_id, component) DO UPDATE SET response_data = $3, submitted_at = NOW()`,
      [memberId, component, JSON.stringify(responses[component])]
    )
  }

  return NextResponse.json({ ok: true })
}
