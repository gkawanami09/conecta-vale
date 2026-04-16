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
  const [showLocationHint, setShowLocationHint] = useState(true)
  const [recenterTick, setRecenterTick] = useState(0)
  const [refreshTick, setRefreshTick] = useState(0)

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
      setError('Geolocalizacao nao e suportada neste navegador.')
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
        setShowLocationHint(false)
      },
      (geoError) => {
        console.error('Erro de geolocalizacao:', {
          code: geoError.code,
          message: geoError.message,
        })

        let friendlyMessage = 'Nao foi possivel obter sua localizacao.'

        if (geoError.code === 1) {
          friendlyMessage = 'Permissao de localizacao negada.'
        } else if (geoError.code === 2) {
          friendlyMessage = 'Localizacao indisponivel no momento.'
        } else if (geoError.code === 3) {
          friendlyMessage = 'Tempo esgotado ao tentar obter a localizacao.'
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

  function handleRecenter() {
    if (!start) return
    setRecenterTick((value) => value + 1)
  }

  function handleRefreshRoute() {
    if (!start) return
    setRefreshTick((value) => value + 1)
  }

  return (
    <section className='relative h-full w-full'>
      <RouteMap
        start={start}
        end={destination.end}
        recenterTick={recenterTick}
        refreshTick={refreshTick}
      />

      <div className='pointer-events-none absolute inset-0 z-[1100]'>
        <div className='pointer-events-auto absolute left-3 top-3 max-w-[78vw] rounded-2xl border border-white/70 bg-white/90 px-3.5 py-3 shadow-lg backdrop-blur sm:max-w-sm sm:px-4'>
          <div className='flex items-center gap-2'>
            <span
              className={`h-2.5 w-2.5 rounded-full ${start ? 'animate-pulse bg-emerald-500' : 'bg-amber-400'}`}
            />
            <p className='text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-900'>
              {start ? 'Rota ativa' : 'Aguardando GPS'}
            </p>
          </div>
          <h2 className='mt-1.5 truncate text-base font-semibold text-slate-900 sm:text-lg'>
            {destination.destName}
          </h2>
          {destination.usedFallback && (
            <p className='mt-1.5 text-xs font-medium text-amber-700'>
              Destino da URL invalido. Usando destino padrao.
            </p>
          )}
        </div>

        <div className='pointer-events-auto absolute bottom-4 right-3 flex flex-col gap-2 sm:right-4 sm:top-3 sm:bottom-auto'>
          <button
            onClick={handleUseMyLocation}
            disabled={loadingLocation}
            className='rounded-xl bg-emerald-800 px-4 py-2.5 text-xs font-semibold text-white shadow-lg transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-emerald-700 sm:text-sm'
          >
            {loadingLocation ? 'Obtendo GPS...' : 'Usar minha localizacao'}
          </button>

          <button
            onClick={handleRecenter}
            disabled={!start}
            className='rounded-xl border border-white/60 bg-white/90 px-4 py-2 text-xs font-semibold text-slate-800 shadow-md backdrop-blur transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45 sm:text-sm'
          >
            Centralizar
          </button>

          <button
            onClick={handleRefreshRoute}
            disabled={!start}
            className='rounded-xl border border-white/60 bg-white/90 px-4 py-2 text-xs font-semibold text-slate-800 shadow-md backdrop-blur transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45 sm:text-sm'
          >
            Atualizar rota
          </button>
        </div>

        {!start && showLocationHint && (
          <div className='pointer-events-auto absolute bottom-4 left-3 right-24 rounded-2xl border border-white/60 bg-white/92 px-3.5 py-3 shadow-xl backdrop-blur sm:left-4 sm:right-[180px] sm:max-w-md'>
            <div className='flex items-start justify-between gap-3'>
              <div>
                <p className='text-xs font-semibold uppercase tracking-[0.12em] text-emerald-900'>
                  Permissao de localizacao
                </p>
                <p className='mt-1 text-xs leading-relaxed text-slate-700 sm:text-sm'>
                  Ative sua localizacao para iniciar a navegacao operacional.
                </p>
              </div>
              <button
                onClick={() => setShowLocationHint(false)}
                className='rounded-md px-1.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                aria-label='Fechar aviso de localizacao'
              >
                x
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className='pointer-events-auto absolute bottom-28 left-3 right-3 rounded-xl border border-rose-200 bg-rose-50/95 px-3 py-2.5 text-xs font-medium text-rose-700 shadow-md sm:bottom-4 sm:left-1/2 sm:right-auto sm:w-[420px] sm:-translate-x-1/2 sm:text-sm'>
            {error}
          </div>
        )}
      </div>
    </section>
  )
}
