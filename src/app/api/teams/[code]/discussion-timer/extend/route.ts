import { NextResponse } from 'next/server'
import { requireTeamMember } from '@/lib/auth/team-access'
import { extendTimer, isTeamLeader, DiscussionStep } from '@/lib/discussion-timer'

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  const membership = await requireTeamMember(code)
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { step, cycleNumber } = await req.json() as { step: DiscussionStep; cycleNumber: number | null }

  const leader = await isTeamLeader(membership.teamId, membership.memberId)
  if (!leader) return NextResponse.json({ error: 'Only the team leader can extend the timer' }, { status: 403 })

  const timer = await extendTimer(membership.teamId, step, cycleNumber)
  if (!timer) return NextResponse.json({ error: 'Timer has not expired yet' }, { status: 409 })

  return NextResponse.json(timer)
}
