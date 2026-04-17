import { DESTINATIONS } from '@/lib/destinations'

export type OperationalFixedPoint = {
  id: string
  name: string
  lng: number
  lat: number
  kind: 'terminal' | 'operational'
}

function destinationPoint(key: string, fallbackName: string, kind: OperationalFixedPoint['kind'], fallbackCoords: [number, number]) {
  const destination = DESTINATIONS.find((item) => item.key === key)

  return {
    id: key,
    name: destination?.name ?? fallbackName,
    lng: destination?.lng ?? fallbackCoords[0],
    lat: destination?.lat ?? fallbackCoords[1],
    kind,
  } satisfies OperationalFixedPoint
}

export const OPERATIONAL_FIXED_POINTS: OperationalFixedPoint[] = [
  destinationPoint('terminal-b', 'Terminal B', 'terminal', [-50.3348, -21.2826]),
  destinationPoint('oficina', 'Oficina', 'operational', [-50.3388, -21.2902]),
]
