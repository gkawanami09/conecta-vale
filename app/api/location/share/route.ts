import { NextResponse } from 'next/server'
import { upsertSharedLocation } from '@/lib/shared-location-store'

type ShareLocationPayload = {
  shareId?: string
  name?: string | null
  phone?: string | null
  status?: string | null
  sharingEnabled?: boolean
  position?: {
    lng?: number
    lat?: number
    accuracy?: number | null
    heading?: number | null
  } | null
}

function normalizeShareId(payload: ShareLocationPayload) {
  if (typeof payload.shareId === 'string' && payload.shareId.trim().length > 0) {
    return payload.shareId.trim()
  }

  if (typeof payload.phone === 'string') {
    const digits = payload.phone.replace(/\D/g, '')
    if (digits.length > 0) {
      return `phone:${digits}`
    }
  }

  return null
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ShareLocationPayload
    const shareId = normalizeShareId(payload)

    if (!shareId) {
      return NextResponse.json(
        { ok: false, error: 'shareId ou phone são obrigatórios' },
        { status: 400 }
      )
    }

    const sharingEnabled = Boolean(payload.sharingEnabled)

    const record = await upsertSharedLocation({
      shareId,
      name: payload.name,
      phone: payload.phone,
      status: payload.status,
      sharingEnabled,
      lng: payload.position?.lng,
      lat: payload.position?.lat,
      accuracy: payload.position?.accuracy,
      heading: payload.position?.heading,
    })

    return NextResponse.json({
      ok: true,
      record,
    })
  } catch (error) {
    console.error('[api.location.share] post_error', error)
    return NextResponse.json(
      { ok: false, error: 'Falha ao atualizar localização compartilhada' },
      { status: 500 }
    )
  }
}
