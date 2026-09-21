import { ref } from 'vue'
import { AGENCIES } from '../data/regions.js'
import { cached } from './apiCache.js'

const TTL = 25000
const BOX = { minLat: 0.77, maxLat: 7.36, minLng: 99.6, maxLng: 119.4 }

function okPos(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (lat === 0 && lng === 0) return false
  return lat >= BOX.minLat && lat <= BOX.maxLat && lng >= BOX.minLng && lng <= BOX.maxLng
}

let feedMod = null
function decoder() {
  if (!feedMod) {
    feedMod = import('gtfs-realtime-bindings').then((m) => {
      const ns = m.transit_realtime || m.default?.transit_realtime
      const FM = m.FeedMessage || ns?.FeedMessage || m.default?.FeedMessage
      if (!FM || typeof FM.decode !== 'function') throw new Error('decoder missing')
      return FM
    })
  }
  return feedMod
}

function str(v) {
  if (v == null) return ''
  return String(v).trim()
}

export function useTransitFeed() {
  const vehicles = ref([])
  const isLive = ref(false)
  const isRefreshing = ref(false)
  const lastUpdated = ref(null)
  const feedError = ref(false)

  async function pullAgency(a) {
    const res = await fetch(a.url)
    if (!res.ok) throw new Error('bad ' + a.id)
    const buf = new Uint8Array(await res.arrayBuffer())
    const FM = await decoder()
    const feed = FM.decode(buf)
    const out = []
    for (const e of feed.entity || []) {
      const vp = e.vehicle
      const pos = vp?.position
      if (!pos) continue
      const lat = Number(pos.latitude)
      const lng = Number(pos.longitude)
      if (!okPos(lat, lng)) continue
      const vd = vp.vehicle || {}
      const td = vp.trip || {}
      const id = str(vd.label || vd.id)
      if (!id) continue
      out.push({
        id,
        agencyId: a.id,
        agencyName: a.name,
        isTrain: a.type === 'train',
        lat,
        lng,
        speed: pos.speed != null ? Math.round(Number(pos.speed)) : null,
        bearing: pos.bearing != null ? Math.round(Number(pos.bearing)) : null,
        tripId: str(td.tripId || td.trip_id),
        routeId: str(td.routeId || td.route_id),
      })
    }
    if (!out.length) throw new Error('none ' + a.id)
    return out
  }

  async function refresh(regionId = 'klang-valley') {
    if (isRefreshing.value) return false
    isRefreshing.value = true
    try {
      const list = AGENCIES.filter((a) => a.region === regionId)
      const res = await Promise.allSettled(list.map((a) => cached('gtfs:' + a.id, TTL, () => pullAgency(a))))
      const fresh = []
      for (const r of res) if (r.status === 'fulfilled') fresh.push(...r.value)
      if (!fresh.length) { feedError.value = true; return false }
      vehicles.value = fresh
      isLive.value = true
      feedError.value = false
      lastUpdated.value = new Date()
      return true
    } catch {
      feedError.value = true
      return false
    } finally {
      isRefreshing.value = false
    }
  }

  return { vehicles, isLive, isRefreshing, lastUpdated, feedError, refresh }
}
