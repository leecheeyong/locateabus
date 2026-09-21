<script setup>
const props = defineProps({
  query: String,
  filter: String,
  vehicles: Array,
  counts: Object,
})

const emit = defineEmits(['update:query', 'update:filter', 'pick-vehicle'])

const tabs = [
  { id: 'all', label: 'All' },
  { id: 'bus', label: 'Bus' },
  { id: 'train', label: 'Train' },
]

function nFor(id) {
  if (!props.counts) return ''
  if (id === 'all') return props.counts.all
  if (id === 'bus') return props.counts.bus
  return props.counts.train
}
</script>

<template>
  <div class="search">
    <input
      :value="query"
      @input="emit('update:query', $event.target.value)"
      placeholder="Bus, route, agency…"
      aria-label="Search"
    />
    <div class="tabs">
      <button
        v-for="t in tabs" :key="t.id"
        @click="emit('update:filter', t.id)"
        :class="{ on: filter === t.id }"
      >
        {{ t.label }} {{ nFor(t.id) }}
      </button>
    </div>
  </div>
  <div class="list">
    <p v-if="!vehicles.length" style="padding:12px;font-size:12px;color:#78746a">No match. Try a shorter number.</p>
    <button
      v-for="v in vehicles.slice(0, 60)" :key="v.id + v.agencyId"
      @click="emit('pick-vehicle', v)"
      class="row"
    >
      <div><strong>{{ v.id }}</strong></div>
      <div class="sub">{{ v.agencyName }} · {{ v.routeId || 'no route' }} · {{ v.speed ?? '-' }} km/h</div>
    </button>
  </div>
</template>