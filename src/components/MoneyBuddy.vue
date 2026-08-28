<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useSalarySettings } from '../composables/useSalarySettings'
import type { Transaction } from '../types/transaction'
import { createFinancialForecast } from '../utils/forecast'
import { formatBaht, formatDate } from '../utils/format'

type Mood = 'ready' | 'happy' | 'worried' | 'crying'

const props = defineProps<{
  income: number
  expense: number
  balance: number
  transactions: Transaction[]
  scopeLabel?: string
}>()

const emit = defineEmits<{
  editSalary: []
}>()

const { monthlySalary, salaryDay, salaryHidden, toggleSalaryVisibility } = useSalarySettings()
const reactionIndex = ref(0)
const isTapped = ref(false)
let tapTimer: ReturnType<typeof window.setTimeout> | undefined
let dateRefreshTimer: ReturnType<typeof window.setInterval> | undefined

const toLocalIsoDate = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const currentDate = ref(toLocalIsoDate(new Date()))
const refreshCurrentDate = () => {
  currentDate.value = toLocalIsoDate(new Date())
}

const forecast = computed(() => createFinancialForecast({
  transactions: props.transactions,
  monthlySalary: monthlySalary.value,
  salaryDay,
  today: currentDate.value,
}))

const spendingRatio = computed(() => {
  if (props.income <= 0) return props.expense > 0 ? 100 : 0
  return Math.round((props.expense / props.income) * 100)
})

const mood = computed<Mood>(() => {
  const result = forecast.value

  if (props.income === 0 && props.expense === 0 && !result.hasSpendingData) return 'ready'
  if (props.balance < 0) return 'crying'
  // ข้อมูลยังน้อยเกินกว่าจะตัดสิน อย่าทำให้ผู้ใช้ใหม่ตกใจด้วยเลขที่ยังเชื่อไม่ได้
  if (result.status === 'insufficient') return 'ready'
  if (result.status === 'risk') return 'crying'
  if (props.expense > 0 && (props.income <= 0 || spendingRatio.value >= 80)) return 'crying'
  if (result.status === 'watch' || spendingRatio.value >= 50) return 'worried'
  return 'happy'
})

const learningNote = computed(() => {
  const result = forecast.value
  const trustPercent = Math.round(result.estimateWeight * 100)
  return `ข้อมูล ${result.historyDays} วัน ${result.expenseRecordCount} รายการ `
    + `น้องเชื่อข้อมูลจริงอยู่ ${trustPercent}% ที่เหลือใช้ค่าอ้างอิงจากเงินเดือนแทน`
})

const forecastMessage = computed(() => {
  const result = forecast.value

  if (!result.hasSpendingData) {
    return salaryHidden.value
      ? `ตั้งวันเงินเดือนไว้วันที่ ${result.salaryDay} แล้ว เริ่มจดรายจ่ายเพื่อให้คาดการณ์แม่นขึ้นนะ`
      : `ตั้งเงินเดือนไว้ ${formatBaht(result.monthlySalary)} วันที่ ${result.salaryDay} เริ่มจดรายจ่ายเพื่อให้คาดการณ์แม่นขึ้นนะ`
  }

  if (result.status === 'insufficient') {
    return `ยังสรุปแนวโน้มไม่ได้นะ ${learningNote.value} `
      + `ตอนนี้ประเมินไว้ราว ${formatBaht(result.averageDailyExpense)} ต่อวัน`
  }

  if (result.status === 'risk') {
    if (result.currentBalance < 0) {
      return `ยอดคงเหลือติดลบ ${formatBaht(Math.abs(result.currentBalance))} อยู่แล้ว ต้องรีบเบรกรายจ่ายนะ`
    }
    if (result.balanceBeforeSalary < 0) {
      return `ถ้าใช้เท่าเดิม เงินอาจขาด ${formatBaht(Math.abs(result.balanceBeforeSalary))} ก่อนเงินเดือนรอบหน้า`
    }
    return `แนวโน้มอีก 30 วันอาจติดลบ ${formatBaht(Math.abs(result.projectedBalance30Days))} ลองลดรายจ่ายกันนะ`
  }

  if (result.status === 'watch') {
    return `ช่วงนี้ใช้เฉลี่ย ${formatBaht(result.averageDailyExpense)} ต่อวัน ลองชะลอรายจ่ายที่ไม่จำเป็นนะ`
  }

  return `ถ้าใช้จ่ายใกล้เคียงเดิม ก่อนเงินเดือนเข้าคาดว่าจะเหลือ ${formatBaht(result.balanceBeforeSalary)}`
})

const messages = computed<Record<Mood, string[]>>(() => ({
  ready: [
    forecastMessage.value,
    'พร้อมช่วยดูแลเงินแล้ว เพิ่มรายการแรกได้เลย!',
    'เริ่มจากบันทึกรายรับหรือรายจ่ายวันนี้ก่อนก็ได้นะ',
  ],
  happy: [
    forecastMessage.value,
    'เก่งมาก! แนวโน้มการเงินยังอยู่ในระดับสบายใจ',
    `ยอดคงเหลือถึงวันนี้ ${formatBaht(forecast.value.currentBalance)} รักษาจังหวะนี้ไว้นะ`,
  ],
  worried: [
    forecastMessage.value,
    'ก่อนซื้อครั้งหน้า ลองรอ 10 นาทีแล้วถามตัวเองอีกที',
    'ลองดูรายการย้อนหลัง อาจมีค่าใช้จ่ายที่ลดได้',
  ],
  crying: [
    forecastMessage.value,
    'พักซื้อของที่ไม่จำเป็นก่อน น้องเป็นห่วง!',
    'ลองตั้งเป้าลดค่าใช้จ่ายเฉลี่ยต่อวันกันนะ',
  ],
}))

const message = computed(() => {
  const choices = messages.value[mood.value]
  return choices[reactionIndex.value % choices.length]
})

const statusLabel = computed(() => {
  if (mood.value === 'ready') {
    return forecast.value.hasSpendingData ? 'กำลังเรียนรู้' : 'รอข้อมูลแรก'
  }
  if (mood.value === 'happy') return 'บริหารได้ดี'
  if (mood.value === 'worried') return 'ควรเฝ้าดู'
  return 'เสี่ยงเงินไม่พอ'
})

const forecastStatusLabel = computed(() => {
  if (forecast.value.status === 'insufficient') return 'กำลังเรียนรู้'
  if (forecast.value.status === 'safe') return 'แนวโน้มดี'
  if (forecast.value.status === 'watch') return 'ควรระวัง'
  return 'มีความเสี่ยง'
})

const forecastConfidenceLabel = computed(() => {
  if (forecast.value.confidence === 'high') return 'ความมั่นใจสูง (ข้อมูลเกิน 2 รอบเงินเดือน)'
  if (forecast.value.confidence === 'medium') return 'ความมั่นใจปานกลาง'
  return 'ข้อมูลยังน้อย ยังไม่เตือนแนวโน้ม'
})

const nextSalaryTiming = computed(() => {
  if (forecast.value.daysUntilSalary === 0) return 'วันนี้'
  if (forecast.value.daysUntilSalary === 1) return 'พรุ่งนี้'
  return `อีก ${forecast.value.daysUntilSalary} วัน`
})

const forecastAdvice = computed(() => {
  const result = forecast.value

  if (!result.hasSpendingData) {
    return 'ยังไม่มีข้อมูลรายจ่ายใน 90 วันที่ผ่านมา บันทึกรายจ่ายเพิ่มแล้วน้องจะปรับการคาดการณ์ให้อัตโนมัติ'
  }

  if (result.status === 'insufficient') {
    return result.hasFullCycleData
      ? 'ข้อมูลครบหนึ่งรอบแล้วแต่รายการยังน้อย บันทึกต่อไปอีกหน่อยน้องจะเริ่มเตือนแนวโน้มให้'
      : 'ค่าเฉลี่ยช่วงต้นรอบจะเหวี่ยงจากรายจ่ายก้อนใหญ่อย่างค่าหอ น้องจึงยังไม่สรุปจนกว่าจะเห็นข้อมูลครบรอบ'
  }

  if (result.status === 'risk') {
    if (result.safeDailyBudget !== null) {
      return `เพื่อให้ถึงวันเงินเดือนออก ควรใช้ไม่เกินประมาณ ${formatBaht(result.safeDailyBudget)} ต่อวัน`
    }
    return 'ยอดคาดการณ์มีโอกาสติดลบ ควรชะลอรายจ่ายและตรวจรายการที่ลดได้ก่อน'
  }

  if (result.status === 'watch') {
    const monthlyTrend = result.averageDailyExpense * 30
    if (monthlyTrend > result.monthlySalary) {
      return `แนวโน้มรายจ่าย 30 วันสูงกว่าเงินเดือนประมาณ ${formatBaht(monthlyTrend - result.monthlySalary)}`
    }
    return 'รายจ่ายเฉลี่ยเริ่มใกล้งบที่ใช้ได้ต่อวัน ลองเว้นรายจ่ายที่ไม่จำเป็นบางรายการ'
  }

  return `หลังเงินเดือนรอบหน้าเข้า คาดว่าจะมี ${formatBaht(result.balanceAfterSalary)} หากพฤติกรรมการใช้เงินใกล้เคียงเดิม`
})

const progressWidth = computed(() => `${Math.min(spendingRatio.value, 100)}%`)

const react = () => {
  reactionIndex.value += 1
  isTapped.value = false
  window.clearTimeout(tapTimer)
  requestAnimationFrame(() => {
    isTapped.value = true
    tapTimer = window.setTimeout(() => {
      isTapped.value = false
    }, 520)
  })
}

onMounted(() => {
  refreshCurrentDate()
  dateRefreshTimer = window.setInterval(refreshCurrentDate, 60_000)
  window.addEventListener('focus', refreshCurrentDate)
})

onBeforeUnmount(() => {
  window.clearTimeout(tapTimer)
  window.clearInterval(dateRefreshTimer)
  window.removeEventListener('focus', refreshCurrentDate)
})
</script>

<template>
  <section class="buddy-card" :class="`buddy-card--${mood}`" aria-labelledby="buddy-title">
    <div class="buddy-copy">
      <div class="buddy-heading">
        <span class="buddy-kicker">เพื่อนดูแลกระเป๋า</span>
        <span class="mood-badge"><i></i>{{ statusLabel }}</span>
      </div>
      <h2 id="buddy-title">
        น้องถุงเงิน
        <small v-if="scopeLabel">{{ scopeLabel }}</small>
      </h2>

      <button class="speech" type="button" aria-label="คุยกับน้องถุงเงิน" @click="react">
        <span aria-live="polite">{{ message }}</span>
        <small>แตะเพื่อคุยกับน้อง</small>
      </button>

      <div class="spending-meter">
        <div class="meter-label">
          <span>ใช้ไป {{ spendingRatio }}% ของรายรับ</span>
          <strong>{{ formatBaht(expense) }}</strong>
        </div>
        <div
          class="meter-track"
          role="progressbar"
          aria-label="สัดส่วนรายจ่ายต่อรายรับ"
          :aria-valuenow="Math.min(spendingRatio, 100)"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <span :style="{ width: progressWidth }"></span>
        </div>
        <div class="meter-zones" aria-hidden="true">
          <span>สบายใจ</span><span>ระวัง</span><span>สูง</span>
        </div>
      </div>
    </div>

    <button
      class="buddy-button"
      :class="{ 'is-tapped': isTapped }"
      type="button"
      aria-label="แตะน้องถุงเงิน"
      @click="react"
    >
      <span v-if="mood === 'happy'" class="spark spark--one" aria-hidden="true">✦</span>
      <span v-if="mood === 'happy'" class="spark spark--two" aria-hidden="true">✦</span>
      <span v-if="mood === 'crying'" class="puddle" aria-hidden="true"></span>

      <svg class="buddy" viewBox="0 0 220 220" role="img" :aria-label="`น้องถุงเงินกำลัง${statusLabel}`">
        <path class="shadow" d="M43 193c0-13 31-23 69-23s68 10 68 23-30 18-68 18-69-5-69-18Z" />
        <g class="vamp-horns" aria-hidden="true">
          <path class="horn horn--left" d="M88 56C69 50 60 34 65 11c5 12 14 20 29 23l-6 22Z" />
          <path class="horn horn--right" d="M130 56c19-6 28-22 23-45-5 12-14 20-29 23l6 22Z" />
        </g>
        <path class="knot" d="M75 52c7-11 13-20 14-34 12 6 22 6 35 0 2 13 9 24 18 34-18 12-48 11-67 0Z" />
        <path class="tie" d="M70 50c17-9 57-9 75 0l-8 17c-18-7-42-7-59 0L70 50Z" />
        <path class="body" d="M77 61c18-9 43-9 61 0 15 20 38 50 38 84 0 39-27 59-68 59s-67-20-67-59c0-34 22-64 36-84Z" />
        <path class="belly" d="M61 142c0-28 20-57 47-57s47 29 47 57-17 47-47 47-47-19-47-47Z" />
        <path class="arm arm--left" d="M48 117c-18 5-25 19-19 34 3 7 9 10 15 7" />
        <path class="arm arm--right" d="M168 117c18 5 25 19 19 34-3 7-9 10-15 7" />

        <g class="face" :class="`face--${mood}`">
          <template v-if="mood === 'happy'">
            <path class="eye-line" d="M82 120c5-7 12-7 17 0" />
            <path class="eye-line" d="M118 120c5-7 12-7 17 0" />
            <path class="mouth-line" d="M92 141c9 12 24 12 33 0" />
            <circle class="cheek" cx="78" cy="139" r="7" />
            <circle class="cheek" cx="139" cy="139" r="7" />
          </template>

          <template v-else-if="mood === 'worried'">
            <path class="brow" d="M78 108l18 5" />
            <path class="brow" d="M139 108l-18 5" />
            <ellipse class="eye" cx="89" cy="122" rx="5" ry="7" />
            <ellipse class="eye" cx="128" cy="122" rx="5" ry="7" />
            <path class="mouth-line" d="M96 151c7-7 18-7 25 0" />
          </template>

          <template v-else-if="mood === 'crying'">
            <path class="brow" d="M78 111l17-6" />
            <path class="brow" d="M139 111l-17-6" />
            <path class="eye-line" d="M80 124c6 5 13 5 19 0" />
            <path class="eye-line" d="M117 124c6 5 13 5 19 0" />
            <path class="mouth-fill" d="M94 153c5-15 23-15 29 0-8 7-20 7-29 0Z" />
            <path class="tear tear--left" d="M84 129c-1 9-8 15-5 22 3 7 12 7 15 0 3-7-6-14-10-22Z" />
            <path class="tear tear--right" d="M132 129c1 9 8 15 5 22-3 7-12 7-15 0-3-7 6-14 10-22Z" />
          </template>

          <template v-else>
            <ellipse class="eye" cx="89" cy="122" rx="5" ry="7" />
            <ellipse class="eye" cx="128" cy="122" rx="5" ry="7" />
            <path class="mouth-line" d="M99 145h19" />
          </template>
        </g>
        <text class="baht" x="108" y="95" text-anchor="middle">฿</text>
      </svg>
    </button>

    <section
      class="forecast-panel"
      :class="`forecast-panel--${forecast.status}`"
      aria-labelledby="forecast-title"
    >
      <header class="forecast-heading">
        <div>
          <span>วิเคราะห์อนาคต</span>
          <h3 id="forecast-title">คาดการณ์ 30 วัน</h3>
        </div>
        <div class="forecast-heading__actions">
          <span class="forecast-status">{{ forecastStatusLabel }}</span>
          <button
            class="forecast-privacy"
            type="button"
            :aria-label="salaryHidden ? 'แสดงเงินเดือน' : 'เบลอเงินเดือน'"
            :aria-pressed="!salaryHidden"
            :title="salaryHidden ? 'แสดงเงินเดือน' : 'เบลอเงินเดือน'"
            @click="toggleSalaryVisibility"
          >
            <svg v-if="salaryHidden" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.3A10.7 10.7 0 0 1 12 4c5.5 0 9 5.1 9 5.1a14.8 14.8 0 0 1-2.5 2.8M6.6 6.7C4.4 8.2 3 10.9 3 10.9S6.5 16 12 16c1 0 2-.2 2.8-.5" />
            </svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 12s3.5-5 9-5 9 5 9 5-3.5 5-9 5-9-5-9-5Z" />
              <circle cx="12" cy="12" r="2.5" />
            </svg>
          </button>
          <button type="button" @click="emit('editSalary')">ตั้งค่า</button>
        </div>
      </header>

      <div class="forecast-metrics">
        <article>
          <span>รายจ่ายเฉลี่ย / วัน</span>
          <strong>
            {{ forecast.hasSpendingData ? formatBaht(forecast.averageDailyExpense) : 'รอข้อมูล' }}
          </strong>
          <small v-if="forecast.isEstimateBlended" :title="learningNote">
            ค่าประมาณ · จริง {{ formatBaht(forecast.observedDailyExpense) }} จากข้อมูล
            {{ forecast.historyDays }} วัน
          </small>
          <small v-else-if="forecast.hasSpendingData">
            {{ forecast.historyDays }} วัน · {{ forecast.expenseRecordCount }} รายการ
          </small>
          <small v-else>เริ่มจดรายจ่ายเพื่อวิเคราะห์</small>
        </article>

        <article>
          <span>เงินเดือนรอบหน้า</span>
          <strong
            class="salary-amount"
            :aria-label="salaryHidden ? 'ซ่อนจำนวนเงินเดือนอยู่' : formatBaht(forecast.monthlySalary)"
          >
            <span :class="{ 'is-blurred': salaryHidden }" aria-hidden="true">
              {{ formatBaht(forecast.monthlySalary) }}
            </span>
          </strong>
          <small>
            <time :datetime="forecast.nextSalaryDate">{{ formatDate(forecast.nextSalaryDate) }}</time>
            · {{ nextSalaryTiming }}
          </small>
        </article>

        <article>
          <span>คาดว่าก่อนเงินเดือนเข้า</span>
          <strong :class="{ 'is-negative': forecast.balanceBeforeSalary < 0 }">
            {{ formatBaht(forecast.balanceBeforeSalary) }}
          </strong>
          <small>หักรายจ่ายคาดการณ์ {{ formatBaht(forecast.projectedExpenseUntilSalary) }}</small>
        </article>

        <article>
          <span>ยอดคาดการณ์อีก 30 วัน</span>
          <strong :class="{ 'is-negative': forecast.projectedBalance30Days < 0 }">
            {{ formatBaht(forecast.projectedBalance30Days) }}
          </strong>
          <small>
            รายจ่าย {{ formatBaht(forecast.projectedExpense30Days) }} · เงินเดือน
            {{ forecast.salaryPaymentsIn30Days }} รอบ
          </small>
        </article>
      </div>

      <p class="forecast-advice">{{ forecastAdvice }}</p>
      <footer>
        {{ forecastConfidenceLabel }} · คำนวณจากข้อมูลสูงสุด 90 วัน · เงินเดือนวันที่
        {{ forecast.salaryDay }} (ก.พ. ใช้วันสุดท้าย)
        <template v-if="forecast.isEstimateBlended"> · {{ learningNote }}</template>
      </footer>
    </section>
  </section>
</template>

<style scoped>
.buddy-card {
  position: relative;
  display: grid;
  min-height: 270px;
  grid-template-columns: minmax(0, 1.4fr) minmax(220px, 0.6fr);
  align-items: center;
  gap: 24px;
  margin-top: 20px;
  padding: 27px 34px;
  overflow: hidden;
  border: 1px solid #dce7df;
  border-radius: 20px;
  background: linear-gradient(125deg, #f8fcf9 0%, #edf7f1 68%, #e3f4e9 100%);
  box-shadow: 0 12px 40px rgba(23, 45, 36, 0.055);
  transition: background 0.4s, border-color 0.4s;
}

.buddy-card::after {
  position: absolute;
  right: -60px;
  top: -110px;
  width: 330px;
  height: 330px;
  border: 1px solid rgba(51, 143, 101, 0.12);
  border-radius: 50%;
  box-shadow: 0 0 0 55px rgba(51, 143, 101, 0.035), 0 0 0 110px rgba(51, 143, 101, 0.02);
  content: '';
  pointer-events: none;
}

.buddy-card--worried {
  border-color: #ebdda7;
  background: linear-gradient(125deg, #fffdf6, #fff8dc);
}

.buddy-card--crying {
  border-color: #d5e2ed;
  background: linear-gradient(125deg, #f8fbfd, #e8f1f7);
}

.buddy-copy {
  position: relative;
  z-index: 2;
}

.buddy-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}

.buddy-kicker {
  color: #57806e;
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.mood-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  border-radius: 999px;
  color: #42725d;
  background: rgba(66, 145, 103, 0.1);
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: 0.62rem;
  font-weight: 700;
}

.mood-badge i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #42a172;
}

.buddy-card--worried .mood-badge {
  color: #887126;
  background: rgba(206, 167, 49, 0.13);
}

.buddy-card--worried .mood-badge i {
  background: #d0a52c;
}

.buddy-card--crying .mood-badge {
  color: #557993;
  background: rgba(77, 127, 163, 0.11);
}

.buddy-card--crying .mood-badge i {
  background: #6496b9;
}

.buddy-copy h2 {
  margin: 6px 0 13px;
  color: var(--ink);
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: clamp(1.25rem, 2vw, 1.65rem);
}

.buddy-copy h2 small {
  display: inline-block;
  margin-left: 4px;
  padding: 3px 6px;
  border-radius: 999px;
  color: #517565;
  background: rgba(55, 139, 98, 0.1);
  font-size: 0.52rem;
  font-weight: 700;
  vertical-align: middle;
}

.speech {
  position: relative;
  display: flex;
  width: min(100%, 560px);
  align-items: flex-start;
  flex-direction: column;
  gap: 4px;
  padding: 13px 16px;
  border: 1px solid #dce6df;
  border-radius: 13px;
  outline: none;
  color: #34443d;
  background: rgba(255, 255, 255, 0.82);
  text-align: left;
  box-shadow: 0 5px 18px rgba(27, 67, 49, 0.055);
  transition: transform 0.2s, border-color 0.2s;
}

.speech::after {
  position: absolute;
  right: -9px;
  top: 22px;
  width: 16px;
  height: 16px;
  border-top: 1px solid #dce6df;
  border-right: 1px solid #dce6df;
  background: #fff;
  content: '';
  transform: rotate(45deg);
}

.speech:hover,
.speech:focus-visible {
  border-color: #87aa9a;
  transform: translateY(-1px);
}

.speech span {
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: 0.82rem;
  font-weight: 600;
  line-height: 1.5;
}

.speech small {
  color: #8b9791;
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: 0.6rem;
}

.spending-meter {
  max-width: 560px;
  margin-top: 16px;
}

.meter-label,
.meter-zones {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: 'Noto Sans Thai', sans-serif;
}

.meter-label {
  margin-bottom: 7px;
  color: #64726c;
  font-size: 0.66rem;
}

.meter-label strong {
  color: var(--ink);
  font-family: 'Manrope', sans-serif;
  font-size: 0.7rem;
}

.meter-track {
  height: 9px;
  overflow: hidden;
  border-radius: 99px;
  background: linear-gradient(90deg, #dfece5 0 50%, #f6ebbd 50% 80%, #f3d2cf 80%);
}

.meter-track > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #3c966a;
  box-shadow: 2px 0 6px rgba(26, 92, 62, 0.2);
  transition: width 0.65s cubic-bezier(.2, .8, .2, 1), background 0.3s;
}

.buddy-card--worried .meter-track > span {
  background: #d2a62e;
}

.buddy-card--crying .meter-track > span {
  background: #d45d54;
}

.meter-zones {
  margin-top: 5px;
  color: #9aa39f;
  font-size: 0.55rem;
}

.forecast-panel {
  position: relative;
  z-index: 2;
  display: grid;
  grid-column: 1 / -1;
  gap: 11px;
  margin-top: 3px;
  padding: 15px;
  border: 1px solid rgba(70, 126, 98, 0.18);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.76);
  font-family: 'Noto Sans Thai', sans-serif;
  box-shadow: 0 6px 20px rgba(26, 68, 49, 0.045);
}

.forecast-heading,
.forecast-heading__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.forecast-heading > div:first-child > span {
  display: block;
  color: #678174;
  font-size: 0.54rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.forecast-heading h3 {
  margin: 2px 0 0;
  color: #22362d;
  font-size: 0.82rem;
}

.forecast-status {
  padding: 4px 7px;
  border-radius: 999px;
  color: #337052;
  background: #e5f3eb;
  font-size: 0.55rem;
  font-weight: 800;
  white-space: nowrap;
}

.forecast-panel--insufficient .forecast-status {
  color: #65766e;
  background: #edf1ef;
}

.forecast-panel--watch .forecast-status {
  color: #846b20;
  background: #f8edc8;
}

.forecast-panel--risk .forecast-status {
  color: #a4453e;
  background: #f8e2df;
}

.forecast-heading__actions button {
  padding: 4px 7px;
  border: 1px solid #c9d9d0;
  border-radius: 7px;
  color: #35664f;
  background: #fff;
  font-family: inherit;
  font-size: 0.55rem;
  font-weight: 700;
  white-space: nowrap;
}

.forecast-heading__actions button:hover,
.forecast-heading__actions button:focus-visible {
  border-color: #6f9b84;
  background: #f3f8f5;
}

.forecast-heading__actions button:focus-visible {
  outline: 3px solid rgba(41, 116, 79, 0.28);
  outline-offset: 1px;
}

.forecast-heading__actions .forecast-privacy {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  padding: 0;
}

.forecast-privacy svg {
  width: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.forecast-metrics .salary-amount > span {
  min-height: 0;
  color: inherit;
  font: inherit;
  transition: filter 0.18s ease;
}

.forecast-metrics .salary-amount > .is-blurred {
  filter: blur(5px);
  user-select: none;
}

.forecast-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
}

.forecast-metrics article {
  min-width: 0;
  padding: 10px;
  border: 1px solid #e1e9e4;
  border-radius: 10px;
  background: rgba(248, 251, 249, 0.92);
}

.forecast-metrics span,
.forecast-metrics strong,
.forecast-metrics small {
  display: block;
}

.forecast-metrics span {
  min-height: 2.6em;
  color: #74847c;
  font-size: 0.57rem;
  font-weight: 700;
  line-height: 1.3;
}

.forecast-metrics strong {
  margin-top: 4px;
  overflow-wrap: anywhere;
  color: #244d3a;
  font-family: 'Manrope', 'Noto Sans Thai', sans-serif;
  font-size: 0.75rem;
  line-height: 1.25;
}

.forecast-metrics strong.is-negative {
  color: #bd4c44;
}

.forecast-metrics small {
  margin-top: 4px;
  color: #8b9690;
  font-size: 0.5rem;
  line-height: 1.35;
}

.forecast-advice {
  margin: 0;
  padding: 9px 11px;
  border-left: 3px solid #55a278;
  border-radius: 4px 9px 9px 4px;
  color: #3f5e50;
  background: #edf7f1;
  font-size: 0.62rem;
  font-weight: 600;
  line-height: 1.5;
}

.forecast-panel--watch .forecast-advice {
  border-left-color: #d0a52c;
  color: #74601f;
  background: #fff8df;
}

.forecast-panel--risk .forecast-advice {
  border-left-color: #ce5c53;
  color: #88443e;
  background: #fff0ee;
}

.forecast-panel footer {
  color: #929d97;
  font-size: 0.48rem;
  line-height: 1.4;
}

.compact-buddy .forecast-panel {
  gap: 8px;
  margin-top: 5px;
  padding: 11px;
  border-radius: 12px;
}

.compact-buddy .forecast-heading {
  align-items: flex-start;
  flex-wrap: wrap;
}

.compact-buddy .forecast-heading h3 {
  font-size: 0.72rem;
}

.compact-buddy .forecast-heading__actions {
  gap: 5px;
}

.compact-buddy .forecast-metrics {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.compact-buddy .forecast-metrics article {
  padding: 8px;
}

.compact-buddy .forecast-metrics span {
  min-height: 0;
  font-size: 0.51rem;
}

.compact-buddy .forecast-metrics strong {
  font-size: 0.65rem;
}

.compact-buddy .forecast-metrics small {
  font-size: 0.46rem;
}

.compact-buddy .forecast-advice {
  padding: 8px 9px;
  font-size: 0.55rem;
}

.buddy-button {
  position: relative;
  z-index: 2;
  width: 230px;
  justify-self: center;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  filter: drop-shadow(0 13px 12px rgba(29, 74, 54, 0.13));
  cursor: pointer;
}

.buddy-button:hover .buddy {
  transform: translateY(-5px) rotate(1deg);
}

.buddy-button:focus-visible {
  border-radius: 50%;
  box-shadow: 0 0 0 4px rgba(53, 144, 101, 0.24);
}

.buddy-button.is-tapped .buddy {
  animation: buddy-tap 0.5s cubic-bezier(.2, .9, .3, 1.3);
}

.buddy {
  display: block;
  width: 100%;
  overflow: visible;
  transition: transform 0.25s ease;
  animation: buddy-float 3.5s ease-in-out infinite;
}

.shadow { fill: rgba(30, 73, 53, 0.13); }
.knot { fill: #77c99a; stroke: #1e714d; stroke-width: 5; stroke-linejoin: round; }
.tie { fill: #c9f06c; stroke: #1e714d; stroke-width: 5; stroke-linejoin: round; }
.body { fill: #5fba85; stroke: #1e714d; stroke-width: 6; stroke-linejoin: round; }
.belly { fill: #86d5a5; opacity: 0.7; }
.arm { fill: none; stroke: #1e714d; stroke-width: 7; stroke-linecap: round; }
.eye { fill: #173c2d; }
.eye-line, .mouth-line, .brow { fill: none; stroke: #173c2d; stroke-width: 6; stroke-linecap: round; }
.mouth-fill { fill: #733b42; stroke: #173c2d; stroke-width: 4; }
.cheek { fill: #ef8f88; opacity: 0.72; }
.tear { fill: #77c9ef; stroke: #4388a8; stroke-width: 2; transform-origin: center; animation: tear-drop 1.25s ease-in infinite; }
.tear--right { animation-delay: 0.35s; }
.baht { fill: #e7ffac; font-family: 'Manrope', sans-serif; font-size: 25px; font-weight: 800; }

.buddy-card--worried .buddy {
  animation: buddy-nervous 1.8s ease-in-out infinite;
}

.buddy-card--crying .body { fill: #70aec7; stroke: #28657d; }
.buddy-card--crying .knot { fill: #91c7dc; stroke: #28657d; }
.buddy-card--crying .tie { fill: #d9eff7; stroke: #28657d; }
.buddy-card--crying .arm { stroke: #28657d; }
.buddy-card--crying .belly { fill: #a6d2e3; }
.buddy-card--crying .baht { fill: #eaf8fd; }
.buddy-card--crying .buddy { animation: buddy-sob 0.8s ease-in-out infinite; }

.spark {
  position: absolute;
  z-index: 3;
  color: #d6aa27;
  font-size: 1.25rem;
  animation: sparkle 1.4s ease-in-out infinite;
}

.spark--one { right: 20px; top: 34px; }
.spark--two { left: 22px; top: 80px; animation-delay: 0.5s; }

.puddle {
  position: absolute;
  z-index: -1;
  left: 45px;
  bottom: 8px;
  width: 145px;
  height: 28px;
  border-radius: 50%;
  background: rgba(101, 183, 221, 0.28);
  animation: puddle 1.6s ease-in-out infinite;
}

@keyframes buddy-float {
  0%, 100% { transform: translateY(0) rotate(-1deg); }
  50% { transform: translateY(-5px) rotate(1deg); }
}

@keyframes buddy-nervous {
  0%, 100% { transform: translateX(0) rotate(0); }
  30% { transform: translateX(-2px) rotate(-1deg); }
  60% { transform: translateX(2px) rotate(1deg); }
}

@keyframes buddy-sob {
  0%, 100% { transform: translateY(0) rotate(-0.5deg); }
  50% { transform: translateY(3px) rotate(0.5deg); }
}

@keyframes buddy-tap {
  0% { transform: scale(1); }
  35% { transform: scale(0.9) rotate(-3deg); }
  70% { transform: scale(1.08) rotate(3deg); }
  100% { transform: scale(1); }
}

@keyframes tear-drop {
  0% { transform: translateY(-2px) scale(0.8); opacity: 0.5; }
  70% { transform: translateY(10px) scale(1); opacity: 1; }
  100% { transform: translateY(16px) scale(0.7); opacity: 0; }
}

@keyframes sparkle {
  0%, 100% { transform: scale(0.7) rotate(0); opacity: 0.35; }
  50% { transform: scale(1.2) rotate(25deg); opacity: 1; }
}

@keyframes puddle {
  0%, 100% { transform: scaleX(0.88); opacity: 0.2; }
  50% { transform: scaleX(1); opacity: 0.4; }
}

.buddy-card.compact-buddy {
  min-height: 0;
  height: auto;
  grid-template-columns: minmax(0, 1fr) 112px;
  gap: 8px;
  margin-top: 0;
  padding: 16px;
  border-radius: 16px;
}

.buddy-card.compact-buddy::after {
  width: 210px;
  height: 210px;
  right: -85px;
  top: -65px;
  box-shadow: 0 0 0 35px rgba(51, 143, 101, 0.03);
}

.compact-buddy .buddy-kicker,
.compact-buddy .speech small,
.compact-buddy .meter-zones {
  display: none;
}

.compact-buddy .buddy-heading {
  gap: 6px;
}

.compact-buddy .mood-badge {
  padding: 4px 7px;
  font-size: 0.56rem;
}

.compact-buddy .buddy-copy h2 {
  margin: 5px 0 8px;
  font-size: 0.95rem;
}

.compact-buddy .speech {
  padding: 9px 10px;
  border-radius: 10px;
}

.compact-buddy .speech::after {
  right: -6px;
  top: 18px;
  width: 11px;
  height: 11px;
}

.compact-buddy .speech span {
  font-size: 0.66rem;
  line-height: 1.45;
}

.compact-buddy .spending-meter {
  margin-top: 10px;
}

.compact-buddy .meter-label {
  margin-bottom: 5px;
  font-size: 0.57rem;
}

.compact-buddy .meter-label strong {
  font-size: 0.59rem;
}

.compact-buddy .meter-track {
  height: 7px;
}

.compact-buddy .buddy-button {
  width: 118px;
}

.compact-buddy .spark {
  font-size: 0.85rem;
}

.compact-buddy .spark--one { right: 5px; top: 20px; }
.compact-buddy .spark--two { left: 8px; top: 45px; }
.compact-buddy .puddle { left: 20px; bottom: 4px; width: 85px; height: 18px; }

@media (max-width: 760px) {
  .buddy-card {
    grid-template-columns: 1fr 180px;
    padding: 24px;
  }

  .buddy-button {
    width: 190px;
  }
}

@media (max-width: 580px) {
  .buddy-card.compact-buddy {
    grid-template-columns: minmax(0, 1fr) 105px;
    gap: 6px;
    padding: 14px;
  }

  .compact-buddy .buddy-copy,
  .compact-buddy .buddy-button {
    order: 0;
  }

  .compact-buddy .buddy-button {
    width: 105px;
  }

  .compact-buddy .buddy-heading {
    justify-content: flex-start;
  }

  .compact-buddy .buddy-copy h2 {
    text-align: left;
  }

  .buddy-card:not(.compact-buddy) {
    grid-template-columns: 1fr;
    gap: 8px;
    padding: 21px 18px 13px;
  }

  .buddy-copy {
    order: 2;
  }

  .buddy-button {
    order: 1;
    width: 165px;
  }

  .speech::after {
    display: none;
  }

  .buddy-heading {
    justify-content: center;
  }

  .buddy-copy h2 {
    text-align: center;
  }
}

@media (prefers-reduced-motion: reduce) {
  .buddy,
  .tear,
  .spark,
  .puddle {
    animation: none !important;
  }
}
</style>
