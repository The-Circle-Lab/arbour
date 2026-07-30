import { NextResponse } from 'next/server'
import { verifyAdminPassword, signAdminToken, setAdminCookie } from '@/lib/auth/admin'

export async function POST(req: Request) {
  const { password } = await req.json()
  if (typeof password !== 'string' || !verifyAdminPassword(password)) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
  }

  const token = await signAdminToken()
  await setAdminCookie(token)

  return NextResponse.json({ ok: true })
}
