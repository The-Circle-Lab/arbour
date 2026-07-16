import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireUser, clearSessionCookie } from '@/lib/auth/jwt'

export async function POST() {
  const userId = await requireUser()
  if (userId) {
    await query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [userId])
  }
  await clearSessionCookie()
  return NextResponse.json({ ok: true })
}
