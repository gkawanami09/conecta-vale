import { NextRequest, NextResponse } from 'next/server'
import { parseOperationalMessage, type ParsedEvent } from '@/lib/ai'
import { findDestinationByText } from '@/lib/destinations'
import { buildRouteLink } from '@/lib/route-link'
import { supabaseAdmin } from '@/lib/supabase'
import { sendWhatsAppText } from '@/lib/whatsapp'

const LOG_PREFIX = '[webhook.whatsapp.waha]'

const ROUTE_KEYWORDS = [
  'rota',
  'ir para',
  'quero ir',
  'como chegar',
  'como chego',
  'me leve',
  'direcao',
  'caminho',
]

const VALID_EVENT_TYPES = new Set<ParsedEvent['event_type']>([
  'interdicao',
  'solicitacao_rota',
  'pedido_apoio',
  'status',
  'desconhecido',
])

const VALID_PRIORITIES = new Set<NonNullable<ParsedEvent['priority']>>([
  'baixa',
  'media',
  'alta',
])

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

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function asNullableString(value: unknown) {
  return asString(value)
}

function fallbackParsedEvent(rawText: string): ParsedEvent {
  return {
    event_type: 'desconhecido',
    location: null,
    destination: null,
    priority: null,
    details: rawText,
  }
}

function sanitizeParsedEvent(
  parsed: ParsedEvent | null | undefined,
  rawText: string
): ParsedEvent {
  const safeParsed = parsed ?? fallbackParsedEvent(rawText)

  const eventType = VALID_EVENT_TYPES.has(safeParsed.event_type)
    ? safeParsed.event_type
    : 'desconhecido'

  const priority =
    safeParsed.priority && VALID_PRIORITIES.has(safeParsed.priority)
      ? safeParsed.priority
      : null

  return {
    event_type: eventType,
    location: asNullableString(safeParsed.location),
    destination: asNullableString(safeParsed.destination),
    priority,
    details: asNullableString(safeParsed.details) ?? rawText,
  }
}

function resolveDestination(parsed: ParsedEvent, rawText: string) {
  const candidates = [parsed.destination, parsed.location, parsed.details, rawText]

  for (const candidate of candidates) {
    const found = findDestinationByText(candidate)
    if (found) {
      return {
        destination: found,
        sourceText: candidate,
      }
    }
  }

  return {
    destination: null,
    sourceText: null,
  }
}

function shouldHandleRouteRequest(
  parsed: ParsedEvent,
  rawText: string,
  destinationFound: boolean
) {
  if (parsed.event_type === 'solicitacao_rota') {
    return { shouldHandle: true, reason: 'ai_event_type' }
  }

  const normalizedText = normalizeText(rawText)
  const hasRouteKeyword = ROUTE_KEYWORDS.some((keyword) =>
    normalizedText.includes(keyword)
  )

  if (hasRouteKeyword) {
    return { shouldHandle: true, reason: 'keyword_fallback' }
  }

  if (parsed.event_type === 'desconhecido' && destinationFound) {
    return { shouldHandle: true, reason: 'destination_fallback' }
  }

  return { shouldHandle: false, reason: `event_type_${parsed.event_type}` }
}

function extractIncomingMessage(parsedBody: JsonObject | null) {
  const payload = asObject(parsedBody?.payload)
  const source = payload ?? parsedBody
  const textField = asObject(source?.text)

  return {
    event: asString(parsedBody?.event) ?? 'unknown',
    session: asString(parsedBody?.session),
    phone: asString(source?.from),
    messageType: asString(source?.type),
    messageId: asString(source?.id),
    fromMe: typeof source?.fromMe === 'boolean' ? source.fromMe : null,
    rawText:
      asString(source?.body) ?? asString(textField?.body) ?? asString(source?.text),
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
  const startedAt = Date.now()

  try {
    const rawBody = await req.text()

    console.log(`${LOG_PREFIX} payload_raw`, rawBody)

    if (!rawBody) {
      console.warn(`${LOG_PREFIX} empty_body`)
      return NextResponse.json({ ok: true, ignored: true }, { status: 200 })
    }

    let parsedBody: JsonObject | null = null

    try {
      const parsed = JSON.parse(rawBody) as unknown
      parsedBody = asObject(parsed)
    } catch (error) {
      console.error(`${LOG_PREFIX} invalid_json`, {
        error: errorMessage(error),
      })
      return NextResponse.json({ ok: true, ignored: true }, { status: 200 })
    }

    if (!parsedBody) {
      console.error(`${LOG_PREFIX} invalid_payload_shape`)
      return NextResponse.json({ ok: true, ignored: true }, { status: 200 })
    }

    console.log(`${LOG_PREFIX} payload_json`, parsedBody)

    const incoming = extractIncomingMessage(parsedBody)

    console.log(`${LOG_PREFIX} message_received`, {
      event: incoming.event,
      session: incoming.session,
      messageId: incoming.messageId,
      phone: incoming.phone,
      messageType: incoming.messageType,
      fromMe: incoming.fromMe,
      hasText: Boolean(incoming.rawText),
      textLength: incoming.rawText?.length ?? 0,
    })

    try {
      const { error: messageError } = await supabaseAdmin.from('messages').insert({
        phone: incoming.phone,
        raw_text: incoming.rawText,
        payload: parsedBody,
      })

      if (messageError) {
        console.error(`${LOG_PREFIX} save_message_error`, messageError)
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} save_message_exception`, {
        error: errorMessage(error),
      })
    }

    if (!incoming.event.startsWith('message')) {
      console.log(`${LOG_PREFIX} ignored_non_message_event`, {
        event: incoming.event,
      })
      return NextResponse.json({ ok: true, ignored: true }, { status: 200 })
    }

    if (incoming.fromMe) {
      console.log(`${LOG_PREFIX} ignored_from_me`, {
        messageId: incoming.messageId,
      })
      return NextResponse.json({ ok: true, ignored: true }, { status: 200 })
    }

    if (!incoming.phone || !incoming.rawText) {
      console.log(`${LOG_PREFIX} ignored_missing_phone_or_text`, {
        phone: incoming.phone,
        messageType: incoming.messageType,
      })
      return NextResponse.json({ ok: true, ignored: true }, { status: 200 })
    }

    let parsedEvent: ParsedEvent

    try {
      const aiResult = await parseOperationalMessage(incoming.rawText)
      parsedEvent = sanitizeParsedEvent(aiResult, incoming.rawText)
    } catch (error) {
      console.error(`${LOG_PREFIX} ai_parse_error`, {
        error: errorMessage(error),
      })
      parsedEvent = fallbackParsedEvent(incoming.rawText)
    }

    console.log(`${LOG_PREFIX} interpreted_event_type`, {
      eventType: parsedEvent.event_type,
      destination: parsedEvent.destination,
      location: parsedEvent.location,
      priority: parsedEvent.priority,
    })

    try {
      const { error: eventError } = await supabaseAdmin.from('events').insert({
        phone: incoming.phone,
        raw_text: incoming.rawText,
        event_type: parsedEvent.event_type,
        parsed_data: parsedEvent,
      })

      if (eventError) {
        console.error(`${LOG_PREFIX} save_event_error`, eventError)
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} save_event_exception`, {
        error: errorMessage(error),
      })
    }

    const { destination, sourceText } = resolveDestination(
      parsedEvent,
      incoming.rawText
    )

    console.log(`${LOG_PREFIX} destination_found`, {
      destination: destination?.name ?? null,
      destinationSource: sourceText,
    })

    const routeDecision = shouldHandleRouteRequest(
      parsedEvent,
      incoming.rawText,
      Boolean(destination)
    )

    if (!routeDecision.shouldHandle) {
      console.log(`${LOG_PREFIX} ignored_not_route_request`, {
        reason: routeDecision.reason,
      })
      return NextResponse.json(
        { ok: true, ignored: true, reason: routeDecision.reason },
        { status: 200 }
      )
    }

    if (!destination) {
      const fallbackReply =
        'Nao consegui identificar o destino. Tente algo como: quero ir para o Terminal B.'

      try {
        const sendResult = await sendWhatsAppText(incoming.phone, fallbackReply)
        console.log(`${LOG_PREFIX} waha_send_result`, {
          kind: 'destination_not_found_reply',
          phone: incoming.phone,
          sendResult,
        })
      } catch (error) {
        console.error(`${LOG_PREFIX} waha_send_error`, {
          kind: 'destination_not_found_reply',
          phone: incoming.phone,
          error: errorMessage(error),
        })
      }

      return NextResponse.json(
        { ok: true, handled: true, destinationFound: false },
        { status: 200 }
      )
    }

    const routeLink = buildRouteLink(
      destination.name,
      destination.lng,
      destination.lat
    )

    console.log(`${LOG_PREFIX} route_link_generated`, {
      phone: incoming.phone,
      destination: destination.name,
      routeLink,
    })

    const replyText =
      `Rota gerada para ${destination.name}. ` +
      `Toque no link e permita sua localizacao: ${routeLink}`

    try {
      const sendResult = await sendWhatsAppText(incoming.phone, replyText)
      console.log(`${LOG_PREFIX} waha_send_result`, {
        kind: 'route_reply',
        phone: incoming.phone,
        destination: destination.name,
        sendResult,
      })
    } catch (error) {
      console.error(`${LOG_PREFIX} waha_send_error`, {
        kind: 'route_reply',
        phone: incoming.phone,
        destination: destination.name,
        error: errorMessage(error),
      })

      return NextResponse.json(
        { ok: true, handled: true, sendError: true },
        { status: 200 }
      )
    }

    console.log(`${LOG_PREFIX} request_completed`, {
      elapsedMs: Date.now() - startedAt,
      phone: incoming.phone,
      destination: destination.name,
    })

    return NextResponse.json({ ok: true, handled: true }, { status: 200 })
  } catch (error) {
    console.error(`${LOG_PREFIX} fatal_error`, {
      error: errorMessage(error),
    })
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
