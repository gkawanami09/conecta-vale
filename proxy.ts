import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  MANAGER_SESSION_COOKIE_NAME,
  verifyManagerSessionToken,
} from '@/lib/manager-auth'

const DASHBOARD_PATH = '/gestor/dashboard'
const LOGIN_PATH = '/gestor/login'
const PUBLIC_MANAGER_API_PATHS = new Set([
  '/api/gestor/auth/login',
  '/api/gestor/auth/logout',
  '/api/gestor/auth/session',
])

function hasValidManagerSession(request: NextRequest) {
  const token = request.cookies.get(MANAGER_SESSION_COOKIE_NAME)?.value
  return Boolean(verifyManagerSessionToken(token))
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isAuthenticated = hasValidManagerSession(request)

  if (pathname.startsWith('/api/gestor/')) {
    if (PUBLIC_MANAGER_API_PATHS.has(pathname)) {
      return NextResponse.next()
    }

    if (isAuthenticated) {
      return NextResponse.next()
    }

    return NextResponse.json(
      { ok: false, error: 'Nao autorizado' },
      { status: 401 }
    )
  }

  if (pathname === LOGIN_PATH && isAuthenticated) {
    return NextResponse.redirect(new URL(DASHBOARD_PATH, request.url))
  }

  if (
    pathname.startsWith('/gestor') &&
    pathname !== LOGIN_PATH &&
    !isAuthenticated
  ) {
    const url = new URL(LOGIN_PATH, request.url)
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/gestor/:path*', '/api/gestor/:path*'],
}
