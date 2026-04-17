function normalizeBaseUrl(rawBaseUrl: string | undefined) {
  if (!rawBaseUrl) return null

  const trimmed = rawBaseUrl.trim()
  if (!trimmed) return null

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  try {
    const parsed = new URL(withProtocol)
    const host = parsed.hostname.toLowerCase()

    if (host === 'localhost' || host === '127.0.0.1') {
      return null
    }

    parsed.hash = ''
    parsed.search = ''
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

function resolvePublicBaseUrl() {
  const candidates = [
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ]

  for (const candidate of candidates) {
    const normalized = normalizeBaseUrl(candidate)
    if (normalized) return normalized
  }

  return 'https://connecta-vale.vercel.app'
}

export function buildRouteLink(destName: string, lng: number, lat: number) {
  const baseUrl = resolvePublicBaseUrl()

  const params = new URLSearchParams({
    destLng: String(lng),
    destLat: String(lat),
    destName,
  })

  return `${baseUrl}/rota?${params.toString()}`
}
