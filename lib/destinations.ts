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
      .some((term) => term.length > 0 && normalized.includes(term))

    if (hasMatch) {
      return destination
    }
  }

  return null
}

