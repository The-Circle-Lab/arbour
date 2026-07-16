import { NextResponse } from 'next/server'
import { getTeamStatus } from '@/lib/phase'
import { requireTeamMember } from '@/lib/auth/team-access'

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  const membership = await requireTeamMember(code)
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const status = await getTeamStatus(membership.teamId)
  return NextResponse.json(status)
}
