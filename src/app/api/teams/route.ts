import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { requireUser } from '@/lib/auth/jwt'
import { requireOwnedMember, requireTeamMemberByTeamId } from '@/lib/auth/team-access'

function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export async function POST(req: Request) {
  try {
    const userId = await requireUser()
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

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
    const { teamId, projectTitle, deadline, assignmentBrief, plantVote, projectManagerVote } = await req.json()
    if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 })

    if (projectManagerVote) {
      const { memberId, votedForMemberId } = projectManagerVote as { memberId: string; votedForMemberId: string }

      const owned = await requireOwnedMember(memberId)
      if (!owned || owned.teamId !== teamId) {
        return NextResponse.json({ error: 'Not authorized for this member' }, { status: 403 })
      }

      const team = await queryOne<{ project_manager_votes: Record<string, string> | null; project_manager_id: string | null }>(
        'SELECT project_manager_votes, project_manager_id FROM teams WHERE id = $1', [teamId]
      )

      // The project manager is fixed for the life of the group once elected — no re-votes.
      if (team?.project_manager_id) {
        return NextResponse.json({ ok: true, agreed: true, projectManagerId: team.project_manager_id })
      }

      const members = await query<{ id: string }>('SELECT id FROM members WHERE team_id = $1', [teamId])
      if (!members.some(m => m.id === votedForMemberId)) {
        return NextResponse.json({ error: 'votedForMemberId is not a member of this team' }, { status: 400 })
      }

      const votes: Record<string, string> = { ...(team?.project_manager_votes ?? {}), [memberId]: votedForMemberId }

      const allVoted = members.every(m => votes[m.id])
      const agreed = allVoted && new Set(Object.values(votes)).size === 1

      if (agreed) {
        await query(
          'UPDATE teams SET project_manager_votes = $1, project_manager_id = $2 WHERE id = $3',
          [JSON.stringify(votes), votedForMemberId, teamId]
        )
      } else {
        await query(
          'UPDATE teams SET project_manager_votes = $1 WHERE id = $2',
          [JSON.stringify(votes), teamId]
        )
      }

      return NextResponse.json({ ok: true, agreed, votes, projectManagerId: agreed ? votedForMemberId : null })
    }

    if (plantVote) {
      const { memberId, plantType } = plantVote as { memberId: string; plantType: string }

      const owned = await requireOwnedMember(memberId)
      if (!owned || owned.teamId !== teamId) {
        return NextResponse.json({ error: 'Not authorized for this member' }, { status: 403 })
      }

      // Load current votes
      const team = await queryOne<{ plant_votes: Record<string, string> | null }>(
        'SELECT plant_votes FROM teams WHERE id = $1', [teamId]
      )
      const votes: Record<string, string> = { ...(team?.plant_votes ?? {}), [memberId]: plantType }

      // Check if all members voted the same
      const members = await query<{ id: string }>('SELECT id FROM members WHERE team_id = $1', [teamId])
      const allVoted = members.every(m => votes[m.id])
      const agreed = allVoted && new Set(Object.values(votes)).size === 1

      if (agreed) {
        await query(
          'UPDATE teams SET plant_votes = $1, plant_type = $2 WHERE id = $3',
          [JSON.stringify(votes), plantType, teamId]
        )
      } else {
        await query(
          'UPDATE teams SET plant_votes = $1 WHERE id = $2',
          [JSON.stringify(votes), teamId]
        )
      }

      return NextResponse.json({ ok: true, agreed, votes, plantType: agreed ? plantType : null })
    }

    const membership = await requireTeamMemberByTeamId(teamId)
    if (!membership) {
      return NextResponse.json({ error: 'Not authorized for this team' }, { status: 403 })
    }

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
