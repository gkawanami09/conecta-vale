import {
  hasFuzzyTokenCoverage,
  normalizeSearchText,
  splitMatchTokens,
} from '@/lib/text-match'

export type MonitoredRoad = {
  id: 'rua-tiradentes' | 'rua-jose-cordeiro' | 'rua-duque-de-caxias'
  name: string
  aliases: string[]
  blockedSegment: [number, number][] // [lat, lng] for map display
  avoidPolygon: [number, number][][] // [[ [lng,lat], ... ]]
  detourWaypoint: [number, number] // [lng, lat]
}

export const MONITORED_ROADS: MonitoredRoad[] = [
  {
    id: 'rua-tiradentes',
    name: 'Rua Tiradentes',
    aliases: ['rua tiradentes', 'tiradentes', 'r tiradentes', 'r. tiradentes'],
    blockedSegment: [
      [-21.2845, -50.3336],
      [-21.2861, -50.3328],
    ],
    avoidPolygon: [
      [
        [-50.3342, -21.2838],
        [-50.3322, -21.2838],
        [-50.3322, -21.2866],
        [-50.3342, -21.2866],
        [-50.3342, -21.2838],
      ],
    ],
    detourWaypoint: [-50.3369, -21.2872],
  },
  {
    id: 'rua-jose-cordeiro',
    name: 'Rua Jose Cordeiro',
    aliases: [
      'rua jose cordeiro',
      'jose cordeiro',
      'r jose cordeiro',
      'r. jose cordeiro',
      'joose cordeiro',
    ],
    blockedSegment: [
      [-21.2819, -50.3347],
      [-21.2852, -50.3347],
    ],
    avoidPolygon: [
      [
        [-50.3354, -21.2812],
        [-50.3339, -21.2812],
        [-50.3339, -21.2858],
        [-50.3354, -21.2858],
        [-50.3354, -21.2812],
      ],
    ],
    detourWaypoint: [-50.3373, -21.2843],
  },
  {
    id: 'rua-duque-de-caxias',
    name: 'Rua Duque de Caxias',
    aliases: [
      'rua duque de caxias',
      'duque de caxias',
      'r duque de caxias',
      'r. duque de caxias',
    ],
    blockedSegment: [
      [-21.2815, -50.3369],
      [-21.283, -50.3356],
    ],
    avoidPolygon: [
      [
        [-50.3378, -21.2808],
        [-50.3348, -21.2808],
        [-50.3348, -21.2835],
        [-50.3378, -21.2835],
        [-50.3378, -21.2808],
      ],
    ],
    detourWaypoint: [-50.3387, -21.2826],
  },
]

export const ROAD_BLOCK_INTENT_PATTERNS: Array<{
  key: string
  regex: RegExp
}> = [
  { key: 'interdicao', regex: /\binterditad[ao]s?\b/ },
  { key: 'bloqueio', regex: /\bbloquei[oa]s?\b|\bbloquead[ao]s?\b/ },
  { key: 'manutencao', regex: /\bmanutencao\b/ },
  { key: 'obra', regex: /\bobras?\b/ },
  { key: 'sem_acesso', regex: /\bsem\s+acesso\b/ },
  { key: 'sem_passagem', regex: /\bsem\s+passagem\b/ },
  { key: 'via_fechada', regex: /\bvia\s+fechada\b|\bfechad[ao]s?\b/ },
  { key: 'transito_impedido', regex: /\btransito\s+impedido\b/ },
  { key: 'nao_passa', regex: /\bnao\s+esta\s+passando\b/ },
]

export function normalizeRoadText(value: string) {
  return normalizeSearchText(value, {
    allowDots: true,
    allowHyphen: true,
  })
}

export function findMonitoredRoadById(roadId: string) {
  return MONITORED_ROADS.find((road) => road.id === roadId) ?? null
}

export function getRoadDefinitionsByIds(roadIds: string[]) {
  const idSet = new Set(roadIds)
  return MONITORED_ROADS.filter((road) => idSet.has(road.id))
}

function containsAliasFuzzy(normalizedMessage: string, normalizedAlias: string) {
  const textTokens = splitMatchTokens(normalizedMessage, {
    stripDots: true,
  })
  const aliasTokens = splitMatchTokens(normalizedAlias, {
    stripDots: true,
  })

  return hasFuzzyTokenCoverage(textTokens, aliasTokens)
}

export function findMonitoredRoadByAlias(text: string) {
  const normalized = normalizeRoadText(text)
  if (!normalized) return null

  for (const road of MONITORED_ROADS) {
    const hasAlias = road.aliases.map(normalizeRoadText).some((alias) => {
      if (!alias) return false
      return normalized.includes(alias) || containsAliasFuzzy(normalized, alias)
    })

    if (hasAlias) {
      return road
    }
  }

  return null
}

export function detectBlockIntent(text: string) {
  const normalized = normalizeRoadText(text)
  if (!normalized) return null

  for (const intent of ROAD_BLOCK_INTENT_PATTERNS) {
    if (intent.regex.test(normalized)) {
      return intent.key
    }
  }

  return null
}
