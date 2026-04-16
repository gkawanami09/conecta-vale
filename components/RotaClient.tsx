'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'

const RouteMap = dynamic(() => import('@/components/RouteMap'), {
  ssr: false,
})

export default function RotaClient() {
  const searchParams = useSearchParams()

  const [start, setStart] = useState<[number, number] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingLocation, setLoadingLocation] = useState(false)

  const destination = useMemo(() => {
    const destLng = Number(searchParams.get('destLng'))
    const destLat = Number(searchParams.get('destLat'))
    const destName = searchParams.get('destName') || 'Destino operacional'

    const isValid =
      !Number.isNaN(destLng) &&
      !Number.isNaN(destLat) &&
      Math.abs(destLng) <= 180 &&
      Math.abs(destLat) <= 90

    return {
      end: isValid
        ? ([destLng, destLat] as [number, number])
        : ([-50.3348, -21.2826] as [number, number]),
      destName,
      usedFallback: !isValid,
    }
  }, [searchParams])

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setError('Geolocalização não é suportada neste navegador.')
      return
    }

    setLoadingLocation(true)
    setError(null)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lng = position.coords.longitude
        const lat = position.coords.latitude
        setStart([lng, lat])
        setLoadingLocation(false)
      },
      (geoError) => {
        console.error('Erro de geolocalização:', {
          code: geoError.code,
          message: geoError.message,
        })

        let friendlyMessage = 'Não foi possível obter sua localização.'

        if (geoError.code === 1) {
          friendlyMessage = 'Permissão de localização negada.'
        } else if (geoError.code === 2) {
          friendlyMessage = 'Localização indisponível no momento.'
        } else if (geoError.code === 3) {
          friendlyMessage = 'Tempo esgotado ao tentar obter a localização.'
        }

        setError(friendlyMessage)
        setLoadingLocation(false)
      },
      {
        enableHighAccuracy: false,
        timeout: 20000,
        maximumAge: 60000,
      }
    )
  }

  return (
    <div>
      <div style={{ marginBottom: '12px' }}>
        <strong>Destino:</strong> {destination.destName}
      </div>

      {destination.usedFallback && (
        <p style={{ marginBottom: '12px' }}>
          Destino da URL inválido ou ausente. Usando destino padrão.
        </p>
      )}

      <div
        style={{
          marginBottom: '16px',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={handleUseMyLocation}
          style={{
            padding: '10px 16px',
            borderRadius: '10px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {loadingLocation ? 'Obtendo localização...' : 'Usar minha localização'}
        </button>

        {error && <span>{error}</span>}
      </div>

      {!start ? (
        <p>Permita sua localização para gerar a rota até o destino.</p>
      ) : (
        <RouteMap start={start} end={destination.end} />
      )}
    </div>
  )
}