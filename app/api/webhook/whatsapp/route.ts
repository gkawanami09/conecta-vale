import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const LOG_PREFIX = '[webhook.whatsapp.waha]'

type JsonObject = Record<string, unknown>

function asString(value: unknown) {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as JsonObject
}

function extractMessage(payload: JsonObject | null) {
  const textField = asObject(payload?.text)

  return {
    phone: asString(payload?.from),
    messageId: asString(payload?.id),
    messageType: asString(payload?.type),
    fromMe: typeof payload?.fromMe === 'boolean' ? payload.fromMe : null,
    rawText:
      asString(payload?.body) ?? asString(textField?.body) ?? asString(payload?.text),
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

export async function GET() {
  return NextResponse.json({ ok: true, provider: 'waha' }, { status: 200 })
}

export async function POST(req: NextRequest) {
  const receivedAt = new Date().toISOString()

  try {
    const rawBody = await req.text()

    console.log(`${LOG_PREFIX} payload_raw`, rawBody)

    if (!rawBody) {
      console.warn(`${LOG_PREFIX} empty_body`, { receivedAt })
      return NextResponse.json({ ok: true, stored: false }, { status: 200 })
    }

    let parsedBody: JsonObject | null = null

    try {
      const parsed = JSON.parse(rawBody) as unknown
      parsedBody = asObject(parsed)
    } catch (error) {
      console.error(`${LOG_PREFIX} invalid_json`, {
        receivedAt,
        error: errorMessage(error),
      })

      return NextResponse.json({ ok: true, stored: false }, { status: 200 })
    }

    if (!parsedBody) {
      console.error(`${LOG_PREFIX} invalid_payload_shape`, { receivedAt })
      return NextResponse.json({ ok: true, stored: false }, { status: 200 })
    }

    console.log(`${LOG_PREFIX} payload_json`, parsedBody)

    const payload = asObject(parsedBody.payload)
    const message = extractMessage(payload)

    console.log(`${LOG_PREFIX} message_summary`, {
      receivedAt,
      event: asString(parsedBody.event),
      session: asString(parsedBody.session),
      messageId: message.messageId,
      phone: message.phone,
      messageType: message.messageType,
      fromMe: message.fromMe,
      hasText: Boolean(message.rawText),
      textLength: message.rawText?.length ?? 0,
    })

    let stored = false

    try {
      const { error } = await supabaseAdmin.from('messages').insert({
        phone: message.phone,
        raw_text: message.rawText,
        payload: parsedBody,
      })

      if (error) {
        console.error(`${LOG_PREFIX} supabase_insert_error`, error)
      } else {
        stored = true
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} supabase_insert_exception`, {
        error: errorMessage(error),
      })
    }

    return NextResponse.json({ ok: true, stored }, { status: 200 })
  } catch (error) {
    console.error(`${LOG_PREFIX} unexpected_error`, {
      error: errorMessage(error),
    })

    return NextResponse.json({ ok: true, stored: false }, { status: 200 })
  }
}