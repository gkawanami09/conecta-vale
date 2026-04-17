import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  MANAGER_SESSION_COOKIE_NAME,
  createManagerSessionToken,
  isManagerCredentialValid,
  managerSessionCookieOptions,
} from '@/lib/manager-auth'
import { isManagerCredentialValidFromDb } from '@/lib/manager-auth-db'

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string
      password?: string
    }

    const email = body.email?.trim().toLowerCase() ?? ''
    const password = body.password ?? ''

    const isValidFromDb = await isManagerCredentialValidFromDb(email, password)
    const isValidFromEnv = isManagerCredentialValid(email, password)

    if (!isValidFromDb && !isValidFromEnv) {
      return NextResponse.json(
        { ok: false, error: 'Credenciais invalidas' },
        { status: 401 }
      )
    }

    const cookieStore = await cookies()
    const sessionToken = createManagerSessionToken(email)

    cookieStore.set(
      MANAGER_SESSION_COOKIE_NAME,
      sessionToken,
      managerSessionCookieOptions()
    )

    return NextResponse.json({
      ok: true,
      manager: {
        email,
      },
    })
  } catch (error) {
    console.error('[api.gestor.auth.login] post_error', error)
    return NextResponse.json(
      { ok: false, error: 'Falha ao autenticar gestor' },
      { status: 500 }
    )
  }
}
