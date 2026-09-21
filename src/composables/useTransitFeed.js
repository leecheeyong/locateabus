import { ref } from 'vue';
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