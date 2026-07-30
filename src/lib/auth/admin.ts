import { timingSafeEqual } from 'crypto'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

export const ADMIN_COOKIE_NAME = 'arbour_admin'
const EXPIRATION = '8h'
const MAX_AGE_SECONDS = 60 * 60 * 8

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  return new TextEncoder().encode(secret)
}

// Distinct payload shape from SessionPayload ({userId, tokenVersion}) so an
// admin token and a user session token can never be swapped for each other.
export async function signAdminToken(): Promise<string> {
  return new SignJWT({ scope: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(EXPIRATION)
    .sign(getSecretKey())
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ['HS256'] })
    return payload.scope === 'admin'
  } catch {
    return false // missing, expired, or tampered — all treated the same
  }
}

export async function requireAdmin(): Promise<boolean> {
  const token = (await cookies()).get(ADMIN_COOKIE_NAME)?.value
  if (!token) return false
  return verifyAdminToken(token)
}

export async function setAdminCookie(token: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
}

export async function clearAdminCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(ADMIN_COOKIE_NAME)
}

// Unset ADMIN_PASSWORD refuses every attempt rather than falling back to
// comparing against a blank password.
export function verifyAdminPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) return false
  const given = Buffer.from(password)
  const wanted = Buffer.from(expected)
  if (given.length !== wanted.length) return false
  return timingSafeEqual(given, wanted)
}
