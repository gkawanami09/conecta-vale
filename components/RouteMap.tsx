'use client'

import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

type RouteMapProps = {
  start: [number, number] | null // [lng, lat]
  end: [number, number] // [lng, lat]
  recenterTick: number
}

type MapViewportControllerProps = {
  startLatLng: [number, number] | null
  endLatLng: [number, number]
  routeCoords: [number, number][]
  recenterTick: number
}

function MapViewportController({
  startLatLng,
  endLatLng,
  routeCoords,
  recenterTick,
}: MapViewportControllerProps) {
  const map = useMap()
  const startLat = startLatLng?.[0] ?? null
  const startLng = startLatLng?.[1] ?? null
  const endLat = endLatLng[0]
  const endLng = endLatLng[1]

  useEffect(() => {
    if (routeCoords.length > 1) {
      map.fitBounds(routeCoords, {
        padding: [56, 56],
        maxZoom: 16,
      })
      return
    }

    if (startLat !== null && startLng !== null) {
      map.flyTo([startLat, startLng], 15, { duration: 0.9 })
      return
    }

    map.flyTo([endLat, endLng], 15, { duration: 0.9 })
  }, [map, routeCoords, startLat, startLng, endLat, endLng])

  useEffect(() => {
    if (startLat === null || startLng === null || recenterTick === 0) return

    map.flyTo([startLat, startLng], Math.max(16, map.getZoom()), {
      duration: 0.8,
    })
  }, [map, recenterTick, startLat, startLng])

  return null
}

export default function RouteMap({
  start,
  end,
  recenterTick,
}: RouteMapProps) {
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startLatLng: [number, number] | null = start ? [start[1], start[0]] : null
  const endLatLng: [number, number] = [end[1], end[0]]

  const initialCenter: [number, number] = startLatLng
    ? [(startLatLng[0] + endLatLng[0]) / 2, (startLatLng[1] + endLatLng[1]) / 2]
    : endLatLng

  const userIcon = useMemo(
    () =>
      L.divIcon({
        className: 'connecta-user-marker-wrap',
        html: `
          <span class="connecta-user-marker-pulse"></span>
          <span class="connecta-user-marker-core"></span>
          <span class="connecta-user-marker-arrow"></span>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      }),
    []
  )

  const destinationIcon = useMemo(
    () =>
      L.divIcon({
        className: 'connecta-destination-marker-wrap',
        html: '<span class="connecta-destination-marker-core"></span>',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
    []
  )

  useEffect(() => {
    if (!start) {
      setRouteCoords([])
      setLoading(false)
      setError(null)
      return
    }

    async function fetchRoute() {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch('/api/route', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ start, end }),
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

        setRouteCoords(leafletCoords)
      } catch (err) {
        console.error(err)
        setError('Nao foi possivel carregar a rota.')
      } finally {
        setLoading(false)
      }
    }

    fetchRoute()
  }, [start, end])

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

        <MapViewportController
          startLatLng={startLatLng}
          endLatLng={endLatLng}
          routeCoords={routeCoords}
          recenterTick={recenterTick}
        />

        <Marker position={endLatLng} icon={destinationIcon}>
          <Popup>Destino</Popup>
        </Marker>

        {startLatLng && (
          <Marker position={startLatLng} icon={userIcon}>
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
        .connecta-user-marker-wrap,
        .connecta-destination-marker-wrap {
          background: transparent;
          border: 0;
        }

        .connecta-user-marker-pulse {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          background: rgba(40, 80, 184, 0.28);
          animation: connectaPulse 1.8s ease-out infinite;
        }

        .connecta-user-marker-core {
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

        .connecta-user-marker-arrow {
          position: absolute;
          left: 50%;
          top: -2px;
          width: 0;
          height: 0;
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-bottom: 9px solid #2850b8;
          transform: translateX(-50%);
          filter: drop-shadow(0 1px 1px rgba(15, 23, 42, 0.3));
        }

        .connecta-destination-marker-core {
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

        @keyframes connectaPulse {
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
