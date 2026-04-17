'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

type RouteMapProps = {
  currentPosition: [number, number] | null // [lng, lat]
  end: [number, number] // [lng, lat]
  recenterTick: number
  autoFollow: boolean
  heading: number | null
  routeRefreshKey: string
  onMapInteraction: () => void
  onRouteDeviationChange: (value: {
    isOffRoute: boolean
    distanceMeters: number | null
  }) => void
}

type MapViewportControllerProps = {
  currentPositionLatLng: [number, number] | null
  endLatLng: [number, number]
  routeCoords: [number, number][]
  recenterTick: number
  autoFollow: boolean
}

const EARTH_RADIUS_METERS = 6371000
const OFF_ROUTE_THRESHOLD_METERS = 45

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
  const didInitialFitRef = useRef(false)
  const lastFollowRef = useRef<{
    ts: number
    point: [number, number]
  } | null>(null)

  useEffect(() => {
    if (routeCoords.length > 1 && !didInitialFitRef.current) {
      map.fitBounds(routeCoords, {
        padding: [56, 56],
        maxZoom: 16,
      })
      didInitialFitRef.current = true
      return
    }

    if (!didInitialFitRef.current && currentPositionLatLng) {
      map.flyTo(currentPositionLatLng, 15, { duration: 0.9 })
      didInitialFitRef.current = true
      return
    }

    if (!didInitialFitRef.current) {
      map.flyTo(endLatLng, 15, { duration: 0.9 })
      didInitialFitRef.current = true
    }
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

export default function RouteMap({
  currentPosition,
  end,
  recenterTick,
  autoFollow,
  heading,
  routeRefreshKey,
  onMapInteraction,
  onRouteDeviationChange,
}: RouteMapProps) {
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const routeRequestKeyRef = useRef<string | null>(null)
  const routeFetchInFlightRef = useRef(false)

  const currentPositionLatLng = useMemo<[number, number] | null>(
    () => (currentPosition ? [currentPosition[1], currentPosition[0]] : null),
    [currentPosition]
  )
  const endLatLng = useMemo<[number, number]>(() => [end[1], end[0]], [end])

  const initialCenter: [number, number] = currentPositionLatLng
    ? [(currentPositionLatLng[0] + endLatLng[0]) / 2, (currentPositionLatLng[1] + endLatLng[1]) / 2]
    : endLatLng

  const headingDegrees =
    typeof heading === 'number' && Number.isFinite(heading) ? heading : 0

  const routeStart = useMemo<[number, number] | null>(() => {
    if (!currentPosition) return null

    // Reduz recálculo excessivo e evita oscilação por ruído de GPS.
    const lng = Number(currentPosition[0].toFixed(5))
    const lat = Number(currentPosition[1].toFixed(5))
    return [lng, lat]
  }, [currentPosition])

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

  useEffect(() => {
    if (!routeStart) return

    const requestKey = `${routeStart[0]}:${routeStart[1]}->${end[0]}:${end[1]}|${routeRefreshKey}`
    if (routeRequestKeyRef.current === requestKey && routeCoords.length > 1) return
    if (routeFetchInFlightRef.current) return

    async function fetchRoute() {
      try {
        routeFetchInFlightRef.current = true
        setLoading(true)
        setError(null)

        const response = await fetch('/api/route', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ start: routeStart, end }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data?.error || 'Erro ao buscar rota')
        }

        const coordinates = data?.features?.[0]?.geometry?.coordinates

        if (!coordinates || !Array.isArray(coordinates)) {
          throw new Error('Rota invalida recebida da API')
        }

        // ORS retorna [lng, lat], Leaflet usa [lat, lng]
        const leafletCoords: [number, number][] = coordinates.map(
          ([lng, lat]: [number, number]) => [lat, lng]
        )

        routeRequestKeyRef.current = requestKey
        setRouteCoords(leafletCoords)
      } catch (err) {
        console.error('[route-map] fetch_route_error', err)
        setError('Nao foi possivel carregar a rota.')
        if (currentPositionLatLng) {
          // Fallback visual para nao deixar o usuario sem indicacao de percurso.
          setRouteCoords([currentPositionLatLng, endLatLng])
        }
      } finally {
        routeFetchInFlightRef.current = false
        setLoading(false)
      }
    }

    void fetchRoute()
  }, [
    routeStart,
    end,
    routeRefreshKey,
    routeCoords.length,
    currentPositionLatLng,
    endLatLng,
  ])

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
        <div className='pointer-events-none absolute bottom-3 left-3 right-3 rounded-xl border border-rose-200 bg-rose-50/95 px-3 py-2 text-xs font-medium text-rose-700 shadow-sm sm:left-1/2 sm:right-auto sm:w-[420px] sm:-translate-x-1/2 sm:text-sm'>
          {error}
        </div>
      )}

      <style jsx global>{`
        .conecta-user-marker-wrap,
        .conecta-destination-marker-wrap {
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
