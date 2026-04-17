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
  summary: {
    activeUsers: number
    staleUsers: number
    sharingEnabledUsers: number
    fixedPoints: number
    lastUpdate: string | null
    operationalStatus: 'normal' | 'attention'
  }
}
