import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import {
  BASE_OPERATIONAL_FIXED_POINTS,
  type OperationalFixedPoint,
} from '@/lib/operational-fixed-points'

export type CustomOperationalFixedPoint = OperationalFixedPoint & {
  createdAt: string | null
  updatedAt: string | null
  active: boolean
}

type CustomOperationalFixedPointRow = {
  point_id: string
  name: string
  aliases: string[] | null
  lng: number
  lat: number
  kind: 'terminal' | 'operational'
  active: boolean
  created_at: string | null
  updated_at: string | null
}

function asNumber(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function toCustomPoint(row: CustomOperationalFixedPointRow): CustomOperationalFixedPoint {
  return {
    id: row.point_id,
    name: row.name,
    aliases: row.aliases ?? [],
    lng: row.lng,
    lat: row.lat,
    kind: row.kind,
    source: 'custom',
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function dedupeOperationalFixedPoints(points: OperationalFixedPoint[]) {
  const mapByName = new Map<string, OperationalFixedPoint>()

  for (const point of points) {
    const key = point.name.trim().toLowerCase()
    const previous = mapByName.get(key)

    if (!previous) {
      mapByName.set(key, point)
      continue
    }

    if (previous.source === 'base' && point.source === 'custom') {
      mapByName.set(key, {
        ...point,
        aliases: Array.from(
          new Set([...(previous.aliases ?? []), ...(point.aliases ?? [])])
        ),
      })
    }
  }

  return Array.from(mapByName.values())
}

export async function listCustomOperationalFixedPoints() {
  const { data, error } = await supabaseAdmin
    .from('operational_fixed_points')
    .select('point_id, name, aliases, lng, lat, kind, active, created_at, updated_at')
    .eq('active', true)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[operational-fixed-points] list_custom_error', error)
    return [] as CustomOperationalFixedPoint[]
  }

  return ((data ?? []) as CustomOperationalFixedPointRow[])
    .map(toCustomPoint)
    .filter((item) => asNumber(item.lat) !== null && asNumber(item.lng) !== null)
}

export async function listOperationalFixedPoints() {
  const customPoints = await listCustomOperationalFixedPoints()

  return dedupeOperationalFixedPoints([
    ...BASE_OPERATIONAL_FIXED_POINTS,
    ...customPoints.map((item) => ({
      id: item.id,
      name: item.name,
      aliases: item.aliases,
      lng: item.lng,
      lat: item.lat,
      kind: item.kind,
      source: item.source,
    } satisfies OperationalFixedPoint)),
  ])
}

export async function createCustomOperationalFixedPoint(input: {
  name: string
  lng: number
  lat: number
  aliases?: string[]
  kind?: 'terminal' | 'operational'
  createdBy?: string | null
}) {
  const name = normalizeName(input.name)
  const lng = asNumber(input.lng)
  const lat = asNumber(input.lat)

  if (!name || lng === null || lat === null) {
    throw new Error('Dados invalidos para criar ponto fixo operacional')
  }

  const pointId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `point-${crypto.randomUUID()}`
      : `point-${Date.now()}`

  const aliases = Array.from(
    new Set(
      (input.aliases ?? [])
        .map((alias) => alias.trim())
        .filter((alias) => alias.length > 0)
    )
  )

  const payload = {
    point_id: pointId,
    name,
    aliases: aliases.length > 0 ? aliases : null,
    lng,
    lat,
    kind: input.kind ?? 'operational',
    active: true,
    created_by: input.createdBy ?? null,
  }

  const { data, error } = await supabaseAdmin
    .from('operational_fixed_points')
    .insert(payload)
    .select('point_id, name, aliases, lng, lat, kind, active, created_at, updated_at')
    .single()

  if (error || !data) {
    console.error('[operational-fixed-points] create_custom_error', {
      payload,
      error,
    })
    throw new Error('Falha ao criar ponto fixo operacional')
  }

  return toCustomPoint(data as CustomOperationalFixedPointRow)
}

export async function deactivateCustomOperationalFixedPoint(pointId: string) {
  const id = pointId.trim()
  if (!id) {
    throw new Error('pointId invalido')
  }

  const { error } = await supabaseAdmin
    .from('operational_fixed_points')
    .update({
      active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('point_id', id)

  if (error) {
    console.error('[operational-fixed-points] deactivate_custom_error', {
      pointId: id,
      error,
    })
    throw new Error('Falha ao desativar ponto fixo operacional')
  }
}
