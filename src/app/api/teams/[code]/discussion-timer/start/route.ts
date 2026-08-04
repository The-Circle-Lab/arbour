import { NextResponse } from 'next/server'
import { requireTeamMember, isProjectManager } from '@/lib/auth/team-access'
import { startTimer, isCurrentDiscussionStep, isDiscussionStep, isValidCycleNumber } from '@/lib/discussion-timer'

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  const membership = await requireTeamMember(code)
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { step, cycleNumber } = await req.json()
  if (!isDiscussionStep(step) || !isValidCycleNumber(cycleNumber)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const projectManager = await isProjectManager(membership.teamId, membership.memberId)
  if (!projectManager) return NextResponse.json({ error: 'Only the project manager can start the timer' }, { status: 403 })

  const isCurrent = await isCurrentDiscussionStep(membership.teamId, step, cycleNumber)
  if (!isCurrent) return NextResponse.json({ error: "Not the team's current discussion step" }, { status: 409 })

  const timer = await startTimer(membership.teamId, step, cycleNumber)
  return NextResponse.json(timer)
}
