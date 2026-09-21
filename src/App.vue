<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { REGION } from './data/regions.js'
import { useTransitFeed } from './composables/useTransitFeed.js'
import SearchPanel from './components/SearchPanel.vue'

const feed = useTransitFeed()
const vehicles = feed.vehicles

const query = ref('')
const filter = ref('all')

const counts = computed(() => ({
  all: vehicles.value.length,
  bus: vehicles.value.filter((v) => !v.isTrain).length,
  train: vehicles.value.filter((v) => v.isTrain).length,
}))

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  let rows = vehicles.value
  if (filter.value === 'bus') rows = rows.filter((v) => !v.isTrain)
  if (filter.value === 'train') rows = rows.filter((v) => v.isTrain)
  if (q) {
    rows = rows.filter((v) =>
      v.id.toLowerCase().includes(q) ||
      v.agencyName.toLowerCase().includes(q) ||
      String(v.tripId || '').toLowerCase().includes(q) ||
      String(v.routeId || '').toLowerCase().includes(q)
    )
  }
  return rows
})

let L = null
let map = null
let layer = null
let tick = null

function paint() {
  if (!map || !L || !layer) return
  layer.clearLayers()
  for (const v of filtered.value.slice(0, 400)) {
    L.circleMarker([v.lat, v.lng], { radius: 6 }).addTo(layer).bindPopup(v.id)
  }
}

function pick(v) {
  if (map) map.flyTo([v.lat, v.lng], Math.max(map.getZoom(), 14), { duration: 0.6 })
}

watch([filter, filtered], paint)

onMounted(async () => {
  const mod = await import('leaflet')
  L = mod.default || mod
  map = L.map('map').setView([REGION.lat, REGION.lng], REGION.zoom)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map)
  layer = L.layerGroup().addTo(map)
  map.on('moveend zoomend', paint)
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
  <div class="layout">
    <aside class="sidebar">
      <div style="padding:12px 12px 0"><strong>locateabus</strong> <span style="color:#78746a;font-size:12px">{{ counts.all }} live</span></div>
      <SearchPanel
        :query="query" :filter="filter" :vehicles="filtered" :counts="counts"
        @update:query="query = $event"
        @update:filter="filter = $event"
        @pick-vehicle="pick"
      />
    </aside>
    <main class="mapwrap"><div id="map"></div></main>
  </div>
</template>
