<script setup>
import { onMounted, onUnmounted, computed } from 'vue'
import { REGION } from './data/regions.js'
import { useTransitFeed } from './composables/useTransitFeed.js'

const feed = useTransitFeed()
const vehicles = feed.vehicles
const isLive = feed.isLive
const isRefreshing = feed.isRefreshing
const lastUpdated = feed.lastUpdated

const ago = computed(() => {
  if (!lastUpdated.value) return 'off'
  const s = Math.floor((Date.now() - lastUpdated.value.getTime()) / 1000)
  if (s < 8) return 'now'
  if (s < 60) return s + 's'
  return Math.floor(s / 60) + 'm'
})

let L = null
let map = null
let layer = null
let tick = null

function paint() {
  if (!map || !L || !layer) return
  layer.clearLayers()
  for (const v of vehicles.value.slice(0, 500)) {
    L.circleMarker([v.lat, v.lng], { radius: 6 }).addTo(layer).bindPopup(v.agencyName + ' ' + v.id)
  }
}

async function redo() { await feed.refresh('klang-valley'); paint() }

onMounted(async () => {
  const mod = await import('leaflet')
  L = mod.default || mod
  map = L.map('map').setView([REGION.lat, REGION.lng], REGION.zoom)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map)
  layer = L.layerGroup().addTo(map)
  await feed.refresh('klang-valley')
  paint()
  tick = setInterval(async () => { await feed.refresh('klang-valley'); paint() }, 30000)
})

onUnmounted(() => {
  clearInterval(tick)
  if (map) { map.remove(); map = null }
})
</script>

<template>
  <div style="position:relative;height:100dvh">
    <div id="map"></div>
    <div class="topbar">
      <strong>locateabus</strong>
      <span class="meta">{{ isLive ? 'live ' + ago : 'off' }} · {{ vehicles.length }}</span>
      <button @click="redo" :disabled="isRefreshing">{{ isRefreshing ? '…' : 'refresh' }}</button>
    </div>
  </div>
</template>
