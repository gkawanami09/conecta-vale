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

type DestinationCatalog = Destination[]

export const DESTINATIONS: Destination[] = [
  {
    key: 'pier-4',
    name: 'Pier 4',
    lng: -44.379167,
    lat: -2.551944,
    aliases: ['pier 4', 'pier iv', 'pier quatro', 'píer 4', 'píer iv'],
  },
  {
    key: 'pier-3',
    name: 'Pier 3',
    lng: -44.379167,
    lat: -2.561667,
    aliases: ['pier 3', 'pier iii', 'píer 3', 'píer iii'],
  },
  {
    key: 'entrada-vale',
    name: 'Entrada Vale',
    lng: -44.3739,
    lat: -2.5704,
    aliases: [
      'entrada vale',
      'entrada da vale',
      'portaria vale',
      'portaria principal',
    ],
  },
  {
    key: 'ponto-onibus',
    name: 'Ponto de Ônibus',
    lng: -44.3702,
    lat: -2.5734,
    aliases: [
      'ponto de onibus',
      'ponto de ônibus',
      'parada de onibus',
      'parada de ônibus',
      'onibus',
    ],
  },
  {
    key: 'setor-gestao',
    name: 'Setor de Gestão',
    lng: -44.3667,
    lat: -2.5768,
    aliases: [
      'setor de gestao',
      'setor de gestão',
      'gestao',
      'gestão',
      'administracao',
      'administração',
      'sede administrativa',
    ],
  },
  {
    key: 'subestacao',
    name: 'Subestação',
    lng: -44.3723,
    lat: -2.5679,
    aliases: ['subestacao', 'subestação', 'subestacao vale'],
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
  return findDestinationByTextInCatalog(DESTINATIONS, text)
}

export function findDestinationByTextInCatalog(
  catalog: DestinationCatalog,
  text: string | null | undefined
) {
  if (!text) return null

  const normalized = normalizeText(text)
  if (!normalized) return null

  for (const destination of catalog) {
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
  return findDestinationCandidatesByTextInCatalog(DESTINATIONS, text)
}

export function findDestinationCandidatesByTextInCatalog(
  catalog: DestinationCatalog,
  text: string
) {
  const normalized = normalizeText(text)
  if (!normalized) return [] as DestinationCandidate[]

  const candidates: DestinationCandidate[] = []

  for (const destination of catalog) {
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
  return resolveDestinationFromTextsInCatalog(DESTINATIONS, texts)
}

export function resolveDestinationFromTextsInCatalog(
  catalog: DestinationCatalog,
  texts: Array<string | null | undefined>
) {
  const mergedByKey = new Map<string, DestinationCandidate>()

  for (const text of texts) {
    if (!text) continue
    for (const candidate of findDestinationCandidatesByTextInCatalog(
      catalog,
      text
    )) {
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
