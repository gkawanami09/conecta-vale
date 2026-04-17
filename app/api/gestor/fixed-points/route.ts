import { NextRequest, NextResponse } from 'next/server'
import {
  createCustomOperationalFixedPoint,
  deactivateOperationalFixedPoint,
  listOperationalFixedPoints,
} from '@/lib/operational-fixed-points-store'

function parseNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export async function GET() {
  const fixedPoints = await listOperationalFixedPoints()
  return NextResponse.json({ ok: true, fixedPoints }, { status: 200 })
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      name?: string
      aliases?: string[]
      lng?: number
      lat?: number
      kind?: 'terminal' | 'operational'
    }

    const name = body.name?.trim() ?? ''
    const lng = parseNumber(body.lng)
    const lat = parseNumber(body.lat)

    if (!name || lng === null || lat === null) {
      return NextResponse.json(
        { ok: false, error: 'Nome e coordenadas validas sao obrigatorios' },
        { status: 400 }
      )
    }

    await createCustomOperationalFixedPoint({
      name,
      aliases: Array.isArray(body.aliases) ? body.aliases : [],
      lng,
      lat,
      kind: body.kind ?? 'operational',
      createdBy: 'manager_dashboard',
    })

    const fixedPoints = await listOperationalFixedPoints()
    return NextResponse.json({ ok: true, fixedPoints }, { status: 200 })
  } catch (error) {
    console.error('[api.gestor.fixed-points] post_error', error)

    return NextResponse.json(
      { ok: false, error: 'Falha ao criar ponto fixo operacional' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const pointId = request.nextUrl.searchParams.get('pointId')?.trim() ?? ''

    if (!pointId) {
      return NextResponse.json(
        { ok: false, error: 'pointId obrigatorio' },
        { status: 400 }
      )
    }

    await deactivateOperationalFixedPoint(pointId)

    const fixedPoints = await listOperationalFixedPoints()
    return NextResponse.json({ ok: true, fixedPoints }, { status: 200 })
  } catch (error) {
    console.error('[api.gestor.fixed-points] delete_error', error)

    return NextResponse.json(
      { ok: false, error: 'Falha ao remover ponto fixo operacional' },
      { status: 500 }
    )
  }
}
