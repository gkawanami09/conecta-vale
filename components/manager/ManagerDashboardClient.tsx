'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import type { DashboardUser, OperationalSnapshot } from '@/lib/manager-dashboard-types'

const ManagerOperationalMap = dynamic(
  () => import('@/components/manager/ManagerOperationalMap'),
  { ssr: false }
)

type ManagerDashboardClientProps = {
  managerEmail: string
}

type SnapshotResponse = {
  ok: boolean
  snapshot?: OperationalSnapshot
  error?: string
}

type FocusTarget = {
  lat: number
  lng: number
  zoom?: number
}

function statusClass(status: DashboardUser['status']) {
  if (status === 'active') return 'bg-emerald-500'
  if (status === 'stale') return 'bg-amber-500'
  return 'bg-slate-400'
}

function statusLabel(status: DashboardUser['status']) {
  if (status === 'active') return 'Ativo'
  if (status === 'stale') return 'Sem atualizacao recente'
  return 'Compartilhamento desativado'
}

function formatTime(value: string | null) {
  if (!value) return 'Sem atualizacao'
  return new Date(value).toLocaleString('pt-BR')
}

export default function ManagerDashboardClient({
  managerEmail,
}: ManagerDashboardClientProps) {
  const [snapshot, setSnapshot] = useState<OperationalSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showUsers, setShowUsers] = useState(true)
  const [showFixedPoints, setShowFixedPoints] = useState(true)
  const [showStaleUsers, setShowStaleUsers] = useState(true)
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null)
  const [focusSeq, setFocusSeq] = useState(0)
  const [fitSeq, setFitSeq] = useState(0)

  const loadSnapshot = useCallback(async () => {
    try {
      const response = await fetch('/api/gestor/operational-snapshot', {
        cache: 'no-store',
      })
      const data = (await response.json()) as SnapshotResponse

      if (!response.ok || !data.ok || !data.snapshot) {
        throw new Error(data.error || 'Falha ao carregar snapshot operacional')
      }

      setSnapshot(data.snapshot)
      setError(null)
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao atualizar painel operacional'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSnapshot()

    const intervalId = window.setInterval(() => {
      void loadSnapshot()
    }, 8000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [loadSnapshot])

  const filteredUsers = useMemo(() => {
    if (!snapshot) return [] as DashboardUser[]

    return snapshot.users.filter((user) => {
      if (user.status === 'stale' && !showStaleUsers) {
        return false
      }

      return true
    })
  }, [snapshot, showStaleUsers])

  async function handleLogout() {
    await fetch('/api/gestor/auth/logout', {
      method: 'POST',
    })

    window.location.href = '/gestor/login'
  }

  function focusUser(user: DashboardUser) {
    if (user.lat === null || user.lng === null) return

    setFocusTarget({
      lat: user.lat,
      lng: user.lng,
      zoom: 17,
    })
    setFocusSeq((value) => value + 1)
  }

  const usersOnMap = filteredUsers.filter(
    (user) =>
      user.sharingEnabled &&
      (showStaleUsers || user.status !== 'stale') &&
      user.lat !== null &&
      user.lng !== null
  )

  return (
    <main className='h-screen w-screen overflow-hidden bg-[#ebf1ed]'>
      <header className='flex h-14 items-center justify-between border-b border-white/40 bg-[#1d2e56] px-3 text-white shadow-sm sm:px-4'>
        <div className='min-w-0'>
          <p className='text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-100'>
            Conecta Vale
          </p>
          <p className='truncate text-sm font-semibold sm:text-base'>
            Dashboard operacional do gestor
          </p>
        </div>

        <div className='flex items-center gap-2'>
          <span className='hidden rounded-full border border-white/30 bg-white/10 px-2.5 py-1 text-xs text-white/90 sm:inline-flex'>
            {managerEmail}
          </span>
          <button
            onClick={handleLogout}
            className='rounded-lg border border-white/35 bg-white/12 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20'
          >
            Sair
          </button>
        </div>
      </header>

      <section className='grid h-[calc(100vh-56px)] grid-cols-1 lg:grid-cols-[1fr_340px]'>
        <div className='relative min-h-[320px]'>
          <ManagerOperationalMap
            users={filteredUsers}
            fixedPoints={snapshot?.fixedPoints ?? []}
            showUsers={showUsers}
            showFixedPoints={showFixedPoints}
            focusTarget={focusTarget}
            focusSeq={focusSeq}
            fitSeq={fitSeq}
          />

          <div className='absolute left-3 top-3 z-[1000] flex flex-wrap gap-2'>
            <button
              onClick={() => setFitSeq((value) => value + 1)}
              className='rounded-lg border border-white/60 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow'
            >
              Centralizar todos
            </button>
            <button
              onClick={() => setShowUsers((value) => !value)}
              className='rounded-lg border border-white/60 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow'
            >
              {showUsers ? 'Ocultar usuarios' : 'Mostrar usuarios'}
            </button>
            <button
              onClick={() => setShowFixedPoints((value) => !value)}
              className='rounded-lg border border-white/60 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow'
            >
              {showFixedPoints ? 'Ocultar pontos fixos' : 'Mostrar pontos fixos'}
            </button>
          </div>
        </div>

        <aside className='border-t border-white/40 bg-[#f8fbf9] lg:border-l lg:border-t-0'>
          <div className='h-full overflow-y-auto p-3 sm:p-4'>
            <div className='grid grid-cols-2 gap-2'>
              <div className='rounded-xl border border-emerald-200 bg-emerald-50 p-3'>
                <p className='text-[11px] uppercase tracking-[0.1em] text-emerald-700'>Ativos</p>
                <p className='mt-1 text-xl font-semibold text-emerald-900'>
                  {snapshot?.summary.activeUsers ?? 0}
                </p>
              </div>
              <div className='rounded-xl border border-amber-200 bg-amber-50 p-3'>
                <p className='text-[11px] uppercase tracking-[0.1em] text-amber-700'>Sem atualizacao</p>
                <p className='mt-1 text-xl font-semibold text-amber-900'>
                  {snapshot?.summary.staleUsers ?? 0}
                </p>
              </div>
              <div className='rounded-xl border border-sky-200 bg-sky-50 p-3'>
                <p className='text-[11px] uppercase tracking-[0.1em] text-sky-700'>Compartilhando</p>
                <p className='mt-1 text-xl font-semibold text-sky-900'>
                  {snapshot?.summary.sharingEnabledUsers ?? 0}
                </p>
              </div>
              <div className='rounded-xl border border-slate-200 bg-slate-50 p-3'>
                <p className='text-[11px] uppercase tracking-[0.1em] text-slate-700'>Pontos fixos</p>
                <p className='mt-1 text-xl font-semibold text-slate-900'>
                  {snapshot?.summary.fixedPoints ?? 0}
                </p>
              </div>
            </div>

            <div className='mt-4 rounded-xl border border-slate-200 bg-white p-3'>
              <p className='text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-600'>
                Status operacional
              </p>
              <p className='mt-1 text-sm font-semibold text-slate-900'>
                {snapshot?.summary.operationalStatus === 'attention'
                  ? 'Atencao: ha usuarios sem atualizacao recente'
                  : 'Normal'}
              </p>
              <p className='mt-2 text-xs text-slate-600'>
                Ultima atualizacao: {formatTime(snapshot?.summary.lastUpdate ?? null)}
              </p>
            </div>

            <div className='mt-4 flex items-center justify-between'>
              <p className='text-xs font-semibold uppercase tracking-[0.1em] text-slate-600'>
                Usuarios monitorados
              </p>
              <button
                onClick={() => setShowStaleUsers((value) => !value)}
                className='rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700'
              >
                {showStaleUsers ? 'Ocultar stale' : 'Mostrar stale'}
              </button>
            </div>

            <div className='mt-2 space-y-2'>
              {filteredUsers.length === 0 && (
                <p className='rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600'>
                  Nenhum usuario monitorado no momento.
                </p>
              )}

              {filteredUsers.map((user) => (
                <button
                  key={user.shareId}
                  onClick={() => focusUser(user)}
                  disabled={user.lat === null || user.lng === null}
                  className='block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-[#006341] disabled:cursor-not-allowed disabled:opacity-60'
                >
                  <div className='flex items-start justify-between gap-3'>
                    <div className='min-w-0'>
                      <p className='truncate text-sm font-semibold text-slate-900'>{user.name}</p>
                      <p className='truncate text-xs text-slate-600'>
                        {user.phone ? user.phone : 'Telefone nao informado'}
                      </p>
                    </div>
                    <span className={`mt-1 h-2.5 w-2.5 rounded-full ${statusClass(user.status)}`} />
                  </div>
                  <p className='mt-1 text-xs text-slate-700'>{statusLabel(user.status)}</p>
                  <p className='mt-0.5 text-[11px] text-slate-500'>
                    Atualizado: {formatTime(user.lastSeenAt)}
                  </p>
                </button>
              ))}
            </div>

            {(loading || error) && (
              <div className='mt-4 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs'>
                {loading ? 'Carregando dados operacionais...' : error}
              </div>
            )}

            <p className='mt-4 text-[11px] text-slate-500'>
              Marcadores no mapa: {usersOnMap.length} usuarios e {showFixedPoints ? snapshot?.fixedPoints.length ?? 0 : 0} pontos fixos.
            </p>
          </div>
        </aside>
      </section>
    </main>
  )
}
