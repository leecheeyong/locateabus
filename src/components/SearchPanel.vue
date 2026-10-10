<script setup>
import { ref, watch } from 'vue'
import { formatDist } from '../composables/useGeo.js'

const props = defineProps({
  query: String,
  filter: String,
  vehicles: Array,
  stops: Array,
  userLoc: Object,
  counts: Object,
  places: Array,
  searchingPlaces: Boolean,
  stopsLoading: Boolean,
  stopsError: Boolean,
})

const emit = defineEmits([
  'update:query', 'update:filter',
  'pick-vehicle', 'pick-place', 'pick-stop',
])

const limit = ref(40)
watch(() => [props.query, props.filter], () => { limit.value = 40 })

function far(v) {
  if (!props.userLoc) return ''
  return formatDist(v._km ?? 0)
}

function sub(v) {
  const bits = [v.agencyName]
  if (v.routeId) bits.push('route ' + v.routeId)
  bits.push((v.speed ?? '-') + ' km/h')
  return bits.join(' · ')
}

function stopMeta(s) {
  const bits = []
  if (s.ref) bits.push(s.ref)
  if (s.shelter) bits.push('shelter')
  else if (s.bench) bits.push('bench')
  if (props.userLoc) bits.push(formatDist(s._km))
  return bits.join(' · ')
}

const tabs = [
  { id: 'all', label: 'All' },
  { id: 'bus', label: 'Bus' },
  { id: 'train', label: 'Train' },
  { id: 'stops', label: 'Stops' },
]

function nFor(id) {
  if (!props.counts) return ''
  if (id === 'all') return props.counts.all
  if (id === 'bus') return props.counts.bus
  if (id === 'train') return props.counts.train
  return props.stops.length
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="px-4 pt-1">
      <div class="flex items-center gap-2 rounded-[12px] border border-line bg-paper px-3 py-2.5">
        <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0 text-fog" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input
          :value="query"
          @input="emit('update:query', $event.target.value)"
          type="text"
          placeholder="Bus, route, plate, or a place"
          class="w-full bg-transparent text-[13px] outline-none"
          aria-label="Search"
        />
        <button v-if="query" @click="emit('update:query', '')" class="text-fog" aria-label="Clear">
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      </div>

      <div v-if="places && places.length" class="mt-2 overflow-hidden rounded-[12px] border border-line bg-paper">
        <button
          v-for="p in places" :key="p.full"
          @click="emit('pick-place', p)"
          class="flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left last:border-0 hover:bg-cream"
        >
          <svg viewBox="0 0 24 24" class="h-3.5 w-3.5 shrink-0 text-fog" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
          <span class="truncate text-[12px]">{{ p.name }}</span>
        </button>
      </div>
      <p v-else-if="searchingPlaces" class="mt-2 px-1 font-mono text-[11px] text-fog">looking up places</p>

      <div class="mt-2.5 flex rounded-[12px] border border-line p-1" role="tablist" aria-label="Type">
        <button
          v-for="t in tabs" :key="t.id"
          @click="emit('update:filter', t.id)"
          :class="[
            'flex flex-1 items-center justify-center gap-1 rounded-[8px] py-1.5 text-[12px] font-medium',
            filter === t.id ? 'bg-ink text-cream' : 'text-fog',
          ]"
        >
          {{ t.label }}
          <span class="font-mono text-[10px] opacity-60">{{ nFor(t.id) }}</span>
        </button>
      </div>
    </div>

    <div class="nice-scroll mt-1 min-h-0 flex-1 overflow-y-auto px-4 pb-3">
      <template v-if="filter === 'stops'">
        <p v-if="stopsLoading" class="py-4 font-mono text-[11px] text-fog">pulling stops near the map</p>
        <p v-else-if="stopsError" class="mt-2 rounded-[12px] border border-line bg-paper px-3 py-2.5 text-[12px]">Stops are down for now. Buses still move.</p>
        <p v-else-if="!stops.length" class="py-4 text-[12px] text-fog">Nothing here yet. Zoom to street level and stops fill in around the middle of the map.</p>
        <button
          v-for="s in stops" :key="s.id"
          @click="emit('pick-stop', s)"
          class="flex w-full items-center gap-3 border-b border-line py-2.5 text-left last:border-0"
        >
          <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-line text-fog">
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[13px]">{{ s.name }}</span>
            <span class="block truncate font-mono text-[11px] text-fog">{{ stopMeta(s) }}</span>
          </span>
        </button>
      </template>

      <template v-else>
        <div class="flex items-baseline justify-between py-2">
          <p class="font-mono text-[10px] uppercase tracking-[0.12em] text-fog">{{ vehicles.length }} listed</p>
          <p v-if="userLoc" class="font-mono text-[10px] text-fog">closest first</p>
        </div>
        <p v-if="!vehicles.length" class="py-3 text-[12px] text-fog">No match. Try a shorter number or another tab.</p>
        <button
          v-for="v in vehicles.slice(0, limit)" :key="v.id + v.agencyId"
          @click="emit('pick-vehicle', v)"
          class="flex w-full items-center gap-3 border-b border-line py-2.5 text-left last:border-0"
        >
          <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-ink text-cream">
            <svg v-if="!v.isTrain" viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="4" width="14" height="12" rx="2"/><path d="M5 10h14M8 20v-4M16 20v-4"/></svg>
            <svg v-else viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="3" width="12" height="14" rx="2"/><path d="M6 10h12"/></svg>
          </span>
          <span class="min-w-0 flex-1 leading-tight">
            <span class="block truncate text-[13px] font-medium">{{ v.id }}<span v-if="v.routeId" class="ml-1.5 font-mono text-[10px] font-normal text-fog">{{ v.routeId }}</span></span>
            <span class="block truncate text-[11px] text-fog">{{ sub(v) }}</span>
          </span>
          <span v-if="far(v)" class="shrink-0 font-mono text-[11px] text-fog">{{ far(v) }}</span>
        </button>
        <button
          v-if="vehicles.length > limit"
          @click="limit += 40"
          class="mt-2 w-full rounded-[10px] border border-line py-2.5 font-mono text-[11px] text-fog"
        >
          more · {{ vehicles.length - limit }} left
        </button>
      </template>
    </div>
  </div>
</template>