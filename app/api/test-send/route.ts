import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppText } from '@/lib/whatsapp'

const DEFAULT_TEST_TO = process.env.WAHA_TEST_TO ?? '5518999999999'
const DEFAULT_TEST_BODY = 'Teste manual do Conecta Vale via WAHA'

export async function GET(req: NextRequest) {
  try {
    const to = req.nextUrl.searchParams.get('to')?.trim() || DEFAULT_TEST_TO
    const body = req.nextUrl.searchParams.get('body')?.trim() || DEFAULT_TEST_BODY

    const result = await sendWhatsAppText(to, body)

    return NextResponse.json(
      {
        ok: true,
        to,
        body,
        result,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[api.test-send] send_error', error)

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      { status: 500 }
    )
  }
}
