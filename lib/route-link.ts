export function buildRouteLink(destName: string, lng: number, lat: number) {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const params = new URLSearchParams({
    destLng: String(lng),
    destLat: String(lat),
    destName,
  })

  return `${baseUrl}/rota?${params.toString()}`
}