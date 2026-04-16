import { Suspense } from 'react'
import RotaClient from '@/components/RotaClient'

function RouteFallback() {
  return (
    <section className='relative h-full w-full overflow-hidden bg-[#e7eeea]'>
      <div className='absolute inset-0 animate-pulse bg-[linear-gradient(110deg,#e5ece8_10%,#f5faf7_45%,#e5ece8_80%)]' />
      <div className='absolute left-4 top-4 rounded-full border border-white/70 bg-white/90 px-3 py-1 text-xs font-semibold text-emerald-900 shadow-sm'>
        Carregando mapa operacional...
      </div>
    </section>
  )
}

export default function RotaPage() {
  return (
    <main className='relative h-screen w-screen overflow-hidden bg-[#eef4f1]'>
      <header className='absolute inset-x-0 top-0 z-[1200] h-14 border-b border-white/20 bg-[#03392a]/88 backdrop-blur'>
        <div className='mx-auto flex h-full w-full max-w-7xl items-center justify-between px-3 sm:px-4'>
          <div className='flex items-center gap-2'>
            <span className='rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-900'>
              Connecta Vale
            </span>
            <span className='rounded-full border border-emerald-200/50 bg-emerald-100/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-50'>
              Rota operacional
            </span>
          </div>
          <p className='hidden text-xs font-medium text-emerald-50/90 sm:block'>
            Navegacao e mobilidade em tempo real
          </p>
        </div>
      </header>

      <section className='h-full pt-14'>
        <Suspense fallback={<RouteFallback />}>
          <RotaClient />
        </Suspense>
      </section>
    </main>
  )
}
