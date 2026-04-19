import { NextRequest, NextResponse } from 'next/server'
import {
  activatePointRoadBlockGlobal,
  activateRoadBlockGlobal,
  clearAllRoadBlocksGlobal,
  clearRoadBlockByIdGlobal,
  getActiveRoadBlocksGlobal,
} from '@/lib/road-blocks'
import { findMonitoredRoadById } from '@/lib/road-blocks-definitions'

function parseNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export async function GET() {
  const blocks = await getActiveRoadBlocksGlobal()
  return NextResponse.json({ ok: true, blocks }, { status: 200 })
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      mode?: 'road' | 'point'
      roadId?: string
      roadName?: string
      lng?: number
      lat?: number
      radiusMeters?: number
    }

    if (body.mode === 'road') {
      const roadId = body.roadId?.trim()
      if (!roadId) {
        return NextResponse.json(
          { ok: false, error: 'roadId obrigatório para bloqueio por via' },
          { status: 400 }
        )
      }

      const road = findMonitoredRoadById(roadId)
      if (!road) {
        return NextResponse.json(
          { ok: false, error: 'Via monitorada não encontrada' },
          { status: 400 }
        )
      }

      await activateRoadBlockGlobal({
        roadId: road.id,
        sourceType: 'manager_dashboard',
        sourceKeyword: 'manual_road_block',
      })
    } else {
      const lng = parseNumber(body.lng)
      const lat = parseNumber(body.lat)

      if (lng === null || lat === null) {
        return NextResponse.json(
          { ok: false, error: 'Coordenadas inválidas para bloqueio' },
          { status: 400 }
        )
      }

      await activatePointRoadBlockGlobal({
        lng,
        lat,
        radiusMeters: parseNumber(body.radiusMeters),
        roadName: body.roadName?.trim() || 'Bloqueio operacional manual',
        sourceType: 'manager_dashboard',
        sourceKeyword: 'manual_point_block',
      })
    }

    const blocks = await getActiveRoadBlocksGlobal()
    return NextResponse.json({ ok: true, blocks }, { status: 200 })
  } catch (error) {
    console.error('[api.gestor.road-blocks] post_error', error)

    const message =
      error instanceof Error
        ? error.message
        : 'Falha ao criar bloqueio operacional'

    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const roadId = request.nextUrl.searchParams.get('roadId')

    if (roadId?.trim()) {
      await clearRoadBlockByIdGlobal(roadId)
    } else {
      await clearAllRoadBlocksGlobal()
    }

    const blocks = await getActiveRoadBlocksGlobal()
    return NextResponse.json({ ok: true, blocks }, { status: 200 })
  } catch (error) {
    console.error('[api.gestor.road-blocks] delete_error', error)
    return NextResponse.json(
      { ok: false, error: 'Falha ao remover bloqueio operacional' },
      { status: 500 }
    )
  }
}
