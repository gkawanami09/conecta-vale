'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

type RouteMapProps = {
  start: [number, number] // [lng, lat]
  end: [number, number]   // [lng, lat]
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
          throw new Error('Rota inválida recebida da API')
        }

        // ORS retorna [lng, lat], Leaflet usa [lat, lng]
        const leafletCoords: [number, number][] = coordinates.map(
          ([lng, lat]: [number, number]) => [lat, lng]
        )

        setRouteCoords(leafletCoords)
      } catch (err) {
        console.error(err)
        setError('Não foi possível carregar a rota.')
      } finally {
        setLoading(false)
      }
    }

    fetchRoute()
  }, [start, end])

  const center: [number, number] = [
    (start[1] + end[1]) / 2,
    (start[0] + end[0]) / 2,
  ]

  const startLatLng: [number, number] = [start[1], start[0]]
  const endLatLng: [number, number] = [end[1], end[0]]

  return (
    <div style={{ width: '100%', height: '100%' }}>
      {loading && <p>Carregando rota...</p>}
      {error && <p>{error}</p>}

      <MapContainer
        center={center}
        zoom={14}
        style={{ width: '100%', height: '600px', borderRadius: '16px' }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
        />

        <CircleMarker center={startLatLng} radius={8}>
          <Popup>Origem</Popup>
        </CircleMarker>

        <CircleMarker center={endLatLng} radius={8}>
          <Popup>Destino</Popup>
        </CircleMarker>

        {routeCoords.length > 0 && <Polyline positions={routeCoords} />}
      </MapContainer>
    </div>
  )
}