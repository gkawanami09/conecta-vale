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

  const locationStatus = start
    ? 'Localizacao capturada com sucesso.'
    : 'Aguardando permissao para iniciar a rota.'

  return (
    <div className='space-y-6'>
      <section className='grid gap-4 lg:grid-cols-[1.4fr_1fr]'>
        <article className='rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm md:p-6'>
          <p className='text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700'>
            Destino da operacao
          </p>
          <h2 className='mt-2 text-2xl font-semibold text-slate-900'>{destination.destName}</h2>
          <p className='mt-2 text-sm leading-relaxed text-slate-600'>
            Compartilhe sua localizacao para abrir a rota com orientacao em tempo real.
          </p>

          {destination.usedFallback && (
            <div className='mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800'>
              Destino da URL invalido ou ausente. O sistema aplicou um destino padrao.
            </div>
          )}

          {error && (
            <div className='mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700'>
              {error}
            </div>
          )}

          <div className='mt-5 flex flex-col gap-3 sm:flex-row sm:items-center'>
            <button
              onClick={handleUseMyLocation}
              disabled={loadingLocation}
              className='inline-flex items-center justify-center rounded-xl bg-emerald-800 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-emerald-700'
            >
              {loadingLocation ? 'Obtendo localizacao...' : 'Usar minha localizacao'}
            </button>

            <span className='rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800'>
              {locationStatus}
            </span>
          </div>
        </article>

        <aside className='rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm md:p-6'>
          <p className='text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700'>
            Painel da viagem
          </p>
          <ul className='mt-4 space-y-3 text-sm text-slate-700'>
            <li className='rounded-xl bg-slate-50 px-3 py-2'>
              <span className='font-medium text-slate-900'>Status:</span>{' '}
              {start ? 'Rota pronta para consulta.' : 'Aguardando localizacao.'}
            </li>
            <li className='rounded-xl bg-slate-50 px-3 py-2'>
              <span className='font-medium text-slate-900'>Atualizacao:</span> em tempo real
            </li>
            <li className='rounded-xl bg-slate-50 px-3 py-2'>
              <span className='font-medium text-slate-900'>Origem:</span>{' '}
              {start ? `${start[1].toFixed(5)}, ${start[0].toFixed(5)}` : 'Nao definida'}
            </li>
          </ul>
        </aside>
      </section>

      <section className='rounded-3xl border border-emerald-100 bg-white p-4 shadow-sm sm:p-5 lg:p-6'>
        <div className='mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between'>
          <div>
            <h3 className='text-lg font-semibold text-slate-900 sm:text-xl'>Mapa da rota</h3>
            <p className='text-sm text-slate-600'>
              Visualizacao do trajeto entre sua origem e o destino selecionado.
            </p>
          </div>
          <span className='self-start rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 sm:self-auto'>
            OpenRouteService + OpenStreetMap
          </span>
        </div>

        <div className='overflow-hidden rounded-2xl border border-slate-200 bg-slate-100'>
          <div className='h-[320px] w-full sm:h-[420px] lg:h-[520px]'>
            {!start ? (
              <div className='flex h-full flex-col items-center justify-center gap-3 px-5 text-center'>
                <div className='rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-800'>
                  Pronto para iniciar
                </div>
                <p className='max-w-md text-sm text-slate-600'>
                  Toque em <strong>Usar minha localizacao</strong> para liberar o mapa com o trajeto.
                </p>
              </div>
            ) : (
              <RouteMap start={start} end={destination.end} />
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
