import { NextResponse } from 'next/server'
import { requireTeamMember } from '@/lib/auth/team-access'
import { getActiveTimer, isDiscussionStep, isValidCycleNumber } from '@/lib/discussion-timer'

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  const membership = await requireTeamMember(code)
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const step = searchParams.get('step')
  if (!isDiscussionStep(step)) return NextResponse.json({ error: 'Invalid step' }, { status: 400 })

  const cycle = searchParams.get('cycle')
  const cycleNumber = cycle === null ? null : Number(cycle)
  if (!isValidCycleNumber(cycleNumber)) return NextResponse.json({ error: 'Invalid cycle' }, { status: 400 })

  const timer = await getActiveTimer(membership.teamId, step, cycleNumber)
  return NextResponse.json(timer)
}
