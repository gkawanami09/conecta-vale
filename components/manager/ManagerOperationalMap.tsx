'use client'

import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet'
import type { DashboardUser } from '@/lib/manager-dashboard-types'
import { managerUserStatusLabel } from '@/lib/manager-status'
import type { OperationalFixedPoint } from '@/lib/operational-fixed-points'

type FocusTarget = {
  lat: number
  lng: number
  zoom?: number
}

type ManagerOperationalMapProps = {
  users: DashboardUser[]
  fixedPoints: OperationalFixedPoint[]
  showUsers: boolean
  showFixedPoints: boolean
  focusTarget: FocusTarget | null
  focusSeq: number
  fitSeq: number
}

function formatRelativeTime(value: string | null) {
  if (!value) return 'sem atualizacao'

  const seconds = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 1000)
  )

  if (seconds < 60) return `${seconds}s atras`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min atras`
  return `${Math.floor(seconds / 3600)}h atras`
}

function FitAndFocusController({
  users,
  fixedPoints,
  showUsers,
  showFixedPoints,
  focusTarget,
  focusSeq,
  fitSeq,
}: {
  users: DashboardUser[]
  fixedPoints: OperationalFixedPoint[]
  showUsers: boolean
  showFixedPoints: boolean
  focusTarget: FocusTarget | null
  focusSeq: number
  fitSeq: number
}) {
  const map = useMap()
  const didInitialFitRef = useRef(false)

  const visibleUserPoints = useMemo(
    () =>
      users
        .filter((user) => showUsers && user.sharingEnabled && user.lat !== null && user.lng !== null)
        .map((user) => [user.lat as number, user.lng as number] as [number, number]),
    [users, showUsers]
  )

  const visibleFixedPoints = useMemo(
    () =>
      showFixedPoints
        ? fixedPoints.map((point) => [point.lat, point.lng] as [number, number])
        : [],
    [fixedPoints, showFixedPoints]
  )

  const allVisiblePoints = useMemo(
    () => [...visibleUserPoints, ...visibleFixedPoints],
    [visibleUserPoints, visibleFixedPoints]
  )

  useEffect(() => {
    if (didInitialFitRef.current) return

    if (allVisiblePoints.length > 0) {
      map.fitBounds(allVisiblePoints, {
        padding: [70, 70],
        maxZoom: 16,
      })
    }

    didInitialFitRef.current = true
  }, [allVisiblePoints, map])

  useEffect(() => {
    if (fitSeq === 0 || allVisiblePoints.length === 0) return

    map.fitBounds(allVisiblePoints, {
      padding: [70, 70],
      maxZoom: 16,
      animate: true,
    })
  }, [fitSeq, allVisiblePoints, map])

  useEffect(() => {
    if (!focusTarget || focusSeq === 0) return

    map.flyTo([focusTarget.lat, focusTarget.lng], focusTarget.zoom ?? 16, {
      duration: 0.8,
    })
  }, [focusTarget, focusSeq, map])

  return null
}

export default function ManagerOperationalMap({
  users,
  fixedPoints,
  showUsers,
  showFixedPoints,
  focusTarget,
  focusSeq,
  fitSeq,
}: ManagerOperationalMapProps) {
  const defaultCenter: [number, number] = [-21.2848, -50.336]

  const userIcons = useMemo(() => {
    return {
      active: L.divIcon({
        className: 'conecta-manager-user-active-wrap',
        html: '<span class="conecta-manager-user-active-core"></span>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
      stale: L.divIcon({
        className: 'conecta-manager-user-stale-wrap',
        html: '<span class="conecta-manager-user-stale-core"></span>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
    }
  }, [])

  const fixedPointIcon = useMemo(
    () =>
      L.divIcon({
        className: 'conecta-manager-fixed-wrap',
        html: '<span class="conecta-manager-fixed-core"></span>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
    []
  )

  return (
    <div className='h-full w-full'>
      <MapContainer
        center={defaultCenter}
        zoom={14}
        zoomControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
        />

        <FitAndFocusController
          users={users}
          fixedPoints={fixedPoints}
          showUsers={showUsers}
          showFixedPoints={showFixedPoints}
          focusTarget={focusTarget}
          focusSeq={focusSeq}
          fitSeq={fitSeq}
        />

        {showFixedPoints &&
          fixedPoints.map((point) => (
            <Marker
              key={point.id}
              position={[point.lat, point.lng]}
              icon={fixedPointIcon}
            >
              <Popup>
                <div className='space-y-1'>
                  <p className='text-sm font-semibold text-slate-900'>{point.name}</p>
                  <p className='text-xs text-slate-600'>
                    {point.kind === 'terminal' ? 'Terminal operacional' : 'Ponto estrategico'}
                  </p>
                </div>
              </Popup>
            </Marker>
          ))}

        {showUsers &&
          users
            .filter(
              (user) =>
                user.sharingEnabled &&
                user.lat !== null &&
                user.lng !== null
            )
            .map((user) => (
              <Marker
                key={user.shareId}
                position={[user.lat as number, user.lng as number]}
                icon={user.status === 'active' ? userIcons.active : userIcons.stale}
              >
                <Popup>
                  <div className='space-y-1'>
                    <p className='text-sm font-semibold text-slate-900'>{user.name}</p>
                    <p className='text-xs text-slate-700'>
                      {user.phone
                        ? `Telefone: ${user.phone}`
                        : 'Telefone nao informado'}
                    </p>
                    <p className='text-xs text-slate-700'>
                      Status: {managerUserStatusLabel(user.status)}
                    </p>
                    <p className='text-xs text-slate-700'>
                      Ultima atualizacao: {formatRelativeTime(user.lastSeenAt)}
                    </p>
                  </div>
                </Popup>
              </Marker>
            ))}
      </MapContainer>

      <style jsx global>{`
        .conecta-manager-user-active-wrap,
        .conecta-manager-user-stale-wrap,
        .conecta-manager-fixed-wrap {
          background: transparent;
          border: 0;
        }

        .conecta-manager-user-active-core,
        .conecta-manager-user-stale-core {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          border: 2px solid #fff;
          box-shadow: 0 0 0 2px rgba(15, 23, 42, 0.16);
        }

        .conecta-manager-user-active-core {
          background: #1d4ed8;
        }

        .conecta-manager-user-stale-core {
          background: #d97706;
        }

        .conecta-manager-fixed-core {
          position: absolute;
          inset: 0;
          border-radius: 5px;
          border: 2px solid #fff;
          background: #006341;
          box-shadow: 0 0 0 3px rgba(0, 99, 65, 0.32);
        }
      `}</style>
    </div>
  )
}
