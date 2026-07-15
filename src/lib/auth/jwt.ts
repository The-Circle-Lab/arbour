import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { queryOne } from '@/lib/db'

export const SESSION_COOKIE_NAME = 'arbor_session'
const EXPIRATION = '30d'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  return new TextEncoder().encode(secret)
}

export interface SessionPayload {
  userId: string
  tokenVersion: number
}

export async function signSessionToken(userId: string, tokenVersion: number): Promise<string> {
  return new SignJWT({ userId, tokenVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(EXPIRATION)
    .sign(getSecretKey())
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey())
    return typeof payload.userId === 'string' && typeof payload.tokenVersion === 'number'
      ? { userId: payload.userId, tokenVersion: payload.tokenVersion }
      : null
  } catch {
    return null // missing, expired, or tampered — all treated the same
  }
}

// Also catches an account deleted after the token was issued — same as a
// revoked token, since neither has a matching (userId, tokenVersion) row.
export async function requireUser(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value
  if (!token) return null
  const payload = await verifySessionToken(token)
  if (!payload) return null

  const row = await queryOne<{ token_version: number }>(
    'SELECT token_version FROM users WHERE id = $1',
    [payload.userId]
  )
  if (!row || row.token_version !== payload.tokenVersion) {
    await clearSessionCookie()
    return null
  }
  return payload.userId
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE_NAME)
}
