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
import { buildCategoryBreakdown, formatPercent } from '../utils/categoryBreakdown'
import { formatBaht, formatDate } from '../utils/format'

const props = defineProps<{
  transactions: Transaction[]
}>()

/** จำกัดจำนวนฟองเพื่อให้ลื่นบนเครื่องทั่วไป ถ้าเกินจะเฉลี่ยโควตาตามสัดส่วนแต่ละหมวด */
const MAX_BUBBLES = 240
/** จำนวนเฟรมที่คำนวณล่วงหน้าเมื่อผู้ใช้ปิดอนิเมชัน เพื่อให้ฟองเข้าที่ก่อนวาด */
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

let bubbles: Bubble[] = []
let labels: ClusterLabel[] = []
let animationId: number | undefined
let resizeObserver: ResizeObserver | undefined
let motionQuery: MediaQueryList | undefined
const pointer: PointerState = { x: 0, y: 0, active: false }

const breakdown = computed(() => buildCategoryBreakdown(props.transactions, activeType.value))

const visibleSlices = computed(() =>
  isolatedKey.value
    ? breakdown.value.slices.filter(({ key }) => key === isolatedKey.value)
    : breakdown.value.slices,
)

const totalCount = computed(() =>
  visibleSlices.value.reduce((sum, slice) => sum + slice.items.length, 0),
)

const shownCount = computed(() => Math.min(totalCount.value, MAX_BUBBLES))
const isCapped = computed(() => totalCount.value > MAX_BUBBLES)
const typeLabel = computed(() => (activeType.value === 'expense' ? 'รายจ่าย' : 'รายรับ'))
const activeBubble = computed(() => selectedBubble.value ?? hoveredBubble.value)

const canvasSummary = computed(() =>
  `ฟองสบู่ ${shownCount.value} ฟองแทน${typeLabel.value}แต่ละรายการ `
  + `จัดกลุ่มตามหมวดหมู่ ${visibleSlices.value.length} หมวด `
  + 'รายละเอียดทั้งหมดอ่านได้จากรายการข้อความด้านล่าง',
)

const draw = () => {
  const element = canvas.value
  const context = element?.getContext('2d')
  if (!element || !context) return

  const { width, height } = stageSize.value
  context.clearRect(0, 0, width, height)
  context.textAlign = 'center'
  context.textBaseline = 'middle'

  for (const label of labels) {
    context.fillStyle = 'rgba(35, 74, 57, 0.1)'
    context.font = "700 15px 'Noto Sans Thai', sans-serif"
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
    context.strokeStyle = isActive ? '#1c4a37' : 'rgba(255, 255, 255, 0.75)'
    context.stroke()

    // ไฮไลต์เล็ก ๆ ด้านซ้ายบนให้ดูเป็นฟองมีมิติ
    context.beginPath()
    context.arc(
      bubble.x - bubble.radius * 0.3,
      bubble.y - bubble.radius * 0.32,
      Math.max(1.5, bubble.radius * 0.24),
      0,
      Math.PI * 2,
    )
    context.fillStyle = 'rgba(255, 255, 255, 0.42)'
    context.fill()

    if (bubble.radius >= 17) {
      context.fillStyle = 'rgba(255, 255, 255, 0.95)'
      context.font = `700 ${Math.round(bubble.radius * 0.62)}px 'Manrope', sans-serif`
      context.fillText(bubble.emoji, bubble.x, bubble.y + 1)
    }
  }

  context.globalAlpha = 1
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
  const field = buildBubbleField({
    slices: visibleSlices.value,
    width: stageSize.value.width,
    height: stageSize.value.height,
    maxBubbles: MAX_BUBBLES,
    previous: new Map(bubbles.map((bubble) => [bubble.id, bubble])),
  })

  bubbles = field.bubbles
  labels = field.labels

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

watch(visibleSlices, () => {
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
        <button class="shake-button" type="button" :disabled="totalCount === 0" @click="shakeBubbles">
          เขย่าฟอง
        </button>
      </div>
    </header>

    <p class="bubble-hint">
      ฟองใหญ่คือรายการที่จ่ายหนัก สีเดียวกันคือหมวดเดียวกัน เอาเมาส์ไปกวนให้ฟองหลบ
      แล้วกดฟองเพื่อปักหมุดดูรายละเอียด
    </p>

    <div v-if="totalCount > 0" ref="wrapper" class="bubble-stage">
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
          left: `${Math.min(Math.max(tooltipPosition.x, 96), Math.max(stageSize.width - 96, 96))}px`,
          top: `${Math.max(tooltipPosition.y - 18, 10)}px`,
        }"
        role="status"
      >
        <strong>{{ activeBubble.description }}</strong>
        <span>{{ formatBaht(activeBubble.amount) }}</span>
        <small>
          {{ activeBubble.emoji }} {{ activeBubble.categoryLabel }} ·
          {{ formatDate(activeBubble.date) }}
        </small>
        <em v-if="selectedBubble">ปักหมุดไว้ · กดฟองเดิมอีกครั้งเพื่อปล่อย</em>
      </div>
    </div>

    <div v-else class="bubble-empty">
      <div aria-hidden="true">○</div>
      <strong>ยังไม่มี{{ typeLabel }}ให้เป่าเป็นฟอง</strong>
      <p>บันทึกรายการแล้วกลับมาดูอีกครั้ง แต่ละรายการจะกลายเป็นฟองหนึ่งฟอง</p>
    </div>

    <ul v-if="breakdown.slices.length" class="bubble-legend">
      <li v-for="slice in breakdown.slices" :key="slice.key">
        <button
          type="button"
          :class="{ 'is-active': isolatedKey === slice.key }"
          :aria-pressed="isolatedKey === slice.key"
          @click="toggleIsolate(slice.key)"
        >
          <i :style="{ background: slice.color }" aria-hidden="true"></i>
          <b>{{ slice.emoji }} {{ slice.label }}</b>
          <small>{{ slice.items.length }} ฟอง · {{ formatPercent(slice.percentage) }}</small>
        </button>
      </li>
    </ul>

    <p v-if="isCapped" class="bubble-note" role="note">
      รายการเยอะมาก แสดง {{ shownCount }} ฟองจาก {{ totalCount }} รายการ
      โดยแบ่งโควตาตามสัดส่วนของแต่ละหมวด
    </p>

    <details v-if="totalCount > 0" class="bubble-fallback">
      <summary>ดูเป็นรายการข้อความ (สำหรับคีย์บอร์ดและโปรแกรมอ่านหน้าจอ)</summary>
      <div v-for="slice in visibleSlices" :key="slice.key" class="fallback-group">
        <h2>{{ slice.emoji }} {{ slice.label }} · {{ formatBaht(slice.amount) }}</h2>
        <ul>
          <li v-for="item in slice.items" :key="item.id">
            {{ item.description }} · {{ formatBaht(Number(item.amount)) }} ·
            {{ formatDate(item.transaction_date) }}
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
  margin: 9px 0 11px;
  color: #83908a;
  font: 500 0.6rem 'Noto Sans Thai', sans-serif;
  line-height: 1.5;
}

.bubble-stage {
  position: relative;
  height: clamp(340px, 58vh, 620px);
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
  max-width: 200px;
  padding: 7px 10px;
  border: 1px solid #d9e4de;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.97);
  font-family: 'Noto Sans Thai', sans-serif;
  box-shadow: 0 8px 20px rgba(23, 55, 40, 0.14);
  transform: translate(-50%, -100%);
  pointer-events: none;
}

.bubble-tooltip strong {
  overflow: hidden;
  color: #2c4438;
  font-size: 0.66rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bubble-tooltip span {
  color: #1f5540;
  font: 700 0.72rem 'Manrope', sans-serif;
}

.bubble-tooltip small {
  color: #8d9791;
  font-size: 0.53rem;
}

.bubble-tooltip em {
  color: #6f8a7b;
  font-size: 0.5rem;
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
  max-width: 320px;
  margin: 0;
  font-size: 0.6rem;
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
  .bubble-stage { height: clamp(300px, 52vh, 460px); }
  .bubble-heading h1 { font-size: 0.98rem; }
}
</style>
