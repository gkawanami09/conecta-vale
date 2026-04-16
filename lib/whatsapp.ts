const LOG_PREFIX = '[whatsapp.waha]'

const WAHA_BASE_URL =
  process.env.WAHA_BASE_URL ?? 'https://apps-waha.ucxocw.easypanel.host/api'
const WAHA_API_KEY = process.env.WAHA_API_KEY ?? '@Calopsita123'
const WAHA_SESSION = process.env.WAHA_SESSION ?? 'default'

type SendTextResponse = Record<string, unknown>

function normalizeWahaBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, '')
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

export async function sendWhatsAppText(to: string, body: string) {
  const endpoint = `${normalizeWahaBaseUrl(WAHA_BASE_URL)}/sendText`
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
    throw error
  }
}