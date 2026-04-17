import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  MANAGER_SESSION_COOKIE_NAME,
  verifyManagerSessionToken,
} from '@/lib/manager-auth'

export async function getManagerSessionFromCookies() {
  const cookieStore = await cookies()
  const token = cookieStore.get(MANAGER_SESSION_COOKIE_NAME)?.value
  return verifyManagerSessionToken(token)
}

export async function requireManagerSessionOrRedirect(redirectTo = '/gestor/login') {
  const session = await getManagerSessionFromCookies()

  if (!session) {
    redirect(redirectTo)
  }

  return session
}
