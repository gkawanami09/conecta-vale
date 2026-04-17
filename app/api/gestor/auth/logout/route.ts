import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  MANAGER_SESSION_COOKIE_NAME,
  managerSessionCookieOptions,
} from '@/lib/manager-auth'

export async function POST() {
  const cookieStore = await cookies()

  cookieStore.set(MANAGER_SESSION_COOKIE_NAME, '', {
    ...managerSessionCookieOptions(),
    maxAge: 0,
  })

  return NextResponse.json({ ok: true })
}
