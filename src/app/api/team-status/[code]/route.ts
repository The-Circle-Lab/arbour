import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { getTeamStatus } from '@/lib/phase'

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  const team = await queryOne<{ id: string }>(
    'SELECT id FROM teams WHERE join_code = $1',
    [code.toUpperCase()]
  )
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const status = await getTeamStatus(team.id)
  return NextResponse.json(status)
}
