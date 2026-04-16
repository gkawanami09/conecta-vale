import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { start, end } = body

    if (
      !start ||
      !end ||
      !Array.isArray(start) ||
      !Array.isArray(end) ||
      start.length !== 2 ||
      end.length !== 2
    ) {
      return NextResponse.json(
        { error: 'Parâmetros start e end inválidos' },
        { status: 400 }
      )
    }

    const orsApiKey = process.env.ORS_API_KEY

    if (!orsApiKey) {
      return NextResponse.json(
        { error: 'ORS_API_KEY não configurada' },
        { status: 500 }
      )
    }

    const response = await fetch(
      'https://api.openrouteservice.org/v2/directions/driving-car/geojson',
      {
        method: 'POST',
        headers: {
          Authorization: orsApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          coordinates: [start, end],
        }),
      }
    )

    const data = await response.json()

    if (!response.ok) {
      console.error('Erro ORS:', data)
      return NextResponse.json(
        { error: 'Erro ao buscar rota no OpenRouteService', details: data },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Erro na API de rota:', error)
    return NextResponse.json(
      { error: 'Erro interno ao calcular rota' },
      { status: 500 }
    )
  }
}