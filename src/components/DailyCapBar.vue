<script setup lang="ts">
import { computed } from 'vue'
import { dayKindEmojis, dayKindLabels, sumPlanItems, useDailyCap } from '../composables/useDailyCap'
import { formatBaht } from '../utils/format'

const props = withDefaults(
  defineProps<{
    /** วันที่ในรูปแบบ YYYY-MM-DD ที่กำลังดูอยู่ */
    date: string
    /** รายจ่ายรวมของวันนั้น */
    spent: number
    isToday?: boolean
  }>(),
  { isToday: true },
)

const emit = defineEmits<{ edit: [] }>()

const { capSettings, capEnabled, dayKindForDate } = useDailyCap()

const dayKind = computed(() => dayKindForDate(props.date))
const profile = computed(() => capSettings.value[dayKind.value])
const cap = computed(() => profile.value.cap)
const planTotal = computed(() => sumPlanItems(profile.value.items))
const planLeftover = computed(() => Math.round((cap.value - planTotal.value) * 100) / 100)

const spent = computed(() => Math.max(0, Math.round(Number(props.spent || 0) * 100) / 100))
const remaining = computed(() => Math.round((cap.value - spent.value) * 100) / 100)
const overBy = computed(() => Math.max(0, -remaining.value))
const ratio = computed(() => (cap.value > 0 ? spent.value / cap.value : 0))
const percent = computed(() => Math.round(ratio.value * 100))
const fillWidth = computed(() => `${Math.min(100, Math.max(spent.value > 0 ? 2 : 0, ratio.value * 100))}%`)

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
  if (level.value === 'warn') return `ใกล้ชนเพดานแล้ว เหลือให้ใช้อีกไม่มาก`
  if (level.value === 'watch') return `ใช้ไปแล้วเกินครึ่งของงบ${dayWord}`
  if (spent.value === 0) return `${dayWord}ยังไม่มีรายจ่าย งบเต็มจำนวน`
  return `ยังอยู่ในงบสบาย ๆ`
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
      class="cap-track"
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

    <ul v-if="profile.items.length" class="cap-plan" aria-label="แผนค่าใช้จ่ายของวัน">
      <li v-for="item in profile.items" :key="item.id">
        <span>{{ item.emoji }} {{ item.label }}</span>
        <b>{{ formatBaht(item.amount) }}</b>
      </li>
      <li class="cap-plan__total">
        <span>รวม</span>
        <b>{{ formatBaht(planTotal) }}</b>
      </li>
      <li class="cap-plan__spare" :class="{ 'cap-plan__spare--negative': planLeftover < 0 }">
        <span>{{ planLeftover < 0 ? 'แผนเกินงบ' : 'กันเหลือ' }}</span>
        <b>{{ formatBaht(Math.abs(planLeftover)) }}</b>
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
  height: 12px;
  overflow: hidden;
  border-radius: 999px;
  background: #edf1ec;
  box-shadow: inset 0 1px 3px rgba(23, 45, 36, 0.09);
}

.cap-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #57a97c, #8fd06a);
  transition: width 0.4s cubic-bezier(0.22, 0.68, 0.35, 1), background 0.3s;
}

.cap-card--watch .cap-fill { background: linear-gradient(90deg, #7fbe63, var(--lime)); }
.cap-card--warn .cap-fill { background: linear-gradient(90deg, #e0a83d, #f0cf6c); }
.cap-card--full .cap-fill { background: linear-gradient(90deg, #d1863c, #e6a94f); }

.cap-card--over .cap-fill {
  background: repeating-linear-gradient(
    -45deg,
    var(--red) 0 9px,
    #d96a60 9px 18px
  );
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
  gap: 1px;
  margin: 3px 0 0;
  padding: 9px 0 0;
  border-top: 1px dashed #e2e6df;
  list-style: none;
}

.cap-plan li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 4px 0;
  color: #55625c;
  font-size: 0.65rem;
}

.cap-plan li b {
  color: #33443c;
  font-family: 'Manrope', sans-serif;
  font-size: 0.66rem;
  font-weight: 700;
}

.cap-plan__total {
  margin-top: 3px;
  padding-top: 7px !important;
  border-top: 1px solid #ecefe9;
  font-weight: 700;
}

.cap-plan__total span,
.cap-plan__total b { color: var(--ink) !important; }

.cap-plan__spare span,
.cap-plan__spare b { color: #2f7d59 !important; }

.cap-plan__spare--negative span,
.cap-plan__spare--negative b { color: var(--red) !important; }

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
