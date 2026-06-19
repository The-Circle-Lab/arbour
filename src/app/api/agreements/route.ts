import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { generateAgreementDraft, MemberReflection } from '@/lib/ai'
import { ChatComponent } from '@/lib/chat-components'

// POST: save resolution note and trigger AI draft generation
export async function POST(req: Request) {
  const { teamId, component, resolutionNote, memberId } = await req.json()

  const member = await queryOne<{ id: string }>(
    'SELECT id FROM members WHERE id = $1 AND team_id = $2',
    [memberId, teamId]
  )
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

  // Fetch member reflections for AI draft
  const reflections = await query<{
    member_id: string
    display_name: string
    component: string
    response_data: Record<string, unknown>
  }>(
    `SELECT ir.member_id, m.display_name, ir.component, ir.response_data
     FROM individual_reflections ir
     JOIN members m ON m.id = ir.member_id
     WHERE m.team_id = $1 AND ir.component = $2
     ORDER BY m.joined_at`,
    [teamId, component]
  )

  const members: MemberReflection[] = []
  const seen = new Set<string>()
  for (const r of reflections) {
    if (!seen.has(r.member_id)) {
      seen.add(r.member_id)
      members.push({ displayName: r.display_name, responses: { [component]: r.response_data } as MemberReflection['responses'] })
    }
  }

  const draftText = await generateAgreementDraft(component as ChatComponent, members, resolutionNote)

  await query(
    `INSERT INTO agreements (team_id, component, resolution_note, draft_text, final_text, recorded_by)
     VALUES ($1, $2, $3, $4, $4, $5)
     ON CONFLICT (team_id, component) DO UPDATE
       SET resolution_note = $3, draft_text = $4, final_text = $4, recorded_by = $5, updated_at = NOW()`,
    [teamId, component, resolutionNote ?? null, draftText, memberId]
  )

  // Clear existing approvals since draft changed
  await query(
    'DELETE FROM agreement_approvals WHERE team_id = $1 AND component = $2',
    [teamId, component]
  )

  return NextResponse.json({ draftText })
}

// PATCH: update final text
export async function PATCH(req: Request) {
  const { teamId, component, finalText, memberId } = await req.json()

  await query(
    `UPDATE agreements SET final_text = $1, recorded_by = $2, updated_at = NOW()
     WHERE team_id = $3 AND component = $4`,
    [finalText, memberId, teamId, component]
  )

  // Clear approvals when text is edited
  await query(
    'DELETE FROM agreement_approvals WHERE team_id = $1 AND component = $2',
    [teamId, component]
  )

  return NextResponse.json({ ok: true })
}

// GET: fetch all agreements for a team
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const teamId = searchParams.get('teamId')
  if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 })

  const agreements = await query<{
    component: string
    resolution_note: string
    draft_text: string
    final_text: string
    recorded_by: string
  }>(
    'SELECT component, resolution_note, draft_text, final_text, recorded_by FROM agreements WHERE team_id = $1',
    [teamId]
  )

  const approvals = await query<{ component: string; member_id: string }>(
    'SELECT component, member_id FROM agreement_approvals WHERE team_id = $1',
    [teamId]
  )

  return NextResponse.json({ agreements, approvals })
}
