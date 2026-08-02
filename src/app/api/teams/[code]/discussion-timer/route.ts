import { NextResponse } from 'next/server'
import { requireTeamMember } from '@/lib/auth/team-access'
import { getActiveTimer, DiscussionStep } from '@/lib/discussion-timer'

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  const membership = await requireTeamMember(code)
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const step = searchParams.get('step') as DiscussionStep
  const cycle = searchParams.get('cycle')
  const cycleNumber = cycle ? parseInt(cycle) : null

  const timer = await getActiveTimer(membership.teamId, step, cycleNumber)
  return NextResponse.json(timer)
}
