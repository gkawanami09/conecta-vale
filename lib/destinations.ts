import {
  hasFuzzyTokenCoverage,
  normalizeSearchText,
  splitMatchTokens,
} from '@/lib/text-match'

export type Destination = {
  key: string
  name: string
  lng: number
  lat: number
  aliases?: string[]
}

export type DestinationCandidate = {
  destination: Destination
  score: number
}

export type DestinationResolution = {
  destination: Destination | null
  confidence: 'high' | 'medium' | 'low'
  candidates: DestinationCandidate[]
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
    aliases: ['oficina central'],
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
  return normalizeSearchText(value, {
    allowHyphen: true,
  })
}

function hasFuzzyTermMatch(normalizedText: string, normalizedTerm: string) {
  const textTokens = splitMatchTokens(normalizedText)
  const termTokens = splitMatchTokens(normalizedTerm)

  return hasFuzzyTokenCoverage(textTokens, termTokens)
}

function termMatchScore(normalizedText: string, normalizedTerm: string) {
  if (!normalizedTerm) return 0
  if (normalizedText === normalizedTerm) return 1
  if (normalizedText.includes(normalizedTerm)) return 0.94
  if (hasFuzzyTermMatch(normalizedText, normalizedTerm)) return 0.8
  return 0
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

export function findDestinationCandidatesByText(text: string) {
  const normalized = normalizeText(text)
  if (!normalized) return [] as DestinationCandidate[]

  const candidates: DestinationCandidate[] = []

  for (const destination of DESTINATIONS) {
    const searchTerms = [
      destination.name,
      destination.key.replace(/-/g, ' '),
      ...(destination.aliases ?? []),
    ]

    const bestScore = Math.max(
      ...searchTerms.map((term) => termMatchScore(normalized, normalizeText(term)))
    )

    if (bestScore >= 0.72) {
      candidates.push({
        destination,
        score: bestScore,
      })
    }
  }

  return candidates.sort((a, b) => b.score - a.score)
}

export function resolveDestinationFromTexts(texts: Array<string | null | undefined>) {
  const mergedByKey = new Map<string, DestinationCandidate>()

  for (const text of texts) {
    if (!text) continue
    for (const candidate of findDestinationCandidatesByText(text)) {
      const previous = mergedByKey.get(candidate.destination.key)
      if (!previous || candidate.score > previous.score) {
        mergedByKey.set(candidate.destination.key, candidate)
      }
    }
  }

  const candidates = Array.from(mergedByKey.values()).sort(
    (a, b) => b.score - a.score
  )

  const top = candidates[0]
  const second = candidates[1]

  if (!top) {
    return {
      destination: null,
      confidence: 'low',
      candidates: [],
    } satisfies DestinationResolution
  }

  const gap = second ? top.score - second.score : top.score
  const confidence =
    top.score >= 0.9 && gap >= 0.1
      ? 'high'
      : top.score >= 0.8 && gap >= 0.06
        ? 'medium'
        : 'low'

  return {
    destination: top.destination,
    confidence,
    candidates,
  } satisfies DestinationResolution
}
