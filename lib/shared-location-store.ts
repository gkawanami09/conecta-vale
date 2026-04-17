import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'

export type SharedLocationStatus = 'active' | 'stale' | 'sharing_disabled'

export type SharedLocationRecord = {
  shareId: string
  name: string | null
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

type SharedLocationUpsertInput = {
  shareId: string
  name?: string | null
  phone?: string | null
  status?: string | null
  sharingEnabled: boolean
  lng?: number | null
  lat?: number | null
  accuracy?: number | null
  heading?: number | null
}

type SharedLocationRow = {
  share_id: string
  name: string | null
  phone: string | null
  status: string | null
  sharing_enabled: boolean
  lng: number | null
  lat: number | null
  accuracy: number | null
  heading: number | null
  last_seen_at: string | null
  updated_at: string | null
}

const LOCAL_STALE_THRESHOLD_SECONDS = 45
const localFallbackStore = new Map<string, SharedLocationRecord>()

function sanitizeNumber(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function sanitizeString(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizePhone(phone: string | null | undefined) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  return digits || null
}

function toDashboardStatus(row: {
  status: string | null
  sharingEnabled: boolean
  lastSeenAt: string | null
}): SharedLocationStatus {
  if (!row.sharingEnabled || row.status === 'sharing_disabled') {
    return 'sharing_disabled'
  }

  if (!row.lastSeenAt) {
    return 'stale'
  }

  const secondsSinceLastUpdate = Math.floor((Date.now() - new Date(row.lastSeenAt).getTime()) / 1000)
  if (secondsSinceLastUpdate <= LOCAL_STALE_THRESHOLD_SECONDS) {
    return 'active'
  }

  return 'stale'
}

function rowToRecord(row: SharedLocationRow): SharedLocationRecord {
  const sharingEnabled = Boolean(row.sharing_enabled)

  return {
    shareId: row.share_id,
    name: row.name,
    phone: row.phone,
    status: toDashboardStatus({
      status: row.status,
      sharingEnabled,
      lastSeenAt: row.last_seen_at,
    }),
    sharingEnabled,
    lng: sanitizeNumber(row.lng),
    lat: sanitizeNumber(row.lat),
    accuracy: sanitizeNumber(row.accuracy),
    heading: sanitizeNumber(row.heading),
    lastSeenAt: row.last_seen_at,
    updatedAt: row.updated_at,
  }
}

function storeInFallback(record: SharedLocationRecord) {
  localFallbackStore.set(record.shareId, record)
}

function getFallbackRecords() {
  return Array.from(localFallbackStore.values())
}

export async function upsertSharedLocation(input: SharedLocationUpsertInput) {
  const nowIso = new Date().toISOString()

  const payload: SharedLocationRow = {
    share_id: input.shareId,
    name: sanitizeString(input.name),
    phone: normalizePhone(input.phone),
    status: sanitizeString(input.status) ?? (input.sharingEnabled ? 'active' : 'sharing_disabled'),
    sharing_enabled: input.sharingEnabled,
    lng: input.sharingEnabled ? sanitizeNumber(input.lng) : null,
    lat: input.sharingEnabled ? sanitizeNumber(input.lat) : null,
    accuracy: input.sharingEnabled ? sanitizeNumber(input.accuracy) : null,
    heading: input.sharingEnabled ? sanitizeNumber(input.heading) : null,
    last_seen_at: input.sharingEnabled ? nowIso : null,
    updated_at: nowIso,
  }

  const nextRecord = rowToRecord(payload)
  storeInFallback(nextRecord)

  const { error } = await supabaseAdmin
    .from('shared_locations')
    .upsert(payload, { onConflict: 'share_id' })

  if (error) {
    console.error('[shared-location] upsert_error', {
      shareId: input.shareId,
      error,
    })
  }

  return nextRecord
}

export async function listSharedLocations() {
  const { data, error } = await supabaseAdmin
    .from('shared_locations')
    .select('share_id, name, phone, status, sharing_enabled, lng, lat, accuracy, heading, last_seen_at, updated_at')
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[shared-location] list_error', error)
    return getFallbackRecords()
  }

  const supabaseRecords = ((data ?? []) as SharedLocationRow[]).map(rowToRecord)

  for (const record of supabaseRecords) {
    const localRecord = localFallbackStore.get(record.shareId)

    if (!localRecord || (localRecord.updatedAt ?? '') <= (record.updatedAt ?? '')) {
      localFallbackStore.set(record.shareId, record)
    }
  }

  return getFallbackRecords()
}
