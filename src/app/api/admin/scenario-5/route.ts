import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin'
import { runScenario5, AdminScenarioError } from '@/lib/admin-scenarios'

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { teamId, grade } = await req.json()
  if (!teamId || typeof grade !== 'string') {
    return NextResponse.json({ error: 'teamId and grade required' }, { status: 400 })
  }

  try {
    const result = await runScenario5(teamId, grade)
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof AdminScenarioError) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}
