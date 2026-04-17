'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import type {
  DashboardUser,
  OperationalRoadBlock,
  OperationalSnapshot,
} from '@/lib/manager-dashboard-types'
import {
  managerUserStatusClass,
  managerUserStatusLabel,
} from '@/lib/manager-status'
import type { OperationalEditMode } from '@/components/manager/ManagerOperationalMap'
import { findMonitoredRoadById } from '@/lib/road-blocks-definitions'

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

type MapClickPoint = {
  lat: number
  lng: number
}

function formatTime(value: string | null) {
  if (!value) return 'Sem atualizacao'
  return new Date(value).toLocaleString('pt-BR')
}

async function parseJsonSafely<T>(response: Response) {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}

export default function ManagerDashboardClient({
  managerEmail,
}: ManagerDashboardClientProps) {
  const [snapshot, setSnapshot] = useState<OperationalSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showUsers, setShowUsers] = useState(true)
  const [showFixedPoints, setShowFixedPoints] = useState(true)
  const [showRoadBlocks, setShowRoadBlocks] = useState(true)
  const [showStaleUsers, setShowStaleUsers] = useState(true)
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null)
  const [focusSeq, setFocusSeq] = useState(0)
  const [fitSeq, setFitSeq] = useState(0)

  const [editMode, setEditMode] = useState<OperationalEditMode>('none')
  const [previewPoint, setPreviewPoint] = useState<MapClickPoint | null>(null)
  const [pendingBlockName, setPendingBlockName] = useState('Bloqueio operacional manual')
  const [pendingBlockRadius, setPendingBlockRadius] = useState('90')
  const [pendingPointName, setPendingPointName] = useState('')
  const [pendingPointKind, setPendingPointKind] = useState<'terminal' | 'operational'>('operational')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

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

  const visibleRoadBlocks = useMemo(() => {
    if (!snapshot) return [] as OperationalRoadBlock[]
    return snapshot.roadBlocks
  }, [snapshot])

  async function handleLogout() {
    await fetch('/api/gestor/auth/logout', {
      method: 'POST',
    })

    window.location.href = '/gestor/login'
  }

  function focusCoordinates(lat: number, lng: number, zoom = 17) {
    setFocusTarget({ lat, lng, zoom })
    setFocusSeq((value) => value + 1)
  }

  function focusUser(user: DashboardUser) {
    if (user.lat === null || user.lng === null) return
    focusCoordinates(user.lat, user.lng)
  }

  function focusFixedPoint(lat: number, lng: number) {
    focusCoordinates(lat, lng)
  }

  function focusRoadBlock(block: OperationalRoadBlock) {
    if (block.blockLat !== null && block.blockLng !== null) {
      focusCoordinates(block.blockLat, block.blockLng)
      return
    }

    if (block.monitoredRoadId) {
      const road = findMonitoredRoadById(block.monitoredRoadId)
      if (!road || road.blockedSegment.length === 0) return
      const segmentMidpoint =
        road.blockedSegment[Math.floor(road.blockedSegment.length / 2)]

      focusCoordinates(segmentMidpoint[0], segmentMidpoint[1], 16)
    }
  }

  function startAddBlock() {
    setEditMode('add_block')
    setPreviewPoint(null)
    setActionError(null)
  }

  function startAddFixedPoint() {
    setEditMode('add_fixed_point')
    setPreviewPoint(null)
    setActionError(null)
  }

  function cancelEditAction() {
    setEditMode('none')
    setPreviewPoint(null)
    setActionError(null)
  }

  async function applyEditAction() {
    if (!previewPoint) {
      setActionError('Clique no mapa para posicionar antes de aplicar.')
      return
    }

    setActionLoading(true)
    setActionError(null)

    try {
      if (editMode === 'add_block') {
        const radiusMeters = Number(pendingBlockRadius)

        const response = await fetch('/api/gestor/road-blocks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            mode: 'point',
            roadName: pendingBlockName,
            lat: previewPoint.lat,
            lng: previewPoint.lng,
            radiusMeters: Number.isFinite(radiusMeters) ? radiusMeters : 90,
          }),
        })

        const data = await parseJsonSafely<{ ok?: boolean; error?: string }>(response)

        if (!response.ok || !data?.ok) {
          throw new Error(data?.error || 'Falha ao aplicar bloqueio')
        }
      }

      if (editMode === 'add_fixed_point') {
        const pointName = pendingPointName.trim()

        if (pointName.length < 2) {
          throw new Error('Informe o nome do ponto fixo para aplicar.')
        }

        const response = await fetch('/api/gestor/fixed-points', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: pointName,
            kind: pendingPointKind,
            lat: previewPoint.lat,
            lng: previewPoint.lng,
          }),
        })

        const data = await parseJsonSafely<{ ok?: boolean; error?: string }>(response)

        if (!response.ok || !data?.ok) {
          throw new Error(data?.error || 'Falha ao criar ponto fixo')
        }
      }

      await loadSnapshot()
      cancelEditAction()
      setPendingPointName('')
    } catch (applyError) {
      const message =
        applyError instanceof Error
          ? applyError.message
          : 'Falha ao aplicar alteracao operacional'

      setActionError(message)
    } finally {
      setActionLoading(false)
    }
  }

  async function removeRoadBlock(roadId: string) {
    setActionLoading(true)
    setActionError(null)

    try {
      const response = await fetch(
        `/api/gestor/road-blocks?roadId=${encodeURIComponent(roadId)}`,
        { method: 'DELETE' }
      )

      const data = await parseJsonSafely<{ ok?: boolean; error?: string }>(response)

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || 'Falha ao remover bloqueio')
      }

      await loadSnapshot()
    } catch (removeError) {
      const message =
        removeError instanceof Error
          ? removeError.message
          : 'Falha ao remover bloqueio'
      setActionError(message)
    } finally {
      setActionLoading(false)
    }
  }

  async function removeFixedPoint(pointId: string) {
    setActionLoading(true)
    setActionError(null)

    try {
      const response = await fetch(
        `/api/gestor/fixed-points?pointId=${encodeURIComponent(pointId)}`,
        { method: 'DELETE' }
      )

      const data = await parseJsonSafely<{ ok?: boolean; error?: string }>(response)

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || 'Falha ao remover ponto fixo')
      }

      await loadSnapshot()
    } catch (removeError) {
      const message =
        removeError instanceof Error
          ? removeError.message
          : 'Falha ao remover ponto fixo'
      setActionError(message)
    } finally {
      setActionLoading(false)
    }
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

      <section className='grid min-h-[calc(100vh-56px)] grid-cols-1 lg:h-[calc(100vh-56px)] lg:grid-cols-[1fr_360px] lg:overflow-hidden'>
        <div className='relative min-h-[320px] h-[46vh] lg:h-full'>
          <ManagerOperationalMap
            users={filteredUsers}
            fixedPoints={snapshot?.fixedPoints ?? []}
            roadBlocks={snapshot?.roadBlocks ?? []}
            showUsers={showUsers}
            showFixedPoints={showFixedPoints}
            showRoadBlocks={showRoadBlocks}
            focusTarget={focusTarget}
            focusSeq={focusSeq}
            fitSeq={fitSeq}
            editMode={editMode}
            previewPoint={previewPoint}
            onMapPointSelect={setPreviewPoint}
          />

          <div className='absolute left-3 top-3 z-[1000] flex max-w-[95%] flex-wrap gap-2'>
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
            <button
              onClick={() => setShowRoadBlocks((value) => !value)}
              className='rounded-lg border border-white/60 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow'
            >
              {showRoadBlocks ? 'Ocultar bloqueios' : 'Mostrar bloqueios'}
            </button>
          </div>

        </div>

        <aside className='border-t border-white/40 bg-[#f8fbf9] lg:h-full lg:overflow-y-auto lg:border-l lg:border-t-0'>
          <div className='p-3 sm:p-4'>
            <div className='mb-3 rounded-xl border border-slate-200 bg-white p-3'>
              <p className='text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-600'>
                AÇÕES OPERACIONAIS
              </p>
              <div className='mt-2 flex flex-wrap gap-2'>
                <button
                  onClick={startAddBlock}
                  className='rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-800'
                >
                  Adicionar bloqueio
                </button>
                <button
                  onClick={startAddFixedPoint}
                  className='rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800'
                >
                  Adicionar ponto fixo
                </button>
                <button
                  onClick={cancelEditAction}
                  disabled={editMode === 'none'}
                  className='rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60'
                >
                  Cancelar
                </button>
                <button
                  onClick={applyEditAction}
                  disabled={editMode === 'none' || actionLoading}
                  className='rounded-lg border border-[#006341] bg-[#006341] px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60'
                >
                  {actionLoading ? 'Aplicando...' : 'Aplicar'}
                </button>
              </div>
            </div>

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
                <p className='text-[11px] uppercase tracking-[0.1em] text-sky-700'>Pontos fixos</p>
                <p className='mt-1 text-xl font-semibold text-sky-900'>
                  {snapshot?.summary.fixedPoints ?? 0}
                </p>
              </div>
              <div className='rounded-xl border border-rose-200 bg-rose-50 p-3'>
                <p className='text-[11px] uppercase tracking-[0.1em] text-rose-700'>Bloqueios</p>
                <p className='mt-1 text-xl font-semibold text-rose-900'>
                  {snapshot?.summary.activeRoadBlocks ?? 0}
                </p>
              </div>
            </div>

            <div className='mt-4 rounded-xl border border-slate-200 bg-white p-3'>
              <p className='text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-600'>
                Status operacional
              </p>
              <p className='mt-1 text-sm font-semibold text-slate-900'>
                {snapshot?.summary.operationalStatus === 'attention'
                  ? 'Atencao: ha bloqueios ativos ou usuarios sem atualizacao recente'
                  : 'Normal'}
              </p>
              <p className='mt-2 text-xs text-slate-600'>
                Ultima atualizacao: {formatTime(snapshot?.summary.lastUpdate ?? null)}
              </p>
            </div>

            {editMode !== 'none' && (
              <div className='mt-4 rounded-xl border border-slate-200 bg-white p-3'>
                <p className='text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-600'>
                  {editMode === 'add_block'
                    ? 'Novo bloqueio operacional'
                    : 'Novo ponto fixo'}
                </p>

                <p className='mt-1 text-xs text-slate-700'>
                  Clique no mapa para posicionar o item e depois confirme em Aplicar.
                </p>

                {previewPoint ? (
                  <p className='mt-2 text-xs text-slate-600'>
                    Preview: lat {previewPoint.lat.toFixed(6)} | lng {previewPoint.lng.toFixed(6)}
                  </p>
                ) : (
                  <p className='mt-2 text-xs text-amber-700'>
                    Aguardando clique no mapa para gerar preview.
                  </p>
                )}

                {editMode === 'add_block' && (
                  <div className='mt-2 space-y-2'>
                    <input
                      value={pendingBlockName}
                      onChange={(event) => setPendingBlockName(event.target.value)}
                      className='w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-800'
                      placeholder='Nome do bloqueio'
                    />
                    <input
                      value={pendingBlockRadius}
                      onChange={(event) => setPendingBlockRadius(event.target.value)}
                      className='w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-800'
                      placeholder='Raio em metros (ex: 90)'
                    />
                  </div>
                )}

                {editMode === 'add_fixed_point' && (
                  <div className='mt-2 space-y-2'>
                    <input
                      value={pendingPointName}
                      onChange={(event) => setPendingPointName(event.target.value)}
                      className='w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-800'
                      placeholder='Nome do ponto fixo (ex: Sede Administrativa)'
                    />
                    <select
                      value={pendingPointKind}
                      onChange={(event) =>
                        setPendingPointKind(event.target.value as 'terminal' | 'operational')
                      }
                      className='w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-800'
                    >
                      <option value='operational'>Ponto operacional</option>
                      <option value='terminal'>Terminal</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            {actionError && (
              <div className='mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700'>
                {actionError}
              </div>
            )}

            <div className='mt-4'>
              <p className='text-xs font-semibold uppercase tracking-[0.1em] text-slate-600'>
                Bloqueios ativos
              </p>
              <div className='mt-2 space-y-2'>
                {visibleRoadBlocks.length === 0 && (
                  <p className='rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600'>
                    Nenhum bloqueio operacional ativo.
                  </p>
                )}

                {visibleRoadBlocks.map((block) => (
                  <div
                    key={block.roadId}
                    className='rounded-xl border border-slate-200 bg-white px-3 py-2'
                  >
                    <button
                      onClick={() => focusRoadBlock(block)}
                      className='w-full text-left'
                    >
                      <p className='truncate text-sm font-semibold text-slate-900'>
                        {block.roadName}
                      </p>
                      <p className='text-xs text-slate-600'>
                        {block.blockType === 'point'
                          ? `Bloqueio por ponto${block.blockRadiusMeters ? ` (${block.blockRadiusMeters}m)` : ''}`
                          : 'Bloqueio de via monitorada'}
                      </p>
                      <p className='text-[11px] text-slate-500'>
                        Atualizado: {formatTime(block.updatedAt)}
                      </p>
                    </button>
                    <button
                      type='button'
                      onClick={(event) => {
                        event.stopPropagation()
                        void removeRoadBlock(block.roadId)
                      }}
                      className='mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700'
                    >
                      Remover bloqueio
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className='mt-4'>
              <p className='text-xs font-semibold uppercase tracking-[0.1em] text-slate-600'>
                Pontos fixos
              </p>
              <div className='mt-2 space-y-2'>
                {(snapshot?.fixedPoints ?? []).map((point) => (
                  <div
                    key={point.id}
                    className='rounded-xl border border-slate-200 bg-white px-3 py-2'
                  >
                    <button
                      onClick={() => focusFixedPoint(point.lat, point.lng)}
                      className='w-full text-left'
                    >
                      <p className='truncate text-sm font-semibold text-slate-900'>
                        {point.name}
                      </p>
                      <p className='text-xs text-slate-600'>
                        {point.source === 'custom' ? 'Criado pelo gestor' : 'Ponto base do sistema'}
                      </p>
                    </button>
                    {point.source === 'custom' && (
                      <button
                        type='button'
                        onClick={(event) => {
                          event.stopPropagation()
                          void removeFixedPoint(point.id)
                        }}
                        className='mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800'
                      >
                        Remover ponto
                      </button>
                    )}
                  </div>
                ))}
              </div>
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
                    <span className={`mt-1 h-2.5 w-2.5 rounded-full ${managerUserStatusClass(user.status)}`} />
                  </div>
                  <p className='mt-1 text-xs text-slate-700'>{managerUserStatusLabel(user.status)}</p>
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
              Marcadores no mapa: {usersOnMap.length} usuarios,{' '}
              {showFixedPoints ? snapshot?.fixedPoints.length ?? 0 : 0} pontos fixos e{' '}
              {showRoadBlocks ? snapshot?.roadBlocks.length ?? 0 : 0} bloqueios.
            </p>
          </div>
        </aside>
      </section>
    </main>
  )
}
