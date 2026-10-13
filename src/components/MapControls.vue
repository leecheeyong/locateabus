<script setup>
defineProps({
  refreshing: Boolean,
  dark: Boolean,
});

const emit = defineEmits([
  "zoom-in",
  "zoom-out",
  "locate",
  "refresh",
  "toggle-theme",
]);

const btn =
  "flex h-[38px] w-[38px] items-center justify-center rounded-[11px] border border-line bg-cream/95 text-ink backdrop-blur hover:bg-paper active:scale-95 dark:border-seam dark:bg-coal/95 dark:text-[#ece8de]";
</script>

<template>
  <div class="absolute right-3 top-[60px] z-20 flex flex-col gap-1.5">
    <button :class="btn" @click="emit('zoom-in')" aria-label="Zoom in">
      <svg
        viewBox="0 0 24 24"
        class="h-4 w-4"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
    <button :class="btn" @click="emit('zoom-out')" aria-label="Zoom out">
      <svg
        viewBox="0 0 24 24"
        class="h-4 w-4"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M5 12h14" />
      </svg>
    </button>
    <button :class="btn" @click="emit('locate')" aria-label="My spot">
      <svg
        viewBox="0 0 24 24"
        class="h-4 w-4"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        <circle cx="12" cy="12" r="8" />
      </svg>
    </button>
    <button
      :class="btn"
      @click="emit('refresh')"
      :disabled="refreshing"
      aria-label="Reload"
    >
      <svg
        viewBox="0 0 24 24"
        :class="['h-4 w-4', refreshing && 'animate-spin']"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" />
      </svg>
    </button>
    <button
      :class="btn"
      @click="emit('toggle-theme')"
      :aria-label="dark ? 'Light' : 'Dark'"
    >
      <svg
        v-if="dark"
        viewBox="0 0 24 24"
        class="h-4 w-4"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle cx="12" cy="12" r="4" />
        <path
          d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        />
      </svg>
      <svg
        v-else
        viewBox="0 0 24 24"
        class="h-4 w-4"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M20 13A8 8 0 0 1 11 4a6.5 6.5 0 0 0 9 9z" />
      </svg>
    </button>
  </div>
</template>
