<script setup lang="ts">
import { computed } from 'vue'
import { getCategoryEmoji, type Transaction, type TransactionCategory } from '../types/transaction'
import { formatBaht } from '../utils/format'

const props = defineProps<{
  transactions: Transaction[]
  previousTransactions: Transaction[]
  monthLabel: string
}>()

const palette = ['#398d67', '#67ae86', '#9cc16f', '#e0aa4c', '#dd7a63', '#9a79b8', '#5b91b7', '#c77794']

interface CategoryExpense {
  category: TransactionCategory | null
  label: string
  emoji: string
  amount: number
  percentage: number
  color: string
}

const sumExpenses = (transactions: Transaction[]) =>
  transactions
    .filter(({ type }) => type === 'expense')
    .reduce((sum, { amount }) => sum + Number(amount), 0)

const currentTotal = computed(() => sumExpenses(props.transactions))
const previousTotal = computed(() => sumExpenses(props.previousTransactions))

const categories = computed<CategoryExpense[]>(() => {
  const totals = new Map<TransactionCategory | null, number>()
  for (const transaction of props.transactions) {
    if (transaction.type !== 'expense') continue
    totals.set(transaction.category, (totals.get(transaction.category) ?? 0) + Number(transaction.amount))
  }

  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount], index) => ({
      category,
      label: category ?? 'ไม่ระบุหมวดหมู่',
      emoji: category ? getCategoryEmoji(category) : '🏷️',
      amount,
      percentage: currentTotal.value > 0 ? (amount / currentTotal.value) * 100 : 0,
      color: palette[index % palette.length],
    }))
})

const donutStyle = computed(() => {
  if (categories.value.length === 0) return { background: '#e8eeea' }
  let start = 0
  const segments = categories.value.map((item) => {
    const end = start + item.percentage
    const segment = `${item.color} ${start}% ${end}%`
    start = end
    return segment
  })
  return { background: `conic-gradient(${segments.join(', ')})` }
})

const monthChange = computed(() => {
  const difference = currentTotal.value - previousTotal.value
  if (previousTotal.value === 0) return { difference, percentage: null }
  return { difference, percentage: (difference / previousTotal.value) * 100 }
})

const comparisonTone = computed(() => {
  if (monthChange.value.difference > 0) return 'increase'
  if (monthChange.value.difference < 0) return 'decrease'
  return 'neutral'
})

const topCategory = computed(() => categories.value[0])
</script>

<template>
  <section class="analytics-panel" aria-labelledby="expense-analytics-title">
    <header class="analytics-heading">
      <div>
        <span>Expense insight</span>
        <h2 id="expense-analytics-title">วิเคราะห์ค่าใช้จ่าย {{ monthLabel }}</h2>
      </div>
      <div class="month-comparison" :class="comparisonTone">
        <strong v-if="monthChange.percentage !== null">
          {{ monthChange.difference > 0 ? '↑' : monthChange.difference < 0 ? '↓' : '–' }}
          {{ Math.abs(monthChange.percentage).toFixed(0) }}%
        </strong>
        <strong v-else>เดือนแรก</strong>
        <small>เทียบเดือนก่อน</small>
      </div>
    </header>

    <div v-if="currentTotal > 0" class="analytics-content">
      <div class="donut-wrap">
        <div class="donut" :style="donutStyle" role="img" :aria-label="`ค่าใช้จ่ายรวม ${formatBaht(currentTotal)}`">
          <div><small>ใช้ไปทั้งหมด</small><strong>{{ formatBaht(currentTotal) }}</strong></div>
        </div>
        <p v-if="topCategory">
          ใช้มากที่สุด <strong>{{ topCategory.emoji }} {{ topCategory.label }}</strong>
          {{ topCategory.percentage.toFixed(0) }}%
        </p>
      </div>

      <div class="category-analysis">
        <article v-for="item in categories" :key="item.label">
          <div class="category-line">
            <span><i :style="{ background: item.color }"></i>{{ item.emoji }} {{ item.label }}</span>
            <p><strong>{{ formatBaht(item.amount) }}</strong><small>{{ item.percentage.toFixed(0) }}%</small></p>
          </div>
          <div class="analysis-bar"><i :style="{ width: `${item.percentage}%`, background: item.color }"></i></div>
        </article>
      </div>
    </div>

    <div v-else class="analytics-empty">
      <div aria-hidden="true">◔</div>
      <strong>ยังไม่มีรายจ่ายในเดือนนี้</strong>
      <p>เมื่อเพิ่มรายการรายจ่าย ระบบจะแยกสัดส่วนตามหมวดหมู่ให้ทันที</p>
    </div>

    <footer v-if="currentTotal > 0" class="comparison-note" :class="comparisonTone">
      <span aria-hidden="true">{{ comparisonTone === 'increase' ? '!' : comparisonTone === 'decrease' ? '✓' : '–' }}</span>
      <p v-if="previousTotal === 0">เดือนก่อนยังไม่มีรายจ่าย จึงเริ่มใช้เดือนนี้เป็นฐานเปรียบเทียบ</p>
      <p v-else-if="monthChange.difference > 0">ใช้จ่ายมากกว่าเดือนก่อน {{ formatBaht(monthChange.difference) }}</p>
      <p v-else-if="monthChange.difference < 0">ประหยัดกว่าเดือนก่อน {{ formatBaht(Math.abs(monthChange.difference)) }}</p>
      <p v-else>ค่าใช้จ่ายเท่ากับเดือนก่อน</p>
    </footer>
  </section>
</template>

<style scoped>
.analytics-panel { min-width: 0; padding: 17px; border: 1px solid var(--line); border-radius: 16px; background: var(--paper); box-shadow: 0 8px 24px rgba(23,45,36,.045); }
.analytics-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 15px; }
.analytics-heading span { color: #71877d; font-size: .53rem; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; }
.analytics-heading h2 { margin: 2px 0 0; font: 700 .86rem 'Noto Sans Thai', sans-serif; }
.month-comparison { min-width: 76px; padding: 6px 8px; border-radius: 9px; background: #f0f4f1; text-align: right; }
.month-comparison strong,.month-comparison small { display: block; font-family: 'Noto Sans Thai', sans-serif; }
.month-comparison strong { color: #65736c; font-size: .68rem; }
.month-comparison small { color: #929b96; font-size: .5rem; }
.month-comparison.increase strong { color: #c35d51; }
.month-comparison.decrease strong { color: #32835b; }
.analytics-content { display: grid; grid-template-columns: 155px minmax(0,1fr); align-items: center; gap: 18px; }
.donut-wrap { text-align: center; }
.donut { display: grid; width: 132px; height: 132px; place-items: center; margin: auto; border-radius: 50%; }
.donut > div { display: grid; width: 84px; height: 84px; place-content: center; border-radius: 50%; background: #fff; box-shadow: 0 0 0 1px rgba(25,77,59,.04); }
.donut small,.donut strong { display: block; font-family: 'Noto Sans Thai', sans-serif; }
.donut small { color: #849089; font-size: .5rem; }
.donut strong { margin-top: 2px; color: #263e33; font-size: .69rem; }
.donut-wrap > p { margin: 8px 0 0; color: #7d8983; font: 500 .54rem 'Noto Sans Thai', sans-serif; }
.donut-wrap > p strong { color: #304b3e; }
.category-analysis { display: grid; gap: 10px; min-width: 0; }
.category-line { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: #52645b; font: 600 .59rem 'Noto Sans Thai', sans-serif; }
.category-line > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.category-line > span i { display: inline-block; width: 7px; height: 7px; margin-right: 5px; border-radius: 50%; }
.category-line p { display: flex; gap: 6px; margin: 0; white-space: nowrap; }
.category-line p strong { color: #334d41; font-size: .61rem; }
.category-line p small { min-width: 27px; color: #8d9792; text-align: right; }
.analysis-bar { height: 5px; margin-top: 4px; overflow: hidden; border-radius: 999px; background: #edf0ee; }
.analysis-bar i { display: block; height: 100%; border-radius: inherit; transition: width .4s ease; }
.comparison-note { display: flex; align-items: center; gap: 8px; margin-top: 14px; padding: 8px 10px; border-radius: 9px; color: #64746c; background: #f0f4f1; font: 500 .57rem 'Noto Sans Thai', sans-serif; }
.comparison-note span { display: grid; width: 20px; height: 20px; flex: 0 0 20px; place-items: center; border-radius: 6px; background: #e0e8e3; font-weight: 800; }
.comparison-note p { margin: 0; }
.comparison-note.increase { color: #995047; background: #fff0ed; }
.comparison-note.increase span { background: #f7d8d3; }
.comparison-note.decrease { color: #347454; background: #edf8f1; }
.comparison-note.decrease span { background: #d5ebdd; }
.analytics-empty { display: flex; min-height: 190px; align-items: center; justify-content: center; flex-direction: column; gap: 5px; color: #7b8781; font-family: 'Noto Sans Thai', sans-serif; text-align: center; }
.analytics-empty > div { display: grid; width: 42px; height: 42px; place-items: center; border-radius: 12px; color: #56816c; background: #edf4f0; font-size: 1.1rem; }
.analytics-empty strong { color: #30483d; font-size: .72rem; }
.analytics-empty p { max-width: 300px; margin: 0; font-size: .57rem; }
@media (max-width: 580px) { .analytics-panel { padding: 14px; } .analytics-content { grid-template-columns: 1fr; } .category-analysis { width: 100%; } }
@media (prefers-reduced-motion: reduce) { .analysis-bar i { transition: none; } }
</style>
