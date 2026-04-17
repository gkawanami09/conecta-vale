'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useRealtimeLocation, type LocationStatus } from '@/hooks/useRealtimeLocation'

const RouteMap = dynamic(() => import('@/components/RouteMap'), {
  ssr: false,
})

type RouteDeviationState = {
  isOffRoute: boolean
  distanceMeters: number | null
}

type ActiveBlock = {
  roadId: string
  roadName: string
  blockedAt: string | null
  updatedAt: string | null
  sourcePhone: string | null
  sourceType: string | null
  sourceKeyword: string | null
  sourceMessage: string | null
}

function statusLabel(status: LocationStatus) {
  if (status === 'active') return 'Localizacao ativa'
  if (status === 'requesting') return 'Solicitando permissao'
  if (status === 'denied') return 'Permissao negada'
  if (status === 'error') return 'Falha de localizacao'
  if (status === 'unsupported') return 'Sem suporte de GPS'
  return 'Aguardando localizacao'
}

function statusDotClass(status: LocationStatus) {
  if (status === 'active') return 'bg-[#2850B8] animate-pulse'
  if (status === 'requesting') return 'bg-[#70C8F8] animate-pulse'
  return 'bg-rose-400'
}

export default function RotaClient() {
  const searchParams = useSearchParams()

  const {
    position,
    heading,
    accuracy,
    status,
    error,
    requestLocation,
  } = useRealtimeLocation({
    autoStart: true,
    minUpdateMs: 1300,
    minDistanceMeters: 4,
  })

  const [showLocationHint, setShowLocationHint] = useState(true)
  const [recenterTick, setRecenterTick] = useState(0)
  const [isAutoFollow, setIsAutoFollow] = useState(true)
  const [deviation, setDeviation] = useState<RouteDeviationState>({
    isOffRoute: false,
    distanceMeters: null,
  })
  const [activeBlocks, setActiveBlocks] = useState<ActiveBlock[]>([])

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

  const blockedRoadIds = useMemo(
    () => activeBlocks.map((block) => block.roadId),
    [activeBlocks]
  )
  const blockedHash = blockedRoadIds.sort().join('|')
  const routeKey = `${destination.end[0]}:${destination.end[1]}:${blockedHash}`

  const loadBlocks = useCallback(async () => {
    try {
      const response = await fetch('/api/road-blocks', { cache: 'no-store' })
      const data = (await response.json()) as {
        ok: boolean
        blocks?: ActiveBlock[]
        error?: string
      }

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Falha ao carregar bloqueios')
      }

      setActiveBlocks(data.blocks ?? [])
    } catch (fetchError) {
      console.warn('[rota-client] load_blocks_warn', fetchError)
    }
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadBlocks()
    }, 15000)

    void loadBlocks()

    return () => {
      window.clearInterval(intervalId)
    }
  }, [loadBlocks])

  function handleRecenter() {
    if (!position) return
    setIsAutoFollow(true)
    setRecenterTick((value) => value + 1)
  }

  const currentError = error

  return (
    <section className='relative h-full w-full'>
      <RouteMap
        key={routeKey}
        currentPosition={position}
        end={destination.end}
        recenterTick={recenterTick}
        autoFollow={isAutoFollow}
        heading={heading}
        routeRefreshKey={blockedHash}
        onMapInteraction={() => setIsAutoFollow(false)}
        onRouteDeviationChange={setDeviation}
      />

      <div className='pointer-events-none absolute inset-0 z-[1100]'>
        <div className='pointer-events-auto absolute left-3 top-3 max-w-[82vw] rounded-2xl border border-white/70 bg-white/90 px-3.5 py-3 shadow-lg backdrop-blur sm:max-w-sm sm:px-4'>
          <div className='flex items-center gap-2'>
            <span className={`h-2.5 w-2.5 rounded-full ${statusDotClass(status)}`} />
            <p className='text-[11px] font-semibold uppercase tracking-[0.12em] text-[#384880]'>
              {statusLabel(status)}
            </p>
          </div>
          <h2 className='mt-1.5 truncate text-base font-semibold text-slate-900 sm:text-lg'>
            {destination.destName}
          </h2>
          {destination.usedFallback && (
            <p className='mt-1.5 text-xs font-medium text-[#3A5AB8]'>
              Destino da URL invalido. Usando destino padrao.
            </p>
          )}
          {typeof accuracy === 'number' && status === 'active' && (
            <p className='mt-1 text-[11px] text-slate-600'>
              Precisao GPS: {Math.round(accuracy)}m
            </p>
          )}
          {deviation.isOffRoute && deviation.distanceMeters !== null && (
            <p className='mt-1 text-[11px] font-medium text-amber-700'>
              Fora da rota por ~{Math.round(deviation.distanceMeters)}m (pronto para recalculo).
            </p>
          )}
        </div>

        <div className='pointer-events-auto absolute bottom-4 right-3 flex flex-col gap-2 sm:right-4 sm:top-3 sm:bottom-auto'>
          {status !== 'active' && (
            <button
              onClick={requestLocation}
              disabled={status === 'requesting'}
              className='rounded-xl bg-[#2850B8] px-4 py-2.5 text-xs font-semibold text-white shadow-lg transition hover:bg-[#2347A3] disabled:cursor-not-allowed disabled:bg-[#4A63B7] sm:text-sm'
            >
              {status === 'requesting'
                ? 'Solicitando GPS...'
                : 'Ativar localizacao'}
            </button>
          )}

          <button
            onClick={handleRecenter}
            disabled={!position}
            className='rounded-xl border border-white/60 bg-white/90 px-4 py-2 text-xs font-semibold text-slate-800 shadow-md backdrop-blur transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45 sm:text-sm'
          >
            Centralizar
          </button>
        </div>

        {!position && showLocationHint && !currentError && (
          <div className='pointer-events-auto absolute bottom-[174px] left-3 right-24 rounded-2xl border border-white/60 bg-white/92 px-3.5 py-3 shadow-xl backdrop-blur sm:left-4 sm:right-[180px] sm:max-w-md'>
            <div className='flex items-start justify-between gap-3'>
              <div>
                <p className='text-xs font-semibold uppercase tracking-[0.12em] text-[#384880]'>
                  Permissao de localizacao
                </p>
                <p className='mt-1 text-xs leading-relaxed text-slate-700 sm:text-sm'>
                  Permita o GPS para acompanhar sua posicao em tempo real no mapa.
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

        {currentError && (
          <div className='pointer-events-auto absolute bottom-28 left-3 right-3 rounded-xl border border-rose-200 bg-rose-50/95 px-3 py-2.5 text-xs font-medium text-rose-700 shadow-md sm:bottom-4 sm:left-1/2 sm:right-auto sm:w-[440px] sm:-translate-x-1/2 sm:text-sm'>
            {currentError}
          </div>
        )}
      </div>
    </section>
  )
}
