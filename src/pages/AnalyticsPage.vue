<script setup lang="ts">
import { defineAsyncComponent, h, ref } from 'vue'
import SkeletonPanel from '../components/SkeletonPanel.vue'
import type { Transaction } from '../types/transaction'

type AnalyticsTab = 'trend' | 'flow' | 'budget'

const lazyPanel = (
  loader: () => Promise<unknown>,
  skeleton: { height?: number; rows?: number; variant?: 'chart' | 'list'; label: string },
) =>
  defineAsyncComponent({
    loader: loader as never,
    loadingComponent: { name: 'LazyPanelFallback', render: () => h(SkeletonPanel, skeleton) },
    delay: 120,
  })

const SpendingTrend = lazyPanel(() => import('../components/SpendingTrend.vue'), {
  height: 300,
  label: 'กำลังโหลดกราฟเทรนด์',
})

const StackedAreaChart = lazyPanel(() => import('../components/StackedAreaChart.vue'), {
  height: 300,
  label: 'กำลังโหลดกราฟกระแสค่าใช้จ่าย',
})

const BudgetChart = lazyPanel(() => import('../components/BudgetChart.vue'), {
  height: 280,
  label: 'กำลังโหลดงบประมาณรายหมวด',
})

const tabs = [
  { id: 'trend', icon: '📈', label: 'เทรนด์' },
  { id: 'flow', icon: '📊', label: 'กระแส' },
  { id: 'budget', icon: '🏦', label: 'งบ' },
] as const

const activeTab = ref<AnalyticsTab>('trend')

withDefaults(defineProps<{ transactions: Transaction[]; readOnly?: boolean }>(), {
  readOnly: false,
})
</script>

<template>
  <section class="app-page analytics-page">
    <!-- คลาส overview-tabs ติดไว้เพื่อให้ธีม opium ทาสีให้เหมือน tab อื่นในแอป -->
    <div class="overview-tabs analytics-tabs" role="tablist" aria-label="มุมมองการวิเคราะห์">
      <button
        v-for="tab in tabs"
        :id="`analytics-tab-${tab.id}`"
        :key="tab.id"
        type="button"
        role="tab"
        :class="{ active: activeTab === tab.id }"
        :aria-selected="activeTab === tab.id"
        :aria-controls="`analytics-panel-${tab.id}`"
        @click="activeTab = tab.id"
      >
        <span aria-hidden="true">{{ tab.icon }}</span> {{ tab.label }}
      </button>
    </div>

    <div
      v-if="activeTab === 'trend'"
      id="analytics-panel-trend"
      role="tabpanel"
      aria-labelledby="analytics-tab-trend"
    >
      <SpendingTrend :transactions="transactions" />
    </div>

    <div
      v-else-if="activeTab === 'flow'"
      id="analytics-panel-flow"
      role="tabpanel"
      aria-labelledby="analytics-tab-flow"
    >
      <StackedAreaChart :transactions="transactions" />
    </div>

    <div
      v-else-if="activeTab === 'budget'"
      id="analytics-panel-budget"
      role="tabpanel"
      aria-labelledby="analytics-tab-budget"
    >
      <BudgetChart :transactions="transactions" :read-only="readOnly" />
    </div>
  </section>
</template>

<style scoped>
.app-page { display: block; }

.analytics-tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; max-width: 380px; margin: 0 auto 12px; padding: 3px; border-radius: 9px; background: #e9efeb; }
.analytics-tabs button { display: inline-flex; min-height: 34px; align-items: center; justify-content: center; gap: 5px; padding: 4px 9px; border: 0; border-radius: 7px; color: #728078; background: transparent; font: 700 .62rem 'Noto Sans Thai', sans-serif; cursor: pointer; transition: color .16s, background .16s; }
.analytics-tabs button.active { color: #20563e; background: #fff; box-shadow: 0 2px 7px rgba(25,77,59,.1); }
.analytics-tabs button:focus-visible { outline: 3px solid rgba(73,137,103,.22); outline-offset: 1px; }

@media (max-width: 780px) {
  .app-page { flex: none; }
}

@media (max-width: 580px) {
  .analytics-tabs { max-width: none; margin-bottom: 9px; }
  .analytics-tabs button { font-size: .58rem; }
}

@media (prefers-reduced-motion: reduce) {
  .analytics-tabs button { transition: none; }
}
</style>
