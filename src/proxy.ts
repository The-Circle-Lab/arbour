import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/jwt'

const PUBLIC_ROUTES = ['/login', '/signup']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Admin has its own password-gated cookie (checked by requireAdmin() in
  // each /api/admin/* route), separate from the user session this proxy
  // enforces below — without this bypass a logged-out admin hitting /admin
  // would be redirected to /login before the page ever renders.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return NextResponse.next()

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname)

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const session = token ? await verifySessionToken(token) : null
  const authenticated = session !== null

  if (!authenticated && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (authenticated && isPublicRoute) {
    return NextResponse.redirect(new URL('/', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
