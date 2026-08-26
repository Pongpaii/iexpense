<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  activePlanItemAt,
  buildPlanProgress,
  dayKindEmojis,
  dayKindLabels,
  formatTimeWindow,
  sumPlanItems,
  useDailyCap,
} from '../composables/useDailyCap'
import type { Transaction } from '../types/transaction'
import { formatBaht } from '../utils/format'

const props = withDefaults(
  defineProps<{
    /** วันที่ในรูปแบบ YYYY-MM-DD ที่กำลังดูอยู่ */
    date: string
    /** รายการทั้งหมดของวันนั้น (ระบบจะคัดเฉพาะรายจ่ายเอง) */
    transactions: Transaction[]
    isToday?: boolean
  }>(),
  { isToday: true },
)

const emit = defineEmits<{ edit: [] }>()

const { capEnabled, profileForKind, dayKindForDate } = useDailyCap()

const dayKind = computed(() => dayKindForDate(props.date))
const profile = computed(() => profileForKind(dayKind.value))
const cap = computed(() => profile.value.cap)
const planTotal = computed(() => sumPlanItems(profile.value.items))
const planSpare = computed(() => Math.round((cap.value - planTotal.value) * 100) / 100)

const expenses = computed(() => props.transactions.filter(({ type }) => type === 'expense'))
const spent = computed(
  () => Math.round(expenses.value.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) * 100) / 100,
)

const progress = computed(() => buildPlanProgress(profile.value.items, expenses.value))

/** เดินนาฬิกาไว้เพื่อขยับเครื่องหมาย "ตอนนี้" ให้ตรงช่วงเวลาปัจจุบัน */
const now = ref(new Date())
let clockTimer: ReturnType<typeof window.setInterval> | undefined

onMounted(() => {
  clockTimer = window.setInterval(() => {
    now.value = new Date()
  }, 30_000)
})

onBeforeUnmount(() => {
  if (clockTimer !== undefined) window.clearInterval(clockTimer)
})

const activeSlotId = computed(() =>
  props.isToday ? activePlanItemAt(profile.value.items, now.value)?.id ?? null : null,
)

const remaining = computed(() => Math.round((cap.value - spent.value) * 100) / 100)
const overBy = computed(() => Math.max(0, -remaining.value))
const ratio = computed(() => (cap.value > 0 ? spent.value / cap.value : 0))
const percent = computed(() => Math.round(ratio.value * 100))

const barWidth = (value: number) => `${Math.min(100, Math.max(value > 0 ? 3 : 0, value * 100))}%`
const fillWidth = computed(() => barWidth(ratio.value))

const level = computed(() => {
  if (ratio.value > 1) return 'over'
  if (ratio.value >= 1) return 'full'
  if (ratio.value >= 0.8) return 'warn'
  if (ratio.value >= 0.5) return 'watch'
  return 'safe'
})

const headline = computed(() => {
  if (level.value === 'over') return `เกินงบ ${formatBaht(overBy.value)}`
  if (level.value === 'full') return 'ใช้ครบพอดีตามงบ'
  return `เหลือ ${formatBaht(remaining.value)}`
})

const hint = computed(() => {
  const dayWord = props.isToday ? 'วันนี้' : 'วันนั้น'
  if (level.value === 'over') return `${dayWord}ใช้เกินเพดานที่ตั้งไว้ พรุ่งนี้ลดลงหน่อยจะช่วยดึงกลับได้`
  if (level.value === 'full') return `${dayWord}ใช้เต็มงบพอดี จ่ายเพิ่มอีกจะเกินแล้ว`
  if (level.value === 'warn') return 'ใกล้ชนเพดานแล้ว เหลือให้ใช้อีกไม่มาก'
  if (level.value === 'watch') return `ใช้ไปแล้วเกินครึ่งของงบ${dayWord}`
  if (spent.value === 0) return `${dayWord}ยังไม่มีรายจ่าย งบเต็มจำนวน`
  return 'ยังอยู่ในงบสบาย ๆ'
})

/** สถานะสั้น ๆ ต่อท้ายหลอดย่อยของแต่ละช่องในแผน */
const itemStatus = (row: (typeof progress.value.items)[number]) => {
  if (row.level === 'empty') return 'ยังไม่ใช้'
  if (row.level === 'over') return `เกิน ${formatBaht(Math.abs(row.remaining))}`
  if (row.level === 'full') return 'ครบพอดี'
  return `เหลือ ${formatBaht(row.remaining)}`
}

const spareRatio = computed(() => {
  if (planSpare.value <= 0) return progress.value.unplanned > 0 ? Infinity : 0
  return progress.value.unplanned / planSpare.value
})

const spareLevel = computed(() => {
  if (progress.value.unplanned <= 0) return 'empty'
  if (planSpare.value <= 0 || spareRatio.value > 1) return 'over'
  if (spareRatio.value >= 1) return 'full'
  if (spareRatio.value >= 0.8) return 'warn'
  if (spareRatio.value >= 0.5) return 'watch'
  return 'safe'
})
</script>

<template>
  <section v-if="capEnabled" class="cap-card" :class="`cap-card--${level}`" aria-label="งบรายจ่ายต่อวัน">
    <header class="cap-head">
      <div class="cap-head__copy">
        <span class="cap-eyebrow">
          {{ isToday ? 'งบวันนี้' : 'งบของวันนั้น' }}
          <b class="cap-daykind">{{ dayKindEmojis[dayKind] }} {{ dayKindLabels[dayKind] }}</b>
        </span>
        <p class="cap-amounts">
          <strong>{{ formatBaht(spent) }}</strong>
          <em>/ {{ formatBaht(cap) }}</em>
        </p>
      </div>

      <button class="cap-edit" type="button" title="ตั้งค่างบรายวัน" @click="emit('edit')">
        ตั้งค่า
      </button>
    </header>

    <div
      class="cap-track cap-track--main"
      role="progressbar"
      :aria-valuenow="Math.min(percent, 999)"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="`ใช้ไป ${percent}% ของงบ ${formatBaht(cap)}`"
    >
      <span class="cap-fill" :style="{ width: fillWidth }"></span>
    </div>

    <p class="cap-status">
      <b>{{ headline }}</b>
      <span>{{ percent }}% ของงบ</span>
    </p>
    <small class="cap-hint">{{ hint }}</small>

    <ul v-if="progress.items.length" class="cap-plan" aria-label="ความคืบหน้าของแต่ละช่องในแผน">
      <li
        v-for="row in progress.items"
        :key="row.item.id"
        class="cap-slot"
        :class="[`cap-slot--${row.level}`, { 'cap-slot--active': row.item.id === activeSlotId }]"
      >
        <div class="cap-slot__top">
          <span class="cap-slot__name">
            {{ row.item.emoji }} {{ row.item.label }}
            <u v-if="row.item.timeWindow">{{ formatTimeWindow(row.item.timeWindow) }}</u>
            <i v-if="row.count > 1" :title="`${row.count} รายการ`">×{{ row.count }}</i>
            <mark v-if="row.item.id === activeSlotId">ตอนนี้</mark>
          </span>
          <span class="cap-slot__amount">
            <b>{{ formatBaht(row.spent) }}</b>
            <em>/ {{ formatBaht(row.item.amount) }}</em>
          </span>
        </div>

        <div
          class="cap-track cap-track--slot"
          role="progressbar"
          :aria-valuenow="Math.min(row.percent, 999)"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="`${row.item.label} ใช้ไป ${row.percent}% ของ ${formatBaht(row.item.amount)}`"
        >
          <span class="cap-fill" :style="{ width: barWidth(row.ratio) }"></span>
        </div>

        <small class="cap-slot__status">{{ itemStatus(row) }}</small>
      </li>

      <li
        v-if="progress.unplannedCount > 0 || planSpare > 0"
        :class="`cap-slot cap-slot--${spareLevel} cap-slot--spare`"
      >
        <div class="cap-slot__top">
          <span class="cap-slot__name">
            🧺 นอกแผน
            <i v-if="progress.unplannedCount" :title="`${progress.unplannedCount} รายการ`">
              ×{{ progress.unplannedCount }}
            </i>
          </span>
          <span class="cap-slot__amount">
            <b>{{ formatBaht(progress.unplanned) }}</b>
            <em>/ {{ formatBaht(Math.max(0, planSpare)) }}</em>
          </span>
        </div>

        <div
          class="cap-track cap-track--slot"
          role="progressbar"
          :aria-valuenow="Math.min(Number.isFinite(spareRatio) ? Math.round(spareRatio * 100) : 999, 999)"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="`รายจ่ายนอกแผน ${formatBaht(progress.unplanned)} จากงบกันเหลือ ${formatBaht(Math.max(0, planSpare))}`"
        >
          <span class="cap-fill" :style="{ width: barWidth(spareRatio) }"></span>
        </div>

        <small class="cap-slot__status">
          {{
            planSpare < 0
              ? 'แผนเกินเพดานอยู่แล้ว ไม่มีงบกันเหลือ'
              : progress.unplanned > planSpare
                ? `เกินงบกันเหลือ ${formatBaht(progress.unplanned - planSpare)}`
                : `งบกันเหลือ ${formatBaht(planSpare - progress.unplanned)}`
          }}
        </small>

        <small v-if="progress.unplannedWithoutTime" class="cap-slot__note">
          {{ progress.unplannedWithoutTime }} รายการจดย้อนหลัง ไม่มีเวลาให้แยกช่องในหมวดเดียวกัน
          ใส่คำว่าเช้า/กลางวัน/เย็นในชื่อรายการได้
        </small>
      </li>

      <li class="cap-plan__total">
        <span>รวมแผน</span>
        <b>{{ formatBaht(planTotal) }}</b>
      </li>
    </ul>
  </section>

  <section v-else class="cap-card cap-card--off" aria-label="งบรายจ่ายต่อวัน">
    <div class="cap-off">
      <strong>ยังไม่ได้เปิดงบรายวัน</strong>
      <p>ตั้งเพดานรายจ่ายต่อวัน แล้วหลอดจะบอกทันทีว่าวันนี้เกินงบหรือยัง</p>
    </div>
    <button class="cap-edit" type="button" @click="emit('edit')">เปิดใช้งาน</button>
  </section>
</template>

<style scoped>
.cap-card {
  display: grid;
  gap: 9px;
  padding: 15px 16px 14px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--paper);
  box-shadow: 0 12px 32px rgba(23, 45, 36, 0.06);
  font-family: 'Noto Sans Thai', sans-serif;
}

.cap-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.cap-head__copy { min-width: 0; }

.cap-eyebrow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  color: #71877d;
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.cap-daykind {
  padding: 3px 8px;
  border-radius: 999px;
  color: #2f6b51;
  background: var(--green-light);
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}

.cap-amounts {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 6px 0 0;
}

.cap-amounts strong {
  color: var(--ink);
  font-family: 'Manrope', sans-serif;
  font-size: 1.18rem;
  font-weight: 800;
  line-height: 1.1;
}

.cap-amounts em {
  color: var(--muted);
  font-family: 'Manrope', sans-serif;
  font-size: 0.72rem;
  font-style: normal;
  font-weight: 700;
}

.cap-edit {
  flex: 0 0 auto;
  padding: 7px 11px;
  border: 1px solid #cfdad3;
  border-radius: 9px;
  color: #285e46;
  background: #fff;
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: 0.63rem;
  font-weight: 700;
}

.cap-edit:hover {
  border-color: #67937f;
  background: #f2f8f4;
}

.cap-edit:focus-visible {
  outline: 3px solid rgba(41, 116, 79, 0.28);
  outline-offset: 2px;
}

.cap-track {
  position: relative;
  overflow: hidden;
  border-radius: 999px;
  background: #edf1ec;
}

.cap-track--main {
  height: 12px;
  box-shadow: inset 0 1px 3px rgba(23, 45, 36, 0.09);
}

.cap-track--slot { height: 6px; }

.cap-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #57a97c, #8fd06a);
  transition: width 0.4s cubic-bezier(0.22, 0.68, 0.35, 1), background 0.3s;
}

.cap-card--watch .cap-track--main .cap-fill { background: linear-gradient(90deg, #7fbe63, var(--lime)); }
.cap-card--warn .cap-track--main .cap-fill { background: linear-gradient(90deg, #e0a83d, #f0cf6c); }
.cap-card--full .cap-track--main .cap-fill { background: linear-gradient(90deg, #d1863c, #e6a94f); }

.cap-card--over .cap-track--main .cap-fill {
  background: repeating-linear-gradient(-45deg, var(--red) 0 9px, #d96a60 9px 18px);
  animation: cap-pulse 1.5s ease-in-out infinite;
}

.cap-card--over { border-color: #eec6c1; background: #fffafa; }
.cap-card--full { border-color: #eed9bd; }

@keyframes cap-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.72; }
}

.cap-status {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin: 0;
}

.cap-status b {
  color: #2b6b4d;
  font-size: 0.76rem;
}

.cap-card--warn .cap-status b,
.cap-card--full .cap-status b { color: #98661f; }
.cap-card--over .cap-status b { color: var(--red); }

.cap-status span {
  color: var(--muted);
  font-family: 'Manrope', sans-serif;
  font-size: 0.62rem;
  font-weight: 700;
}

.cap-hint {
  color: var(--muted);
  font-size: 0.63rem;
  line-height: 1.5;
}

.cap-plan {
  display: grid;
  gap: 9px;
  margin: 3px 0 0;
  padding: 10px 0 0;
  border-top: 1px dashed #e2e6df;
  list-style: none;
}

.cap-slot {
  display: grid;
  gap: 4px;
}

.cap-slot__top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.cap-slot__name {
  display: inline-flex;
  min-width: 0;
  align-items: baseline;
  gap: 5px;
  overflow: hidden;
  color: #45534c;
  font-size: 0.66rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cap-slot__name i {
  flex: 0 0 auto;
  padding: 1px 5px;
  border-radius: 999px;
  color: #5b7568;
  background: #edf2ee;
  font-family: 'Manrope', sans-serif;
  font-size: 0.52rem;
  font-style: normal;
  font-weight: 700;
}

.cap-slot__name u {
  flex: 0 0 auto;
  color: #9aa7a1;
  font-family: 'Manrope', sans-serif;
  font-size: 0.53rem;
  font-weight: 600;
  text-decoration: none;
}

.cap-slot__name mark {
  flex: 0 0 auto;
  padding: 1px 6px;
  border-radius: 999px;
  color: #1f5d40;
  background: var(--lime);
  font-size: 0.52rem;
  font-weight: 800;
}

.cap-slot--active .cap-slot__name { color: var(--ink); font-weight: 700; }
.cap-slot--active .cap-track { box-shadow: 0 0 0 2px rgba(201, 240, 108, 0.5); }

.cap-slot__note {
  color: #9aa7a1;
  font-size: 0.55rem;
  line-height: 1.45;
}

.cap-slot__amount {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  font-family: 'Manrope', sans-serif;
}

.cap-slot__amount b {
  color: #2c3b34;
  font-size: 0.7rem;
  font-weight: 800;
}

.cap-slot__amount em {
  color: #93a09a;
  font-size: 0.6rem;
  font-style: normal;
  font-weight: 700;
}

.cap-slot__status {
  color: var(--muted);
  font-size: 0.58rem;
  font-weight: 600;
  text-align: right;
}

.cap-slot--empty .cap-fill { background: #dfe5e1; }
.cap-slot--watch .cap-fill { background: linear-gradient(90deg, #7fbe63, #a9dd6b); }

.cap-slot--warn .cap-fill { background: linear-gradient(90deg, #e0a83d, #f0cf6c); }
.cap-slot--warn .cap-slot__status { color: #98661f; }

.cap-slot--full .cap-fill { background: linear-gradient(90deg, #d1863c, #e6a94f); }
.cap-slot--full .cap-slot__status { color: #98661f; }

.cap-slot--over .cap-fill {
  background: repeating-linear-gradient(-45deg, var(--red) 0 7px, #d96a60 7px 14px);
}

.cap-slot--over .cap-slot__amount b,
.cap-slot--over .cap-slot__status { color: var(--red); }

.cap-slot--spare {
  padding-top: 8px;
  border-top: 1px dotted #e6eae5;
}

.cap-plan__total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px solid #ecefe9;
  color: var(--ink);
  font-size: 0.66rem;
  font-weight: 700;
}

.cap-plan__total b {
  color: var(--ink);
  font-family: 'Manrope', sans-serif;
  font-size: 0.7rem;
  font-weight: 800;
}

.cap-card--off {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.cap-off strong {
  color: var(--ink);
  font-size: 0.78rem;
}

.cap-off p {
  margin: 3px 0 0;
  color: var(--muted);
  font-size: 0.65rem;
  line-height: 1.5;
}

@media (max-width: 520px) {
  .cap-card--off { align-items: stretch; flex-direction: column; }
}
</style>
