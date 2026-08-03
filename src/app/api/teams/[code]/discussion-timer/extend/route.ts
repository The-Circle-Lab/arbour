import { NextResponse } from 'next/server'
import { requireTeamMember, isProjectManager } from '@/lib/auth/team-access'
import { extendTimer, isDiscussionStep, isValidCycleNumber } from '@/lib/discussion-timer'

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  const membership = await requireTeamMember(code)
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { step, cycleNumber } = await req.json()
  if (!isDiscussionStep(step) || !isValidCycleNumber(cycleNumber)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const projectManager = await isProjectManager(membership.teamId, membership.memberId)
  if (!projectManager) return NextResponse.json({ error: 'Only the project manager can extend the timer' }, { status: 403 })

  const timer = await extendTimer(membership.teamId, step, cycleNumber)
  if (!timer) return NextResponse.json({ error: 'Timer has not expired yet' }, { status: 409 })

  return NextResponse.json(timer)
}
