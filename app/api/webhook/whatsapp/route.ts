import { NextRequest, NextResponse } from 'next/server'
import { resolveDestinationFromTextsInCatalog } from '@/lib/destinations'
import {
  activateRoadBlockGlobal,
  clearAllRoadBlocksGlobal,
  getActiveRoadBlocksGlobal,
} from '@/lib/road-blocks'
import { buildRouteLink } from '@/lib/route-link'
import { interpretMarcoMessage } from '@/lib/marco'
import { listOperationalDestinations } from '@/lib/operational-destinations'
import { supabaseAdmin } from '@/lib/supabase'
import { sendWhatsAppText } from '@/lib/whatsapp'

const LOG_PREFIX = '[webhook.whatsapp.waha]'

type JsonObject = Record<string, unknown>

function asString(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as JsonObject
}

function pickString(source: JsonObject | null, paths: string[][]) {
  if (!source) return null

  for (const path of paths) {
    let current: unknown = source
    for (const segment of path) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        current = null
        break
      }
      current = (current as JsonObject)[segment]
    }
    const value = asString(current)
    if (value) return value
  }

  return null
}

function pickStrings(source: JsonObject | null, paths: string[][]) {
  if (!source) return [] as string[]
  const values: string[] = []
  const seen = new Set<string>()

  for (const path of paths) {
    const value = pickString(source, [path])
    if (!value) continue
    if (seen.has(value)) continue
    seen.add(value)
    values.push(value)
  }

  return values
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

function truncateText(value: string, max = 180) {
  if (value.length <= max) return value
  return `${value.slice(0, max)}...`
}

function formatRouteClarificationReply() {
  return (
    'Entendi que você quer rota. Me confirme o destino para eu enviar o link correto. ' +
    'Exemplo: quero ir para o Terminal B.'
  )
}

function formatAmbiguousDestinationReply(destinationNames: string[]) {
  const list = destinationNames.join(' ou ')
  return `Encontrei mais de um destino possível (${list}). Me confirme qual você quer.`
}

function formatGenericReply(input: {
  hasImage: boolean
  hasAudioInput: boolean
  transcriptionStatus: string
  transcription: string | null
  summary: string
  suggestedReply: string | null
}) {
  if (input.suggestedReply) return input.suggestedReply

  if (
    input.hasAudioInput &&
    input.transcriptionStatus === 'success' &&
    input.transcription
  ) {
    const audioPreview = truncateText(input.transcription, 90)
    return `Entendi seu áudio: "${audioPreview}". ${input.summary || 'Posso ajudar com rota, bloqueios e suporte operacional.'}`
  }

  if (input.hasImage) {
    return `Imagem recebida e analisada. ${input.summary || 'Se houver ocorrência, eu registro e atualizo o sistema.'}`
  }

  return `Entendi seu contexto. ${input.summary || 'Posso gerar rota, registrar ocorrências e consultar bloqueios.'}`
}

function extractIncomingMessage(parsedBody: JsonObject | null) {
  const payload = asObject(parsedBody?.payload)
  const source = payload ?? parsedBody
  const textField = asObject(source?.text)

  const messageType =
    pickString(source, [
      ['type'],
      ['message', 'type'],
      ['payload', 'type'],
    ]) ?? 'text'

  const mediaUrls = pickStrings(source, [
    ['media', 'url'],
    ['image', 'url'],
    ['audio', 'url'],
    ['audio', 'link'],
    ['audio', 'downloadUrl'],
    ['media', 'downloadUrl'],
    ['file', 'url'],
    ['document', 'url'],
    ['video', 'url'],
    ['mediaUrl'],
    ['url'],
  ])

  const mimeType = pickString(source, [
    ['media', 'mimetype'],
    ['media', 'mimeType'],
    ['image', 'mimetype'],
    ['audio', 'mimetype'],
    ['file', 'mimetype'],
    ['mimetype'],
    ['mimeType'],
  ])

  const caption = pickString(source, [
    ['caption'],
    ['image', 'caption'],
    ['media', 'caption'],
  ])

  const rawText =
    asString(source?.body) ??
    asString(textField?.body) ??
    asString(source?.text) ??
    caption

  const isAudio =
    messageType.includes('audio') ||
    messageType.includes('ptt') ||
    (mimeType?.startsWith('audio/') ?? false)

  const isImage =
    messageType.includes('image') ||
    (mimeType?.startsWith('image/') ?? false)

  const audioBase64 = pickString(source, [
    ['audio', 'base64'],
    ['audio', 'data'],
    ['media', 'base64'],
    ['media', 'data'],
  ])

  const mediaUrl = mediaUrls[0] ?? null

  return {
    event: asString(parsedBody?.event) ?? 'unknown',
    session: asString(parsedBody?.session),
    phone: asString(source?.from),
    messageType,
    messageId: asString(source?.id),
    fromMe: typeof source?.fromMe === 'boolean' ? source.fromMe : null,
    rawText,
    caption,
    mediaUrl,
    mediaUrls,
    mimeType,
    audioUrl: isAudio ? mediaUrl : null,
    audioUrls: isAudio ? mediaUrls : [],
    audioBase64: isAudio ? audioBase64 : null,
    imageUrl: isImage ? mediaUrl : null,
  }
}

async function saveIncomingMessage(
  phone: string | null,
  text: string | null,
  payload: JsonObject
) {
  try {
    const { error } = await supabaseAdmin.from('messages').insert({
      phone,
      raw_text: text,
      payload,
    })

    if (error) {
      console.error(`${LOG_PREFIX} save_message_error`, error)
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} save_message_exception`, {
      error: errorMessage(error),
    })
  }
}

async function saveEvent(
  phone: string,
  rawText: string | null,
  eventType: string,
  parsedData: JsonObject
) {
  try {
    const { error } = await supabaseAdmin.from('events').insert({
      phone,
      raw_text: rawText,
      event_type: eventType,
      parsed_data: parsedData,
    })

    if (error) {
      console.error(`${LOG_PREFIX} save_event_error`, error)
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} save_event_exception`, {
      error: errorMessage(error),
    })
  }
}

async function safeReply(
  phone: string,
  kind: string,
  text: string,
  metadata?: JsonObject
) {
  try {
    const sendResult = await sendWhatsAppText(phone, text)
    console.log(`${LOG_PREFIX} send_result`, {
      kind,
      phone,
      sendResult,
      ...(metadata ?? {}),
    })
  } catch (error) {
    console.error(`${LOG_PREFIX} send_error`, {
      kind,
      phone,
      error: errorMessage(error),
      ...(metadata ?? {}),
    })
    throw error
  }
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
      return NextResponse.json({ ok: true, ignored: true }, { status: 200 })
    }

    let parsedBody: JsonObject | null = null

    try {
      parsedBody = asObject(JSON.parse(rawBody) as unknown)
    } catch (error) {
      console.error(`${LOG_PREFIX} invalid_json`, {
        error: errorMessage(error),
      })
      return NextResponse.json({ ok: true, ignored: true }, { status: 200 })
    }

    if (!parsedBody) {
      return NextResponse.json({ ok: true, ignored: true }, { status: 200 })
    }

    const incoming = extractIncomingMessage(parsedBody)

    console.log(`${LOG_PREFIX} message_received`, {
      event: incoming.event,
      session: incoming.session,
      phone: incoming.phone,
      messageType: incoming.messageType,
      messageId: incoming.messageId,
      fromMe: incoming.fromMe,
      hasText: Boolean(incoming.rawText),
      hasAudio: Boolean(
        incoming.audioUrl ||
          incoming.audioBase64 ||
          incoming.messageType.includes('audio') ||
          incoming.messageType.includes('ptt')
      ),
      hasImage: Boolean(incoming.imageUrl),
      hasMedia: Boolean(incoming.mediaUrl),
      mediaUrlCount: incoming.mediaUrls.length,
      hasAudioBase64: Boolean(incoming.audioBase64),
    })

    await saveIncomingMessage(incoming.phone, incoming.rawText, parsedBody)

    if (!incoming.event.startsWith('message')) {
      return NextResponse.json({ ok: true, ignored: true }, { status: 200 })
    }

    if (incoming.fromMe) {
      return NextResponse.json({ ok: true, ignored: true }, { status: 200 })
    }

    if (!incoming.phone) {
      return NextResponse.json({ ok: true, ignored: true }, { status: 200 })
    }

    const knownDestinations = await listOperationalDestinations()

    const interpretation = await interpretMarcoMessage({
      text: incoming.rawText,
      caption: incoming.caption,
      messageType: incoming.messageType,
      session: incoming.session,
      chatId: incoming.phone,
      messageId: incoming.messageId,
      audioUrl: incoming.audioUrl,
      audioUrls: incoming.audioUrls,
      audioBase64: incoming.audioBase64,
      imageUrl: incoming.imageUrl,
      mediaMimeType: incoming.mimeType,
      knownDestinations,
    })

    console.log(`${LOG_PREFIX} interpreted`, {
      intent: interpretation.intent,
      eventType: interpretation.eventType,
      confidence: interpretation.confidence,
      roadId: interpretation.roadId,
      destinationText: interpretation.destinationText,
      shouldBlockRoad: interpretation.shouldBlockRoad,
      shouldSendRoute: interpretation.shouldSendRoute,
      asksListBlocks: interpretation.asksListBlocks,
      asksClearBlocks: interpretation.asksClearBlocks,
      source: interpretation.source,
      hasTranscription: Boolean(interpretation.transcription),
      transcriptionStatus: interpretation.transcriptionStatus,
      hasImageAssessment: Boolean(interpretation.imageAssessment),
    })

    const rawTextForAudit =
      interpretation.normalizedText || incoming.rawText || incoming.caption || null
    const hasAudioInput =
      Boolean(incoming.audioUrl) ||
      Boolean(incoming.audioBase64) ||
      incoming.messageType.includes('audio') ||
      incoming.messageType.includes('ptt')

    await saveEvent(incoming.phone, rawTextForAudit, interpretation.eventType, {
      intent: interpretation.intent,
      confidence: interpretation.confidence,
      summary: interpretation.summary,
      destination_text: interpretation.destinationText,
      road_text: interpretation.roadText,
      road_id: interpretation.roadId,
      should_block_road: interpretation.shouldBlockRoad,
      should_send_route: interpretation.shouldSendRoute,
      asks_list_blocks: interpretation.asksListBlocks,
      asks_clear_blocks: interpretation.asksClearBlocks,
      forward_target: interpretation.forwardTarget,
      transcription: interpretation.transcription,
      transcription_status: interpretation.transcriptionStatus,
      image_assessment: interpretation.imageAssessment,
      source: interpretation.source,
    })

    if (interpretation.asksListBlocks) {
      const blocks = await getActiveRoadBlocksGlobal()
      const reply =
        blocks.length === 0
          ? 'Não há vias indisponíveis no momento.'
          : `Vias indisponíveis no momento: ${blocks.map((block) => block.roadName).join(', ')}.`

      await safeReply(incoming.phone, 'list_blocks_reply', reply)
      return NextResponse.json({ ok: true, handled: true }, { status: 200 })
    }

    if (interpretation.asksClearBlocks) {
      await clearAllRoadBlocksGlobal()
      await safeReply(
        incoming.phone,
        'clear_blocks_reply',
        'Bloqueios globais limpos. O roteamento voltou ao estado normal.'
      )
      return NextResponse.json({ ok: true, handled: true }, { status: 200 })
    }

    if (interpretation.shouldBlockRoad) {
      if (!interpretation.roadId) {
        await safeReply(
          incoming.phone,
          'road_block_clarification_reply',
          'Entendi a ocorrência de via indisponível, mas preciso da rua exata para bloquear no sistema. Informe: Rua Tiradentes, Rua José Cordeiro ou Rua Duque de Caxias.'
        )
        return NextResponse.json(
          { ok: true, handled: true, roadBlockNeedsClarification: true },
          { status: 200 }
        )
      }

      await activateRoadBlockGlobal({
        roadId: interpretation.roadId,
        sourcePhone: incoming.phone,
        sourceType: incoming.imageUrl
          ? 'whatsapp_image'
          : hasAudioInput
            ? 'whatsapp_audio'
            : 'whatsapp_text',
        sourceKeyword: interpretation.intent,
        sourceMessage: rawTextForAudit,
      })

      const blockReply =
        interpretation.suggestedReply ||
        `Ocorrência registrada no sistema. Trecho ${interpretation.roadText ?? 'informado'} marcado como indisponível e roteamento atualizado para evitar essa via.`

      await safeReply(incoming.phone, 'road_block_ack', blockReply, {
        roadId: interpretation.roadId,
      })

      return NextResponse.json(
        {
          ok: true,
          handled: true,
          roadBlockRegistered: true,
          roadId: interpretation.roadId,
        },
        { status: 200 }
      )
    }

    const userDrivenDestinationResolution = resolveDestinationFromTextsInCatalog(
      knownDestinations,
      [incoming.rawText, incoming.caption, interpretation.transcription]
    )
    const aiDrivenDestinationResolution = resolveDestinationFromTextsInCatalog(
      knownDestinations,
      [interpretation.destinationText, interpretation.normalizedText]
    )

    // Regra de segurança: prioriza o que o usuário realmente escreveu/falou.
    // Só usa o destino da IA quando o usuário não deu pista suficiente.
    const destinationResolution =
      userDrivenDestinationResolution.destination
        ? userDrivenDestinationResolution
        : aiDrivenDestinationResolution.confidence === 'high'
          ? aiDrivenDestinationResolution
          : userDrivenDestinationResolution
    const destination = destinationResolution.destination

    console.log(`${LOG_PREFIX} destination_resolution`, {
      userDriven: {
        destination: userDrivenDestinationResolution.destination?.name ?? null,
        confidence: userDrivenDestinationResolution.confidence,
        candidates: userDrivenDestinationResolution.candidates
          .slice(0, 3)
          .map((item) => ({ name: item.destination.name, score: item.score })),
      },
      aiDriven: {
        destination: aiDrivenDestinationResolution.destination?.name ?? null,
        confidence: aiDrivenDestinationResolution.confidence,
        candidates: aiDrivenDestinationResolution.candidates
          .slice(0, 3)
          .map((item) => ({ name: item.destination.name, score: item.score })),
      },
      finalDestination: destination?.name ?? null,
      finalConfidence: destinationResolution.confidence,
    })

    if (interpretation.shouldSendRoute) {
      if (!destination) {
        const routeFallbackReply =
          hasAudioInput &&
          interpretation.transcriptionStatus !== 'success' &&
          !incoming.rawText
            ? 'Recebi seu áudio, mas não consegui transcrever com confiança. Pode repetir em texto? Exemplo: quero ir para o Terminal B.'
            : formatRouteClarificationReply()

        await safeReply(
          incoming.phone,
          'destination_not_found_reply',
          routeFallbackReply
        )

        return NextResponse.json(
          { ok: true, handled: true, destinationFound: false },
          { status: 200 }
        )
      }

      if (destinationResolution.confidence === 'low') {
        const destinationOptions = destinationResolution.candidates
          .slice(0, 2)
          .map((candidate) => candidate.destination.name)

        if (destinationOptions.length > 1) {
          await safeReply(
            incoming.phone,
            'destination_ambiguous_reply',
            formatAmbiguousDestinationReply(destinationOptions)
          )

          return NextResponse.json(
            {
              ok: true,
              handled: true,
              destinationAmbiguous: true,
              options: destinationOptions,
            },
            { status: 200 }
          )
        }
      }

      const normalizedPhone = incoming.phone.replace(/\D/g, '')
      const shareId = normalizedPhone ? `phone:${normalizedPhone}` : null

      const routeLink = buildRouteLink(destination.name, destination.lng, destination.lat, {
        userPhone: incoming.phone,
        shareId,
      })

      console.log(`${LOG_PREFIX} route_link_generated`, {
        phone: incoming.phone,
        destination: destination.name,
        routeLink,
      })

      await safeReply(
        incoming.phone,
        'route_reply',
        `Rota gerada para ${destination.name}. Toque no link e permita sua localização: ${routeLink}`,
        {
          destination: destination.name,
        }
      )

      return NextResponse.json({ ok: true, handled: true }, { status: 200 })
    }

    if (interpretation.intent === 'route_request' && !destination) {
      await safeReply(
        incoming.phone,
        'route_without_destination_reply',
        formatRouteClarificationReply()
      )

      return NextResponse.json(
        { ok: true, handled: true, routeNeedsDestination: true },
        { status: 200 }
      )
    }

    if (interpretation.intent === 'external_forward_request') {
      const contextualForwardReply =
        `Já encaminhei sua mensagem para ${interpretation.forwardTarget ?? 'o responsável informado'} e registrei essa solicitação no sistema.`

      await safeReply(
        incoming.phone,
        'external_forward_reply',
        contextualForwardReply,
        {
          summary: interpretation.summary,
        }
      )
      return NextResponse.json({ ok: true, handled: true }, { status: 200 })
    }

    if (
      hasAudioInput &&
      interpretation.transcriptionStatus !== 'success' &&
      !interpretation.shouldBlockRoad &&
      !interpretation.asksListBlocks &&
      !interpretation.asksClearBlocks
    ) {
      const audioFailureReply =
        interpretation.transcriptionStatus === 'missing_media_url'
          ? 'Recebi seu áudio, mas a mídia não chegou completa no webhook. Reenvie o áudio ou envie em texto para eu gerar a rota.'
          : 'Recebi seu áudio, mas não consegui transcrever com confiança. Pode repetir em texto? Exemplo: quero ir para o Terminal B.'

      await safeReply(
        incoming.phone,
        'audio_transcription_failed_reply',
        audioFailureReply
      )
      return NextResponse.json(
        { ok: true, handled: true, audioTranscriptionFailed: true },
        { status: 200 }
      )
    }

    const genericReply = formatGenericReply({
      hasImage: Boolean(incoming.imageUrl),
      hasAudioInput,
      transcriptionStatus: interpretation.transcriptionStatus,
      transcription: interpretation.transcription,
      summary: interpretation.summary,
      suggestedReply: interpretation.suggestedReply,
    })

    await safeReply(incoming.phone, 'generic_reply', genericReply)

    console.log(`${LOG_PREFIX} request_completed`, {
      elapsedMs: Date.now() - startedAt,
      phone: incoming.phone,
      intent: interpretation.intent,
    })

    return NextResponse.json({ ok: true, handled: true }, { status: 200 })
  } catch (error) {
    console.error(`${LOG_PREFIX} fatal_error`, {
      error: errorMessage(error),
    })
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
