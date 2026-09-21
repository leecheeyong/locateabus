<script setup>
import { ref } from 'vue'

const count = ref(0)
const title = ref('locateabus')
</script>

<template>
  <div class="wrap">
    <h1>{{ title }}</h1>
  </div>
</template>

<style scoped>
.wrap { max-width: 560px; margin: 60px auto; font-family: system-ui, sans-serif; padding: 0 20px; }
h1 { letter-spacing: -0.02em; }
.hint { color: #666; font-size: 14px; }
button { padding: 8px 14px; margin-top: 12px; }
</style>
