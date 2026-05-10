import { DESTINATIONS } from '@/lib/destinations'

export type OperationalFixedPoint = {
  id: string
  name: string
  lng: number
  lat: number
  aliases?: string[]
  kind: 'terminal' | 'operational'
  source: 'base' | 'custom'
}

function destinationPoint(key: string, fallbackName: string, kind: OperationalFixedPoint['kind'], fallbackCoords: [number, number]) {
  const destination = DESTINATIONS.find((item) => item.key === key)

  return {
    id: key,
    name: destination?.name ?? fallbackName,
    lng: destination?.lng ?? fallbackCoords[0],
    lat: destination?.lat ?? fallbackCoords[1],
    aliases: destination?.aliases ?? [],
    kind,
    source: 'base',
  } satisfies OperationalFixedPoint
}

export const BASE_OPERATIONAL_FIXED_POINTS: OperationalFixedPoint[] = [
  destinationPoint('pier-4', 'Pier 4', 'terminal', [-44.379167, -2.551944]),
  destinationPoint('pier-3', 'Pier 3', 'terminal', [-44.379167, -2.561667]),
  destinationPoint('entrada-vale', 'Entrada Vale', 'terminal', [-44.3739, -2.5704]),
  destinationPoint('ponto-onibus', 'Ponto de Ônibus', 'operational', [-44.3702, -2.5734]),
  destinationPoint('setor-gestao', 'Setor de Gestão', 'operational', [-44.3667, -2.5768]),
  destinationPoint('subestacao', 'Subestação', 'operational', [-44.3723, -2.5679]),
]

export const OPERATIONAL_FIXED_POINTS = BASE_OPERATIONAL_FIXED_POINTS
