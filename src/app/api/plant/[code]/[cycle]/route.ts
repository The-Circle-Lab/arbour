export const maxDuration = 60

import { NextResponse } from 'next/server'
import { query, queryOne, withTransaction } from '@/lib/db'
import { computePlantState, flagCountToLevelDrop, CheckinRow } from '@/lib/plant-logic'
import { generateCheckinComparison, CheckinSummary } from '@/lib/ai'
import { ChatComponent } from '@/lib/chat-components'
import { requireTeamMember } from '@/lib/auth/team-access'
import { clearAgreementApprovals } from '@/lib/agreement-approvals'
import { applyPlantHealthDelta, getCurrentPlantLevel, levelToState } from '@/lib/plant-health'

export async function GET(_req: Request, { params }: { params: Promise<{ code: string; cycle: string }> }) {
  const { code, cycle } = await params
  const cycleNum = parseInt(cycle)

  const membership = await requireTeamMember(code)
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const teamId = membership.teamId

  // Return cached
  const cached = await queryOne<{
    computed_state: string
    flagged_components: string[]
    ai_nudge_text: string | string[]
    per_component: Record<string, string>
  }>(
    'SELECT computed_state, flagged_components, ai_nudge_text, per_component FROM plant_states WHERE team_id = $1 AND cycle_number = $2',
    [teamId, cycleNum]
  )
  if (cached) return NextResponse.json(cached)

  // Check all members submitted
  const [{ team_size }] = await query<{ team_size: number }>(
    'SELECT COUNT(*)::int AS team_size FROM members WHERE team_id = $1',
    [teamId]
  )

  const submittedRows = await query<{ member_id: string; count: number }>(
    `SELECT ci.member_id, COUNT(DISTINCT ci.component)::int AS count
     FROM checkins ci
     JOIN members m ON m.id = ci.member_id
     WHERE m.team_id = $1 AND ci.cycle_number = $2
     GROUP BY ci.member_id`,
    [teamId, cycleNum]
  )
  const allSubmitted = submittedRows.filter(r => r.count >= 6).length >= team_size
  if (!allSubmitted) return NextResponse.json({ ready: false }, { status: 202 })

  // Fetch all check-ins
  const checkinRows = await query<{
    member_id: string
    display_name: string
    component: string
    response_data: { rating?: string; ratings?: Record<string, string>; [key: string]: unknown }
  }>(
    `SELECT ci.member_id, u.display_name, ci.component, ci.response_data
     FROM checkins ci
     JOIN members m ON m.id = ci.member_id
     JOIN users u ON u.id = m.user_id
     WHERE m.team_id = $1 AND ci.cycle_number = $2`,
    [teamId, cycleNum]
  )

  const plantResult = computePlantState(checkinRows as CheckinRow[], team_size)

  // Fetch agreements for nudge context
  const agreementRows = await query<{ component: string; final_text: string }>(
    'SELECT component, final_text FROM agreements WHERE team_id = $1 AND final_text IS NOT NULL',
    [teamId]
  )
  const agreements: Record<ChatComponent, string> = {} as Record<ChatComponent, string>
  for (const r of agreementRows) agreements[r.component as ChatComponent] = r.final_text

  // Build per-member summary for AI
  const memberMap = new Map<string, CheckinSummary>()
  for (const row of checkinRows) {
    if (!memberMap.has(row.member_id)) {
      memberMap.set(row.member_id, { displayName: row.display_name, checkins: {} as CheckinSummary['checkins'] })
    }
    const data = row.response_data
    memberMap.get(row.member_id)!.checkins[row.component as ChatComponent] = {
      rating: (data.rating as string) ?? undefined,
      notes: data.ratings as Record<string, string> | undefined,
    }
  }

  const comparison = await generateCheckinComparison(
    Array.from(memberMap.values()),
    agreements,
    cycleNum
  )

  // Merge AI flags with computed flags
  const allFlagged = Array.from(new Set([
    ...plantResult.flaggedComponents,
    ...comparison.flaggedComponents,
  ]))

  // computed_state now means "the unified plant level right after this
  // cycle's check-in," not an independently-computed absolute value — only
  // apply the ledger effect (and correct the stored value) the one time this
  // cycle is actually being processed for the first time. The insert, ledger
  // write, and computed_state correction all happen in one transaction so a
  // failure partway through can't leave the cycle permanently cached with a
  // stale, ledger-uncorrected computed_state.
  let finalState = plantResult.state
  await withTransaction(async tx => {
    const inserted = await tx.query<{ team_id: string }>(
      `INSERT INTO plant_states (team_id, cycle_number, computed_state, flagged_components, ai_nudge_text, per_component)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (team_id, cycle_number) DO NOTHING
       RETURNING team_id`,
      [teamId, cycleNum, plantResult.state, allFlagged, null, JSON.stringify(comparison.perComponent)]
    )
    if (inserted.length === 0) return

    const drop = flagCountToLevelDrop(allFlagged.length)
    if (drop > 0) {
      const result = await applyPlantHealthDelta(tx, {
        teamId,
        delta: -drop,
        source: 'checkin',
        cycleNumber: cycleNum,
        detail: { flaggedComponents: allFlagged },
      })
      finalState = result.state
    } else {
      const level = await getCurrentPlantLevel(tx.query, teamId)
      finalState = levelToState(level)
    }
    await tx.query(
      'UPDATE plant_states SET computed_state = $1 WHERE team_id = $2 AND cycle_number = $3',
      [finalState, teamId, cycleNum]
    )
  })

  // Flagged components are unsettled again — clear their approvals so the team
  // must re-agree on the updated wording before the cycle counts as resolved.
  await clearAgreementApprovals(teamId, allFlagged)

  return NextResponse.json({
    computed_state: finalState,
    flagged_components: allFlagged,
    per_component: comparison.perComponent,
  })
}
