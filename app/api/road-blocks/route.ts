import { NextRequest, NextResponse } from 'next/server'
import {
  activateRoadBlockGlobal,
  clearRoadBlockByIdGlobal,
  clearAllRoadBlocksGlobal,
  clearRoadBlockGlobal,
  detectRoadBlockMessage,
  getActiveRoadBlocksGlobal,
} from '@/lib/road-blocks'
import { findMonitoredRoadById } from '@/lib/road-blocks-definitions'

export async function GET() {
  const blocks = await getActiveRoadBlocksGlobal()
  return NextResponse.json({ ok: true, blocks }, { status: 200 })
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      roadId?: string
      text?: string
      sourcePhone?: string
      sourceType?: string
    }

    let roadId: string | null = body.roadId ?? null
    let sourceKeyword: string | null = null
    let sourceMessage: string | null = null

    if (!roadId && body.text) {
      const detection = detectRoadBlockMessage(body.text)
      if (!detection) {
        return NextResponse.json(
          { ok: false, error: 'Mensagem nao reconhecida como bloqueio de via' },
          { status: 400 }
        )
      }
      roadId = detection.road.id
      sourceKeyword = detection.intentKey
      sourceMessage = body.text
    }

    if (!roadId) {
      return NextResponse.json(
        { ok: false, error: 'roadId ou text sao obrigatorios' },
        { status: 400 }
      )
    }

    const road = findMonitoredRoadById(roadId)
    if (!road) {
      return NextResponse.json(
        { ok: false, error: 'Via monitorada nao encontrada' },
        { status: 400 }
      )
    }

    await activateRoadBlockGlobal({
      roadId: road.id,
      sourcePhone: body.sourcePhone ?? null,
      sourceType: body.sourceType ?? 'simulation',
      sourceKeyword,
      sourceMessage,
    })

    const blocks = await getActiveRoadBlocksGlobal()
    return NextResponse.json({ ok: true, blocks }, { status: 200 })
  } catch (error) {
    console.error('[api.road-blocks] post_error', error)
    return NextResponse.json(
      { ok: false, error: 'Falha ao registrar bloqueio global' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const roadId = req.nextUrl.searchParams.get('roadId')

    if (roadId) {
      const road = findMonitoredRoadById(roadId)

      if (road) {
        await clearRoadBlockGlobal(road.id)
      } else {
        await clearRoadBlockByIdGlobal(roadId)
      }
    } else {
      await clearAllRoadBlocksGlobal()
    }

    const blocks = await getActiveRoadBlocksGlobal()
    return NextResponse.json({ ok: true, blocks }, { status: 200 })
  } catch (error) {
    console.error('[api.road-blocks] delete_error', error)
    return NextResponse.json(
      { ok: false, error: 'Falha ao limpar bloqueios globais' },
      { status: 500 }
    )
  }
}
