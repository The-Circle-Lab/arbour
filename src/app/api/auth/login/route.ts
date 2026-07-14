import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { verifyPassword, DUMMY_HASH } from '@/lib/auth/password'
import { signSessionToken, setSessionCookie } from '@/lib/auth/jwt'

export async function POST(req: Request) {
  const { email, password } = await req.json()

  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  if (!normalizedEmail || typeof password !== 'string' || !password) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
  }

  const user = await queryOne<{ id: string; password_hash: string }>(
    'SELECT id, password_hash FROM users WHERE email = $1',
    [normalizedEmail]
  )

  const valid = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH)
  if (!user || !valid) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
  }

  const token = await signSessionToken(user.id)
  await setSessionCookie(token)

  return NextResponse.json({ id: user.id, email: normalizedEmail })
}
