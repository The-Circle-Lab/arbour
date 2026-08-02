import { NextResponse } from 'next/server'
import { requireTeamMember } from '@/lib/auth/team-access'
import { startTimer, isTeamLeader, DiscussionStep } from '@/lib/discussion-timer'

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  const membership = await requireTeamMember(code)
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { step, cycleNumber } = await req.json() as { step: DiscussionStep; cycleNumber: number | null }

  const leader = await isTeamLeader(membership.teamId, membership.memberId)
  if (!leader) return NextResponse.json({ error: 'Only the team leader can start the timer' }, { status: 403 })

  const timer = await startTimer(membership.teamId, step, cycleNumber)
  return NextResponse.json(timer)
}
