<script setup lang="ts">
import { defineAsyncComponent, h } from 'vue'
import SkeletonPanel from '../components/SkeletonPanel.vue'
import type { Transaction } from '../types/transaction'

const BubbleGalaxy = defineAsyncComponent({
  loader: () => import('../components/BubbleGalaxy.vue'),
  loadingComponent: {
    name: 'LazyPanelFallback',
    render: () => h(SkeletonPanel, { height: 380, label: 'กำลังโหลดฟองเงิน' }),
  },
  delay: 120,
})

defineProps<{ transactions: Transaction[] }>()
</script>

<template>
  <section class="app-page bubbles-page">
    <BubbleGalaxy :transactions="transactions" />
  </section>
</template>

<style scoped>
.app-page { display: block; }
@media (max-width: 780px) {
  .app-page { flex: none; }
}
</style>
