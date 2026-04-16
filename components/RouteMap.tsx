'use client'

import { useEffect, useState } from 'react'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

type RouteMapProps = {
  start: [number, number] // [lng, lat]
  end: [number, number] // [lng, lat]
}

export default function RouteMap({ start, end }: RouteMapProps) {
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
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

  const center: [number, number] = [(start[1] + end[1]) / 2, (start[0] + end[0]) / 2]

  const startLatLng: [number, number] = [start[1], start[0]]
  const endLatLng: [number, number] = [end[1], end[0]]

  return (
    <div className='relative h-full w-full'>
      <MapContainer center={center} zoom={14} style={{ width: '100%', height: '100%' }}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
        />

        <CircleMarker
          center={startLatLng}
          radius={8}
          pathOptions={{
            color: '#065f46',
            fillColor: '#047857',
            fillOpacity: 0.95,
            weight: 2,
          }}
        >
          <Popup>Origem</Popup>
        </CircleMarker>

        <CircleMarker
          center={endLatLng}
          radius={8}
          pathOptions={{
            color: '#14532d',
            fillColor: '#16a34a',
            fillOpacity: 0.95,
            weight: 2,
          }}
        >
          <Popup>Destino</Popup>
        </CircleMarker>

        {routeCoords.length > 0 && (
          <Polyline
            positions={routeCoords}
            pathOptions={{
              color: '#065f46',
              weight: 5,
              opacity: 0.9,
            }}
          />
        )}
      </MapContainer>

      {loading && (
        <div className='pointer-events-none absolute left-3 top-3 rounded-full border border-emerald-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm'>
          Carregando rota...
        </div>
      )}

      {error && (
        <div className='pointer-events-none absolute bottom-3 left-3 right-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 shadow-sm'>
          {error}
        </div>
      )}
    </div>
  )
}
