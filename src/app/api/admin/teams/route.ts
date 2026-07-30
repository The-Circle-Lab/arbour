import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/admin'

interface AdminTeamRow {
  id: string
  name: string
  join_code: string
  tasks: { id: string; title: string; status: string; deadline: string | null }[]
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const teams = await query<AdminTeamRow>(
    `SELECT t.id, t.name, t.join_code,
            COALESCE(
              json_agg(
                json_build_object('id', tk.id, 'title', tk.title, 'status', tk.status, 'deadline', tk.deadline)
                ORDER BY tk.created_at
              ) FILTER (WHERE tk.id IS NOT NULL),
              '[]'
            ) AS tasks
     FROM teams t
     LEFT JOIN tasks tk ON tk.team_id = t.id
     GROUP BY t.id
     ORDER BY t.name`
  )

  return NextResponse.json({ teams })
}
