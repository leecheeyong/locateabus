<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import { REGIONS } from "./data/regions.js";
import { useTransitFeed } from "./composables/useTransitFeed.js";
import {
  haversineKm,
  formatDist,
  formatAgo,
  getPosition,
  searchPlaces,
  fetchStops,
} from "./composables/useGeo.js";
import SearchPanel from "./components/SearchPanel.vue";
import VehicleSheet from "./components/VehicleSheet.vue";
import MapControls from "./components/MapControls.vue";
import { useBottomSheet } from "./composables/useBottomSheet.js";

function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

function okLL(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

function read(key, fb) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fb;
    const v = JSON.parse(raw);
    return v ?? fb;
  } catch {
    return fb;
  }
}

function write(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    return;
  }
}

const feed = useTransitFeed();
const vehicles = feed.vehicles;
const isLive = feed.isLive;
const isRefreshing = feed.isRefreshing;
const lastUpdated = feed.lastUpdated;
const feedError = feed.feedError;
const refresh = feed.refresh;

const regionId = ref(read("lab-region", "klang-valley"));
if (!REGIONS.some((r) => r.id === regionId.value))
  regionId.value = "klang-valley";
const region = computed(
  () => REGIONS.find((r) => r.id === regionId.value) || REGIONS[0],
);

const query = ref("");
const filter = ref("all");
const selected = ref(null);
const favorites = ref(read("lab-favs", []));
if (!Array.isArray(favorites.value)) favorites.value = [];
const userLoc = ref(null);
const locating = ref(false);
const places = ref([]);
const searchingPlaces = ref(false);
const stops = ref([]);
const stopsLoading = ref(false);
const stopsError = ref(false);
const notice = ref("");
const dark = ref(
  read("lab-theme", null) ??
    (window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"),
);
const mapError = ref("");

const sheetEl = ref(null);
const sheetGrip = ref(null);
const sheet = useBottomSheet(sheetEl, sheetGrip);

let noteT = null;
function notify(msg) {
  notice.value = msg;
  clearTimeout(noteT);
  noteT = setTimeout(() => {
    notice.value = "";
  }, 3000);
}

const counts = computed(() => ({
  all: vehicles.value.length,
  bus: vehicles.value.filter((v) => !v.isTrain).length,
  train: vehicles.value.filter((v) => v.isTrain).length,
}));

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  let rows = vehicles.value;
  if (filter.value === "bus") rows = rows.filter((v) => !v.isTrain);
  if (filter.value === "train") rows = rows.filter((v) => v.isTrain);
  if (q) {
    rows = rows.filter(
      (v) =>
        v.id.toLowerCase().includes(q) ||
        v.agencyName.toLowerCase().includes(q) ||
        String(v.tripId || "")
          .toLowerCase()
          .includes(q) ||
        String(v.routeId || "")
          .toLowerCase()
          .includes(q) ||
        String(v.plate || "")
          .toLowerCase()
          .includes(q),
    );
  }
  if (userLoc.value) {
    return rows
      .map((v) => ({
        ...v,
        _km: haversineKm(userLoc.value.lat, userLoc.value.lng, v.lat, v.lng),
      }))
      .sort((a, b) => a._km - b._km);
  }
  return rows;
});

const sortedStops = computed(() => {
  const c = userLoc.value || (map ? map.getCenter() : null);
  const rows = stops.value.map((s) => ({
    ...s,
    _km: c ? haversineKm(c.lat, c.lng, s.lat, s.lng) : 0,
  }));
  rows.sort((a, b) => a._km - b._km);
  return rows;
});

const selDist = computed(() => {
  if (!selected.value || !userLoc.value) return "";
  return formatDist(
    haversineKm(
      userLoc.value.lat,
      userLoc.value.lng,
      selected.value.lat,
      selected.value.lng,
    ),
  );
});

const cardShown = computed(
  () => !!selected.value && !(sheet.narrow && sheet.opened),
);

const agoText = computed(() => formatAgo(lastUpdated.value));
const favOn = computed(
  () => selected.value && favorites.value.includes(selected.value.id),
);
const statusWord = computed(() => {
  if (isLive.value) return "live " + agoText.value;
  if (counts.value.all) return "held " + agoText.value;
  return "off";
});

let L = null;
let map = null;
let busLayer = null;
let stopLayer = null;
let meLayer = null;
let pin = null;
let raf = 0;
let stopTimer = null;
let stopAt = null;
let stopCool = 0;
let tick = null;

const BUS =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="4" width="14" height="12" rx="2"/><path d="M5 10h14M8 20v-4M16 20v-4"/></svg>';
const TRAIN =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="3" width="12" height="14" rx="2"/><path d="M6 10h12"/></svg>';

const markerEls = new Map();

function keyOf(v) {
  return v.agencyId + "|" + v.id;
}

function sameAs(a, b) {
  return !!a && !!b && a.agencyId === b.agencyId && a.id === b.id;
}

function syncSel(was, now) {
  if (was) {
    const el = markerEls.get(keyOf(was));
    if (el) el.classList.remove("vm-on");
  }
  if (now) {
    const el = markerEls.get(keyOf(now));
    if (el) el.classList.add("vm-on");
  }
}

function selectVehicle(v) {
  if (!v) return;
  if (!sameAs(selected.value, v)) selected.value = v;
  if (sheet.narrow && sheet.opened) sheet.close();
}

function vehicleAt(px) {
  if (!map) return null;
  let hit = null;
  let best = 18; // px - roughly the icon itself, taps land on it
  for (const v of filtered.value) {
    if (!okLL(v.lat, v.lng)) continue;
    const p = map.latLngToContainerPoint([v.lat, v.lng]);
    const d = p.distanceTo(px);
    if (d < best) {
      best = d;
      hit = v;
    }
  }
  return hit;
}

function tileUrl() {
  return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
}

function tileAttr() {
  return "";
}

let tiles = null;
function setTiles() {
  if (!map || !L) return;
  if (tiles) map.removeLayer(tiles);
  tiles = L.tileLayer(tileUrl(), {
    maxZoom: 19,
    maxNativeZoom: 18,
    attribution: tileAttr(),
  });
  tiles.addTo(map);
}

function sizeFor(z) {
  if (z <= 9) return 0.15;
  if (z <= 11) return 0.06;
  if (z <= 13) return 0.025;
  return 0.012;
}

function paint() {
  if (!map || !L || !busLayer) return;
  busLayer.clearLayers();
  markerEls.clear();
  const b = map.getBounds().pad(0.1);
  const z = map.getZoom();
  const inView = filtered.value
    .filter((v) => okLL(v.lat, v.lng) && b.contains([v.lat, v.lng]))
    .slice(0, 400);
  if (z >= 15) {
    inView.forEach(addOne);
    return;
  }
  const s = sizeFor(z);
  const grid = new Map();
  for (const v of inView) {
    const k = Math.floor(v.lng / s) + "_" + Math.floor(v.lat / s);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(v);
  }
  for (const g of grid.values()) {
    if (g.length === 1) addOne(g[0]);
    else addBunch(g);
  }
}

function addOne(v) {
  const on =
    selected.value && keyOf(selected.value) === keyOf(v) ? " vm-on" : "";
  const cls = v.isTrain ? "vm-train" : "vm-bus";
  const icon = L.divIcon({
    html:
      '<div class="vm ' +
      cls +
      on +
      '">' +
      (v.isTrain ? TRAIN : BUS) +
      "</div>",
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
  const m = L.marker([v.lat, v.lng], { icon, keyboard: false });
  m.on("click", () => selectVehicle(v));
  m.addTo(busLayer);
  const el = m.getElement ? m.getElement() : m._icon;
  if (el) markerEls.set(keyOf(v), el);
}

function addBunch(g) {
  let la = 0;
  let ln = 0;
  for (const v of g) {
    la += v.lat;
    ln += v.lng;
  }
  la /= g.length;
  ln /= g.length;
  const icon = L.divIcon({
    html: '<div class="bunch">' + g.length + "</div>",
    className: "",
    iconSize: [44, 26],
    iconAnchor: [22, 13],
  });
  const m = L.marker([la, ln], { icon, keyboard: false });
  m.on("click", () =>
    map.flyTo([la, ln], Math.min(map.getZoom() + 2, 16), { duration: 0.6 }),
  );
  m.addTo(busLayer);
}

function paintStops() {
  if (!map || !L || !stopLayer) return;
  stopLayer.clearLayers();
  if (map.getZoom() < 14) return;
  for (const s of stops.value) {
    if (!okLL(s.lat, s.lng)) continue;
    const c = L.circleMarker([s.lat, s.lng], {
      radius: 5,
      color: "#c8501a",
      weight: 2,
      fillColor: "#fbfaf7",
      fillOpacity: 1,
    });
    c.bindTooltip(esc(s.name), {
      direction: "top",
      offset: [0, -6],
      className: "stop-tip",
    });
    c.on("click", () => openStop(s));
    c.addTo(stopLayer);
  }
}

function soon() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(paint);
}

async function loadStops() {
  if (!map || stopsLoading.value) return;
  if (Date.now() < stopCool) return;
  if (map.getZoom() < 14) {
    stops.value = [];
    paintStops();
    return;
  }
  const c = map.getCenter();
  if (
    stopAt &&
    haversineKm(stopAt.lat, stopAt.lng, c.lat, c.lng) < 1 &&
    stops.value.length
  )
    return;
  stopsLoading.value = true;
  stopsError.value = false;
  try {
    stops.value = await fetchStops(c.lat, c.lng);
    stopAt = { lat: c.lat, lng: c.lng };
    paintStops();
  } catch {
    stopsError.value = true;
    stopCool = Date.now() + 60000;
  } finally {
    stopsLoading.value = false;
  }
}

function soonStops() {
  clearTimeout(stopTimer);
  stopTimer = setTimeout(loadStops, 900);
}

function paintMe() {
  if (!map || !L || !userLoc.value) return;
  meLayer.clearLayers();
  L.circle([userLoc.value.lat, userLoc.value.lng], {
    radius: 70,
    color: "#c8501a",
    weight: 1,
    opacity: 0.5,
    fillOpacity: 0.07,
  }).addTo(meLayer);
  L.circleMarker([userLoc.value.lat, userLoc.value.lng], {
    radius: 6,
    color: "#fbfaf7",
    weight: 2,
    fillColor: "#c8501a",
    fillOpacity: 1,
  }).addTo(meLayer);
}

function dropPin(lat, lng) {
  if (!map || !L || !okLL(lat, lng)) return;
  if (pin) {
    map.removeLayer(pin);
    pin = null;
  }
  pin = L.marker([lat, lng], {
    icon: L.divIcon({
      html: '<div style="width:16px;height:16px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#1c1a15;border:2px solid #fbfaf7"></div>',
      className: "",
      iconSize: [16, 16],
      iconAnchor: [8, 14],
    }),
    keyboard: false,
  }).addTo(map);
}

function go(lat, lng, z = 15) {
  if (map && okLL(lat, lng)) map.flyTo([lat, lng], z, { duration: 0.8 });
}

async function redo() {
  const ok = await refresh(regionId.value, true);
  if (!ok && !vehicles.value.length)
    notify("Feed is down. Check connection and try again.");
  soon();
}

function setRegion(id) {
  if (!REGIONS.some((r) => r.id === id)) return;
  regionId.value = id;
  write("lab-region", id);
  selected.value = null;
  go(region.value.lat, region.value.lng, region.value.zoom);
  refresh(id, true);
  stopAt = null;
  setTimeout(loadStops, 900);
}

async function findMe() {
  if (locating.value) return;
  locating.value = true;
  try {
    const p = await getPosition();
    userLoc.value = p;
    paintMe();
    go(p.lat, p.lng, 15);
    stopAt = null;
    loadStops();
    notify("Set. List is now closest first.");
  } catch {
    notify("No location. Allow access in the browser.");
  } finally {
    locating.value = false;
  }
}

function pick(v) {
  selectVehicle(v);
  if (map) go(v.lat, v.lng, Math.max(map.getZoom(), 14));
}

function follow() {
  if (selected.value) go(selected.value.lat, selected.value.lng, 16);
}

function fav(v) {
  const id = v.id;
  favorites.value = favorites.value.includes(id)
    ? favorites.value.filter((f) => f !== id)
    : [...favorites.value, id];
  write("lab-favs", favorites.value);
}

function openStop(s) {
  if (!s || !okLL(s.lat, s.lng)) return;
  dropPin(s.lat, s.lng);
  if (map) go(s.lat, s.lng, Math.max(map.getZoom(), 15));
  sheet.close();
  notify(s.name || "Bus stop");
}

function openPlace(p) {
  if (!okLL(p.lat, p.lng)) return;
  places.value = [];
  query.value = "";
  dropPin(p.lat, p.lng);
  sheet.close();
  go(p.lat, p.lng, 15);
}

function flip() {
  dark.value = dark.value === "dark" ? "light" : "dark";
  useTheme();
}

function useTheme() {
  document.documentElement.classList.toggle("dark", dark.value === "dark");
  write("lab-theme", dark.value);
  setTiles();
}

let seq = 0;
watch(query, async (q) => {
  const my = ++seq;
  const word = q.trim().toLowerCase();
  if (word.length < 3) {
    places.value = [];
    searchingPlaces.value = false;
    return;
  }
  const busHit = vehicles.value.some(
    (v) =>
      v.id.toLowerCase().includes(word) ||
      v.agencyName.toLowerCase().includes(word) ||
      String(v.tripId || "")
        .toLowerCase()
        .includes(word) ||
      String(v.routeId || "")
        .toLowerCase()
        .includes(word) ||
      String(v.plate || "")
        .toLowerCase()
        .includes(word),
  );
  if (busHit) {
    places.value = [];
    searchingPlaces.value = false;
    return;
  }
  searchingPlaces.value = true;
  const rows = await searchPlaces(q);
  if (my !== seq) return;
  places.value = rows.filter((p) => okLL(p.lat, p.lng));
  searchingPlaces.value = false;
});

watch([filter, filtered], soon);
watch(favorites, (f) => write("lab-favs", f));
watch(selected, (now, was) => syncSel(was, now));
watch(dark, useTheme);
watch(vehicles, (rows) => {
  if (!selected.value) return;
  const fresh = rows.find(
    (v) => v.id === selected.value.id && v.agencyId === selected.value.agencyId,
  );
  if (fresh) selected.value = fresh;
});

onMounted(async () => {
  useTheme();
  try {
    const mod = await import("leaflet");
    L = mod.default || mod;
  } catch {
    mapError.value = "Map did not load. Reload when you are back online.";
    return;
  }
  map = L.map("map", {
    zoomControl: false,
    worldCopyJump: true,
    preferCanvas: true,
  }).setView([region.value.lat, region.value.lng], region.value.zoom);
  map.attributionControl.setPrefix(false);
  setTiles();
  busLayer = L.layerGroup().addTo(map);
  stopLayer = L.layerGroup().addTo(map);
  meLayer = L.layerGroup().addTo(map);
  map.on("moveend zoomend", () => {
    soon();
    soonStops();
  });
  map.on("click", (e) => {
    const t =
      e.originalEvent && (e.originalEvent.target || e.originalEvent.srcElement);
    const hit = t && t.closest ? t.closest(".leaflet-interactive") : null;
    if (hit) return;
    const v = vehicleAt(e.containerPoint);
    if (v) selectVehicle(v);
  });
  await refresh(regionId.value);
  if (feedError.value && !vehicles.value.length) sheet.open();
  soon();
  loadStops();
  tick = setInterval(() => {
    if (!document.hidden) refresh(regionId.value);
  }, 30000);
  window.addEventListener("resize", soon);
  await nextTick();
  setTimeout(() => map && map.invalidateSize(), 300);
});

onUnmounted(() => {
  clearInterval(tick);
  clearTimeout(stopTimer);
  cancelAnimationFrame(raf);
  window.removeEventListener("resize", soon);
  if (map) {
    map.remove();
    map = null;
  }
});
</script>

<template>
  <div
    class="flex h-dvh flex-col bg-paper text-ink dark:bg-night dark:text-[#ece8de]"
  >
    <header
      class="z-30 flex h-[58px] shrink-0 items-center gap-3 border-b border-line bg-cream px-3 dark:border-seam dark:bg-coal sm:px-4"
    >
      <div class="flex min-w-0 items-center gap-2.5">
        <div class="min-w-0 leading-none">
          <p class="truncate text-[15px] font-semibold tracking-tight">
            locateabus
          </p>
        </div>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <label class="sr-only" for="region">Area</label>
        <select
          id="region"
          :value="regionId"
          @change="setRegion($event.target.value)"
          class="h-9 max-w-[128px] truncate rounded-[10px] border border-line bg-cream px-2 font-mono text-[11px] outline-none focus:border-ink sm:max-w-none dark:border-seam dark:bg-coal dark:focus:border-smoke"
        >
          <option v-for="r in REGIONS" :key="r.id" :value="r.id">
            {{ r.name }}
          </option>
        </select>
        <button
          @click="sheet.toggle()"
          class="flex h-9 w-9 items-center justify-center rounded-[10px] border border-line text-fog md:hidden dark:border-seam dark:text-smoke"
          :aria-expanded="sheet.opened"
          aria-controls="side-sheet"
          aria-label="Open list"
        >
          <svg
            viewBox="0 0 24 24"
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M4 7h16M4 12h16M4 17h10" />
          </svg>
        </button>
      </div>
    </header>

    <div class="relative flex min-h-0 flex-1">
      <div
        v-if="sheet.opened"
        class="sheet-scrim md:hidden"
        @click="sheet.close()"
      ></div>

      <aside
        id="side-sheet"
        ref="sheetEl"
        :class="[
          'z-30 flex min-h-0 flex-col border-line bg-cream dark:border-seam dark:bg-coal',
          'max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:h-[88dvh] max-md:rounded-t-[18px] max-md:border-t max-md:pb-[env(safe-area-inset-bottom)] max-md:shadow-[0_-14px_32px_rgba(20,19,16,0.18)]',
          'md:static md:w-[300px] md:shrink-0 md:border-r lg:w-[360px]',
        ]"
      >
        <div
          ref="sheetGrip"
          class="sheet-grip md:hidden"
          @pointerdown="sheet.onPointerDown"
        >
          <div class="grab"></div>
          <button
            type="button"
            class="grip-row"
            :aria-expanded="sheet.opened"
            aria-controls="side-sheet"
            @click="sheet.onTap"
          >
            <span
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-ink text-cream dark:bg-[#ece8de] dark:text-night"
            >
              <svg
                viewBox="0 0 24 24"
                class="h-4 w-4"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M4 6h16M4 12h16M4 18h10" />
              </svg>
            </span>
            <span class="min-w-0 flex-1 leading-tight">
              <span
                class="block truncate text-[13px] font-medium text-ink dark:text-[#ece8de]"
                >Nearby</span
              >
              <span
                class="block truncate font-mono text-[10px] text-fog dark:text-smoke"
                >{{ counts.all }} on map · {{ statusWord }}</span
              >
            </span>
            <svg
              viewBox="0 0 24 24"
              class="grip-chev h-4 w-4 shrink-0 text-fog dark:text-smoke"
              :class="sheet.opened && 'rotate-180'"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="m6 15 6-6 6 6" />
            </svg>
          </button>
        </div>

        <div class="hidden items-center gap-2 px-4 pb-1 pt-3 md:flex">
          <p
            class="flex-1 font-mono text-[10px] uppercase tracking-[0.14em] text-fog dark:text-smoke"
          >
            Near you
          </p>
        </div>
        <SearchPanel
          :query="query"
          :filter="filter"
          :vehicles="filtered"
          :stops="sortedStops"
          :user-loc="userLoc"
          :favorites="favorites"
          :counts="counts"
          :places="places"
          :searching-places="searchingPlaces"
          :stops-loading="stopsLoading"
          :stops-error="stopsError"
          :feed-error="feedError"
          @update:query="query = $event"
          @update:filter="filter = $event"
          @pick-vehicle="pick"
          @pick-place="openPlace"
          @pick-stop="openStop"
          @toggle-fav="fav"
          @retry="redo"
        />
        <p
          class="shrink-0 border-t border-line px-4 py-2 text-center font-mono text-[10px] text-fog dark:border-seam dark:text-smoke"
        >
          data from data.gov.my / Made with ❤️ by Hack Clubber
        </p>
      </aside>

      <main class="relative min-w-0 flex-1">
        <div id="map" class="absolute inset-0 z-10"></div>
        <div
          v-if="mapError"
          class="absolute inset-0 z-20 flex items-center justify-center bg-paper p-6 text-center dark:bg-night"
        >
          <p class="max-w-[240px] text-[13px] leading-relaxed text-fog">
            {{ mapError }}
          </p>
        </div>

        <MapControls
          :refreshing="isRefreshing || locating"
          :dark="dark === 'dark'"
          @zoom-in="map && map.zoomIn()"
          @zoom-out="map && map.zoomOut()"
          @locate="findMe"
          @refresh="redo"
          @toggle-theme="flip"
        />

        <div
          class="absolute left-3 top-3 z-20 flex items-center gap-2 rounded-full border border-line bg-cream/95 py-1.5 pl-3 pr-3 font-mono text-[11px] text-ink backdrop-blur dark:border-seam dark:bg-coal/95 dark:text-[#ece8de]"
        >
          <span
            class="dot-live h-1.5 w-1.5 rounded-full"
            :class="isLive ? 'bg-moss' : counts.all ? 'bg-clay' : 'bg-fog'"
          ></span>
          <span>{{ statusWord }}</span>
          <span class="text-fog dark:text-smoke">{{ counts.all }} on map</span>
        </div>

        <VehicleSheet
          v-if="cardShown"
          :vehicle="selected"
          :distance="selDist"
          :is-fav="!!favOn"
          @close="selected = null"
          @track="follow"
          @toggle-fav="selected && fav(selected)"
        />

        <div
          v-if="notice"
          class="rise above-grip absolute bottom-5 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-4 py-2 text-[12px] text-cream dark:bg-[#ece8de] dark:text-night"
        >
          {{ notice }}
        </div>
      </main>
    </div>
  </div>
</template>
