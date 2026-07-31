<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatBaht } from '../utils/format'

type Mood = 'ready' | 'happy' | 'worried' | 'crying'

const props = defineProps<{
  income: number
  expense: number
  balance: number
  scopeLabel?: string
}>()

const reactionIndex = ref(0)
const isTapped = ref(false)
let tapTimer: ReturnType<typeof setTimeout> | undefined

const spendingRatio = computed(() => {
  if (props.income <= 0) return props.expense > 0 ? 100 : 0
  return Math.round((props.expense / props.income) * 100)
})

const mood = computed<Mood>(() => {
  if (props.income === 0 && props.expense === 0) return 'ready'
  if (props.expense > 0 && (props.income <= 0 || spendingRatio.value >= 80)) return 'crying'
  if (spendingRatio.value >= 50) return 'worried'
  return 'happy'
})

const messages: Record<Mood, string[]> = {
  ready: [
    'พร้อมช่วยดูแลเงินแล้ว เพิ่มรายการแรกได้เลย!',
    'เริ่มจากบันทึกรายรับก่อนก็ได้นะ',
  ],
  happy: [
    'เก่งมาก! ยังเหลือเงินให้เก็บอีกเยอะเลย',
    'วันนี้น้องอารมณ์ดี เพราะคุณคุมรายจ่ายได้ดี!',
    `ยอดคงเหลือ ${formatBaht(props.balance)} รักษาจังหวะนี้ไว้นะ`,
  ],
  worried: [
    'เริ่มใช้เกินครึ่งของรายรับแล้ว ลองชะลอสักนิดนะ',
    'ก่อนซื้อครั้งหน้า ลองรอ 10 นาทีแล้วถามตัวเองอีกที',
    'ลองดูรายการย้อนหลัง อาจมีค่าใช้จ่ายที่ลดได้',
  ],
  crying: [
    'ฮือ... รายจ่ายแตะ 80% ของรายรับแล้วนะ',
    'พักซื้อของที่ไม่จำเป็นก่อน น้องเป็นห่วง!',
    'ลองตั้งเป้าลดรายจ่ายรายการถัดไปกันนะ',
  ],
}

const message = computed(() => {
  const choices = messages[mood.value]
  return choices[reactionIndex.value % choices.length]
})

const statusLabel = computed(() => {
  if (mood.value === 'ready') return 'รอข้อมูลแรก'
  if (mood.value === 'happy') return 'บริหารได้ดี'
  if (mood.value === 'worried') return 'เริ่มใช้เยอะ'
  return 'ใช้จ่ายสูงแล้ว'
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
