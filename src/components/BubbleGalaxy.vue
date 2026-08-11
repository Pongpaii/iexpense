<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Transaction, TransactionType } from '../types/transaction'
import {
  buildBubbleField,
  findBubbleAt,
  stepBubbleField,
  type Bubble,
  type ClusterLabel,
  type PointerState,
} from '../utils/bubbleField'
import { formatBaht, formatDate } from '../utils/format'
import { buildSpendingHabits } from '../utils/spendingHabits'

const props = defineProps<{
  transactions: Transaction[]
}>()

/** จำนวนฟองมากสุด กันเครื่องช้าและกันจอแน่น */
const MAX_BUBBLES = 60
/** เพดานขนาดตัวอักษรของชื่อในฟอง ฟองเล็กจะได้ตัวเล็กลงเอง */
const NAME_FONT_SIZE = 16
/** จำนวนเฟรมที่คำนวณล่วงหน้าเมื่อผู้ใช้ปิดอนิเมชัน */
const SETTLE_STEPS = 220

const wrapper = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const activeType = ref<TransactionType>('expense')
const isolatedKey = ref<string | null>(null)
const selectedBubble = ref<Bubble | null>(null)
const hoveredBubble = ref<Bubble | null>(null)
const tooltipPosition = ref({ x: 0, y: 0 })
const stageSize = ref({ width: 0, height: 0 })
const prefersReducedMotion = ref(false)
const omittedCount = ref(0)

let bubbles: Bubble[] = []
let labels: ClusterLabel[] = []
let animationId: number | undefined
let resizeObserver: ResizeObserver | undefined
let motionQuery: MediaQueryList | undefined
const pointer: PointerState = { x: 0, y: 0, active: false }

const summary = computed(() => buildSpendingHabits(props.transactions, activeType.value))

const visibleGroups = computed(() =>
  isolatedKey.value
    ? summary.value.groups.filter(({ key }) => key === isolatedKey.value)
    : summary.value.groups,
)

const visibleHabitCount = computed(() =>
  visibleGroups.value.reduce((sum, group) => sum + group.habits.length, 0),
)

const typeLabel = computed(() => (activeType.value === 'expense' ? 'รายจ่าย' : 'รายรับ'))

const topHabits = computed(() =>
  visibleGroups.value
    .flatMap((group) => group.habits.map((habit) => ({ habit, group })))
    .sort((left, right) => right.habit.count - left.habit.count)
    .slice(0, 3),
)

const canvasSummary = computed(() =>
  `ฟอง ${Math.min(visibleHabitCount.value, MAX_BUBBLES)} ฟอง แต่ละฟองคือสิ่งที่จ่ายซ้ำ `
  + `ขนาดตามจำนวนครั้ง จัดกลุ่มตามหมวดหมู่ ${visibleGroups.value.length} หมวด `
  + 'รายละเอียดทั้งหมดอ่านได้จากรายการข้อความด้านล่าง',
)

const activeBubble = computed(() => selectedBubble.value ?? hoveredBubble.value)

const draw = () => {
  const element = canvas.value
  const context = element?.getContext('2d')
  if (!element || !context) return

  const { width, height } = stageSize.value
  context.clearRect(0, 0, width, height)
  context.textAlign = 'center'
  context.textBaseline = 'middle'

  for (const label of labels) {
    context.fillStyle = 'rgba(35, 74, 57, 0.09)'
    context.font = "700 16px 'Noto Sans Thai', sans-serif"
    context.fillText(label.label, label.x, label.y)
  }

  const highlightedId = activeBubble.value?.id ?? null

  for (const bubble of bubbles) {
    const isActive = bubble.id === highlightedId
    context.globalAlpha = highlightedId !== null && !isActive ? 0.38 : 1

    context.beginPath()
    context.arc(bubble.x, bubble.y, bubble.radius, 0, Math.PI * 2)
    context.fillStyle = bubble.color
    context.fill()
    context.lineWidth = isActive ? 3 : 1
    context.strokeStyle = isActive ? '#12301f' : 'rgba(255, 255, 255, 0.7)'
    context.stroke()

    context.beginPath()
    context.arc(
      bubble.x - bubble.radius * 0.32,
      bubble.y - bubble.radius * 0.34,
      Math.max(2, bubble.radius * 0.2),
      0,
      Math.PI * 2,
    )
    context.fillStyle = 'rgba(255, 255, 255, 0.34)'
    context.fill()

    drawBubbleText(context, bubble)
  }

  context.globalAlpha = 1
}

/** เขียนชื่อกลางฟอง พร้อมจำนวนครั้งไว้บรรทัดล่าง */
const drawBubbleText = (context: CanvasRenderingContext2D, bubble: Bubble) => {
  const lineHeight = bubble.fontSize * 1.2
  const countLabel = `×${bubble.count}`
  const blockHeight = bubble.lines.length * lineHeight + bubble.fontSize * 1.05
  let cursorY = bubble.y - blockHeight / 2 + lineHeight / 2

  context.font = `700 ${bubble.fontSize}px 'Noto Sans Thai', sans-serif`
  context.lineJoin = 'round'
  context.lineWidth = 2.6
  context.strokeStyle = 'rgba(16, 43, 31, 0.45)'

  for (const line of bubble.lines) {
    context.strokeText(line, bubble.x, cursorY)
    context.fillStyle = '#ffffff'
    context.fillText(line, bubble.x, cursorY)
    cursorY += lineHeight
  }

  context.font = `800 ${Math.round(bubble.fontSize * 0.92)}px 'Manrope', sans-serif`
  context.lineWidth = 2.4
  context.strokeText(countLabel, bubble.x, cursorY + 1)
  context.fillStyle = 'rgba(255, 255, 255, 0.92)'
  context.fillText(countLabel, bubble.x, cursorY + 1)
}

const step = () => {
  stepBubbleField(bubbles, {
    width: stageSize.value.width,
    height: stageSize.value.height,
    pointer,
  })
}

const settleAndDraw = () => {
  for (let iteration = 0; iteration < SETTLE_STEPS; iteration += 1) step()
  draw()
}

const renderFrame = () => {
  step()
  draw()
  animationId = window.requestAnimationFrame(renderFrame)
}

const stopAnimation = () => {
  if (animationId !== undefined) window.cancelAnimationFrame(animationId)
  animationId = undefined
}

const startAnimation = () => {
  stopAnimation()

  if (bubbles.length === 0) {
    draw()
    return
  }

  if (prefersReducedMotion.value) {
    settleAndDraw()
    return
  }

  animationId = window.requestAnimationFrame(renderFrame)
}

const syncCanvasSize = () => {
  const element = canvas.value
  const container = wrapper.value
  if (!element || !container) return

  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  const width = container.clientWidth
  const height = container.clientHeight
  stageSize.value = { width, height }

  element.width = Math.round(width * ratio)
  element.height = Math.round(height * ratio)
  element.style.width = `${width}px`
  element.style.height = `${height}px`
  element.getContext('2d')?.setTransform(ratio, 0, 0, ratio, 0, 0)
}

const rebuildField = () => {
  const context = canvas.value?.getContext('2d')
  if (!context) return

  const field = buildBubbleField({
    groups: visibleGroups.value,
    width: stageSize.value.width,
    height: stageSize.value.height,
    maxBubbles: MAX_BUBBLES,
    maxFontSize: NAME_FONT_SIZE,
    measure: (value: string, size: number) => {
      context.font = `700 ${size}px 'Noto Sans Thai', sans-serif`
      return context.measureText(value).width
    },
    previous: new Map(bubbles.map((bubble) => [bubble.id, bubble])),
  })

  bubbles = field.bubbles
  labels = field.labels
  omittedCount.value = field.omitted

  if (selectedBubble.value && !bubbles.some(({ id }) => id === selectedBubble.value?.id)) {
    selectedBubble.value = null
  }
  hoveredBubble.value = null
}

const rebuildAll = () => {
  syncCanvasSize()
  rebuildField()
  startAnimation()
}

const pointerPosition = (event: PointerEvent) => {
  const bounds = canvas.value?.getBoundingClientRect()
  if (!bounds) return null
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
}

const handlePointerMove = (event: PointerEvent) => {
  const position = pointerPosition(event)
  if (!position) return

  pointer.x = position.x
  pointer.y = position.y
  pointer.active = true
  tooltipPosition.value = position
  hoveredBubble.value = findBubbleAt(bubbles, position.x, position.y)
  if (prefersReducedMotion.value) draw()
}

const handlePointerLeave = () => {
  pointer.active = false
  hoveredBubble.value = null
  if (prefersReducedMotion.value) draw()
}

const handlePointerDown = (event: PointerEvent) => {
  const position = pointerPosition(event)
  if (!position) return

  tooltipPosition.value = position
  const bubble = findBubbleAt(bubbles, position.x, position.y)
  selectedBubble.value = bubble && bubble.id === selectedBubble.value?.id ? null : bubble
  if (prefersReducedMotion.value) draw()
}

const switchType = (next: TransactionType) => {
  if (activeType.value === next) return
  activeType.value = next
  isolatedKey.value = null
  selectedBubble.value = null
}

const toggleIsolate = (key: string) => {
  isolatedKey.value = isolatedKey.value === key ? null : key
  selectedBubble.value = null
}

const shakeBubbles = () => {
  for (const bubble of bubbles) {
    bubble.vx += (Math.random() - 0.5) * 26
    bubble.vy += (Math.random() - 0.5) * 26
  }
  if (prefersReducedMotion.value) settleAndDraw()
}

const handleVisibilityChange = () => {
  if (document.hidden) stopAnimation()
  else startAnimation()
}

const handleMotionPreferenceChange = (event: MediaQueryListEvent) => {
  prefersReducedMotion.value = event.matches
  startAnimation()
}

watch(visibleGroups, () => {
  rebuildField()
  startAnimation()
})

onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  prefersReducedMotion.value = motionQuery.matches
  motionQuery.addEventListener('change', handleMotionPreferenceChange)

  if (wrapper.value) {
    resizeObserver = new ResizeObserver(() => rebuildAll())
    resizeObserver.observe(wrapper.value)
  }

  document.addEventListener('visibilitychange', handleVisibilityChange)
  rebuildAll()
})

onBeforeUnmount(() => {
  stopAnimation()
  resizeObserver?.disconnect()
  motionQuery?.removeEventListener('change', handleMotionPreferenceChange)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <section class="bubble-panel" aria-labelledby="bubble-title">
    <header class="bubble-heading">
      <div>
        <span>Money bubbles</span>
        <h1 id="bubble-title">ฟองเงิน</h1>
      </div>

      <div class="bubble-actions">
        <div class="type-toggle" role="group" aria-label="เลือกชนิดของฟอง">
          <button type="button" :class="{ active: activeType === 'expense' }" @click="switchType('expense')">
            รายจ่าย
          </button>
          <button type="button" :class="{ active: activeType === 'income' }" @click="switchType('income')">
            รายรับ
          </button>
        </div>
        <button
          class="shake-button"
          type="button"
          :disabled="visibleHabitCount === 0"
          @click="shakeBubbles"
        >
          เขย่าฟอง
        </button>
      </div>
    </header>

    <p class="bubble-hint">
      ฟองใหญ่ = สิ่งที่จ่ายบ่อยที่สุด ตัวเลข ×N คือจำนวนครั้ง ไม่ใช่ยอดเงิน
      สีเดียวกันคือหมวดเดียวกัน กวนด้วยเมาส์ได้ กดฟองเพื่อดูยอดรวมและครั้งล่าสุด
    </p>

    <p v-if="topHabits.length" class="bubble-top" role="status">
      จ่ายบ่อยสุด:
      <b v-for="(entry, index) in topHabits" :key="entry.habit.id">
        {{ index > 0 ? ' · ' : '' }}{{ entry.group.emoji }} {{ entry.habit.name }}
        ({{ entry.habit.count }} ครั้ง)
      </b>
    </p>

    <div v-if="visibleHabitCount > 0" ref="wrapper" class="bubble-stage">
      <canvas
        ref="canvas"
        role="img"
        :aria-label="canvasSummary"
        @pointermove="handlePointerMove"
        @pointerleave="handlePointerLeave"
        @pointerdown="handlePointerDown"
      ></canvas>

      <div
        v-if="activeBubble"
        class="bubble-tooltip"
        :style="{
          left: `${Math.min(Math.max(tooltipPosition.x, 100), Math.max(stageSize.width - 100, 100))}px`,
          top: `${Math.max(tooltipPosition.y - 18, 10)}px`,
        }"
        role="status"
      >
        <strong>{{ activeBubble.name }}</strong>
        <span>{{ activeBubble.count }} ครั้ง · รวม {{ formatBaht(activeBubble.total) }}</span>
        <small>
          เฉลี่ยครั้งละ {{ formatBaht(activeBubble.total / activeBubble.count) }} ·
          ล่าสุด {{ formatDate(activeBubble.lastDate) }}
        </small>
        <em>{{ activeBubble.emoji }} {{ activeBubble.categoryLabel }}</em>
      </div>
    </div>

    <div v-else class="bubble-empty">
      <div aria-hidden="true">○</div>
      <strong>ยังไม่มี{{ typeLabel }}ให้เป่าเป็นฟอง</strong>
      <p>บันทึกรายการแล้วกลับมาดูอีกครั้ง รายการที่ชื่อซ้ำกันจะรวมเป็นฟองเดียวและโตขึ้นตามจำนวนครั้ง</p>
    </div>

    <ul v-if="summary.groups.length" class="bubble-legend">
      <li v-for="group in summary.groups" :key="group.key">
        <button
          type="button"
          :class="{ 'is-active': isolatedKey === group.key }"
          :aria-pressed="isolatedKey === group.key"
          @click="toggleIsolate(group.key)"
        >
          <i :style="{ background: group.color }" aria-hidden="true"></i>
          <b>{{ group.emoji }} {{ group.label }}</b>
          <small>{{ group.count }} ครั้ง · {{ group.habits.length }} อย่าง</small>
        </button>
      </li>
    </ul>

    <p v-if="omittedCount > 0" class="bubble-note" role="note">
      พื้นที่ไม่พอสำหรับทุกอย่าง ซ่อนไว้ {{ omittedCount }} รายการที่จ่ายน้อยครั้งที่สุด
      กดชิปหมวดหมู่เพื่อดูเฉพาะหมวดนั้นแล้วจะเห็นครบขึ้น
    </p>

    <details v-if="visibleHabitCount > 0" class="bubble-fallback">
      <summary>ดูเป็นรายการข้อความ (สำหรับคีย์บอร์ดและโปรแกรมอ่านหน้าจอ)</summary>
      <div v-for="group in visibleGroups" :key="group.key" class="fallback-group">
        <h2>{{ group.emoji }} {{ group.label }} · {{ group.count }} ครั้ง · {{ formatBaht(group.total) }}</h2>
        <ul>
          <li v-for="habit in group.habits" :key="habit.id">
            {{ habit.name }} · {{ habit.count }} ครั้ง · รวม {{ formatBaht(habit.total) }} ·
            ล่าสุด {{ formatDate(habit.lastDate) }}
          </li>
        </ul>
      </div>
    </details>
  </section>
</template>

<style scoped>
.bubble-panel {
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--paper);
  box-shadow: 0 8px 24px rgba(23, 45, 36, 0.05);
}

.bubble-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}

.bubble-heading span {
  color: #71877d;
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.bubble-heading h1 {
  margin: 3px 0 0;
  color: var(--ink);
  font: 700 1.1rem 'Noto Sans Thai', sans-serif;
}

.bubble-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}

.type-toggle {
  display: flex;
  padding: 3px;
  border-radius: 9px;
  background: #e9efeb;
}

.type-toggle button {
  min-height: 30px;
  padding: 4px 11px;
  border: 0;
  border-radius: 7px;
  color: #728078;
  background: transparent;
  font: 700 0.62rem 'Noto Sans Thai', sans-serif;
}

.type-toggle button.active {
  color: #20563e;
  background: #fff;
  box-shadow: 0 2px 7px rgba(25, 77, 59, 0.1);
}

.shake-button {
  min-height: 34px;
  padding: 6px 13px;
  border: 1px solid #cbdad2;
  border-radius: 9px;
  color: #2f5a46;
  background: #fff;
  font: 700 0.62rem 'Noto Sans Thai', sans-serif;
}

.shake-button:hover:not(:disabled) {
  border-color: #a7c3b3;
  background: #f3f9f5;
}

.shake-button:disabled {
  opacity: 0.55;
}

.bubble-hint {
  margin: 9px 0 8px;
  color: #83908a;
  font: 500 0.6rem 'Noto Sans Thai', sans-serif;
  line-height: 1.5;
}

.bubble-top {
  margin: 0 0 11px;
  color: #5e6f67;
  font: 500 0.62rem 'Noto Sans Thai', sans-serif;
}

.bubble-top b {
  color: #2f4a3d;
  font-weight: 700;
}

.bubble-stage {
  position: relative;
  height: clamp(360px, 60vh, 640px);
  overflow: hidden;
  border: 1px solid #e4ece7;
  border-radius: 14px;
  background:
    radial-gradient(circle at 22% 18%, rgba(201, 240, 108, 0.16), transparent 42%),
    linear-gradient(150deg, #f7fbf8, #eef6f1);
}

.bubble-stage canvas {
  display: block;
  touch-action: none;
  cursor: crosshair;
}

.bubble-tooltip {
  position: absolute;
  z-index: 3;
  display: grid;
  gap: 1px;
  max-width: 210px;
  padding: 8px 11px;
  border: 1px solid #d9e4de;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.97);
  font-family: 'Noto Sans Thai', sans-serif;
  box-shadow: 0 8px 20px rgba(23, 55, 40, 0.14);
  transform: translate(-50%, -100%);
  pointer-events: none;
}

.bubble-tooltip strong {
  color: #2c4438;
  font-size: 0.68rem;
  line-height: 1.35;
}

.bubble-tooltip span {
  color: #1f5540;
  font: 700 0.66rem 'Noto Sans Thai', sans-serif;
}

.bubble-tooltip small {
  color: #8d9791;
  font-size: 0.55rem;
  line-height: 1.45;
}

.bubble-tooltip em {
  color: #6f8a7b;
  font-size: 0.53rem;
  font-style: normal;
}

.bubble-empty {
  display: flex;
  min-height: 240px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 6px;
  border: 1px dashed #dbe5df;
  border-radius: 14px;
  color: #7b8781;
  font-family: 'Noto Sans Thai', sans-serif;
  text-align: center;
}

.bubble-empty > div {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 50%;
  color: #56816c;
  background: #edf4f0;
  font-size: 1.3rem;
}

.bubble-empty strong {
  color: #30483d;
  font-size: 0.78rem;
}

.bubble-empty p {
  max-width: 340px;
  margin: 0;
  font-size: 0.6rem;
  line-height: 1.5;
}

.bubble-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.bubble-legend button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 6px 10px;
  border: 1px solid #e0e8e3;
  border-radius: 999px;
  background: #fff;
  font-family: 'Noto Sans Thai', sans-serif;
  cursor: pointer;
}

.bubble-legend button:hover {
  border-color: #b6cec1;
  background: #f6faf7;
}

.bubble-legend button.is-active {
  border-color: #7aa78f;
  background: #eef6f1;
}

.bubble-legend button:focus-visible {
  outline: 3px solid rgba(73, 137, 103, 0.24);
  outline-offset: 1px;
}

.bubble-legend i {
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  border-radius: 50%;
}

.bubble-legend b {
  color: #43554c;
  font-size: 0.6rem;
}

.bubble-legend small {
  color: #93a09a;
  font-size: 0.53rem;
}

.bubble-note {
  margin: 9px 0 0;
  color: #8b968f;
  font: 500 0.56rem 'Noto Sans Thai', sans-serif;
  line-height: 1.5;
}

.bubble-fallback {
  margin-top: 11px;
  font-family: 'Noto Sans Thai', sans-serif;
}

.bubble-fallback summary {
  color: #5d7268;
  font-size: 0.58rem;
  font-weight: 700;
  cursor: pointer;
}

.fallback-group h2 {
  margin: 10px 0 4px;
  color: #37493f;
  font-size: 0.62rem;
}

.fallback-group ul {
  display: grid;
  gap: 3px;
  margin: 0;
  padding-left: 16px;
  color: #6d7a73;
  font-size: 0.57rem;
}

@media (max-width: 580px) {
  .bubble-panel { padding: 14px; }
  .bubble-stage { height: clamp(320px, 54vh, 480px); }
  .bubble-heading h1 { font-size: 0.98rem; }
}
</style>
