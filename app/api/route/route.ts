import { NextRequest, NextResponse } from 'next/server'
import {
  buildAvoidPolygonsFromBlocks,
  buildDetourWaypointsFromBlocks,
  getActiveRoadBlocksGlobal,
} from '@/lib/road-blocks'
import { findMonitoredRoadById } from '@/lib/road-blocks-definitions'

type DirectionsRequestOptions = {
  coordinates: [number, number][]
  avoidPolygons?: ReturnType<typeof buildAvoidPolygonsFromBlocks>
}

type RouteGeoJson = {
  type: string
  features?: Array<{
    type?: string
    geometry?: {
      type?: string
      coordinates?: [number, number][]
    }
    properties?: Record<string, unknown>
  }>
}

type RouteMode =
  | 'default'
  | 'avoid_polygons'
  | 'detour_fallback'
  | 'detour_refined'
  | 'detour_refined_no_avoid'
  | 'default_fallback'
  | 'osrm_only'
  | 'osrm_fallback'
  | 'osrm_refined'

type RouteCandidate = {
  data: RouteGeoJson
  provider: 'ors' | 'osrm'
  routeMode: RouteMode
}

type BlockRouteViolation = {
  roadId: string
  roadName: string
  blockType: 'road' | 'point'
  distanceMeters: number
  thresholdMeters: number
}

const REQUEST_TIMEOUT_MS = 12000
const EARTH_RADIUS_METERS = 6371000
const POINT_BLOCK_ROUTE_MIN_RADIUS_METERS = 25
const POINT_BLOCK_ROUTE_PADDING_METERS = 8
const ROAD_BLOCK_PROXIMITY_THRESHOLD_METERS = 35
const MAX_REFINED_DETOUR_ATTEMPTS = 32
const MAX_OSRM_REFINED_ATTEMPTS = 14

function isValidCoord(coord: [number, number]) {
  const [lng, lat] = coord
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    Math.abs(lng) <= 180 &&
    Math.abs(lat) <= 90
  )
}

async function fetchJsonWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    })

    const rawText = await response.text()
    let data: unknown = null

    if (rawText) {
      try {
        data = JSON.parse(rawText)
      } catch {
        data = rawText
      }
    }

    return {
      response,
      data,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

function extractLineCoordinates(data: RouteGeoJson) {
  const coordinates = data?.features?.[0]?.geometry?.coordinates

  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return null
  }

  const isValid = coordinates.every(
    (point) =>
      Array.isArray(point) &&
      point.length === 2 &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1])
  )

  if (!isValid) return null

  return coordinates as [number, number][]
}

function toRad(value: number) {
  return (value * Math.PI) / 180
}

function lngLatToMeters(coord: [number, number]) {
  const [lng, lat] = coord
  return {
    x: toRad(lng) * EARTH_RADIUS_METERS * Math.cos(toRad(lat)),
    y: toRad(lat) * EARTH_RADIUS_METERS,
  }
}

function pointToSegmentDistanceMeters(
  point: [number, number],
  segStart: [number, number],
  segEnd: [number, number]
) {
  const p = lngLatToMeters(point)
  const a = lngLatToMeters(segStart)
  const b = lngLatToMeters(segEnd)

  const abx = b.x - a.x
  const aby = b.y - a.y
  const apx = p.x - a.x
  const apy = p.y - a.y
  const abLengthSq = abx * abx + aby * aby

  if (abLengthSq === 0) {
    return Math.hypot(apx, apy)
  }

  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLengthSq))
  const closestX = a.x + abx * t
  const closestY = a.y + aby * t
  return Math.hypot(p.x - closestX, p.y - closestY)
}

function minDistanceToPolylineMeters(point: [number, number], polyline: [number, number][]) {
  if (polyline.length === 0) return Number.POSITIVE_INFINITY
  if (polyline.length === 1) return pointToSegmentDistanceMeters(point, polyline[0], polyline[0])

  let minDistance = Number.POSITIVE_INFINITY

  for (let index = 0; index < polyline.length - 1; index += 1) {
    const segmentDistance = pointToSegmentDistanceMeters(
      point,
      polyline[index],
      polyline[index + 1]
    )
    if (segmentDistance < minDistance) {
      minDistance = segmentDistance
    }
  }

  return minDistance
}

function minDistanceBetweenPolylinesMeters(
  routeLine: [number, number][],
  blockLine: [number, number][]
) {
  if (routeLine.length === 0 || blockLine.length === 0) {
    return Number.POSITIVE_INFINITY
  }

  let minDistance = Number.POSITIVE_INFINITY

  for (const routePoint of routeLine) {
    minDistance = Math.min(minDistance, minDistanceToPolylineMeters(routePoint, blockLine))
  }

  for (const blockPoint of blockLine) {
    minDistance = Math.min(minDistance, minDistanceToPolylineMeters(blockPoint, routeLine))
  }

  return minDistance
}

function metersToDegreesLat(meters: number) {
  return (meters / EARTH_RADIUS_METERS) * (180 / Math.PI)
}

function metersToDegreesLng(meters: number, lat: number) {
  const metersPerDegreeLng =
    ((Math.PI / 180) * EARTH_RADIUS_METERS * Math.cos(toRad(lat))) || 1
  return meters / metersPerDegreeLng
}

function distanceBetweenCoordsMeters(a: [number, number], b: [number, number]) {
  const aMeters = lngLatToMeters(a)
  const bMeters = lngLatToMeters(b)
  return Math.hypot(aMeters.x - bMeters.x, aMeters.y - bMeters.y)
}

function getPointBlockEffectiveRadius(radiusMeters: number | null) {
  if (typeof radiusMeters !== 'number' || !Number.isFinite(radiusMeters)) {
    return POINT_BLOCK_ROUTE_MIN_RADIUS_METERS
  }

  return Math.max(POINT_BLOCK_ROUTE_MIN_RADIUS_METERS, radiusMeters)
}

function getRouteBlockViolations(
  routeCoords: [number, number][],
  activeBlocks: Awaited<ReturnType<typeof getActiveRoadBlocksGlobal>>
) {
  const violations: BlockRouteViolation[] = []

  for (const block of activeBlocks) {
    if (block.blockType === 'point') {
      if (
        typeof block.blockLng !== 'number' ||
        typeof block.blockLat !== 'number' ||
        !Number.isFinite(block.blockLng) ||
        !Number.isFinite(block.blockLat)
      ) {
        continue
      }

      const thresholdMeters =
        getPointBlockEffectiveRadius(block.blockRadiusMeters) + POINT_BLOCK_ROUTE_PADDING_METERS
      const distanceMeters = minDistanceToPolylineMeters(
        [block.blockLng, block.blockLat],
        routeCoords
      )

      if (distanceMeters <= thresholdMeters) {
        violations.push({
          roadId: block.roadId,
          roadName: block.roadName,
          blockType: block.blockType,
          distanceMeters,
          thresholdMeters,
        })
      }
      continue
    }

    if (!block.monitoredRoadId) continue
    const road = findMonitoredRoadById(block.monitoredRoadId)
    if (!road) continue

    const blockedSegmentLngLat = road.blockedSegment.map(
      ([lat, lng]) => [lng, lat] as [number, number]
    )
    const distanceMeters = minDistanceBetweenPolylinesMeters(routeCoords, blockedSegmentLngLat)

    if (distanceMeters <= ROAD_BLOCK_PROXIMITY_THRESHOLD_METERS) {
      violations.push({
        roadId: block.roadId,
        roadName: block.roadName,
        blockType: block.blockType,
        distanceMeters,
        thresholdMeters: ROAD_BLOCK_PROXIMITY_THRESHOLD_METERS,
      })
    }
  }

  return violations
}

function buildRefinedDetourCoordinates(
  startCoord: [number, number],
  endCoord: [number, number],
  activeBlocks: Awaited<ReturnType<typeof getActiveRoadBlocksGlobal>>
) {
  const routeCandidates: [number, number][][] = []
  const routeKeys = new Set<string>()
  const pointWaypointGroups: Array<{
    blockId: string
    nearRing: [number, number][]
    farRing: [number, number][]
  }> = []

  function addCandidate(waypoints: [number, number][]) {
    const coordinates = [startCoord, ...waypoints, endCoord]
    const key = coordinates
      .map((point) => `${point[0].toFixed(6)}:${point[1].toFixed(6)}`)
      .join('|')

    if (routeKeys.has(key)) return
    routeKeys.add(key)
    routeCandidates.push(coordinates)
  }

  function buildRing(
    centerLng: number,
    centerLat: number,
    offsetMeters: number
  ) {
    const points: [number, number][] = []
    const bearings = [0, 45, 90, 135, 180, 225, 270, 315]

    for (const bearingDeg of bearings) {
      const angle = (bearingDeg * Math.PI) / 180
      const deltaLng = metersToDegreesLng(Math.cos(angle) * offsetMeters, centerLat)
      const deltaLat = metersToDegreesLat(Math.sin(angle) * offsetMeters)
      const waypoint: [number, number] = [centerLng + deltaLng, centerLat + deltaLat]
      if (!isValidCoord(waypoint)) continue
      points.push(waypoint)
    }

    return points
  }

  function cardinalFromRing(ring: [number, number][]) {
    if (ring.length >= 8) {
      return [ring[0], ring[2], ring[4], ring[6]]
    }

    return ring.slice(0, Math.min(4, ring.length))
  }

  for (const block of activeBlocks) {
    if (
      block.blockType !== 'point' ||
      typeof block.blockLng !== 'number' ||
      typeof block.blockLat !== 'number' ||
      !Number.isFinite(block.blockLng) ||
      !Number.isFinite(block.blockLat)
    ) {
      continue
    }

    const radius = getPointBlockEffectiveRadius(block.blockRadiusMeters)
    const nearRing = buildRing(
      block.blockLng,
      block.blockLat,
      Math.max(130, radius * 2.6)
    )
    const farRing = buildRing(
      block.blockLng,
      block.blockLat,
      Math.max(240, radius * 4.6)
    )
    const pointRing = nearRing

    for (const waypoint of pointRing) {
      addCandidate([waypoint])
    }

    for (const waypoint of cardinalFromRing(farRing)) {
      addCandidate([waypoint])
    }

    if (pointRing.length >= 8) {
      for (let index = 0; index < 4; index += 1) {
        const current = pointRing[index]
        const opposite = pointRing[index + 4]
        addCandidate([current, opposite])
      }
    }

    if (nearRing.length > 0) {
      pointWaypointGroups.push({
        blockId: block.roadId,
        nearRing,
        farRing: farRing.length > 0 ? farRing : nearRing,
      })
    }
  }

  if (pointWaypointGroups.length >= 2) {
    for (let firstIndex = 0; firstIndex < pointWaypointGroups.length; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < pointWaypointGroups.length;
        secondIndex += 1
      ) {
        const firstGroup = pointWaypointGroups[firstIndex]
        const secondGroup = pointWaypointGroups[secondIndex]
        if (firstGroup.blockId === secondGroup.blockId) continue

        const firstOptions = cardinalFromRing(firstGroup.farRing)
        const secondOptions = cardinalFromRing(secondGroup.farRing)

        for (const firstWaypoint of firstOptions) {
          for (const secondWaypoint of secondOptions) {
            const firstOrderDistance =
              distanceBetweenCoordsMeters(startCoord, firstWaypoint) +
              distanceBetweenCoordsMeters(firstWaypoint, secondWaypoint) +
              distanceBetweenCoordsMeters(secondWaypoint, endCoord)

            const secondOrderDistance =
              distanceBetweenCoordsMeters(startCoord, secondWaypoint) +
              distanceBetweenCoordsMeters(secondWaypoint, firstWaypoint) +
              distanceBetweenCoordsMeters(firstWaypoint, endCoord)

            if (firstOrderDistance <= secondOrderDistance) {
              addCandidate([firstWaypoint, secondWaypoint])
            } else {
              addCandidate([secondWaypoint, firstWaypoint])
            }
          }
        }
      }
    }
  }

  for (const block of activeBlocks) {
    if (block.blockType !== 'road' || !block.monitoredRoadId) continue
    const road = findMonitoredRoadById(block.monitoredRoadId)
    if (!road) continue

    addCandidate([road.detourWaypoint])
  }

  return routeCandidates.slice(0, MAX_REFINED_DETOUR_ATTEMPTS)
}

async function requestDirectionsOrs(
  orsApiKey: string,
  options: DirectionsRequestOptions
) {
  const payload: Record<string, unknown> = {
    coordinates: options.coordinates,
  }

  if (options.avoidPolygons) {
    payload.options = {
      avoid_polygons: options.avoidPolygons,
    }
  }

  const { response, data } = await fetchJsonWithTimeout(
    'https://api.openrouteservice.org/v2/directions/driving-car/geojson',
    {
      method: 'POST',
      headers: {
        Authorization: orsApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  )

  if (!response.ok) {
    throw new Error(typeof data === 'string' ? data : JSON.stringify(data))
  }

  const geoJson = data as RouteGeoJson
  if (!extractLineCoordinates(geoJson)) {
    throw new Error('ORS retornou geometria invalida')
  }

  return geoJson
}

async function requestDirectionsOsrm(options: { coordinates: [number, number][] }) {
  const coordinatesParam = options.coordinates
    .map(([lng, lat]) => `${lng},${lat}`)
    .join(';')

  const { response, data } = await fetchJsonWithTimeout(
    `https://router.project-osrm.org/route/v1/driving/${coordinatesParam}?overview=full&geometries=geojson`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    }
  )

  if (!response.ok) {
    throw new Error(typeof data === 'string' ? data : JSON.stringify(data))
  }

  const coordinates =
    (data as { routes?: Array<{ geometry?: { coordinates?: [number, number][] } }> })
      ?.routes?.[0]?.geometry?.coordinates

  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new Error('OSRM sem geometria valida')
  }

  const geoJson = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates,
        },
        properties: {
          source: 'osrm',
        },
      },
    ],
  } satisfies RouteGeoJson

  return geoJson
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { start, end } = body

    if (
      !start ||
      !end ||
      !Array.isArray(start) ||
      !Array.isArray(end) ||
      start.length !== 2 ||
      end.length !== 2
    ) {
      return NextResponse.json(
        { error: 'Parametros start e end invalidos' },
        { status: 400 }
      )
    }

    const startCoord: [number, number] = [Number(start[0]), Number(start[1])]
    const endCoord: [number, number] = [Number(end[0]), Number(end[1])]

    if (!isValidCoord(startCoord) || !isValidCoord(endCoord)) {
      return NextResponse.json(
        { error: 'Coordenadas start/end invalidas' },
        { status: 400 }
      )
    }

    const orsApiKey = process.env.ORS_API_KEY?.trim() || null

    const activeBlocks = await getActiveRoadBlocksGlobal()
    const avoidPolygons = buildAvoidPolygonsFromBlocks(activeBlocks)
    const detourWaypoints = buildDetourWaypointsFromBlocks(activeBlocks)
    const hasActiveBlocks = activeBlocks.length > 0
    const refinedCandidates = hasActiveBlocks
      ? buildRefinedDetourCoordinates(startCoord, endCoord, activeBlocks)
      : []

    let selectedCandidate: RouteCandidate | null = null
    let selectedViolations: BlockRouteViolation[] = []
    let bestCandidateWithViolations: {
      candidate: RouteCandidate
      violations: BlockRouteViolation[]
    } | null = null

    const routeProviderErrors: Array<{
      provider: 'ors' | 'osrm'
      routeMode: RouteMode
      error: unknown
    }> = []

    function evaluateCandidate(candidate: RouteCandidate) {
      const routeCoords = extractLineCoordinates(candidate.data)
      if (!routeCoords) {
        throw new Error('Candidato de rota sem geometria valida')
      }

      if (!hasActiveBlocks) {
        selectedCandidate = candidate
        selectedViolations = []
        return true
      }

      const violations = getRouteBlockViolations(routeCoords, activeBlocks)
      if (violations.length === 0) {
        selectedCandidate = candidate
        selectedViolations = []
        return true
      }

      if (
        !bestCandidateWithViolations ||
        violations.length < bestCandidateWithViolations.violations.length
      ) {
        bestCandidateWithViolations = {
          candidate,
          violations,
        }
      }

      return false
    }

    if (orsApiKey) {
      if (avoidPolygons) {
        try {
          const orsAvoidData = await requestDirectionsOrs(orsApiKey, {
            coordinates: [startCoord, endCoord],
            avoidPolygons,
          })
          evaluateCandidate({
            data: orsAvoidData,
            provider: 'ors',
            routeMode: 'avoid_polygons',
          })
        } catch (error) {
          routeProviderErrors.push({
            provider: 'ors',
            routeMode: 'avoid_polygons',
            error,
          })
        }
      }

      if (!selectedCandidate && detourWaypoints.length > 0) {
        try {
          const orsDetourData = await requestDirectionsOrs(orsApiKey, {
            coordinates: [startCoord, ...detourWaypoints, endCoord],
            avoidPolygons: avoidPolygons ?? undefined,
          })
          evaluateCandidate({
            data: orsDetourData,
            provider: 'ors',
            routeMode: 'detour_fallback',
          })
        } catch (error) {
          routeProviderErrors.push({
            provider: 'ors',
            routeMode: 'detour_fallback',
            error,
          })
        }
      }

      if (!selectedCandidate && hasActiveBlocks && refinedCandidates.length > 0) {
        for (const candidateCoordinates of refinedCandidates) {
          try {
            const orsRefinedData = await requestDirectionsOrs(orsApiKey, {
              coordinates: candidateCoordinates,
              avoidPolygons: avoidPolygons ?? undefined,
            })
            const accepted = evaluateCandidate({
              data: orsRefinedData,
              provider: 'ors',
              routeMode: 'detour_refined',
            })
            if (accepted) break
          } catch (error) {
            routeProviderErrors.push({
              provider: 'ors',
              routeMode: 'detour_refined',
              error,
            })
          }
        }
      }

      if (!selectedCandidate && hasActiveBlocks && refinedCandidates.length > 0) {
        for (const candidateCoordinates of refinedCandidates) {
          try {
            const orsRefinedNoAvoidData = await requestDirectionsOrs(orsApiKey, {
              coordinates: candidateCoordinates,
            })
            const accepted = evaluateCandidate({
              data: orsRefinedNoAvoidData,
              provider: 'ors',
              routeMode: 'detour_refined_no_avoid',
            })
            if (accepted) break
          } catch (error) {
            routeProviderErrors.push({
              provider: 'ors',
              routeMode: 'detour_refined_no_avoid',
              error,
            })
          }
        }
      }

      if (!selectedCandidate) {
        try {
          const orsDefaultData = await requestDirectionsOrs(orsApiKey, {
            coordinates: [startCoord, endCoord],
          })
          evaluateCandidate({
            data: orsDefaultData,
            provider: 'ors',
            routeMode: 'default_fallback',
          })
        } catch (error) {
          routeProviderErrors.push({
            provider: 'ors',
            routeMode: 'default_fallback',
            error,
          })
        }
      }
    } else {
      routeProviderErrors.push({
        provider: 'ors',
        routeMode: 'default',
        error: 'ORS_API_KEY ausente',
      })
    }

    if (!selectedCandidate) {
      try {
        const osrmData = await requestDirectionsOsrm({
          coordinates: [startCoord, endCoord],
        })
        evaluateCandidate({
          data: osrmData,
          provider: 'osrm',
          routeMode: hasActiveBlocks ? 'osrm_fallback' : 'osrm_only',
        })
      } catch (error) {
        routeProviderErrors.push({
          provider: 'osrm',
          routeMode: hasActiveBlocks ? 'osrm_fallback' : 'osrm_only',
          error,
        })
      }
    }

    if (!selectedCandidate && hasActiveBlocks && refinedCandidates.length > 0) {
      const osrmRefinedCandidates = refinedCandidates.slice(0, MAX_OSRM_REFINED_ATTEMPTS)

      for (const candidateCoordinates of osrmRefinedCandidates) {
        try {
          const osrmRefinedData = await requestDirectionsOsrm({
            coordinates: candidateCoordinates,
          })
          const accepted = evaluateCandidate({
            data: osrmRefinedData,
            provider: 'osrm',
            routeMode: 'osrm_refined',
          })
          if (accepted) break
        } catch (error) {
          routeProviderErrors.push({
            provider: 'osrm',
            routeMode: 'osrm_refined',
            error,
          })
        }
      }
    }

    if (!selectedCandidate) {
      const candidateWithViolations = bestCandidateWithViolations as
        | { candidate: RouteCandidate; violations: BlockRouteViolation[] }
        | null

      if (hasActiveBlocks && candidateWithViolations !== null) {
        const violatedBlocks = candidateWithViolations.violations.map(
          (item: BlockRouteViolation) => ({
            roadId: item.roadId,
            roadName: item.roadName,
            blockType: item.blockType,
            distanceMeters: Math.round(item.distanceMeters),
            thresholdMeters: Math.round(item.thresholdMeters),
          })
        )

        console.warn('[route-api] sem_rota_segura_com_bloqueios', {
          violatedBlocks,
          routeProviderErrors,
        })

        return NextResponse.json(
          {
            error:
              'Nao foi possivel gerar uma rota segura sem cruzar area interditada. Aguarde liberacao de bloqueio ou ajuste operacional.',
            metadata: {
              provider: null,
              routeMode: 'strict_blocked',
              blocksApplied: false,
              degradedForActiveBlocks: true,
              blockViolationCount: violatedBlocks.length,
              violatedBlocks,
            },
          },
          { status: 409 }
        )
      }

      console.error('Erro rota ORS+OSRM:', routeProviderErrors)
      return NextResponse.json(
        { error: 'Erro ao buscar rota nos provedores disponiveis' },
        { status: 502 }
      )
    }

    const finalCandidate: RouteCandidate = selectedCandidate
    const finalViolations = selectedViolations
    const blocksApplied = hasActiveBlocks ? finalViolations.length === 0 : false

    if (hasActiveBlocks && !blocksApplied) {
      console.warn('[route-api] rota_degradada_com_bloqueios', {
        routeMode: finalCandidate.routeMode,
        provider: finalCandidate.provider,
        violations: finalViolations.map((item) => ({
          roadId: item.roadId,
          roadName: item.roadName,
          blockType: item.blockType,
          distanceMeters: Math.round(item.distanceMeters),
          thresholdMeters: Math.round(item.thresholdMeters),
        })),
      })
    }

    const metadata = {
      provider: finalCandidate.provider,
      routeMode: finalCandidate.routeMode,
      blocksApplied,
      degradedForActiveBlocks: hasActiveBlocks && !blocksApplied,
      blockViolationCount: finalViolations.length,
      violatedBlocks: finalViolations.map((item) => ({
        roadId: item.roadId,
        roadName: item.roadName,
        blockType: item.blockType,
        distanceMeters: Math.round(item.distanceMeters),
        thresholdMeters: Math.round(item.thresholdMeters),
      })),
      activeRoadBlocks: activeBlocks.map((block) => ({
        roadId: block.roadId,
        roadName: block.roadName,
        blockType: block.blockType,
      })),
    }

    return NextResponse.json({
      ...finalCandidate.data,
      metadata,
    })
  } catch (error) {
    console.error('Erro na API de rota:', error)
    return NextResponse.json(
      { error: 'Erro interno ao calcular rota' },
      { status: 500 }
    )
  }
}
