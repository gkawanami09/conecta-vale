import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import {
  detectBlockIntent,
  findMonitoredRoadByAlias,
  findMonitoredRoadById,
  getRoadDefinitionsByIds,
  type MonitoredRoad,
} from '@/lib/road-blocks-definitions'

export { getRoadDefinitionsByIds } from '@/lib/road-blocks-definitions'

type RoadBlockType = 'road' | 'point'

export type ActiveRoadBlock = {
  roadId: string
  roadName: string
  blockType: RoadBlockType
  monitoredRoadId: MonitoredRoad['id'] | null
  blockLng: number | null
  blockLat: number | null
  blockRadiusMeters: number | null
  blockedAt: string | null
  updatedAt: string | null
  sourcePhone: string | null
  sourceType: string | null
  sourceKeyword: string | null
  sourceMessage: string | null
}

type RoadBlockRow = {
  road_id: string
  road_name: string
  active: boolean
  blocked_at: string | null
  updated_at: string | null
  source_phone: string | null
  source_type: string | null
  source_keyword: string | null
  source_message: string | null
  block_type?: string | null
  block_lng?: number | null
  block_lat?: number | null
  block_radius_meters?: number | null
}

const POINT_BLOCK_DEFAULT_RADIUS_METERS = 90
const POINT_BLOCK_MIN_RADIUS_METERS = 20
const POINT_BLOCK_MAX_RADIUS_METERS = 500
const POINT_BLOCK_ROUTE_MIN_RADIUS_METERS = 25
const EARTH_RADIUS_METERS = 6378137

function parseNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isValidCoordinate(lng: number | null, lat: number | null) {
  if (lng === null || lat === null) return false
  return Math.abs(lng) <= 180 && Math.abs(lat) <= 90
}

function clampPointBlockRadius(radius: number | null | undefined) {
  if (radius === null || radius === undefined || !Number.isFinite(radius)) {
    return POINT_BLOCK_DEFAULT_RADIUS_METERS
  }

  return Math.max(
    POINT_BLOCK_MIN_RADIUS_METERS,
    Math.min(POINT_BLOCK_MAX_RADIUS_METERS, Math.round(radius))
  )
}

function getPointBlockRouteRadiusMeters(radius: number | null | undefined) {
  return Math.max(POINT_BLOCK_ROUTE_MIN_RADIUS_METERS, clampPointBlockRadius(radius))
}

function normalizeBlockType(row: RoadBlockRow): RoadBlockType {
  const raw = row.block_type?.trim().toLowerCase()

  if (raw === 'point') {
    const lng = parseNumber(row.block_lng)
    const lat = parseNumber(row.block_lat)
    if (isValidCoordinate(lng, lat)) {
      return 'point'
    }
  }

  return 'road'
}

function isMissingPointBlockColumnsError(error: unknown) {
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error ?? '')

  return (
    message.includes('block_type') ||
    message.includes('block_lng') ||
    message.includes('block_lat') ||
    message.includes('block_radius_meters')
  )
}

async function selectActiveRoadBlockRows() {
  const fullSelect =
    'road_id, road_name, active, blocked_at, updated_at, source_phone, source_type, source_keyword, source_message, block_type, block_lng, block_lat, block_radius_meters'

  const fullQuery = await supabaseAdmin
    .from('road_blocks')
    .select(fullSelect)
    .eq('active', true)
    .order('updated_at', { ascending: false })

  if (!fullQuery.error) {
    return (fullQuery.data ?? []) as RoadBlockRow[]
  }

  if (!isMissingPointBlockColumnsError(fullQuery.error)) {
    console.error('[road-blocks] get_active_error', fullQuery.error)
    return [] as RoadBlockRow[]
  }

  const fallbackQuery = await supabaseAdmin
    .from('road_blocks')
    .select(
      'road_id, road_name, active, blocked_at, updated_at, source_phone, source_type, source_keyword, source_message'
    )
    .eq('active', true)
    .order('updated_at', { ascending: false })

  if (fallbackQuery.error) {
    console.error('[road-blocks] get_active_fallback_error', fallbackQuery.error)
    return [] as RoadBlockRow[]
  }

  return ((fallbackQuery.data ?? []) as RoadBlockRow[]).map((row) => ({
    ...row,
    block_type: null,
    block_lng: null,
    block_lat: null,
    block_radius_meters: null,
  }))
}

function toActiveRoadBlock(row: RoadBlockRow): ActiveRoadBlock | null {
  const blockType = normalizeBlockType(row)

  if (blockType === 'point') {
    const blockLng = parseNumber(row.block_lng)
    const blockLat = parseNumber(row.block_lat)

    if (!isValidCoordinate(blockLng, blockLat)) {
      return null
    }

    return {
      roadId: row.road_id,
      roadName: row.road_name,
      blockType,
      monitoredRoadId: null,
      blockLng,
      blockLat,
      blockRadiusMeters: clampPointBlockRadius(row.block_radius_meters),
      blockedAt: row.blocked_at ?? null,
      updatedAt: row.updated_at ?? null,
      sourcePhone: row.source_phone ?? null,
      sourceType: row.source_type ?? null,
      sourceKeyword: row.source_keyword ?? null,
      sourceMessage: row.source_message ?? null,
    }
  }

  const monitoredRoad = findMonitoredRoadById(row.road_id)

  return {
    roadId: monitoredRoad?.id ?? row.road_id,
    roadName: monitoredRoad?.name ?? row.road_name,
    blockType: 'road',
    monitoredRoadId: monitoredRoad?.id ?? null,
    blockLng: null,
    blockLat: null,
    blockRadiusMeters: null,
    blockedAt: row.blocked_at ?? null,
    updatedAt: row.updated_at ?? null,
    sourcePhone: row.source_phone ?? null,
    sourceType: row.source_type ?? null,
    sourceKeyword: row.source_keyword ?? null,
    sourceMessage: row.source_message ?? null,
  }
}

function makePointBlockId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `point-block-${crypto.randomUUID()}`
  }

  return `point-block-${Date.now()}`
}

function buildCirclePolygon(input: {
  lng: number
  lat: number
  radiusMeters: number
  segments?: number
}) {
  const segments = Math.max(12, input.segments ?? 24)
  const latRadians = (input.lat * Math.PI) / 180
  const metersPerDegreeLat = (Math.PI / 180) * EARTH_RADIUS_METERS
  const metersPerDegreeLng =
    ((Math.PI / 180) * EARTH_RADIUS_METERS * Math.cos(latRadians)) || 1

  const ring: [number, number][] = []

  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * 2 * Math.PI
    const dx = Math.cos(angle) * input.radiusMeters
    const dy = Math.sin(angle) * input.radiusMeters

    const lng = input.lng + dx / metersPerDegreeLng
    const lat = input.lat + dy / metersPerDegreeLat
    ring.push([lng, lat])
  }

  return [ring] as [number, number][][]
}

function buildPointBlockAvoidPolygons(pointBlocks: ActiveRoadBlock[]) {
  return pointBlocks
    .filter((item) => item.blockType === 'point')
    .filter((item) => isValidCoordinate(item.blockLng, item.blockLat))
    .map((item) =>
      buildCirclePolygon({
        lng: item.blockLng as number,
        lat: item.blockLat as number,
        radiusMeters: getPointBlockRouteRadiusMeters(item.blockRadiusMeters),
      })
    )
}

function metersToDegreesLat(meters: number) {
  return (meters / EARTH_RADIUS_METERS) * (180 / Math.PI)
}

function metersToDegreesLng(meters: number, lat: number) {
  const latRad = (lat * Math.PI) / 180
  const metersPerDegreeLng =
    ((Math.PI / 180) * EARTH_RADIUS_METERS * Math.cos(latRad)) || 1
  return meters / metersPerDegreeLng
}

function buildPointBlockDetourWaypoints(pointBlocks: ActiveRoadBlock[]) {
  const waypoints: [number, number][] = []
  const keys = new Set<string>()

  for (const block of pointBlocks) {
    if (
      block.blockType !== 'point' ||
      !isValidCoordinate(block.blockLng, block.blockLat)
    ) {
      continue
    }

    const lng = block.blockLng as number
    const lat = block.blockLat as number
    const radius = getPointBlockRouteRadiusMeters(block.blockRadiusMeters)
    const offsetMeters = Math.max(140, radius * 2.2)
    const deltaLat = metersToDegreesLat(offsetMeters)
    const deltaLng = metersToDegreesLng(offsetMeters, lat)

    const candidates: [number, number][] = [
      [lng + deltaLng, lat + deltaLat],
      [lng - deltaLng, lat - deltaLat],
    ]

    for (const candidate of candidates) {
      if (!isValidCoordinate(candidate[0], candidate[1])) continue
      const key = `${candidate[0].toFixed(6)}:${candidate[1].toFixed(6)}`
      if (keys.has(key)) continue
      keys.add(key)
      waypoints.push(candidate)
    }
  }

  return waypoints
}

function roadIdsFromActiveBlocks(activeBlocks: ActiveRoadBlock[]) {
  return activeBlocks
    .filter((block) => block.blockType === 'road' && block.monitoredRoadId)
    .map((block) => block.monitoredRoadId as MonitoredRoad['id'])
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
  const rows = await selectActiveRoadBlockRows()

  return rows
    .map(toActiveRoadBlock)
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
    throw new Error(`Via monitorada não encontrada: ${input.roadId}`)
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
  }

  const { error } = await supabaseAdmin
    .from('road_blocks')
    .upsert(payload, { onConflict: 'road_id' })

  if (error) {
    console.error('[road-blocks] activate_error', { roadId: road.id, error })
    throw new Error('Falha ao registrar bloqueio global')
  }

  return road
}

export async function activatePointRoadBlockGlobal(input: {
  lng: number
  lat: number
  radiusMeters?: number | null
  roadName?: string | null
  sourcePhone?: string | null
  sourceType?: string | null
  sourceKeyword?: string | null
  sourceMessage?: string | null
}) {
  const lng = parseNumber(input.lng)
  const lat = parseNumber(input.lat)

  if (!isValidCoordinate(lng, lat)) {
    throw new Error('Coordenadas inválidas para bloqueio por ponto')
  }

  const now = new Date().toISOString()
  const roadId = makePointBlockId()

  const payload: RoadBlockRow = {
    road_id: roadId,
    road_name: input.roadName?.trim() || 'Bloqueio operacional',
    active: true,
    blocked_at: now,
    updated_at: now,
    source_phone: input.sourcePhone ?? null,
    source_type: input.sourceType ?? null,
    source_keyword: input.sourceKeyword ?? null,
    source_message: input.sourceMessage ?? null,
    block_type: 'point',
    block_lng: lng,
    block_lat: lat,
    block_radius_meters: clampPointBlockRadius(input.radiusMeters),
  }

  const { error } = await supabaseAdmin
    .from('road_blocks')
    .insert(payload)

  if (error) {
    console.error('[road-blocks] activate_point_error', { payload, error })

    if (isMissingPointBlockColumnsError(error)) {
      throw new Error(
        'Estrutura do banco incompleta para bloqueio por ponto. Rode o SQL de atualização.'
      )
    }

    throw new Error('Falha ao registrar bloqueio por ponto')
  }

  return roadId
}

export async function clearRoadBlockGlobal(roadId: MonitoredRoad['id']) {
  const road = findMonitoredRoadById(roadId)
  if (!road) {
    throw new Error(`Via monitorada não encontrada: ${roadId}`)
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

export async function clearRoadBlockByIdGlobal(roadId: string) {
  const id = roadId.trim()
  if (!id) {
    throw new Error('roadId inválido')
  }

  const { error } = await supabaseAdmin
    .from('road_blocks')
    .update({
      active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('road_id', id)

  if (error) {
    console.error('[road-blocks] clear_by_id_error', { roadId: id, error })
    throw new Error('Falha ao desativar bloqueio')
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

export function buildAvoidPolygonsFromBlocks(activeBlocks: ActiveRoadBlock[]) {
  const activeRoads = getRoadDefinitionsByIds(roadIdsFromActiveBlocks(activeBlocks))
  const roadPolygons = activeRoads.map((road) => road.avoidPolygon)
  const pointPolygons = buildPointBlockAvoidPolygons(activeBlocks)
  const polygons = [...roadPolygons, ...pointPolygons]

  if (polygons.length === 0) return null

  return {
    type: 'MultiPolygon',
    coordinates: polygons,
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

export function buildDetourWaypointsFromBlocks(activeBlocks: ActiveRoadBlock[]) {
  const activeRoads = getRoadDefinitionsByIds(roadIdsFromActiveBlocks(activeBlocks))
  const roadWaypoints = buildDetourWaypoints(activeRoads)
  const pointWaypoints = buildPointBlockDetourWaypoints(activeBlocks)
  return [...roadWaypoints, ...pointWaypoints]
}
