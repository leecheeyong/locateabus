<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { REGION } from './data/regions.js'
import { useTransitFeed } from './composables/useTransitFeed.js'
import SearchPanel from './components/SearchPanel.vue'
import VehicleSheet from './components/VehicleSheet.vue'

const feed = useTransitFeed()
const vehicles = feed.vehicles
const query = ref('')
const filter = ref('all')
const selected = ref(null)

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
      String(v.routeId || '').toLowerCase().includes(q) ||
      String(v.plate || '').toLowerCase().includes(q)
    )
  }
  return rows
})

let L = null
let map = null
let busLayer = null
let tick = null
let raf = 0

const BUS = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="4" width="14" height="12" rx="2"/><path d="M5 10h14M8 20v-4M16 20v-4"/></svg>'
const TRAIN = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="3" width="12" height="14" rx="2"/><path d="M6 10h12"/></svg>'

function paint() {
  if (!map || !L || !busLayer) return
  busLayer.clearLayers()
  for (const v of filtered.value.slice(0, 400)) {
    const on = selected.value && selected.value.id === v.id ? ' vm-on' : ''
    const cls = v.isTrain ? 'vm-train' : 'vm-bus'
    const icon = L.divIcon({
      html: '<div class="vm ' + cls + on + '">' + (v.isTrain ? TRAIN : BUS) + '</div>',
      className: '',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    })
    const m = L.marker([v.lat, v.lng], { icon, keyboard: false })
    m.on('click', () => { selected.value = v })
    m.addTo(busLayer)
  }
}

function soon() {
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(paint)
}

function pick(v) {
  selected.value = v
  if (map) map.flyTo([v.lat, v.lng], Math.max(map.getZoom(), 14), { duration: 0.6 })
  soon()
}

function follow() {
  if (selected.value && map) map.flyTo([selected.value.lat, selected.value.lng], 16, { duration: 0.6 })
}

watch([filter, filtered], soon)
watch(selected, soon)
watch(vehicles, (rows) => {
  if (!selected.value) return
  const fresh = rows.find((v) => v.id === selected.value.id && v.agencyId === selected.value.agencyId)
  if (fresh) selected.value = fresh
})

onMounted(async () => {
  const mod = await import('leaflet')
  L = mod.default || mod
  map = L.map('map').setView([REGION.lat, REGION.lng], REGION.zoom)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map)
  busLayer = L.layerGroup().addTo(map)
  map.on('moveend zoomend', soon)
  await feed.refresh('klang-valley')
  soon()
  tick = setInterval(async () => { await feed.refresh('klang-valley'); soon() }, 30000)
})

onUnmounted(() => {
  clearInterval(tick)
  cancelAnimationFrame(raf)
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
    <main class="mapwrap">
      <div id="map"></div>
      <VehicleSheet :vehicle="selected" @close="selected = null" @track="follow" />
    </main>
  </div>
</template>
