<script setup>
import { computed } from 'vue'

const props = defineProps({ vehicle: Object })
const emit = defineEmits(['close', 'track'])

const head = computed(() => {
  const b = props.vehicle?.bearing
  if (!Number.isFinite(b)) return '-'
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round((((b % 360) + 360) % 360) / 45) % 8]
})

</script>

<template>
  <div v-if="vehicle" class="sheet">
    <div style="display:flex;justify-content:space-between;align-items:start">
      <div>
        <div style="font-weight:600">{{ vehicle.agencyName }}</div>
        <div style="font-family:monospace;font-size:11px;color:#78746a">{{ vehicle.id }}<span v-if="vehicle.plate && vehicle.plate !== vehicle.id"> · {{ vehicle.plate }}</span></div>
      </div>
      <button @click="emit('close')" aria-label="Close">✕</button>
    </div>
    <div class="grid">
      <div><div style="font-size:10px;color:#78746a">SPEED</div><strong>{{ vehicle.speed ?? '-' }}</strong> km/h</div>
      <div><div style="font-size:10px;color:#78746a">TO</div><strong>{{ head }}</strong></div>
      <div><div style="font-size:10px;color:#78746a">ROUTE</div><strong>{{ vehicle.routeId || '-' }}</strong></div>
    </div>
    <div style="font-family:monospace;font-size:11px;color:#78746a">trip {{ vehicle.tripId || 'n/a' }}</div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button @click="emit('track')" class="primary" style="flex:1">Follow</button>
      <button @click="emit('close')" style="flex:1">Close</button>
    </div>
  </div>
</template>
