import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import {
  detectBlockIntent,
  findMonitoredRoadByAlias,
  findMonitoredRoadById,
  type MonitoredRoad,
} from '@/lib/road-blocks-definitions'
export { getRoadDefinitionsByIds } from '@/lib/road-blocks-definitions'

export type ActiveRoadBlock = {
  roadId: MonitoredRoad['id']
  roadName: string
  blockedAt: string | null
  updatedAt: string | null
  sourcePhone: string | null
  sourceType: string | null
  sourceKeyword: string | null
  sourceMessage: string | null
}

type RoadBlockRow = {
  road_id: MonitoredRoad['id']
  road_name: string
  active: boolean
  blocked_at: string | null
  updated_at: string | null
  source_phone: string | null
  source_type: string | null
  source_keyword: string | null
  source_message: string | null
}

export function detectRoadBlockMessage(text: string) {
  const intentKey = detectBlockIntent(text)
  if (!intentKey) return null

  const road = findMonitoredRoadByAlias(text)
  if (!road) return null

  return {
    road,
    intentKey,
  }
}

export async function getActiveRoadBlocksGlobal() {
  const { data, error } = await supabaseAdmin
    .from('road_blocks')
    .select(
      'road_id, road_name, active, blocked_at, updated_at, source_phone, source_type, source_keyword, source_message'
    )
    .eq('active', true)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[road-blocks] get_active_error', error)
    return [] as ActiveRoadBlock[]
  }

  const rows = (data ?? []) as RoadBlockRow[]

  return rows
    .map((row) => {
      const road = findMonitoredRoadById(row.road_id)
      if (!road) return null
      return {
        roadId: road.id,
        roadName: road.name,
        blockedAt: row.blocked_at ?? null,
        updatedAt: row.updated_at ?? null,
        sourcePhone: row.source_phone ?? null,
        sourceType: row.source_type ?? null,
        sourceKeyword: row.source_keyword ?? null,
        sourceMessage: row.source_message ?? null,
      } satisfies ActiveRoadBlock
    })
    .filter((row): row is ActiveRoadBlock => row !== null)
}

export async function activateRoadBlockGlobal(input: {
  roadId: MonitoredRoad['id']
  sourcePhone?: string | null
  sourceType?: string | null
  sourceKeyword?: string | null
  sourceMessage?: string | null
}) {
  const road = findMonitoredRoadById(input.roadId)
  if (!road) {
    throw new Error(`Via monitorada nao encontrada: ${input.roadId}`)
  }

  const now = new Date().toISOString()

  const payload = {
    road_id: road.id,
    road_name: road.name,
    active: true,
    blocked_at: now,
    updated_at: now,
    source_phone: input.sourcePhone ?? null,
    source_type: input.sourceType ?? null,
    source_keyword: input.sourceKeyword ?? null,
    source_message: input.sourceMessage ?? null,
  } satisfies RoadBlockRow

  const { error } = await supabaseAdmin
    .from('road_blocks')
    .upsert(payload, { onConflict: 'road_id' })

  if (error) {
    console.error('[road-blocks] activate_error', { roadId: road.id, error })
    throw new Error('Falha ao registrar bloqueio global')
  }

  return road
}

export async function clearRoadBlockGlobal(roadId: MonitoredRoad['id']) {
  const road = findMonitoredRoadById(roadId)
  if (!road) {
    throw new Error(`Via monitorada nao encontrada: ${roadId}`)
  }

  const { error } = await supabaseAdmin
    .from('road_blocks')
    .update({
      active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('road_id', road.id)

  if (error) {
    console.error('[road-blocks] clear_one_error', { roadId: road.id, error })
    throw new Error('Falha ao limpar bloqueio')
  }
}

export async function clearAllRoadBlocksGlobal() {
  const { error } = await supabaseAdmin
    .from('road_blocks')
    .update({
      active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('active', true)

  if (error) {
    console.error('[road-blocks] clear_all_error', error)
    throw new Error('Falha ao limpar bloqueios globais')
  }
}

export function buildAvoidPolygonsGeoJSON(activeRoads: MonitoredRoad[]) {
  if (activeRoads.length === 0) return null

  return {
    type: 'MultiPolygon',
    coordinates: activeRoads.map((road) => road.avoidPolygon),
  } as const
}

export function buildDetourWaypoints(activeRoads: MonitoredRoad[]) {
  const keys = new Set<string>()
  const points: [number, number][] = []

  for (const road of activeRoads) {
    const point = road.detourWaypoint
    const key = `${point[0]}:${point[1]}`
    if (keys.has(key)) continue
    keys.add(key)
    points.push(point)
  }

  return points
}
