'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import {
  Circle,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { findMonitoredRoadById } from '@/lib/road-blocks-definitions'

type ActiveRouteBlock = {
  roadId: string
  roadName: string
  blockType: 'road' | 'point'
  monitoredRoadId: string | null
  blockLng: number | null
  blockLat: number | null
  blockRadiusMeters: number | null
  updatedAt: string | null
}

type RouteMetadata = {
  provider?: string
  routeMode?: string
  blocksApplied?: boolean
  degradedForActiveBlocks?: boolean
}

type RouteMapProps = {
  currentPosition: [number, number] | null // [lng, lat]
  end: [number, number] // [lng, lat]
  recenterTick: number
  autoFollow: boolean
  heading: number | null
  routeRefreshKey: string
  activeBlocks: ActiveRouteBlock[]
  onMapInteraction: () => void
  onRouteDeviationChange: (value: {
    isOffRoute: boolean
    distanceMeters: number | null
  }) => void
  onRouteMetadataChange?: (metadata: RouteMetadata | null) => void
}

type MapViewportControllerProps = {
  currentPositionLatLng: [number, number] | null
  endLatLng: [number, number]
  routeCoords: [number, number][]
  recenterTick: number
  autoFollow: boolean
}

type RouteApiResponse = {
  error?: string
  features?: Array<{
    geometry?: {
      coordinates?: [number, number][]
    }
  }>
  metadata?: RouteMetadata
}

const EARTH_RADIUS_METERS = 6371000
const OFF_ROUTE_THRESHOLD_METERS = 45
const POINT_BLOCK_DISPLAY_MIN_RADIUS_METERS = 25

function toRad(value: number) {
  return (value * Math.PI) / 180
}

function haversineMeters(a: [number, number], b: [number, number]) {
  const [lat1, lng1] = a
  const [lat2, lng2] = b

  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const lat1Rad = toRad(lat1)
  const lat2Rad = toRad(lat2)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLng / 2) ** 2

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h))
}

function latLngToMeters(lat: number, lng: number) {
  const x = toRad(lng) * EARTH_RADIUS_METERS * Math.cos(toRad(lat))
  const y = toRad(lat) * EARTH_RADIUS_METERS
  return { x, y }
}

function pointToSegmentDistanceMeters(
  p: [number, number],
  a: [number, number],
  b: [number, number]
) {
  const pM = latLngToMeters(p[0], p[1])
  const aM = latLngToMeters(a[0], a[1])
  const bM = latLngToMeters(b[0], b[1])

  const abx = bM.x - aM.x
  const aby = bM.y - aM.y
  const apx = pM.x - aM.x
  const apy = pM.y - aM.y

  const abLenSq = abx * abx + aby * aby
  if (abLenSq === 0) {
    return Math.hypot(apx, apy)
  }

  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq))
  const cx = aM.x + abx * t
  const cy = aM.y + aby * t

  return Math.hypot(pM.x - cx, pM.y - cy)
}

function minDistanceToRouteMeters(
  point: [number, number],
  polyline: [number, number][]
) {
  if (polyline.length < 2) return null

  let minDistance = Number.POSITIVE_INFINITY

  for (let i = 0; i < polyline.length - 1; i += 1) {
    const segmentDistance = pointToSegmentDistanceMeters(
      point,
      polyline[i],
      polyline[i + 1]
    )
    if (segmentDistance < minDistance) {
      minDistance = segmentDistance
    }
  }

  return Number.isFinite(minDistance) ? minDistance : null
}

function MapInteractionTracker({ onMapInteraction }: { onMapInteraction: () => void }) {
  useMapEvents({
    dragstart: onMapInteraction,
    zoomstart: onMapInteraction,
  })
  return null
}

function MapViewportController({
  currentPositionLatLng,
  endLatLng,
  routeCoords,
  recenterTick,
  autoFollow,
}: MapViewportControllerProps) {
  const map = useMap()
  const didInitialCenterRef = useRef(false)
  const didFirstRouteFitRef = useRef(false)
  const lastFollowRef = useRef<{
    ts: number
    point: [number, number]
  } | null>(null)

  useEffect(() => {
    if (routeCoords.length > 1 && !didFirstRouteFitRef.current) {
      map.fitBounds(routeCoords, {
        padding: [56, 56],
        maxZoom: 16,
      })
      didFirstRouteFitRef.current = true
      didInitialCenterRef.current = true
      return
    }

    if (didInitialCenterRef.current) return

    if (currentPositionLatLng) {
      map.flyTo(currentPositionLatLng, 15, { duration: 0.9 })
      didInitialCenterRef.current = true
      return
    }

    map.flyTo(endLatLng, 15, { duration: 0.9 })
    didInitialCenterRef.current = true
  }, [map, routeCoords, currentPositionLatLng, endLatLng])

  useEffect(() => {
    if (!autoFollow || !currentPositionLatLng) return

    const now = Date.now()
    const previous = lastFollowRef.current

    if (previous) {
      const elapsed = now - previous.ts
      const moved = haversineMeters(previous.point, currentPositionLatLng)
      if (elapsed < 900 || moved < 8) {
        return
      }
    }

    lastFollowRef.current = { ts: now, point: currentPositionLatLng }
    map.panTo(currentPositionLatLng, {
      animate: true,
      duration: 0.8,
    })
  }, [map, autoFollow, currentPositionLatLng])

  useEffect(() => {
    if (!currentPositionLatLng || recenterTick === 0) return

    map.flyTo(currentPositionLatLng, Math.max(16, map.getZoom()), {
      duration: 0.8,
    })
  }, [map, recenterTick, currentPositionLatLng])

  return null
}

function normalizeErrorMessage(value: unknown) {
  if (value instanceof Error && value.message) return value.message
  if (typeof value === 'string' && value.trim()) return value
  return 'Nao foi possivel carregar a rota.'
}

function isValidCoord(value: number | null | undefined, max: number) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max
}

export default function RouteMap({
  currentPosition,
  end,
  recenterTick,
  autoFollow,
  heading,
  routeRefreshKey,
  activeBlocks,
  onMapInteraction,
  onRouteDeviationChange,
  onRouteMetadataChange,
}: RouteMapProps) {
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)
  const [retryCount, setRetryCount] = useState(0)
  const routeRequestKeyRef = useRef<string | null>(null)
  const routeFetchInFlightRef = useRef(false)

  const currentPositionLatLng = useMemo<[number, number] | null>(
    () => (currentPosition ? [currentPosition[1], currentPosition[0]] : null),
    [currentPosition]
  )
  const endLatLng = useMemo<[number, number]>(() => [end[1], end[0]], [end])

  const initialCenter: [number, number] = currentPositionLatLng
    ? [
        (currentPositionLatLng[0] + endLatLng[0]) / 2,
        (currentPositionLatLng[1] + endLatLng[1]) / 2,
      ]
    : endLatLng

  const headingDegrees =
    typeof heading === 'number' && Number.isFinite(heading) ? heading : 0

  const routeStart = useMemo<[number, number] | null>(() => {
    if (!currentPosition) return null

    const lng = Number(currentPosition[0].toFixed(4))
    const lat = Number(currentPosition[1].toFixed(4))
    return [lng, lat]
  }, [currentPosition])

  const roadBlocks = useMemo(
    () =>
      activeBlocks.filter(
        (block) => block.blockType === 'road' && block.monitoredRoadId
      ),
    [activeBlocks]
  )

  const pointBlocks = useMemo(
    () =>
      activeBlocks.filter(
        (block) =>
          block.blockType === 'point' &&
          isValidCoord(block.blockLat, 90) &&
          isValidCoord(block.blockLng, 180)
      ),
    [activeBlocks]
  )

  const userIcon = useMemo(
    () =>
      L.divIcon({
        className: 'conecta-user-marker-wrap',
        html: `
          <span class="conecta-user-marker-pulse"></span>
          <span class="conecta-user-marker-core"></span>
          <span class="conecta-user-marker-arrow" style="transform: translateX(-50%) rotate(${headingDegrees}deg)"></span>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      }),
    [headingDegrees]
  )

  const destinationIcon = useMemo(
    () =>
      L.divIcon({
        className: 'conecta-destination-marker-wrap',
        html: '<span class="conecta-destination-marker-core"></span>',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
    []
  )

  const blockPointIcon = useMemo(
    () =>
      L.divIcon({
        className: 'conecta-route-block-wrap',
        html: '<span class="conecta-route-block-core"></span>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    []
  )

  useEffect(() => {
    if (!routeStart) return

    const requestKey = `${routeStart[0]}:${routeStart[1]}->${end[0]}:${end[1]}|${routeRefreshKey}|${retryNonce}`

    if (routeRequestKeyRef.current === requestKey) return
    if (routeFetchInFlightRef.current) return

    async function fetchRoute() {
      routeFetchInFlightRef.current = true
      routeRequestKeyRef.current = requestKey
      setLoading(true)

      try {
        const response = await fetch('/api/route', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ start: routeStart, end }),
        })

        const rawText = await response.text()
        let data: RouteApiResponse | null = null

        if (rawText) {
          try {
            data = JSON.parse(rawText) as RouteApiResponse
          } catch {
            data = null
          }
        }

        if (!response.ok) {
          throw new Error(data?.error || `Erro ao buscar rota (${response.status})`)
        }

        const coordinates = data?.features?.[0]?.geometry?.coordinates
        if (!Array.isArray(coordinates) || coordinates.length < 2) {
          throw new Error('Rota invalida recebida da API')
        }

        const leafletCoords: [number, number][] = coordinates.map(
          ([lng, lat]) => [lat, lng]
        )

        setRouteCoords(leafletCoords)
        setError(null)
        setRetryCount(0)
        onRouteMetadataChange?.(data?.metadata ?? null)
      } catch (fetchError) {
        console.error('[route-map] fetch_route_error', fetchError)
        setRouteCoords([])
        setError(normalizeErrorMessage(fetchError))
        onRouteMetadataChange?.(null)
      } finally {
        routeFetchInFlightRef.current = false
        setLoading(false)
      }
    }

    void fetchRoute()
  }, [routeStart, end, routeRefreshKey, retryNonce, onRouteMetadataChange])

  useEffect(() => {
    if (!error || !routeStart) return
    if (retryCount >= 2) return

    const retryTimer = window.setTimeout(() => {
      setRetryCount((value) => value + 1)
      setRetryNonce((value) => value + 1)
    }, 2500)

    return () => {
      window.clearTimeout(retryTimer)
    }
  }, [error, routeStart, retryCount])

  useEffect(() => {
    if (!error || !routeStart) return
    if (activeBlocks.length === 0) return

    const intervalId = window.setInterval(() => {
      setRetryNonce((value) => value + 1)
    }, 8000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [error, routeStart, activeBlocks.length])

  useEffect(() => {
    if (!currentPositionLatLng || routeCoords.length < 2) {
      onRouteDeviationChange({ isOffRoute: false, distanceMeters: null })
      return
    }

    const distanceToRoute = minDistanceToRouteMeters(currentPositionLatLng, routeCoords)
    if (distanceToRoute === null) {
      onRouteDeviationChange({ isOffRoute: false, distanceMeters: null })
      return
    }

    onRouteDeviationChange({
      isOffRoute: distanceToRoute > OFF_ROUTE_THRESHOLD_METERS,
      distanceMeters: distanceToRoute,
    })
  }, [currentPositionLatLng, routeCoords, onRouteDeviationChange])

  return (
    <div className='relative h-full w-full'>
      <MapContainer
        center={initialCenter}
        zoom={15}
        zoomControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
        />

        <MapInteractionTracker onMapInteraction={onMapInteraction} />

        <MapViewportController
          currentPositionLatLng={currentPositionLatLng}
          endLatLng={endLatLng}
          routeCoords={routeCoords}
          recenterTick={recenterTick}
          autoFollow={autoFollow}
        />

        {roadBlocks.map((block) => {
          const road = block.monitoredRoadId
            ? findMonitoredRoadById(block.monitoredRoadId)
            : null
          if (!road) return null

          return (
            <Polyline
              key={block.roadId}
              positions={road.blockedSegment}
              pathOptions={{
                color: '#ef4444',
                weight: 5,
                opacity: 0.9,
                dashArray: '10 7',
              }}
            >
              <Popup>
                <p className='text-xs font-semibold text-slate-900'>
                  Bloqueio ativo: {block.roadName}
                </p>
              </Popup>
            </Polyline>
          )
        })}

        {pointBlocks.map((block) => (
          <Circle
            key={`${block.roadId}-radius`}
            center={[block.blockLat as number, block.blockLng as number]}
            radius={Math.max(POINT_BLOCK_DISPLAY_MIN_RADIUS_METERS, block.blockRadiusMeters ?? 90)}
            pathOptions={{
              color: '#ef4444',
              weight: 2,
              opacity: 0.85,
              fillColor: '#ef4444',
              fillOpacity: 0.15,
            }}
          />
        ))}

        {pointBlocks.map((block) => (
          <Marker
            key={block.roadId}
            position={[block.blockLat as number, block.blockLng as number]}
            icon={blockPointIcon}
          >
            <Popup>
              <p className='text-xs font-semibold text-slate-900'>
                Bloqueio ativo: {block.roadName}
              </p>
            </Popup>
          </Marker>
        ))}

        <Marker position={endLatLng} icon={destinationIcon}>
          <Popup>Destino</Popup>
        </Marker>

        {currentPositionLatLng && (
          <Marker position={currentPositionLatLng} icon={userIcon}>
            <Popup>Sua posicao</Popup>
          </Marker>
        )}

        {routeCoords.length > 0 && (
          <Polyline
            positions={routeCoords}
            pathOptions={{
              color: '#2850B8',
              weight: 6,
              opacity: 0.92,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        )}
      </MapContainer>

      {loading && (
        <div className='pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-white/70 bg-white/92 px-3 py-1.5 text-xs font-semibold text-[#384880] shadow-sm backdrop-blur'>
          Calculando rota...
        </div>
      )}

      {error && (
        <div className='pointer-events-none absolute bottom-3 left-3 right-3 rounded-xl border border-rose-200 bg-rose-50/95 px-3 py-2 text-xs font-medium text-rose-700 shadow-sm sm:left-1/2 sm:right-auto sm:w-[520px] sm:-translate-x-1/2 sm:text-sm'>
          {error}
        </div>
      )}

      <style jsx global>{`
        .conecta-user-marker-wrap,
        .conecta-destination-marker-wrap,
        .conecta-route-block-wrap {
          background: transparent;
          border: 0;
        }

        .conecta-user-marker-pulse {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          background: rgba(40, 80, 184, 0.28);
          animation: conectaPulse 1.8s ease-out infinite;
        }

        .conecta-user-marker-core {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 14px;
          height: 14px;
          border: 2px solid #ffffff;
          border-radius: 999px;
          background: #2850b8;
          transform: translate(-50%, -50%);
          box-shadow: 0 0 0 2px rgba(40, 80, 184, 0.35);
        }

        .conecta-user-marker-arrow {
          position: absolute;
          left: 50%;
          top: -2px;
          width: 0;
          height: 0;
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-bottom: 9px solid #2850b8;
          transform-origin: center 13px;
          filter: drop-shadow(0 1px 1px rgba(15, 23, 42, 0.3));
          transition: transform 220ms ease-out;
        }

        .conecta-destination-marker-core {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 14px;
          height: 14px;
          border-radius: 999px;
          background: #384880;
          border: 2px solid #ffffff;
          transform: translate(-50%, -50%);
          box-shadow: 0 0 0 4px rgba(112, 200, 248, 0.48);
        }

        .conecta-route-block-core {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          border: 2px solid #fff;
          box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.34);
          background: #ef4444;
        }

        .conecta-route-block-core::before,
        .conecta-route-block-core::after {
          content: '';
          position: absolute;
          left: 50%;
          top: 50%;
          width: 12px;
          height: 2px;
          background: #fff;
          transform-origin: center;
        }

        .conecta-route-block-core::before {
          transform: translate(-50%, -50%) rotate(45deg);
        }

        .conecta-route-block-core::after {
          transform: translate(-50%, -50%) rotate(-45deg);
        }

        @keyframes conectaPulse {
          0% {
            transform: scale(0.72);
            opacity: 0.95;
          }
          70% {
            transform: scale(1.8);
            opacity: 0;
          }
          100% {
            transform: scale(1.8);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}
