export const maxDuration = 60

import { NextResponse } from 'next/server'
import { query, queryOne, tryWithAdvisoryLock } from '@/lib/db'
import { requireTeamMember } from '@/lib/auth/team-access'
import { buildFinalReportContext, buildDecisionTimeline } from '@/lib/final-report'
import { generateFinalReportSummary } from '@/lib/ai'
import { ChatComponent } from '@/lib/chat-components'

// Advisory-lock classid for final-report generation — distinct from the
// plant-health ledger's lock class so the two never contend with each other.
const FINAL_REPORT_LOCK_CLASS = 2

interface FinalReportRow {
  summary: string
  highlights: string[]
  growth_areas: string[]
  generated_at: string
}

async function fetchCachedReport(teamId: string): Promise<FinalReportRow | null> {
  return queryOne<FinalReportRow>(
    'SELECT summary, highlights, growth_areas, generated_at FROM final_reports WHERE team_id = $1',
    [teamId]
  )
}

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const membership = await requireTeamMember(code)
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const teamId = membership.teamId

  const context = await buildFinalReportContext(teamId)
  const decisionTimeline = await buildDecisionTimeline(teamId, context)
  const aiReport = await fetchCachedReport(teamId)

  return NextResponse.json({
    team: context.team,
    agreements: context.agreements,
    plantHealthHistory: context.plantHealthHistory,
    taskWorkflow: context.taskWorkflow,
    taskStats: context.taskStats,
    decisionTimeline,
    aiReport,
  })
}

export async function POST(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const membership = await requireTeamMember(code)
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const teamId = membership.teamId

  const cached = await fetchCachedReport(teamId)
  if (cached) return NextResponse.json(cached)

  // Only one concurrent request per team actually pays for the LLM call — a
  // teammate who lands on the report page at the same moment (likely, since
  // this is the page the whole team checks together) just no-ops here and
  // relies on the client's GET polling to pick up the winner's result.
  const generated = await tryWithAdvisoryLock(FINAL_REPORT_LOCK_CLASS, teamId, async () => {
    // Re-check now that we hold the lock — a prior holder may have just finished.
    const nowCached = await fetchCachedReport(teamId)
    if (nowCached) return nowCached

    const context = await buildFinalReportContext(teamId)

    const agreements: Partial<Record<ChatComponent, string>> = {}
    for (const a of context.agreements) {
      if (a.finalText) agreements[a.component] = a.finalText
    }

    const missedDeadlines = context.plantHealthHistory.filter(e => e.source === 'deadline_missed').length
    const recoveredDeadlines = context.plantHealthHistory.filter(e => e.source === 'task_recovered').length
    const checkinDecrements = context.plantHealthHistory
      .filter(e => e.source === 'checkin')
      .reduce((sum, e) => sum + Math.abs(e.delta), 0)
    const finalState = context.plantHealthHistory[context.plantHealthHistory.length - 1]?.state ?? 'thriving'

    const result = await generateFinalReportSummary(
      { title: context.team.projectTitle, brief: null },
      agreements,
      { missedDeadlines, recoveredDeadlines, checkinDecrements, finalState },
      { done: context.taskStats.done, total: context.taskWorkflow.length, declinedSubmissions: context.declinedSubmissions.length },
    )

    await query(
      `INSERT INTO final_reports (team_id, summary, highlights, growth_areas)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)
       ON CONFLICT (team_id) DO NOTHING`,
      [teamId, result.summary, JSON.stringify(result.highlights), JSON.stringify(result.growthAreas)]
    )

    return fetchCachedReport(teamId)
  })

  return NextResponse.json(generated ?? (await fetchCachedReport(teamId)))
}
