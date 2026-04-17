'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type LocationStatus =
  | 'idle'
  | 'requesting'
  | 'active'
  | 'denied'
  | 'error'
  | 'unsupported'

type Coordinates = [number, number] // [lng, lat]

type UseRealtimeLocationOptions = {
  autoStart?: boolean
  minUpdateMs?: number
  minDistanceMeters?: number
}

type RealtimeLocationState = {
  position: Coordinates | null
  heading: number | null
  accuracy: number | null
  status: LocationStatus
  error: string | null
  requestLocation: () => void
  stopLocation: () => void
}

const EARTH_RADIUS_METERS = 6371000

function distanceMeters(a: Coordinates, b: Coordinates) {
  const [lng1, lat1] = a
  const [lng2, lat2] = b

  const toRad = (value: number) => (value * Math.PI) / 180

  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const lat1Rad = toRad(lat1)
  const lat2Rad = toRad(lat2)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLng / 2) ** 2

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h))
}

function geoErrorToMessage(error: GeolocationPositionError) {
  if (error.code === 1) return 'Permissao de localizacao negada.'
  if (error.code === 2) return 'Localizacao indisponivel no momento.'
  if (error.code === 3) return 'Tempo esgotado ao obter localizacao.'
  return 'Nao foi possivel obter sua localizacao.'
}

export function useRealtimeLocation(
  options: UseRealtimeLocationOptions = {}
): RealtimeLocationState {
  const {
    autoStart = true,
    minUpdateMs = 1200,
    minDistanceMeters = 4,
  } = options

  const watchIdRef = useRef<number | null>(null)
  const lastUpdateRef = useRef<number>(0)
  const lastPositionRef = useRef<Coordinates | null>(null)

  const [position, setPosition] = useState<Coordinates | null>(null)
  const [heading, setHeading] = useState<number | null>(null)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [status, setStatus] = useState<LocationStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const stopLocation = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }, [])

  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unsupported')
      setError('Geolocalizacao nao e suportada neste navegador.')
      return
    }

    stopLocation()
    setError(null)
    setStatus('requesting')

    watchIdRef.current = navigator.geolocation.watchPosition(
      (geoPosition) => {
        const now = Date.now()
        const next: Coordinates = [
          geoPosition.coords.longitude,
          geoPosition.coords.latitude,
        ]
        const previous = lastPositionRef.current

        if (previous) {
          const elapsed = now - lastUpdateRef.current
          const moved = distanceMeters(previous, next)

          if (elapsed < minUpdateMs && moved < minDistanceMeters) {
            return
          }
        }

        lastUpdateRef.current = now
        lastPositionRef.current = next
        setPosition(next)
        setHeading(
          typeof geoPosition.coords.heading === 'number'
            ? geoPosition.coords.heading
            : null
        )
        setAccuracy(
          typeof geoPosition.coords.accuracy === 'number'
            ? geoPosition.coords.accuracy
            : null
        )
        setStatus('active')
        setError(null)
      },
      (geoError) => {
        const friendlyError = geoErrorToMessage(geoError)
        console.error('[location] watch_error', {
          code: geoError.code,
          message: geoError.message,
        })

        if (geoError.code === 1) {
          setStatus('denied')
        } else {
          setStatus('error')
        }

        setError(friendlyError)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 20000,
      }
    )
  }, [minDistanceMeters, minUpdateMs, stopLocation])

  useEffect(() => {
    if (!autoStart) return
    const timerId = window.setTimeout(() => {
      requestLocation()
    }, 0)

    return () => {
      window.clearTimeout(timerId)
      stopLocation()
    }
  }, [autoStart, requestLocation, stopLocation])

  return {
    position,
    heading,
    accuracy,
    status,
    error,
    requestLocation,
    stopLocation,
  }
}
