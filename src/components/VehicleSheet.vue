<script setup>
import { computed } from "vue";
import { formatAgo } from "../composables/useGeo.js";

const props = defineProps({
  vehicle: Object,
  distance: String,
  isFav: Boolean,
});

const emit = defineEmits(["close", "track", "toggle-fav"]);

const head = computed(() => {
  const b = props.vehicle?.bearing;
  if (!Number.isFinite(b)) return "-";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round((((b % 360) + 360) % 360) / 45) % 8];
});

const ping = computed(() => {
  const t = props.vehicle?.at;
  if (!t) return "";
  return formatAgo(new Date(t));
});

const state = computed(() => {
  const s = String(props.vehicle?.status ?? "");
  if (s === "1" || s === "STOPPED_AT") return "at stop";
  if (s === "2" || s === "IN_TRANSIT_TO") return "on the way";
  if (s === "0" || s === "INCOMING_AT") return "arriving";
  return "";
});

const odoText = computed(() => {
  const o = props.vehicle?.odo;
  if (!Number.isFinite(o)) return "";
  if (o < 1000) return o + " m";
  return (o / 1000).toFixed(1) + " km";
});

const dirText = computed(() => {
  const d = props.vehicle?.dir;
  if (d == null || d === "") return "";
  return "dir " + d;
});
</script>

<template>
  <div
    v-if="vehicle"
    class="rise above-grip absolute inset-x-3 bottom-3 z-20 mx-auto max-w-md rounded-[16px] border border-line bg-cream p-4 dark:border-seam dark:bg-coal sm:inset-x-auto sm:right-4 sm:mx-0 sm:w-[300px]"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="flex min-w-0 items-center gap-2.5">
        <span
          :class="[
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]',
            vehicle.isTrain
              ? 'bg-moss text-cream'
              : 'bg-ink text-cream dark:bg-[#ece8de] dark:text-night',
          ]"
        >
          <svg
            v-if="!vehicle.isTrain"
            viewBox="0 0 24 24"
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="5" y="4" width="14" height="12" rx="2" />
            <path d="M5 10h14M8 20v-4M16 20v-4" />
          </svg>
          <svg
            v-else
            viewBox="0 0 24 24"
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="6" y="3" width="12" height="14" rx="2" />
            <path d="M6 10h12" />
          </svg>
        </span>
        <div class="min-w-0 leading-tight">
          <p
            class="truncate text-[13px] font-semibold text-ink dark:text-[#ece8de]"
          >
            {{ vehicle.agencyName }}
          </p>
          <p class="mt-0.5 truncate font-mono text-[11px] text-fog">
            {{ vehicle.id
            }}<span v-if="vehicle.plate && vehicle.plate !== vehicle.id">
              · {{ vehicle.plate }}</span
            >
          </p>
        </div>
      </div>
      <button
        @click="emit('close')"
        class="rounded-lg p-1.5 text-fog"
        aria-label="Close"
      >
        <svg
          viewBox="0 0 24 24"
          class="h-4 w-4"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>

    <div
      class="mt-3 grid grid-cols-3 divide-x divide-line border-y border-line dark:divide-seam dark:border-seam"
    >
      <div class="py-2 pr-2">
        <p class="font-mono text-[10px] uppercase tracking-[0.1em] text-fog">
          Speed
        </p>
        <p
          class="mt-0.5 text-[14px] font-medium tabular-nums text-ink dark:text-[#ece8de]"
        >
          {{ vehicle.speed ?? "-" }}
          <span class="text-[10px] font-normal text-fog">km/h</span>
        </p>
      </div>
      <div class="px-3 py-2">
        <p class="font-mono text-[10px] uppercase tracking-[0.1em] text-fog">
          To
        </p>
        <p
          class="mt-0.5 text-[14px] font-medium tabular-nums text-ink dark:text-[#ece8de]"
        >
          {{ head }}
        </p>
      </div>
      <div class="py-2 pl-3">
        <p class="font-mono text-[10px] uppercase tracking-[0.1em] text-fog">
          Away
        </p>
        <p
          class="mt-0.5 text-[14px] font-medium tabular-nums text-ink dark:text-[#ece8de]"
        >
          {{ distance || "-" }}
        </p>
      </div>
    </div>

    <div
      class="mt-1 divide-y divide-line font-mono text-[11px] dark:divide-seam"
    >
      <div
        v-if="vehicle.routeId"
        class="flex items-baseline justify-between gap-3 py-1.5"
      >
        <span class="uppercase tracking-[0.1em] text-fog">Route</span>
        <span class="truncate text-right text-ink dark:text-[#ece8de]"
          >{{ vehicle.routeId
          }}<span v-if="dirText" class="text-fog"> {{ dirText }}</span></span
        >
      </div>
      <div
        v-if="vehicle.tripId"
        class="flex items-baseline justify-between gap-3 py-1.5"
      >
        <span class="uppercase tracking-[0.1em] text-fog">Trip</span>
        <span class="truncate text-right text-ink dark:text-[#ece8de]"
          >{{ vehicle.tripId
          }}<span v-if="vehicle.start" class="text-fog">
            {{ vehicle.start }}</span
          ></span
        >
      </div>
      <div
        v-if="vehicle.stopId || vehicle.stopSeq != null"
        class="flex items-baseline justify-between gap-3 py-1.5"
      >
        <span class="uppercase tracking-[0.1em] text-fog">Stop</span>
        <span class="truncate text-right text-ink dark:text-[#ece8de]"
          >{{ vehicle.stopId || "seq " + vehicle.stopSeq
          }}<span
            v-if="vehicle.stopId && vehicle.stopSeq != null"
            class="text-fog"
          >
            #{{ vehicle.stopSeq }}</span
          ><span v-if="state" class="text-fog"> {{ state }}</span></span
        >
      </div>
      <div
        v-if="odoText"
        class="flex items-baseline justify-between gap-3 py-1.5"
      >
        <span class="uppercase tracking-[0.1em] text-fog">Run</span>
        <span class="text-right tabular-nums text-ink dark:text-[#ece8de]">{{
          odoText
        }}</span>
      </div>
      <div v-if="ping" class="flex items-baseline justify-between gap-3 py-1.5">
        <span class="uppercase tracking-[0.1em] text-fog">Ping</span>
        <span class="text-right tabular-nums text-ink dark:text-[#ece8de]"
          >{{ ping
          }}<span v-if="vehicle.stale" class="text-fog"> held</span></span
        >
      </div>
    </div>

    <div class="mt-3 flex gap-2">
      <button
        @click="emit('track')"
        class="flex min-h-[40px] flex-1 items-center justify-center rounded-[10px] bg-ink text-[12px] font-medium text-cream dark:bg-[#ece8de] dark:text-night"
      >
        Follow
      </button>
      <button
        @click="emit('toggle-fav')"
        class="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-line text-[12px] font-medium text-ink dark:border-seam dark:text-[#ece8de]"
      >
        <svg
          viewBox="0 0 24 24"
          :class="['h-3.5 w-3.5', isFav ? 'fill-clay text-clay' : 'text-fog']"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8L12 3z"
          />
        </svg>
        {{ isFav ? "Kept" : "Keep" }}
      </button>
    </div>
  </div>
</template>
