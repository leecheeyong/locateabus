export function haversineKm(aLat, aLng, bLat, bLng) {
    const R = 6371
    const dLat = ((bLat - aLat) * Math.PI) / 180
    const dLng = ((bLng - aLng) * Math.PI) / 180
    const s = Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
    return 2 * R * Math.asin(Math.sqrt(s))
}

export function formatDist(km) {
  if (!Number.isFinite(km)) return ''
  if (km < 1) return Math.round(km * 1000) + ' m'
  if (km < 10) return km.toFixed(1) + ' km'
  return Math.round(km) + ' km'
}