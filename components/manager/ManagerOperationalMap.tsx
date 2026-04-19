'use client'

import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import type {
  DashboardUser,
  OperationalRoadBlock,
} from '@/lib/manager-dashboard-types'
import { managerUserStatusLabel } from '@/lib/manager-status'
import type { OperationalFixedPoint } from '@/lib/operational-fixed-points'
import { findMonitoredRoadById } from '@/lib/road-blocks-definitions'
import { MANAGER_SAO_LUIZ_INITIAL_VIEW } from '@/lib/manager-map-defaults'

type FocusTarget = {
  lat: number
  lng: number
  zoom?: number
}

export type OperationalEditMode = 'none' | 'add_block' | 'add_fixed_point'

type MapClickPoint = {
  lat: number
  lng: number
}

type BlockVisualPoint = {
  lat: number
  lng: number
}

type ManagerOperationalMapProps = {
  users: DashboardUser[]
  fixedPoints: OperationalFixedPoint[]
  roadBlocks: OperationalRoadBlock[]
  showUsers: boolean
  showFixedPoints: boolean
  showRoadBlocks: boolean
  focusTarget: FocusTarget | null
  focusSeq: number
  fitSeq: number
  editMode: OperationalEditMode
  previewPoint: MapClickPoint | null
  onMapPointSelect: (point: MapClickPoint) => void
}

function formatRelativeTime(value: string | null) {
  if (!value) return 'sem atualização'

  const seconds = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 1000)
  )

  if (seconds < 60) return `${seconds}s atrás`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min atrás`
  return `${Math.floor(seconds / 3600)}h atrás`
}

function getRoadBlockVisualPoint(monitoredRoadId: string | null): BlockVisualPoint | null {
  if (!monitoredRoadId) return null

  const road = findMonitoredRoadById(monitoredRoadId)
  if (!road || road.blockedSegment.length === 0) return null

  const totals = road.blockedSegment.reduce(
    (acc, point) => {
      acc.lat += point[0]
      acc.lng += point[1]
      return acc
    },
    { lat: 0, lng: 0 }
  )

  return {
    lat: totals.lat / road.blockedSegment.length,
    lng: totals.lng / road.blockedSegment.length,
  }
}

function getOperationalBlockVisualPoint(block: OperationalRoadBlock): BlockVisualPoint | null {
  if (
    block.blockType === 'point' &&
    typeof block.blockLat === 'number' &&
    typeof block.blockLng === 'number'
  ) {
    return {
      lat: block.blockLat,
      lng: block.blockLng,
    }
  }

  if (block.blockType === 'road') {
    return getRoadBlockVisualPoint(block.monitoredRoadId)
  }

  return null
}

function MapClickController({
  editMode,
  onMapPointSelect,
}: {
  editMode: OperationalEditMode
  onMapPointSelect: (point: MapClickPoint) => void
}) {
  useMapEvents({
    click(event) {
      if (editMode === 'none') return

      onMapPointSelect({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      })
    },
  })

  return null
}

function FitAndFocusController({
  users,
  fixedPoints,
  roadBlocks,
  showUsers,
  showFixedPoints,
  showRoadBlocks,
  focusTarget,
  focusSeq,
  fitSeq,
}: {
  users: DashboardUser[]
  fixedPoints: OperationalFixedPoint[]
  roadBlocks: OperationalRoadBlock[]
  showUsers: boolean
  showFixedPoints: boolean
  showRoadBlocks: boolean
  focusTarget: FocusTarget | null
  focusSeq: number
  fitSeq: number
}) {
  const map = useMap()
  const didInitialFitRef = useRef(false)

  const visibleUserPoints = useMemo(
    () =>
      users
        .filter(
          (user) => showUsers && user.sharingEnabled && user.lat !== null && user.lng !== null
        )
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

  const visibleBlockPoints = useMemo(
    () =>
      showRoadBlocks
        ? roadBlocks
            .map((block) => getOperationalBlockVisualPoint(block))
            .filter((point): point is BlockVisualPoint => point !== null)
            .map((point) => [point.lat, point.lng] as [number, number])
        : [],
    [roadBlocks, showRoadBlocks]
  )

  const allVisiblePoints = useMemo(
    () => [...visibleUserPoints, ...visibleFixedPoints, ...visibleBlockPoints],
    [visibleUserPoints, visibleFixedPoints, visibleBlockPoints]
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

function blockDisplayLabel(block: OperationalRoadBlock) {
  if (block.blockType === 'point') return 'Bloqueio por ponto'
  return 'Bloqueio de via monitorada'
}

export default function ManagerOperationalMap({
  users,
  fixedPoints,
  roadBlocks,
  showUsers,
  showFixedPoints,
  showRoadBlocks,
  focusTarget,
  focusSeq,
  fitSeq,
  editMode,
  previewPoint,
  onMapPointSelect,
}: ManagerOperationalMapProps) {
  const defaultCenter: [number, number] = [
    MANAGER_SAO_LUIZ_INITIAL_VIEW.lat,
    MANAGER_SAO_LUIZ_INITIAL_VIEW.lng,
  ]

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

  const customFixedPointIcon = useMemo(
    () =>
      L.divIcon({
        className: 'conecta-manager-fixed-custom-wrap',
        html: '<span class="conecta-manager-fixed-custom-core"></span>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
    []
  )

  const pointBlockIcon = useMemo(
    () =>
      L.divIcon({
        className: 'conecta-manager-block-wrap',
        html: '<span class="conecta-manager-block-core"></span>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    []
  )

  const previewBlockIcon = useMemo(
    () =>
      L.divIcon({
        className: 'conecta-manager-block-preview-wrap',
        html: '<span class="conecta-manager-block-preview-core"></span>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    []
  )

  const previewFixedPointIcon = useMemo(
    () =>
      L.divIcon({
        className: 'conecta-manager-fixed-preview-wrap',
        html: '<span class="conecta-manager-fixed-preview-core"></span>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
    []
  )

  const roadBlocksByRoad = useMemo(
    () =>
      roadBlocks.filter(
        (block) => block.blockType === 'road' && block.monitoredRoadId !== null
      ),
    [roadBlocks]
  )

  const pointBlocks = useMemo(
    () =>
      roadBlocks.filter(
        (block) =>
          block.blockType === 'point' &&
          block.blockLat !== null &&
          block.blockLng !== null
      ),
    [roadBlocks]
  )

  const roadBlocksAsMarkers = useMemo(
    () =>
      roadBlocksByRoad
        .map((block) => ({
          block,
          point: getRoadBlockVisualPoint(block.monitoredRoadId),
        }))
        .filter(
          (item): item is { block: OperationalRoadBlock; point: BlockVisualPoint } =>
            item.point !== null
        ),
    [roadBlocksByRoad]
  )

  return (
    <div className='h-full w-full'>
      <MapContainer
        center={defaultCenter}
        zoom={14}
        zoomControl={false}
        style={{
          width: '100%',
          height: '100%',
          cursor: editMode === 'none' ? 'grab' : 'crosshair',
        }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
        />

        <MapClickController editMode={editMode} onMapPointSelect={onMapPointSelect} />

        <FitAndFocusController
          users={users}
          fixedPoints={fixedPoints}
          roadBlocks={roadBlocks}
          showUsers={showUsers}
          showFixedPoints={showFixedPoints}
          showRoadBlocks={showRoadBlocks}
          focusTarget={focusTarget}
          focusSeq={focusSeq}
          fitSeq={fitSeq}
        />

        {showRoadBlocks &&
          roadBlocksAsMarkers.map(({ block, point }) => (
            <Marker
              key={block.roadId}
              position={[point.lat, point.lng]}
              icon={pointBlockIcon}
            >
              <Popup>
                <div className='space-y-1'>
                  <p className='text-sm font-semibold text-slate-900'>{block.roadName}</p>
                  <p className='text-xs text-slate-700'>{blockDisplayLabel(block)}</p>
                  <p className='text-xs text-slate-600'>
                    Atualizado: {formatRelativeTime(block.updatedAt)}
                  </p>
                </div>
              </Popup>
            </Marker>
          ))}

        {showRoadBlocks &&
          pointBlocks.map((block) => (
            <Marker
              key={block.roadId}
              position={[block.blockLat as number, block.blockLng as number]}
              icon={pointBlockIcon}
            >
              <Popup>
                <div className='space-y-1'>
                  <p className='text-sm font-semibold text-slate-900'>{block.roadName}</p>
                  <p className='text-xs text-slate-700'>
                    {blockDisplayLabel(block)}
                    {block.blockRadiusMeters ? ` (${block.blockRadiusMeters}m)` : ''}
                  </p>
                  <p className='text-xs text-slate-600'>
                    Atualizado: {formatRelativeTime(block.updatedAt)}
                  </p>
                </div>
              </Popup>
            </Marker>
          ))}

        {showFixedPoints &&
          fixedPoints.map((point) => (
            <Marker
              key={point.id}
              position={[point.lat, point.lng]}
              icon={point.source === 'custom' ? customFixedPointIcon : fixedPointIcon}
            >
              <Popup>
                <div className='space-y-1'>
                  <p className='text-sm font-semibold text-slate-900'>{point.name}</p>
                  <p className='text-xs text-slate-600'>
                    {point.kind === 'terminal' ? 'Terminal operacional' : 'Ponto estratégico'}
                    {point.source === 'custom' ? ' (gestor)' : ''}
                  </p>
                </div>
              </Popup>
            </Marker>
          ))}

        {showUsers &&
          users
            .filter(
              (user) => user.sharingEnabled && user.lat !== null && user.lng !== null
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
                        : 'Telefone não informado'}
                    </p>
                    <p className='text-xs text-slate-700'>
                      Status: {managerUserStatusLabel(user.status)}
                    </p>
                    <p className='text-xs text-slate-700'>
                      Última atualização: {formatRelativeTime(user.lastSeenAt)}
                    </p>
                  </div>
                </Popup>
              </Marker>
            ))}

        {previewPoint && editMode === 'add_block' && (
          <Marker
            position={[previewPoint.lat, previewPoint.lng]}
            icon={previewBlockIcon}
          >
            <Popup>
              <p className='text-xs text-slate-700'>Preview de bloqueio operacional</p>
            </Popup>
          </Marker>
        )}

        {previewPoint && editMode === 'add_fixed_point' && (
          <Marker
            position={[previewPoint.lat, previewPoint.lng]}
            icon={previewFixedPointIcon}
          >
            <Popup>
              <p className='text-xs text-slate-700'>Preview de ponto fixo</p>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      <style jsx global>{`
        .conecta-manager-user-active-wrap,
        .conecta-manager-user-stale-wrap,
        .conecta-manager-fixed-wrap,
        .conecta-manager-fixed-custom-wrap,
        .conecta-manager-fixed-preview-wrap,
        .conecta-manager-block-wrap,
        .conecta-manager-block-preview-wrap {
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

        .conecta-manager-fixed-core,
        .conecta-manager-fixed-custom-core,
        .conecta-manager-fixed-preview-core {
          position: absolute;
          inset: 0;
          border-radius: 5px;
          border: 2px solid #fff;
          box-shadow: 0 0 0 3px rgba(0, 99, 65, 0.32);
        }

        .conecta-manager-fixed-core {
          background: #006341;
        }

        .conecta-manager-fixed-custom-core {
          background: #059669;
        }

        .conecta-manager-fixed-preview-core {
          background: #16a34a;
          opacity: 0.55;
          box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.24);
        }

        .conecta-manager-block-core,
        .conecta-manager-block-preview-core {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          border: 2px solid #fff;
          box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.34);
          background: #ef4444;
        }

        .conecta-manager-block-core::before,
        .conecta-manager-block-core::after,
        .conecta-manager-block-preview-core::before,
        .conecta-manager-block-preview-core::after {
          content: '';
          position: absolute;
          left: 50%;
          top: 50%;
          width: 12px;
          height: 2px;
          background: #fff;
          transform-origin: center;
        }

        .conecta-manager-block-core::before,
        .conecta-manager-block-preview-core::before {
          transform: translate(-50%, -50%) rotate(45deg);
        }

        .conecta-manager-block-core::after,
        .conecta-manager-block-preview-core::after {
          transform: translate(-50%, -50%) rotate(-45deg);
        }

        .conecta-manager-block-preview-core {
          opacity: 0.6;
          box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2);
        }
      `}</style>
    </div>
  )
}
