<script setup lang="ts">
import { defineAsyncComponent, h } from 'vue'
import SkeletonPanel from '../components/SkeletonPanel.vue'
import type { Transaction } from '../types/transaction'

const SpendingTrend = defineAsyncComponent({
  loader: () => import('../components/SpendingTrend.vue'),
  loadingComponent: {
    name: 'LazyPanelFallback',
    render: () => h(SkeletonPanel, { height: 300, label: 'กำลังโหลดกราฟเทรนด์' }),
  },
  delay: 120,
})

defineProps<{ transactions: Transaction[] }>()
</script>

<template>
  <section class="app-page trends-page">
    <SpendingTrend :transactions="transactions" />
  </section>
</template>

<style scoped>
.app-page { display: block; }
@media (max-width: 780px) {
  .app-page { flex: none; }
}
</style>
