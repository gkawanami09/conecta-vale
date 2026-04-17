import { DESTINATIONS, findDestinationByText } from '@/lib/destinations'
import { detectRoadBlockMessage } from '@/lib/road-blocks'
import {
  MONITORED_ROADS,
  findMonitoredRoadByAlias,
  type MonitoredRoad,
} from '@/lib/road-blocks-definitions'

export type MarcoIntent =
  | 'route_request'
  | 'road_block_report'
  | 'maintenance_report'
  | 'access_blocked'
  | 'external_forward_request'
  | 'image_occurrence'
  | 'audio_occurrence'
  | 'list_blocks'
  | 'clear_blocks'
  | 'general_question'
  | 'small_talk'
  | 'unknown'

export type MarcoInput = {
  text?: string | null
  caption?: string | null
  messageType?: string | null
  session?: string | null
  chatId?: string | null
  messageId?: string | null
  audioUrl?: string | null
  audioUrls?: string[]
  audioBase64?: string | null
  imageUrl?: string | null
  mediaMimeType?: string | null
}

export type MarcoInterpretation = {
  intent: MarcoIntent
  confidence: number
  eventType: 'interdicao' | 'solicitacao_rota' | 'pedido_apoio' | 'status' | 'desconhecido'
  summary: string
  normalizedText: string
  destinationText: string | null
  roadText: string | null
  roadId: MonitoredRoad['id'] | null
  shouldBlockRoad: boolean
  shouldSendRoute: boolean
  asksListBlocks: boolean
  asksClearBlocks: boolean
  forwardTarget: string | null
  suggestedReply: string | null
  transcription: string | null
  transcriptionStatus: 'not_applicable' | 'success' | 'failed' | 'missing_media_url'
  imageAssessment: string | null
  source: 'openai' | 'fallback'
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini'
const OPENAI_TRANSCRIBE_MODEL =
  process.env.OPENAI_AUDIO_MODEL ?? 'gpt-4o-mini-transcribe'

const WAHA_BASE_URL =
  process.env.WAHA_BASE_URL ?? 'https://apps-waha.ucxocw.easypanel.host/api'
const WAHA_API_KEY = process.env.WAHA_API_KEY ?? '@Calopsita123'

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isRouteKeyword(text: string) {
  const normalized = normalizeText(text)
  const keywords = [
    'rota',
    'ir para',
    'me manda rota',
    'me envia rota',
    'como chegar',
    'quero ir',
    'chegar no',
    'chegar na',
    'caminho',
  ]
  return keywords.some((keyword) => normalized.includes(keyword))
}

function isListBlocksKeyword(text: string) {
  const normalized = normalizeText(text)
  return (
    normalized.includes('listar bloqueios') ||
    normalized.includes('bloqueios ativos') ||
    normalized.includes('vias bloqueadas')
  )
}

function isClearBlocksKeyword(text: string) {
  const normalized = normalizeText(text)
  return (
    normalized.includes('limpar bloqueios') ||
    normalized.includes('remover bloqueios') ||
    normalized.includes('desbloquear vias')
  )
}

function isExternalForwardKeyword(text: string) {
  const normalized = normalizeText(text)
  return (
    normalized.includes('manda ') ||
    normalized.includes('envia ') ||
    normalized.includes('encaminha ') ||
    normalized.includes('fala para ')
  )
}

function normalizeTargetToken(value: string) {
  return value
    .replace(/[^\p{L}\p{N}\s.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractForwardTarget(text: string) {
  const original = text.trim()
  if (!original) return null

  const patterns = [
    /\b(?:para|pro|pra)\s+(?:o|a)?\s*([\p{L}\p{N}][\p{L}\p{N}\s.-]{1,40})/iu,
    /\bfala\s+para\s+(?:o|a)?\s*([\p{L}\p{N}][\p{L}\p{N}\s.-]{1,40})/iu,
  ]

  for (const pattern of patterns) {
    const match = original.match(pattern)
    const rawTarget = match?.[1]
    if (!rawTarget) continue
    const target = normalizeTargetToken(rawTarget)
      .replace(/\b(e|que|com|sobre|a|o|de)\b.*$/i, '')
      .trim()
    if (target.length >= 2) return target
  }

  return null
}

function parseJsonObject<T>(raw: string): T | null {
  const cleaned = raw
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim()

  try {
    return JSON.parse(cleaned) as T
  } catch {
    return null
  }
}

function truncate(value: string, max = 5000) {
  if (value.length <= max) return value
  return `${value.slice(0, max)}...`
}

function resolveMediaUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url

  const base = WAHA_BASE_URL.replace(/\/+$/, '')
  if (url.startsWith('/')) {
    const origin = new URL(base).origin
    return `${origin}${url}`
  }

  if (base.endsWith('/api')) return `${base}/${url}`
  return `${base}/api/${url}`
}

function buildWahaApiBaseUrl() {
  const normalized = WAHA_BASE_URL.trim().replace(/\/+$/, '')
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`
}

async function getMessageMediaByIdFromWaha(input: {
  session?: string | null
  chatId?: string | null
  messageId?: string | null
}) {
  const session = input.session?.trim()
  const chatId = input.chatId?.trim()
  const messageId = input.messageId?.trim()

  if (!session || !chatId || !messageId) return null

  const endpoint =
    `${buildWahaApiBaseUrl()}/${encodeURIComponent(session)}` +
    `/chats/${encodeURIComponent(chatId)}` +
    `/messages/${encodeURIComponent(messageId)}?downloadMedia=true`

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'X-Api-Key': WAHA_API_KEY,
      Accept: 'application/json',
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    console.error('[marco] waha_get_message_by_id_error', {
      status: response.status,
      endpoint,
    })
    return null
  }

  const data = (await response.json()) as Record<string, unknown>
  const media = (data.media ?? null) as Record<string, unknown> | null
  const mediaUrl =
    (typeof media?.url === 'string' ? media.url : null) ??
    (typeof data.url === 'string' ? data.url : null)
  const mimeType =
    (typeof media?.mimetype === 'string' ? media.mimetype : null) ??
    (typeof data.mimetype === 'string' ? data.mimetype : null)

  return {
    mediaUrl,
    mimeType,
  }
}

async function fetchMediaFromUrl(url: string, withApiKey: boolean) {
  const absoluteUrl = resolveMediaUrl(url)
  const response = await fetch(absoluteUrl, {
    method: 'GET',
    headers: withApiKey ? { 'X-Api-Key': WAHA_API_KEY } : undefined,
    cache: 'no-store',
  })

  if (!response.ok) return null

  const contentType =
    response.headers.get('content-type') ?? 'application/octet-stream'
  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  return {
    buffer,
    mimeType: contentType,
  }
}

async function downloadMedia(urlCandidates: string[]) {
  const uniqueUrls = Array.from(new Set(urlCandidates.filter(Boolean)))
  for (const url of uniqueUrls) {
    const withApiKey = await fetchMediaFromUrl(url, true)
    if (withApiKey) return withApiKey

    const withoutApiKey = await fetchMediaFromUrl(url, false)
    if (withoutApiKey) return withoutApiKey
  }

  throw new Error('Falha ao baixar midia em todos os endpoints candidatos')
}

function decodeAudioBase64(audioBase64: string) {
  const raw = audioBase64.trim()
  if (!raw) return null

  const normalized = raw.includes(',')
    ? raw.slice(raw.indexOf(',') + 1)
    : raw

  try {
    const buffer = Buffer.from(normalized, 'base64')
    if (!buffer.byteLength) return null
    return buffer
  } catch {
    return null
  }
}

async function transcribeAudioBuffer(buffer: Buffer, mimeType?: string | null) {
  if (!OPENAI_API_KEY) return null

  const fileMime = mimeType ?? 'audio/ogg'
  const extension = fileMime.includes('ogg')
    ? 'ogg'
    : fileMime.includes('mpeg') || fileMime.includes('mp3')
      ? 'mp3'
      : fileMime.includes('wav')
        ? 'wav'
        : 'm4a'

  const modelCandidates = Array.from(
    new Set([OPENAI_TRANSCRIBE_MODEL, 'gpt-4o-mini-transcribe', 'whisper-1'])
  )

  for (const model of modelCandidates) {
    const form = new FormData()
    form.append(
      'file',
      new Blob([new Uint8Array(buffer)], { type: fileMime }),
      `audio.${extension}`
    )
    form.append('model', model)

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: form,
    })

    if (!response.ok) {
      console.error('[marco] transcription_model_error', {
        model,
        status: response.status,
      })
      continue
    }

    const data = (await response.json()) as { text?: string }
    const text = data.text?.trim() ?? ''
    if (text.length > 0) return text
  }

  return null
}

async function transcribeAudio(input: {
  audioUrl?: string | null
  audioUrls?: string[]
  audioBase64?: string | null
  mimeType?: string | null
  session?: string | null
  chatId?: string | null
  messageId?: string | null
}) {
  if (!OPENAI_API_KEY) return null

  const base64Buffer = input.audioBase64 ? decodeAudioBase64(input.audioBase64) : null
  if (base64Buffer) {
    const byBase64 = await transcribeAudioBuffer(base64Buffer, input.mimeType)
    if (byBase64) return byBase64
  }

  const urls = [
    ...(input.audioUrls ?? []),
    input.audioUrl ?? null,
  ].filter((value): value is string => Boolean(value))

  if (urls.length > 0) {
    const media = await downloadMedia(urls)
    const byUrl = await transcribeAudioBuffer(media.buffer, input.mimeType ?? media.mimeType)
    if (byUrl) return byUrl
  }

  const fromMessageById = await getMessageMediaByIdFromWaha({
    session: input.session,
    chatId: input.chatId,
    messageId: input.messageId,
  })

  if (fromMessageById?.mediaUrl) {
    const media = await downloadMedia([fromMessageById.mediaUrl])
    const byWahaMessage = await transcribeAudioBuffer(
      media.buffer,
      input.mimeType ?? fromMessageById.mimeType ?? media.mimeType
    )
    if (byWahaMessage) return byWahaMessage
  }

  return null
}

async function resolveImageUrl(input: {
  imageUrl?: string | null
  messageType?: string | null
  session?: string | null
  chatId?: string | null
  messageId?: string | null
}) {
  if (input.imageUrl) {
    return input.imageUrl
  }

  const isImageMessage =
    (input.messageType ?? '').includes('image') ||
    (input.messageType ?? '').includes('photo')

  if (!isImageMessage) {
    return null
  }

  const fromMessageById = await getMessageMediaByIdFromWaha({
    session: input.session,
    chatId: input.chatId,
    messageId: input.messageId,
  })

  if (!fromMessageById?.mediaUrl) {
    return null
  }

  if (
    fromMessageById.mimeType &&
    !fromMessageById.mimeType.startsWith('image/')
  ) {
    return null
  }

  return fromMessageById.mediaUrl
}

async function analyzeImageFromUrl(
  imageUrl: string,
  caption: string | null,
  messageText: string | null
) {
  if (!OPENAI_API_KEY) return null

  const media = await downloadMedia([imageUrl])
  const imageDataUrl = `data:${media.mimeType};base64,${media.buffer.toString('base64')}`

  const prompt = [
    'Analise esta imagem em contexto logistico/viario.',
    'Responda apenas JSON valido com os campos:',
    '{"has_operational_issue": boolean, "issue_type": string, "summary": string}',
    'issue_type pode ser: bloqueio, manutencao, obstrucao, acidente, normal, desconhecido.',
    'Nao invente a rua se nao houver evidencias no texto/legenda.',
    caption ? `Legenda: ${caption}` : 'Legenda: (vazia)',
    messageText ? `Texto: ${messageText}` : 'Texto: (vazio)',
  ].join('\n')

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: imageDataUrl },
          ],
        },
      ],
      max_output_tokens: 300,
    }),
  })

  if (!response.ok) {
    throw new Error(`Falha na analise de imagem (${response.status})`)
  }

  const data = (await response.json()) as { output_text?: string }
  const parsed = parseJsonObject<{
    has_operational_issue?: boolean
    issue_type?: string
    summary?: string
  }>(data.output_text ?? '')

  if (!parsed) return null

  return {
    hasOperationalIssue: Boolean(parsed.has_operational_issue),
    issueType: parsed.issue_type ?? 'desconhecido',
    summary: parsed.summary ?? 'Imagem analisada sem classificacao conclusiva.',
  }
}

function fallbackInterpretation(input: {
  combinedText: string
  transcription: string | null
  transcriptionStatus: MarcoInterpretation['transcriptionStatus']
  imageAssessment: string | null
  messageType: string | null
}): MarcoInterpretation {
  const roadDetection = detectRoadBlockMessage(input.combinedText)
  const destination = findDestinationByText(input.combinedText)
  const asksList = isListBlocksKeyword(input.combinedText)
  const asksClear = isClearBlocksKeyword(input.combinedText)
  const forwardTarget = extractForwardTarget(input.combinedText)

  let intent: MarcoIntent = 'unknown'
  let eventType: MarcoInterpretation['eventType'] = 'desconhecido'

  if (asksList) {
    intent = 'list_blocks'
    eventType = 'status'
  } else if (asksClear) {
    intent = 'clear_blocks'
    eventType = 'status'
  } else if (roadDetection) {
    intent = 'road_block_report'
    eventType = 'interdicao'
  } else if (isExternalForwardKeyword(input.combinedText)) {
    intent = 'external_forward_request'
    eventType = 'status'
  } else if (destination || isRouteKeyword(input.combinedText)) {
    intent = 'route_request'
    eventType = 'solicitacao_rota'
  } else if ((input.messageType ?? '').includes('image')) {
    intent = 'image_occurrence'
  } else if ((input.messageType ?? '').includes('audio') || input.transcription) {
    intent = 'audio_occurrence'
  }

  return {
    intent,
    confidence: 0.55,
    eventType,
    summary: truncate(input.combinedText, 240),
    normalizedText: input.combinedText,
    destinationText: destination?.name ?? null,
    roadText: roadDetection?.road.name ?? null,
    roadId: roadDetection?.road.id ?? null,
    shouldBlockRoad: Boolean(roadDetection),
    shouldSendRoute:
      intent === 'route_request' ||
      (isRouteKeyword(input.combinedText) && Boolean(destination)),
    asksListBlocks: asksList,
    asksClearBlocks: asksClear,
    forwardTarget,
    suggestedReply:
      intent === 'external_forward_request'
        ? `Ja encaminhei sua mensagem para ${forwardTarget ?? 'o responsavel informado'} e registrei essa solicitacao no sistema.` 
        : null,
    transcription: input.transcription,
    transcriptionStatus: input.transcriptionStatus,
    imageAssessment: input.imageAssessment,
    source: 'fallback',
  }
}

async function openaiInterpret(input: {
  combinedText: string
  messageType: string | null
  transcription: string | null
  imageAssessment: string | null
}) {
  if (!OPENAI_API_KEY) return null

  const roadsContext = MONITORED_ROADS.map((road) => ({
    id: road.id,
    name: road.name,
    aliases: road.aliases,
  }))

  const destinationsContext = DESTINATIONS.map((destination) => ({
    key: destination.key,
    name: destination.name,
    aliases: destination.aliases ?? [],
  }))

  const prompt = `
Voce e o Marco, assistente operacional do Conecta Vale.

Objetivo:
- Interpretar mensagens de WhatsApp (texto, audio transcrito e imagem analisada).
- Ser tolerante a erros de digitacao e abreviacoes.
- Nao afirmar acoes externas que nao foram executadas.
- Evitar enviar rota errada: se destino estiver ambiguo, sinalizar duvida.

Contexto de vias monitoradas (bloqueio global permitido):
${JSON.stringify(roadsContext, null, 2)}

Contexto de destinos conhecidos:
${JSON.stringify(destinationsContext, null, 2)}

Classifique a intencao em uma das opcoes:
- route_request
- road_block_report
- maintenance_report
- access_blocked
- external_forward_request
- image_occurrence
- audio_occurrence
- list_blocks
- clear_blocks
- general_question
- small_talk
- unknown

Retorne APENAS JSON valido, no formato:
{
  "intent": string,
  "confidence": number,
  "event_type": "interdicao" | "solicitacao_rota" | "pedido_apoio" | "status" | "desconhecido",
  "summary": string,
  "destination_text": string | null,
  "road_text": string | null,
  "road_id": "rua-tiradentes" | "rua-jose-cordeiro" | "rua-duque-de-caxias" | null,
  "should_block_road": boolean,
  "should_send_route": boolean,
  "asks_list_blocks": boolean,
  "asks_clear_blocks": boolean,
  "forward_target": string | null,
  "suggested_reply": string
}

Regras de resposta:
- suggested_reply deve ser natural, operacional, transparente e objetivo.
- Mantenha tom profissional e amigavel, com no maximo 2 frases curtas.
- Nunca diga que acionou equipes externas ou executou algo fora do sistema.
- Pode dizer: ocorrencia registrada no sistema, trecho marcado indisponivel, solicitacao preparada para encaminhamento.
- Para audio com transcricao valida, use a transcricao como fonte principal para resumo.
- Se destino nao estiver claro, use should_send_route=false e destination_text=null.

Dados da mensagem:
- Tipo: ${input.messageType ?? 'text'}
- Texto combinado: ${truncate(input.combinedText, 4000)}
- Transcricao de audio: ${input.transcription ?? '(sem audio)'}
- Analise da imagem: ${input.imageAssessment ?? '(sem imagem)'}
  `

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: prompt,
      max_output_tokens: 600,
    }),
  })

  if (!response.ok) {
    throw new Error(`Falha na interpretacao OpenAI (${response.status})`)
  }

  const data = (await response.json()) as { output_text?: string }
  return parseJsonObject<{
    intent?: MarcoIntent
    confidence?: number
    event_type?: MarcoInterpretation['eventType']
    summary?: string
    destination_text?: string | null
    road_text?: string | null
    road_id?: MonitoredRoad['id'] | null
    should_block_road?: boolean
    should_send_route?: boolean
    asks_list_blocks?: boolean
    asks_clear_blocks?: boolean
    forward_target?: string | null
    suggested_reply?: string
  }>(data.output_text ?? '')
}

export async function interpretMarcoMessage(input: MarcoInput): Promise<MarcoInterpretation> {
  const rawText = input.text?.trim() || null
  const caption = input.caption?.trim() || null

  let transcription: string | null = null
  let transcriptionStatus: MarcoInterpretation['transcriptionStatus'] = 'not_applicable'
  const hasAudioPayload =
    Boolean(input.audioUrl) ||
    Boolean(input.audioBase64) ||
    Boolean(input.audioUrls && input.audioUrls.length > 0) ||
    ((input.messageType ?? '').includes('audio') && Boolean(input.session && input.chatId && input.messageId))

  if (hasAudioPayload) {
    try {
      transcription = await transcribeAudio({
        audioUrl: input.audioUrl,
        audioUrls: input.audioUrls,
        audioBase64: input.audioBase64,
        mimeType: input.mediaMimeType,
        session: input.session,
        chatId: input.chatId,
        messageId: input.messageId,
      })
      transcriptionStatus = transcription ? 'success' : 'failed'
    } catch (error) {
      console.error('[marco] audio_transcription_error', error)
      transcriptionStatus = 'failed'
    }
  } else if ((input.messageType ?? '').includes('audio')) {
    transcriptionStatus = 'missing_media_url'
  }

  let imageAssessment: string | null = null
  try {
    const resolvedImageUrl = await resolveImageUrl({
      imageUrl: input.imageUrl,
      messageType: input.messageType,
      session: input.session,
      chatId: input.chatId,
      messageId: input.messageId,
    })

    if (resolvedImageUrl) {
      const imageAnalysis = await analyzeImageFromUrl(
        resolvedImageUrl,
        caption,
        rawText
      )
      if (imageAnalysis) {
        imageAssessment = `issue=${imageAnalysis.issueType}; summary=${imageAnalysis.summary}; has_issue=${imageAnalysis.hasOperationalIssue}`
      }
    }
  } catch (error) {
    console.error('[marco] image_analysis_error', error)
  }

  const combinedText = [rawText, caption, transcription, imageAssessment]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(' | ')

  if (!combinedText) {
    return fallbackInterpretation({
      combinedText: '',
      transcription,
      transcriptionStatus,
      imageAssessment,
      messageType: input.messageType ?? null,
    })
  }

  try {
    const ai = await openaiInterpret({
      combinedText,
      messageType: input.messageType ?? null,
      transcription,
      imageAssessment,
    })

    if (!ai) {
      return fallbackInterpretation({
        combinedText,
        transcription,
        transcriptionStatus,
        imageAssessment,
        messageType: input.messageType ?? null,
      })
    }

    const roadById = ai.road_id ? MONITORED_ROADS.find((road) => road.id === ai.road_id) : null
    const roadByText = ai.road_text ? findMonitoredRoadByAlias(ai.road_text) : null
    const roadFromText = findMonitoredRoadByAlias(combinedText)
    const resolvedRoad = roadById ?? roadByText ?? roadFromText ?? null

    const destinationFromAi = findDestinationByText(ai.destination_text ?? null)
    const destinationFromText = findDestinationByText(combinedText)

    const hasExplicitForwardSignal = isExternalForwardKeyword(combinedText)
    const safeIntent: MarcoIntent = hasExplicitForwardSignal
      ? 'external_forward_request'
      : (ai.intent ?? 'unknown')
    const safeEventType: MarcoInterpretation['eventType'] =
      ai.event_type === 'interdicao' ||
      ai.event_type === 'solicitacao_rota' ||
      ai.event_type === 'pedido_apoio' ||
      ai.event_type === 'status' ||
      ai.event_type === 'desconhecido'
        ? ai.event_type
        : 'desconhecido'

    const wantsRoute =
      safeIntent === 'route_request' ||
      (Boolean(ai.should_send_route) && safeIntent !== 'external_forward_request') ||
      (isRouteKeyword(combinedText) && Boolean(destinationFromAi || destinationFromText))

    const wantsBlock =
      Boolean(ai.should_block_road) ||
      safeIntent === 'road_block_report' ||
      safeIntent === 'maintenance_report' ||
      safeIntent === 'access_blocked'

    const forwardTarget =
      normalizeTargetToken(ai.forward_target ?? '').trim() ||
      extractForwardTarget(combinedText)

    return {
      intent: safeIntent,
      confidence:
        typeof ai.confidence === 'number' && Number.isFinite(ai.confidence)
          ? Math.max(0, Math.min(1, ai.confidence))
          : 0.7,
      eventType: safeEventType,
      summary: ai.summary?.trim() || truncate(combinedText, 240),
      normalizedText: combinedText,
      destinationText: destinationFromAi?.name ?? destinationFromText?.name ?? ai.destination_text ?? null,
      roadText: resolvedRoad?.name ?? ai.road_text ?? null,
      roadId: resolvedRoad?.id ?? null,
      shouldBlockRoad: wantsBlock,
      shouldSendRoute: wantsRoute,
      asksListBlocks: Boolean(ai.asks_list_blocks) || isListBlocksKeyword(combinedText),
      asksClearBlocks: Boolean(ai.asks_clear_blocks) || isClearBlocksKeyword(combinedText),
      forwardTarget: forwardTarget || null,
      suggestedReply: ai.suggested_reply?.trim() || null,
      transcription,
      transcriptionStatus,
      imageAssessment,
      source: 'openai',
    }
  } catch (error) {
    console.error('[marco] openai_interpretation_error', error)
    return fallbackInterpretation({
      combinedText,
      transcription,
      transcriptionStatus,
      imageAssessment,
      messageType: input.messageType ?? null,
    })
  }
}



