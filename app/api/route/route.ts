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

async function requestDirections(
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

  const response = await fetch(
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

  const data = await response.json()

  if (!response.ok) {
    throw new Error(JSON.stringify(data))
  }

  return data
}

async function requestDirectionsOsrm(options: { coordinates: [number, number][] }) {
  const coordinatesParam = options.coordinates
    .map(([lng, lat]) => `${lng},${lat}`)
    .join(';')

  const response = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${coordinatesParam}?overview=full&geometries=geojson`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    }
  )

  const data = await response.json()

  if (!response.ok) {
    throw new Error(JSON.stringify(data))
  }

  const coordinates = data?.routes?.[0]?.geometry?.coordinates
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

    if (
      startCoord.some((value) => Number.isNaN(value)) ||
      endCoord.some((value) => Number.isNaN(value))
    ) {
      return NextResponse.json(
        { error: 'Coordenadas start/end invalidas' },
        { status: 400 }
      )
    }

    const orsApiKey = process.env.ORS_API_KEY

    if (!orsApiKey) {
      return NextResponse.json(
        { error: 'ORS_API_KEY nao configurada' },
        { status: 500 }
      )
    }

    const activeBlocks = await getActiveRoadBlocksGlobal()
    const avoidPolygons = buildAvoidPolygonsFromBlocks(activeBlocks)
    const detourWaypoints = buildDetourWaypointsFromBlocks(activeBlocks)

    let data: RouteGeoJson
    let routeMode:
      | 'default'
      | 'avoid_polygons'
      | 'detour_fallback'
      | 'default_fallback' = 'default'

    try {
      if (avoidPolygons) {
        data = await requestDirections(orsApiKey, {
          coordinates: [startCoord, endCoord],
          avoidPolygons,
        })
        routeMode = 'avoid_polygons'
      } else {
        data = await requestDirections(orsApiKey, {
          coordinates: [startCoord, endCoord],
        })
      }
    } catch (avoidError) {
      try {
        if (detourWaypoints.length > 0) {
          data = await requestDirections(orsApiKey, {
            coordinates: [startCoord, ...detourWaypoints, endCoord],
          })
          routeMode = 'detour_fallback'
        } else {
          throw avoidError
        }
      } catch (detourError) {
        // Fallback final: evita ficar sem rota no cliente quando o ORS rejeita avoid/detour.
        // Mantem operacao funcional e sinaliza via metadata que foi fallback.
        try {
          data = await requestDirections(orsApiKey, {
            coordinates: [startCoord, endCoord],
          })
          routeMode = 'default_fallback'
          console.warn('[route.api] default_fallback_enabled', {
            avoidError,
            detourError,
            activeBlocks: activeBlocks.length,
          })
        } catch (defaultError) {
          try {
            data = await requestDirectionsOsrm({
              coordinates: [startCoord, endCoord],
            })
            routeMode = 'default_fallback'
            console.warn('[route.api] osrm_fallback_enabled', {
              avoidError,
              detourError,
              defaultError,
              activeBlocks: activeBlocks.length,
            })
          } catch (osrmError) {
            console.error('Erro ORS avoid+detour+default+osrm:', {
              avoidError,
              detourError,
              defaultError,
              osrmError,
            })
            return NextResponse.json(
              { error: 'Erro ao buscar rota no OpenRouteService' },
              { status: 502 }
            )
          }
        }
      }
    }

    const metadata = {
      routeMode,
      activeRoadBlocks: activeBlocks.map((block) => ({
        roadId: block.roadId,
        roadName: block.roadName,
        blockType: block.blockType,
      })),
    }

    return NextResponse.json({
      ...(data ?? {}),
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
