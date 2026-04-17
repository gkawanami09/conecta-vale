import { NextRequest, NextResponse } from 'next/server'
import {
  buildAvoidPolygonsFromBlocks,
  buildDetourWaypointsFromBlocks,
  getActiveRoadBlocksGlobal,
} from '@/lib/road-blocks'

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

const REQUEST_TIMEOUT_MS = 12000

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

    let data: RouteGeoJson | null = null
    let routeMode:
      | 'default'
      | 'avoid_polygons'
      | 'detour_fallback'
      | 'default_fallback'
      | 'osrm_only' = 'default'
    let provider: 'ors' | 'osrm' = 'ors'

    let orsError: unknown = null

    if (orsApiKey) {
      try {
        if (avoidPolygons) {
          data = await requestDirectionsOrs(orsApiKey, {
            coordinates: [startCoord, endCoord],
            avoidPolygons,
          })
          routeMode = 'avoid_polygons'
        } else {
          data = await requestDirectionsOrs(orsApiKey, {
            coordinates: [startCoord, endCoord],
          })
          routeMode = 'default'
        }
      } catch (firstError) {
        try {
          if (detourWaypoints.length > 0) {
            data = await requestDirectionsOrs(orsApiKey, {
              coordinates: [startCoord, ...detourWaypoints, endCoord],
            })
            routeMode = 'detour_fallback'
          }
        } catch (detourError) {
          orsError = { firstError, detourError }
        }

        if (!data) {
          try {
            data = await requestDirectionsOrs(orsApiKey, {
              coordinates: [startCoord, endCoord],
            })
            routeMode = 'default_fallback'
          } catch (defaultError) {
            orsError = { firstError, defaultError }
          }
        }
      }
    } else {
      orsError = 'ORS_API_KEY ausente'
    }

    if (!data) {
      if (hasActiveBlocks) {
        console.error('Rota bloqueada: sem alternativa segura com bloqueios ativos', {
          orsError,
          activeBlocks: activeBlocks.map((block) => ({
            roadId: block.roadId,
            roadName: block.roadName,
            blockType: block.blockType,
          })),
        })
        return NextResponse.json(
          {
            error:
              'Nao foi possivel calcular rota alternativa com os bloqueios ativos. Aguarde nova atualizacao do gestor.',
          },
          { status: 409 }
        )
      }

      try {
        data = await requestDirectionsOsrm({
          coordinates: [startCoord, endCoord],
        })
        provider = 'osrm'
        routeMode = orsApiKey ? 'default_fallback' : 'osrm_only'
      } catch (osrmError) {
        console.error('Erro rota ORS+OSRM:', {
          orsError,
          osrmError,
        })
        return NextResponse.json(
          { error: 'Erro ao buscar rota nos provedores disponiveis' },
          { status: 502 }
        )
      }
    }

    const metadata = {
      provider,
      routeMode,
      blocksApplied: hasActiveBlocks,
      activeRoadBlocks: activeBlocks.map((block) => ({
        roadId: block.roadId,
        roadName: block.roadName,
        blockType: block.blockType,
      })),
    }

    return NextResponse.json({
      ...data,
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
