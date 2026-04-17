import { OperationalFixedPoint } from '@/lib/operational-fixed-points'
import { SharedLocationStatus } from '@/lib/shared-location-store'

export type DashboardUser = {
  shareId: string
  name: string
  phone: string | null
  status: SharedLocationStatus
  sharingEnabled: boolean
  lng: number | null
  lat: number | null
  accuracy: number | null
  heading: number | null
  lastSeenAt: string | null
  updatedAt: string | null
}

export type OperationalSnapshot = {
  users: DashboardUser[]
  fixedPoints: OperationalFixedPoint[]
  roadBlocks: OperationalRoadBlock[]
  summary: {
    activeUsers: number
    staleUsers: number
    sharingEnabledUsers: number
    fixedPoints: number
    activeRoadBlocks: number
    lastUpdate: string | null
    operationalStatus: 'normal' | 'attention'
  }
}

export type OperationalRoadBlock = {
  roadId: string
  roadName: string
  blockType: 'road' | 'point'
  monitoredRoadId: string | null
  blockLng: number | null
  blockLat: number | null
  blockRadiusMeters: number | null
  blockedAt: string | null
  updatedAt: string | null
  sourcePhone: string | null
  sourceType: string | null
  sourceKeyword: string | null
  sourceMessage: string | null
}
