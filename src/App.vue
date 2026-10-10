<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { REGIONS } from './data/regions.js'
import { useTransitFeed } from './composables/useTransitFeed.js'
import { haversineKm, formatDist, getPosition, searchPlaces, fetchStops } from './composables/useGeo.js'
import SearchPanel from './components/SearchPanel.vue'
import VehicleSheet from './components/VehicleSheet.vue'
import MapControls from './components/MapControls.vue'

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}
function okLL(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}
function read(key, fb) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fb
    return JSON.parse(raw) ?? fb
  } catch { return fb }
}
function write(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch { return }
}

const feed = useTransitFeed()
const vehicles = feed.vehicles
const isLive = feed.isLive
const isRefreshing = feed.isRefreshing
const lastUpdated = feed.lastUpdated

const regionId = ref(read('lab-region', 'klang-valley'))
if (!REGIONS.some((r) => r.id === regionId.value)) regionId.value = 'klang-valley'
const region = computed(() => REGIONS.find((r) => r.id === regionId.value) || REGIONS[0])
const query = ref('')
const filter = ref('all')
const selected = ref(null)
const userLoc = ref(null)
const locating = ref(false)
const places = ref([])
const searchingPlaces = ref(false)
const stops = ref([])
const stopsLoading = ref(false)
const stopsError = ref(false)
const notice = ref('')

let noteT = null
function notify(msg) {
  notice.value = msg
  clearTimeout(noteT)
  noteT = setTimeout(() => { notice.value = '' }, 3000)
}

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
  if (userLoc.value) {
    return rows
      .map((v) => ({ ...v, _km: haversineKm(userLoc.value.lat, userLoc.value.lng, v.lat, v.lng) }))
      .sort((a, b) => a._km - b._km)
  }
  return rows
})

const sortedStops = computed(() => {
  const c = userLoc.value || (map ? map.getCenter() : null)
  const rows = stops.value.map((s) => ({ ...s, _km: c ? haversineKm(c.lat, c.lng, s.lat, s.lng) : 0 }))
  rows.sort((a, b) => a._km - b._km)
  return rows
})

const agoText = computed(() => {
  if (!lastUpdated.value) return 'off'
  const s = Math.floor((Date.now() - lastUpdated.value.getTime()) / 1000)
  if (s < 8) return 'now'
  if (s < 60) return s + 's'
  return Math.floor(s / 60) + 'm'
})

let L = null
let map = null
let busLayer = null
let stopLayer = null
let meLayer = null
let pin = null
let raf = 0
let stopTimer = null
let stopAt = null
let tick = null

const BUS = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="4" width="14" height="12" rx="2"/><path d="M5 10h14M8 20v-4M16 20v-4"/></svg>'
const TRAIN = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="3" width="12" height="14" rx="2"/><path d="M6 10h12"/></svg>'

function tileUrl() {
  return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'
}
let tiles = null
function setTiles() {
  if (!map || !L) return
  if (tiles) map.removeLayer(tiles)
  tiles = L.tileLayer(tileUrl(), { maxZoom: 19, maxNativeZoom: 18, attribution: 'Tiles &copy; Esri' })
  tiles.addTo(map)
}

function sizeFor(z) {
  if (z <= 9) return 0.15
  if (z <= 11) return 0.06
  if (z <= 13) return 0.025
  return 0.012
}

function paint() {
  if (!map || !L || !busLayer) return
  busLayer.clearLayers()
  const b = map.getBounds().pad(0.1)
  const z = map.getZoom()
  const inView = filtered.value.filter((v) => okLL(v.lat, v.lng) && b.contains([v.lat, v.lng])).slice(0, 400)
  if (z >= 15) { inView.forEach(addOne); return }
  const s = sizeFor(z)
  const grid = new Map()
  for (const v of inView) {
    const k = Math.floor(v.lng / s) + '_' + Math.floor(v.lat / s)
    if (!grid.has(k)) grid.set(k, [])
    grid.get(k).push(v)
  }
  for (const g of grid.values()) {
    if (g.length === 1) addOne(g[0])
    else addBunch(g)
  }
}

function addOne(v) {
  const on = selected.value && selected.value.id === v.id ? ' vm-on' : ''
  const cls = v.isTrain ? 'vm-train' : 'vm-bus'
  const icon = L.divIcon({
    html: '<div class="vm ' + cls + on + '">' + (v.isTrain ? TRAIN : BUS) + '</div>',
    className: '', iconSize: [28, 28], iconAnchor: [14, 14],
  })
  const m = L.marker([v.lat, v.lng], { icon, keyboard: false })
  m.on('click', () => { selected.value = v })
  m.addTo(busLayer)
}

function addBunch(g) {
  let la = 0, ln = 0
  for (const v of g) { la += v.lat; ln += v.lng }
  la /= g.length; ln /= g.length
  const icon = L.divIcon({
    html: '<div class="bunch">' + g.length + '</div>',
    className: '', iconSize: [44, 26], iconAnchor: [22, 13],
  })
  const m = L.marker([la, ln], { icon, keyboard: false })
  m.on('click', () => map.flyTo([la, ln], Math.min(map.getZoom() + 2, 16), { duration: 0.6 }))
  m.addTo(busLayer)
}

function paintStops() {
  if (!map || !L || !stopLayer) return
  stopLayer.clearLayers()
  if (map.getZoom() < 14) return
  for (const s of stops.value) {
    if (!okLL(s.lat, s.lng)) continue
    const c = L.circleMarker([s.lat, s.lng], { radius: 5, color: '#c8501a', weight: 2, fillColor: '#fbfaf7', fillOpacity: 1 })
    c.bindTooltip(esc(s.name), { direction: 'top', offset: [0, -6], className: 'stop-tip' })
    c.on('click', () => openStop(s))
    c.addTo(stopLayer)
  }
}

function soon() { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint) }

async function loadStops() {
  if (!map || stopsLoading.value) return
  if (map.getZoom() < 14) { stops.value = []; paintStops(); return }
  const c = map.getCenter()
  if (stopAt && haversineKm(stopAt.lat, stopAt.lng, c.lat, c.lng) < 1 && stops.value.length) return
  stopsLoading.value = true
  stopsError.value = false
  try {
    stops.value = await fetchStops(c.lat, c.lng)
    stopAt = { lat: c.lat, lng: c.lng }
    paintStops()
  } catch {
    stopsError.value = true
  } finally {
    stopsLoading.value = false
  }
}

function soonStops() {
  clearTimeout(stopTimer)
  stopTimer = setTimeout(loadStops, 900)
}

function paintMe() {
  if (!map || !L || !userLoc.value) return
  meLayer.clearLayers()
  L.circle([userLoc.value.lat, userLoc.value.lng], { radius: 70, color: '#c8501a', weight: 1, opacity: 0.5, fillOpacity: 0.07 }).addTo(meLayer)
  L.circleMarker([userLoc.value.lat, userLoc.value.lng], { radius: 6, color: '#fbfaf7', weight: 2, fillColor: '#c8501a', fillOpacity: 1 }).addTo(meLayer)
}

function dropPin(lat, lng) {
  if (!map || !L || !okLL(lat, lng)) return
  if (pin) { map.removeLayer(pin); pin = null }
  pin = L.marker([lat, lng], {
    icon: L.divIcon({
      html: '<div style="width:16px;height:16px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#1c1a15;border:2px solid #fbfaf7"></div>',
      className: '', iconSize: [16, 16], iconAnchor: [8, 14],
    }),
    keyboard: false,
  }).addTo(map)
}

function go(lat, lng, z = 15) { if (map && okLL(lat, lng)) map.flyTo([lat, lng], z, { duration: 0.8 }) }
async function redo() { await feed.refresh(regionId.value); soon() }

function setRegion(id) {
  if (!REGIONS.some((r) => r.id === id)) return
  regionId.value = id
  write('lab-region', id)
  selected.value = null
  go(region.value.lat, region.value.lng, region.value.zoom)
  feed.refresh(id).then(soon)
  stopAt = null
  setTimeout(loadStops, 900)
}

async function findMe() {
  if (locating.value) return
  locating.value = true
  try {
    const p = await getPosition()
    userLoc.value = p
    paintMe()
    go(p.lat, p.lng, 15)
    stopAt = null
    loadStops()
    notify('Set. List is now closest first.')
  } catch {
    notify('No location. Allow access in the browser.')
  } finally {
    locating.value = false
  }
}

function pick(v) { selected.value = v; go(v.lat, v.lng, Math.max(map.getZoom(), 14)); soon() }
function follow() { if (selected.value) go(selected.value.lat, selected.value.lng, 16) }
function openStop(s) {
  if (!s || !okLL(s.lat, s.lng)) return
  dropPin(s.lat, s.lng)
  go(s.lat, s.lng, Math.max(map.getZoom(), 15))
  notify(s.name || 'Bus stop')
}
function openPlace(p) {
  if (!okLL(p.lat, p.lng)) return
  places.value = []
  query.value = ''
  dropPin(p.lat, p.lng)
  go(p.lat, p.lng, 15)
}

let seq = 0
watch(query, async (q) => {
  const my = ++seq
  const word = q.trim().toLowerCase()
  if (word.length < 3) { places.value = []; searchingPlaces.value = false; return }
  const busHit = vehicles.value.some((v) =>
    v.id.toLowerCase().includes(word) ||
    v.agencyName.toLowerCase().includes(word) ||
    String(v.tripId || '').toLowerCase().includes(word) ||
    String(v.routeId || '').toLowerCase().includes(word)
  )
  if (busHit) { places.value = []; searchingPlaces.value = false; return }
  searchingPlaces.value = true
  const rows = await searchPlaces(q)
  if (my !== seq) return
  places.value = rows.filter((p) => okLL(p.lat, p.lng))
  searchingPlaces.value = false
})

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
  map = L.map('map', { zoomControl: false, worldCopyJump: true, preferCanvas: true }).setView([region.value.lat, region.value.lng], region.value.zoom)
  map.attributionControl.setPrefix(false)
  setTiles()
  busLayer = L.layerGroup().addTo(map)
  stopLayer = L.layerGroup().addTo(map)
  meLayer = L.layerGroup().addTo(map)
  map.on('moveend zoomend', () => { soon(); soonStops() })
  await feed.refresh(regionId.value)
  soon()
  loadStops()
  tick = setInterval(() => { if (!document.hidden) feed.refresh(regionId.value).then(soon) }, 30000)
  window.addEventListener('resize', soon)
})

onUnmounted(() => {
  clearInterval(tick)
  clearTimeout(stopTimer)
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', soon)
  if (map) { map.remove(); map = null }
})
</script>

<template>
  <div class="flex h-dvh flex-col bg-paper text-ink">
    <header class="flex h-[58px] items-center gap-3 border-b border-line bg-cream px-4">
      <strong class="tracking-tight">locateabus</strong>
      <span class="font-mono text-[11px] text-fog">{{ isLive ? 'live ' + agoText : 'off' }} · {{ counts.all }}</span>
      <span style="flex:1"></span>
      <select :value="regionId" @change="setRegion($event.target.value)" class="h-9 rounded-[10px] border border-line bg-cream px-2 font-mono text-[11px]">
        <option v-for="r in REGIONS" :key="r.id" :value="r.id">{{ r.name }}</option>
      </select>
    </header>
    <div class="flex min-h-0 flex-1">
      <aside class="flex w-[300px] shrink-0 flex-col border-r border-line bg-cream">
        <SearchPanel
          :query="query" :filter="filter" :vehicles="filtered"
          :stops="sortedStops" :user-loc="userLoc"
          :counts="counts" :places="places" :searching-places="searchingPlaces"
          :stops-loading="stopsLoading" :stops-error="stopsError"
          @update:query="query = $event"
          @update:filter="filter = $event"
          @pick-vehicle="pick"
          @pick-place="openPlace"
          @pick-stop="openStop"
        />
      </aside>
      <main class="relative min-w-0 flex-1">
        <div id="map" class="absolute inset-0 z-10"></div>
        <MapControls
          :refreshing="isRefreshing || locating"
          @zoom-in="map && map.zoomIn()"
          @zoom-out="map && map.zoomOut()"
          @locate="findMe"
          @refresh="redo"
        />
        <VehicleSheet :vehicle="selected" @close="selected = null" @track="follow" />
        <div
          v-if="notice"
          class="rise absolute bottom-5 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-4 py-2 text-[12px] text-cream"
        >
          {{ notice }}
        </div>
      </main>
    </div>
  </div>
</template>