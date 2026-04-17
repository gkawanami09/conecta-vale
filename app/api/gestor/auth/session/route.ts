import { NextRequest, NextResponse } from 'next/server'
import { getManagerSessionFromRequest } from '@/lib/manager-auth'

export async function GET(request: NextRequest) {
  const session = getManagerSessionFromRequest(request)

  if (!session) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  return NextResponse.json({
    ok: true,
    manager: {
      email: session.email,
    },
  })
}
