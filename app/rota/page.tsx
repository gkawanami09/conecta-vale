import { Suspense } from 'react'
import RotaClient from '@/components/RotaClient'

function RotaPageFallback() {
  return (
    <section className='rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm'>
      <p className='text-sm font-medium text-emerald-700'>Carregando painel de rota...</p>
    </section>
  )
}

export default function RotaPage() {
  return (
    <main className='relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f4f8f6_0%,#fdfdfc_45%,#f7faf8_100%)]'>
      <div className='pointer-events-none absolute -left-24 top-[-64px] h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl' />
      <div className='pointer-events-none absolute -right-24 top-52 h-72 w-72 rounded-full bg-emerald-900/10 blur-3xl' />

      <div className='relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-10 pt-8 sm:px-6 lg:px-8 lg:pb-14 lg:pt-12'>
        <header className='rounded-3xl border border-emerald-100 bg-white/90 p-6 shadow-sm backdrop-blur md:p-8'>
          <span className='inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800'>
            Connecta Vale
          </span>
          <h1 className='mt-4 text-3xl font-semibold tracking-tight text-emerald-950 md:text-4xl'>
            Rota operacional em tempo real
          </h1>
          <p className='mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 md:text-base'>
            Compartilhe sua localizacao para montar o melhor trajeto ate o destino informado na mensagem.
          </p>
        </header>

        <Suspense fallback={<RotaPageFallback />}>
          <RotaClient />
        </Suspense>
      </div>
    </main>
  )
}
