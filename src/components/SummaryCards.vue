<script setup lang="ts">
import { formatBaht } from '../utils/format'

withDefaults(
  defineProps<{
    balance: number
    income: number
    expense: number
    balanceLabel?: string
    incomeLabel?: string
    expenseLabel?: string
  }>(),
  {
    balanceLabel: 'ยอดคงเหลือ',
    incomeLabel: 'รายรับ',
    expenseLabel: 'รายจ่าย',
  },
)
</script>

<template>
  <section class="summary-grid" aria-label="สรุปยอดเงิน">
    <article class="summary-card summary-card--balance">
      <div class="summary-card__icon" aria-hidden="true">฿</div>
      <div>
        <p>{{ balanceLabel }}</p>
        <strong>{{ formatBaht(balance) }}</strong>
      </div>
    </article>

    <article class="summary-card summary-card--income">
      <div class="summary-card__icon" aria-hidden="true">↗</div>
      <div>
        <p>{{ incomeLabel }}</p>
        <strong>{{ formatBaht(income) }}</strong>
      </div>
    </article>

    <article class="summary-card summary-card--expense">
      <div class="summary-card__icon" aria-hidden="true">↘</div>
      <div>
        <p>{{ expenseLabel }}</p>
        <strong>{{ formatBaht(expense) }}</strong>
      </div>
    </article>
  </section>
</template>
