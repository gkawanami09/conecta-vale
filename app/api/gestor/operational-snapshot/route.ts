import { NextRequest, NextResponse } from 'next/server'
import { getManagerSessionFromRequest } from '@/lib/manager-auth'
import type { DashboardUser, OperationalSnapshot } from '@/lib/manager-dashboard-types'
import { listOperationalFixedPoints } from '@/lib/operational-fixed-points-store'
import { getActiveRoadBlocksGlobal } from '@/lib/road-blocks'
import { listSharedLocations } from '@/lib/shared-location-store'

function userDisplayName(user: {
  shareId: string
  name: string | null
  phone: string | null
}) {
  if (user.name) return user.name
  if (user.phone) {
    const suffix = user.phone.slice(-4)
    return `Usuário ${suffix}`
  }
  return `Usuário ${user.shareId.slice(0, 8)}`
}

function sortUsers(users: DashboardUser[]) {
  const rankByStatus: Record<DashboardUser['status'], number> = {
    active: 0,
    stale: 1,
    sharing_disabled: 2,
  }

  return [...users].sort((a, b) => {
    const rankDiff = rankByStatus[a.status] - rankByStatus[b.status]
    if (rankDiff !== 0) return rankDiff

    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
    if (aTime !== bTime) return bTime - aTime

    return a.name.localeCompare(b.name)
  })
}

export async function GET(request: NextRequest) {
  const session = getManagerSessionFromRequest(request)

  if (!session) {
    return NextResponse.json(
      { ok: false, error: 'Não autorizado' },
      { status: 401 }
    )
  }

  const sharedLocations = await listSharedLocations()
  const fixedPoints = await listOperationalFixedPoints()
  const roadBlocks = await getActiveRoadBlocksGlobal()

  const users = sortUsers(
    sharedLocations.map((item) => ({
      shareId: item.shareId,
      name: userDisplayName(item),
      phone: item.phone,
      status: item.status,
      sharingEnabled: item.sharingEnabled,
      lng: item.lng,
      lat: item.lat,
      accuracy: item.accuracy,
      heading: item.heading,
      lastSeenAt: item.lastSeenAt,
      updatedAt: item.updatedAt,
    }))
  )

  const activeUsers = users.filter((user) => user.status === 'active').length
  const staleUsers = users.filter((user) => user.status === 'stale').length
  const sharingEnabledUsers = users.filter((user) => user.sharingEnabled).length

  const lastUpdate = users
    .map((user) => user.updatedAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null

  const snapshot: OperationalSnapshot = {
    users,
    fixedPoints,
    roadBlocks,
    summary: {
      activeUsers,
      staleUsers,
      sharingEnabledUsers,
      fixedPoints: fixedPoints.length,
      activeRoadBlocks: roadBlocks.length,
      lastUpdate,
      operationalStatus:
        staleUsers > 0 || roadBlocks.length > 0 ? 'attention' : 'normal',
    },
  }

  return NextResponse.json({
    ok: true,
    snapshot,
  })
}
