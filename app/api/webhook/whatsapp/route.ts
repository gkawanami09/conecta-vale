import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Invalid verify token' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]

    const phone = message?.from ?? null
    const rawText = message?.text?.body ?? null

    await supabaseAdmin.from('messages').insert({
      phone,
      raw_text: rawText,
      payload: body,
    })

    console.log('Mensagem recebida:', { phone, rawText })

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('Erro no webhook:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}