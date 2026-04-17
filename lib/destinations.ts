export type Destination = {
  key: string
  name: string
  lng: number
  lat: number
  aliases?: string[]
}

export const DESTINATIONS: Destination[] = [
  {
    key: 'terminal-a',
    name: 'Terminal A',
    lng: -50.3405,
    lat: -21.2865,
    aliases: ['terminal a', 'terminal-a', 'term a'],
  },
  {
    key: 'terminal-b',
    name: 'Terminal B',
    lng: -50.3348,
    lat: -21.2826,
    aliases: ['terminal b', 'terminal-b', 'term b'],
  },
  {
    key: 'oficina',
    name: 'Oficina',
    lng: -50.3388,
    lat: -21.2902,
    aliases: ['manutencao', 'oficina central'],
  },
  {
    key: 'portaria',
    name: 'Portaria',
    lng: -50.3455,
    lat: -21.2853,
    aliases: ['entrada', 'guarita'],
  },
]

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0

  const rows = a.length + 1
  const cols = b.length + 1
  const dp: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0)
  )

  for (let i = 0; i < rows; i += 1) dp[i][0] = i
  for (let j = 0; j < cols; j += 1) dp[0][j] = j

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      )
    }
  }

  return dp[rows - 1][cols - 1]
}

function splitTokens(value: string) {
  return value.split(' ').filter((token) => token.length >= 2)
}

function isCloseToken(a: string, b: string) {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  const maxDistance = a.length >= 8 ? 2 : 1
  return levenshteinDistance(a, b) <= maxDistance
}

function hasFuzzyTermMatch(normalizedText: string, normalizedTerm: string) {
  const textTokens = splitTokens(normalizedText)
  const termTokens = splitTokens(normalizedTerm)
  if (termTokens.length === 0) return false

  return termTokens.every((termToken) =>
    textTokens.some((textToken) => isCloseToken(termToken, textToken))
  )
}

export function findDestinationByText(text: string | null | undefined) {
  if (!text) return null

  const normalized = normalizeText(text)
  if (!normalized) return null

  for (const destination of DESTINATIONS) {
    const searchTerms = [
      destination.name,
      destination.key.replace(/-/g, ' '),
      ...(destination.aliases ?? []),
    ]

    const hasMatch = searchTerms
      .map(normalizeText)
      .some(
        (term) =>
          term.length > 0 &&
          (normalized.includes(term) || hasFuzzyTermMatch(normalized, term))
      )

    if (hasMatch) {
      return destination
    }
  }

  return null
}

