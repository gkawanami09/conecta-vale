import 'server-only'
import {
  type Destination,
  type DestinationResolution,
  DESTINATIONS,
  resolveDestinationFromTextsInCatalog,
} from '@/lib/destinations'
import { listCustomOperationalFixedPoints } from '@/lib/operational-fixed-points-store'

type OperationalDestination = Destination & {
  source: 'base' | 'custom'
}

function normalizeDestinationName(name: string) {
  return name.trim().replace(/\s+/g, ' ')
}

function dedupeDestinations(destinations: OperationalDestination[]) {
  const keyByName = new Map<string, OperationalDestination>()

  for (const destination of destinations) {
    const normalizedName = normalizeDestinationName(destination.name).toLowerCase()
    const existing = keyByName.get(normalizedName)

    if (!existing) {
      keyByName.set(normalizedName, destination)
      continue
    }

    // Prioriza pontos custom quando houver mesmo nome, mantendo alias da versao base.
    if (existing.source === 'base' && destination.source === 'custom') {
      const mergedAliases = Array.from(
        new Set([...(existing.aliases ?? []), ...(destination.aliases ?? [])])
      )
      keyByName.set(normalizedName, {
        ...destination,
        aliases: mergedAliases,
      })
    }
  }

  return Array.from(keyByName.values())
}

export async function listOperationalDestinations() {
  const customPoints = await listCustomOperationalFixedPoints()

  const baseDestinations: OperationalDestination[] = DESTINATIONS.map((item) => ({
    ...item,
    source: 'base',
  }))

  const customDestinations: OperationalDestination[] = customPoints.map((point) => ({
    key: `custom-${point.id}`,
    name: point.name,
    lng: point.lng,
    lat: point.lat,
    aliases: point.aliases,
    source: 'custom',
  }))

  return dedupeDestinations([...baseDestinations, ...customDestinations])
}

export async function resolveOperationalDestinationFromTexts(
  texts: Array<string | null | undefined>
): Promise<DestinationResolution> {
  const operationalDestinations = await listOperationalDestinations()

  return resolveDestinationFromTextsInCatalog(operationalDestinations, texts)
}
