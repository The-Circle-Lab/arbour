import { query } from './db'
import { CHAT_COMPONENTS } from './chat-components'

export type Phase =
  | 'REFLECTING'
  | 'REVEAL'
  | 'AGREEING'
  | 'CHECKIN_1'
  | 'PLANT_1'
  | 'CHECKIN_2'
  | 'PLANT_2'
  | 'DONE'

interface TeamStatus {
  phase: Phase
  teamSize: number
  reflectionsSubmitted: number
  allReflected: boolean
  allAgreed: boolean
  checkin1Submitted: number
  allCheckin1Done: boolean
  checkin2Submitted: number
  allCheckin2Done: boolean
  plant1Resolved: boolean
  plant2Resolved: boolean
  hasFlagsAfterCycle1: boolean
  hasFlagsAfterCycle2: boolean
}

export async function getTeamStatus(teamId: string): Promise<TeamStatus> {
  const [{ team_size }] = await query<{ team_size: number }>(
    'SELECT COUNT(*)::int AS team_size FROM members WHERE team_id = $1',
    [teamId]
  )

  const [{ count: reflCount }] = await query<{ count: number }>(
    `SELECT COUNT(DISTINCT member_id)::int AS count
     FROM individual_reflections ir
     JOIN members m ON m.id = ir.member_id
     WHERE m.team_id = $1
     GROUP BY m.team_id
     HAVING COUNT(DISTINCT ir.component) = 6`,
    [teamId]
  ).catch(() => [{ count: 0 }])

  const reflectionsSubmitted = reflCount ?? 0
  const allReflected = reflectionsSubmitted >= team_size

  // All 6 agreements fully approved by all members
  const agreedRows = await query<{ component: string; approvals: number }>(
    `SELECT a.component, COUNT(aa.member_id)::int AS approvals
     FROM agreements a
     LEFT JOIN agreement_approvals aa ON aa.team_id = a.team_id AND aa.component = a.component
     WHERE a.team_id = $1
     GROUP BY a.component`,
    [teamId]
  )
  const allAgreed =
    agreedRows.length === 6 &&
    agreedRows.every(r => r.approvals >= team_size)

  // Check-in counts (members who submitted all 6 components for a cycle)
  const checkin1Count = await countCheckinSubmissions(teamId, 1)
  const checkin2Count = await countCheckinSubmissions(teamId, 2)

  const plant1Row = await query<{ flagged_components: string[] }>(
    'SELECT flagged_components FROM plant_states WHERE team_id = $1 AND cycle_number = 1',
    [teamId]
  )
  const plant2Row = await query<{ flagged_components: string[] }>(
    'SELECT flagged_components FROM plant_states WHERE team_id = $1 AND cycle_number = 2',
    [teamId]
  )

  const hasFlagsAfterCycle1 = (plant1Row[0]?.flagged_components ?? []).length > 0
  const hasFlagsAfterCycle2 = (plant2Row[0]?.flagged_components ?? []).length > 0

  const resolutions1 = hasFlagsAfterCycle1
    ? await query<{ component: string }>(
        'SELECT component FROM resolutions WHERE team_id = $1 AND cycle_number = 1',
        [teamId]
      )
    : []
  const flagged1 = plant1Row[0]?.flagged_components ?? []
  const plant1Resolved = !hasFlagsAfterCycle1 || resolutions1.length >= flagged1.length

  const resolutions2 = hasFlagsAfterCycle2
    ? await query<{ component: string }>(
        'SELECT component FROM resolutions WHERE team_id = $1 AND cycle_number = 2',
        [teamId]
      )
    : []
  const flagged2 = plant2Row[0]?.flagged_components ?? []
  const plant2Resolved = !hasFlagsAfterCycle2 || resolutions2.length >= flagged2.length

  // Derive phase
  let phase: Phase = 'REFLECTING'
  if (allReflected) phase = 'REVEAL'
  if (allAgreed) phase = 'CHECKIN_1'
  if (checkin1Count >= team_size) phase = 'PLANT_1'
  if (checkin1Count >= team_size && plant1Resolved) phase = 'CHECKIN_2'
  if (checkin2Count >= team_size) phase = 'PLANT_2'
  if (checkin2Count >= team_size && plant2Resolved) phase = 'DONE'

  return {
    phase,
    teamSize: team_size,
    reflectionsSubmitted,
    allReflected,
    allAgreed,
    checkin1Submitted: checkin1Count,
    allCheckin1Done: checkin1Count >= team_size,
    checkin2Submitted: checkin2Count,
    allCheckin2Done: checkin2Count >= team_size,
    plant1Resolved,
    plant2Resolved,
    hasFlagsAfterCycle1,
    hasFlagsAfterCycle2,
  }
}

async function countCheckinSubmissions(teamId: string, cycle: number): Promise<number> {
  const rows = await query<{ count: number }>(
    `SELECT COUNT(DISTINCT ci.member_id)::int AS count
     FROM checkins ci
     JOIN members m ON m.id = ci.member_id
     WHERE m.team_id = $1 AND ci.cycle_number = $2
     AND (
       SELECT COUNT(DISTINCT ci2.component) FROM checkins ci2
       WHERE ci2.member_id = ci.member_id AND ci2.cycle_number = $2
     ) = ${CHAT_COMPONENTS.length}`,
    [teamId, cycle]
  )
  return rows[0]?.count ?? 0
}
