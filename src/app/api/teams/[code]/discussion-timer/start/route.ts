import { NextResponse } from 'next/server'
import { requireTeamMember } from '@/lib/auth/team-access'
import { startTimer, isTeamLeader, isDiscussionStep, isValidCycleNumber } from '@/lib/discussion-timer'

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  const membership = await requireTeamMember(code)
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { step, cycleNumber } = await req.json()
  if (!isDiscussionStep(step) || !isValidCycleNumber(cycleNumber)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const leader = await isTeamLeader(membership.teamId, membership.memberId)
  if (!leader) return NextResponse.json({ error: 'Only the team leader can start the timer' }, { status: 403 })

  const timer = await startTimer(membership.teamId, step, cycleNumber)
  return NextResponse.json(timer)
}
