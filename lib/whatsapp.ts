const LOG_PREFIX = '[whatsapp.waha]'

const WAHA_BASE_URL =
  process.env.WAHA_BASE_URL ?? 'https://apps-waha.ucxocw.easypanel.host/api'
const WAHA_API_KEY = process.env.WAHA_API_KEY ?? '@Calopsita123'
const WAHA_SESSION = process.env.WAHA_SESSION ?? 'default'
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID

type SendTextResponse = Record<string, unknown>

function normalizeWahaBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, '')
}

function buildSendTextEndpoint(baseUrl: string) {
  const normalized = normalizeWahaBaseUrl(baseUrl)
  return normalized.endsWith('/api')
    ? `${normalized}/sendText`
    : `${normalized}/api/sendText`
}

function normalizeChatId(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    throw new Error('Numero de destino vazio')
  }

  if (trimmed.includes('@')) {
    return trimmed
  }

  const digitsOnly = trimmed.replace(/\D/g, '')
  if (!digitsOnly) {
    throw new Error(`Numero invalido: "${value}"`)
  }

  return `${digitsOnly}@c.us`
}

function toMetaPhone(value: string) {
  const trimmed = value.trim()
  const withoutSuffix = trimmed.includes('@')
    ? trimmed.split('@')[0]
    : trimmed
  const digitsOnly = withoutSuffix.replace(/\D/g, '')

  if (!digitsOnly) {
    throw new Error(`Numero invalido para Meta API: "${value}"`)
  }

  return digitsOnly
}

async function parseResponseBody(response: Response) {
  const raw = await response.text()

  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as SendTextResponse
  } catch {
    return { raw }
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

async function sendViaMetaCloudApi(to: string, body: string) {
  if (!META_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error('META_ACCESS_TOKEN ou WHATSAPP_PHONE_NUMBER_ID nao configurados')
  }

  const endpoint = `https://graph.facebook.com/v22.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`
  const phone = toMetaPhone(to)
  const text = body.trim()

  if (!text) {
    throw new Error('Corpo da mensagem vazio')
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'text',
    text: {
      body: text,
    },
  }

  console.log('[whatsapp.meta] send_attempt', {
    endpoint,
    phone,
    textLength: text.length,
  })

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${META_ACCESS_TOKEN}`,
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })

  const data = await parseResponseBody(response)

  console.log('[whatsapp.meta] send_response', {
    status: response.status,
    ok: response.ok,
    data,
  })

  if (!response.ok) {
    throw new Error(
      `Meta Cloud API falhou (status ${response.status}): ${JSON.stringify(data)}`
    )
  }

  return data
}

export async function sendWhatsAppText(to: string, body: string) {
  const endpoint = buildSendTextEndpoint(WAHA_BASE_URL)
  const chatId = normalizeChatId(to)
  const text = body.trim()

  if (!text) {
    throw new Error('Corpo da mensagem vazio')
  }

  const payload = {
    chatId,
    text,
    session: WAHA_SESSION,
  }

  console.log(`${LOG_PREFIX} send_attempt`, {
    endpoint,
    session: WAHA_SESSION,
    chatId,
    textLength: text.length,
  })

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': WAHA_API_KEY,
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    })

    const data = await parseResponseBody(response)

    console.log(`${LOG_PREFIX} send_response`, {
      status: response.status,
      ok: response.ok,
      data,
    })

    if (!response.ok) {
      throw new Error(
        `WAHA sendText falhou (status ${response.status}): ${JSON.stringify(data)}`
      )
    }

    return data
  } catch (error) {
    console.error(`${LOG_PREFIX} send_error`, {
      to,
      chatId,
      message: getErrorMessage(error),
    })

    // Fallback automatico para Meta Cloud API quando WAHA falhar.
    try {
      const metaResult = await sendViaMetaCloudApi(to, body)
      console.log(`${LOG_PREFIX} fallback_meta_success`, {
        to,
      })
      return metaResult
    } catch (metaError) {
      console.error('[whatsapp.meta] send_error', {
        to,
        message: getErrorMessage(metaError),
      })
      throw metaError
    }
  }
}
