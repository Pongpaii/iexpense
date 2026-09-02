<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useTheme } from '../composables/useTheme'
import type { Transaction, TransactionType } from '../types/transaction'
import { categoryPalette, formatPercent, opiumCategoryPalette } from '../utils/categoryBreakdown'
import { formatBaht } from '../utils/format'
import { buildStackedAreaData, type TrendGranularity } from '../utils/trendData'

const props = defineProps<{
  transactions: Transaction[]
}>()

const PADDING = { top: 20, right: 16, bottom: 30 }

/** id ของ gradient ต้องไม่ชนกับ instance อื่น และต้องเป็น ASCII เพราะชื่อหมวดเป็นภาษาไทย */
const uid = useId()

const { theme } = useTheme()
const activePalette = computed(() =>
  theme.value === 'opium' ? opiumCategoryPalette : categoryPalette,
)

const granularity = ref<TrendGranularity>('week')
const activeType = ref<TransactionType>('expense')
const hiddenKeys = ref<string[]>([])
const hoverIndex = ref<number | null>(null)
const pinnedIndex = ref<number | null>(null)
const activeIndex = computed(() => hoverIndex.value ?? pinnedIndex.value)

const data = computed(() =>
  buildStackedAreaData(props.transactions, activeType.value, granularity.value, activePalette.value),
)

const hasData = computed(() => data.value.grandTotal > 0)
const typeLabel = computed(() => (activeType.value === 'expense' ? 'รายจ่าย' : 'รายรับ'))
const unitLabel = computed(() => (granularity.value === 'week' ? 'สัปดาห์' : 'เดือน'))

const visibleOrder = computed(() =>
  data.value.categoryOrder.filter((key) => !hiddenKeys.value.includes(key)),
)

watch([activeType, granularity], () => {
  hiddenKeys.value = []
  hoverIndex.value = null
  pinnedIndex.value = null
})

watch(data, (next) => {
  hiddenKeys.value = hiddenKeys.value.filter((key) => next.categoryOrder.includes(key))
  if (pinnedIndex.value !== null && pinnedIndex.value >= next.points.length) pinnedIndex.value = null
})

// --- ขนาดกราฟ: วัดคอนเทนเนอร์จริง เพื่อให้ 1 หน่วยใน SVG = 1px ---
const plotRef = ref<HTMLElement | null>(null)
const chartWidth = ref(640)
let resizeObserver: ResizeObserver | undefined

const observePlot = (element: HTMLElement | null) => {
  resizeObserver?.disconnect()
  resizeObserver = undefined
  if (!element) return

  const syncWidth = () => {
    chartWidth.value = Math.max(element.clientWidth, 260)
  }

  syncWidth()
  if (typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(syncWidth)
  resizeObserver.observe(element)
}

watch(plotRef, observePlot, { flush: 'post' })
onBeforeUnmount(() => resizeObserver?.disconnect())

const chartHeight = computed(() => (chartWidth.value < 460 ? 214 : 252))
const paddingLeft = computed(() => (chartWidth.value < 420 ? 48 : 60))
const innerWidth = computed(() =>
  Math.max(chartWidth.value - paddingLeft.value - PADDING.right, 40),
)
const innerHeight = computed(() => chartHeight.value - PADDING.top - PADDING.bottom)

const niceCeil = (value: number) => {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  for (const step of [1, 1.5, 2, 2.5, 5]) {
    if (value <= step * magnitude) return step * magnitude
  }
  return 10 * magnitude
}

/** ยอดรวมของเฉพาะหมวดที่ยังแสดงอยู่ · ซ่อนหมวดแล้ว scale แกน Y ต้องหุบตาม */
const visibleTotals = computed(() =>
  data.value.points.map((point) =>
    visibleOrder.value.reduce((sum, key) => sum + (point.categories[key] ?? 0), 0),
  ),
)

const scaleMax = computed(() => niceCeil(Math.max(...visibleTotals.value, 0)))

const xAt = (index: number) => {
  const count = data.value.points.length
  if (count <= 1) return paddingLeft.value + innerWidth.value / 2
  return paddingLeft.value + (index / (count - 1)) * innerWidth.value
}

const yAt = (amount: number) =>
  PADDING.top + innerHeight.value * (1 - Math.min(amount / scaleMax.value, 1))

const gridTicks = computed(() =>
  [1, 0.75, 0.5, 0.25, 0].map((ratio) => ({
    ratio,
    y: PADDING.top + innerHeight.value * (1 - ratio),
    label: formatBaht(scaleMax.value * ratio),
  })),
)

const axisLabels = computed(() => {
  const points = data.value.points
  const maxLabels = Math.max(Math.floor(innerWidth.value / 54), 2)
  const step = Math.max(1, Math.ceil(points.length / maxLabels))
  const lastIndex = points.length - 1

  return points
    .map((point, index) => ({
      key: point.period,
      text: point.axisLabel,
      x: xAt(index),
      anchor: index === 0 ? 'start' : index === lastIndex ? 'end' : 'middle',
      index,
    }))
    .filter(({ index }) => (lastIndex - index) % step === 0)
})

interface AreaBand {
  key: string
  gradientId: string
  label: string
  emoji: string
  color: string
  /** เส้นทางของพื้นที่: ขอบบนไปขวา แล้ววนกลับตามเส้นฐานเดิม */
  areaPath: string
  /** ขอบบนอย่างเดียว ใช้ตีเส้นให้ชั้นอ่านง่าย */
  topPath: string
}

const bands = computed<AreaBand[]>(() => {
  const points = data.value.points
  const baselines = points.map(() => 0)
  const result: AreaBand[] = []

  for (const key of visibleOrder.value) {
    const meta = data.value.categoryMeta[key]
    if (!meta) continue

    const tops = points.map((point, index) => baselines[index] + (point.categories[key] ?? 0))
    const topPath = tops
      .map((value, index) => `${index === 0 ? 'M' : 'L'}${xAt(index)},${yAt(value)}`)
      .join(' ')
    const backPath = baselines
      .map((value, index) => ({ value, index }))
      .reverse()
      .map(({ value, index }) => `L${xAt(index)},${yAt(value)}`)
      .join(' ')

    result.push({
      key,
      gradientId: `${uid}-flow-${result.length}`,
      label: meta.label,
      emoji: meta.emoji,
      color: meta.color,
      areaPath: `${topPath} ${backPath} Z`,
      topPath,
    })

    for (let index = 0; index < baselines.length; index += 1) baselines[index] = tops[index]
  }

  return result
})

const bandWidth = computed(() => {
  const count = data.value.points.length
  return count > 1 ? innerWidth.value / (count - 1) : innerWidth.value
})

const hitBands = computed(() =>
  data.value.points.map((point, index) => {
    const left = Math.max(xAt(index) - bandWidth.value / 2, paddingLeft.value)
    const right = Math.min(xAt(index) + bandWidth.value / 2, paddingLeft.value + innerWidth.value)
    return { key: point.period, index, x: left, width: Math.max(right - left, 1) }
  }),
)

const activeDetail = computed(() => {
  const index = activeIndex.value
  if (index === null) return null

  const point = data.value.points[index]
  if (!point) return null

  const rows = visibleOrder.value
    .map((key) => ({
      key,
      amount: point.categories[key] ?? 0,
      label: data.value.categoryMeta[key]?.label ?? '',
      emoji: data.value.categoryMeta[key]?.emoji ?? '',
      color: data.value.categoryMeta[key]?.color ?? 'currentColor',
    }))
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount)

  return {
    periodLabel: point.periodLabel,
    rows,
    total: visibleTotals.value[index] ?? 0,
    guideX: xAt(index),
    left: Math.min(Math.max(xAt(index), 88), Math.max(chartWidth.value - 88, 88)),
  }
})

const setHover = (event: PointerEvent, index: number) => {
  if (event.pointerType !== 'mouse') return
  hoverIndex.value = index
}

const clearHover = (event: PointerEvent) => {
  if (event.pointerType !== 'mouse') return
  hoverIndex.value = null
}

const pinPeriod = (index: number) => {
  pinnedIndex.value = pinnedIndex.value === index ? null : index
}

const toggleCategory = (key: string) => {
  hiddenKeys.value = hiddenKeys.value.includes(key)
    ? hiddenKeys.value.filter((item) => item !== key)
    : [...hiddenKeys.value, key]
}

const switchType = (next: TransactionType) => {
  if (activeType.value === next) return
  activeType.value = next
}

const switchGranularity = (next: TrendGranularity) => {
  if (granularity.value === next) return
  granularity.value = next
}

const peakPoint = computed(() => {
  const points = data.value.points
  if (points.length === 0) return null

  return points.reduce((highest, point, index) => {
    const total = visibleTotals.value[index] ?? 0
    return total > highest.total ? { label: point.periodLabel, total } : highest
  }, { label: points[0].periodLabel, total: visibleTotals.value[0] ?? 0 })
})

const visibleTotal = computed(() => visibleTotals.value.reduce((sum, value) => sum + value, 0))

const chartSummary = computed(
  () =>
    `กราฟพื้นที่สะสมแสดง${typeLabel.value}รวม ${formatBaht(visibleTotal.value)} `
    + `แยก ${visibleOrder.value.length} หมวด ย้อนหลัง ${data.value.points.length} ${unitLabel.value} `
    + 'รายละเอียดทั้งหมดอ่านได้จากตารางด้านล่างกราฟ',
)
</script>

<template>
  <section class="chart-panel flow-panel" aria-labelledby="stacked-area-title">
    <header class="chart-heading">
      <div>
        <span class="chart-eyebrow">Spending flow</span>
        <h2 id="stacked-area-title">กระแส{{ typeLabel }}ตามหมวด</h2>
      </div>

      <div class="flow-controls">
        <div class="overview-tabs" role="group" aria-label="ความละเอียดของช่วงเวลา">
          <button
            type="button"
            :class="{ active: granularity === 'week' }"
            @click="switchGranularity('week')"
          >
            สัปดาห์
          </button>
          <button
            type="button"
            :class="{ active: granularity === 'month' }"
            @click="switchGranularity('month')"
          >
            เดือน
          </button>
        </div>

        <div class="type-toggle" role="group" aria-label="เลือกชนิดของรายการ">
          <button
            type="button"
            :class="{ active: activeType === 'expense' }"
            @click="switchType('expense')"
          >
            รายจ่าย
          </button>
          <button
            type="button"
            :class="{ active: activeType === 'income' }"
            @click="switchType('income')"
          >
            รายรับ
          </button>
        </div>
      </div>
    </header>

    <div v-if="hasData" class="flow-body">
      <div class="flow-summary">
        <div>
          <small>รวมที่แสดง</small>
          <strong>{{ formatBaht(visibleTotal) }}</strong>
        </div>
        <div v-if="peakPoint && peakPoint.total > 0">
          <small>{{ unitLabel }}ที่ใช้มากสุด</small>
          <strong>{{ peakPoint.label }} · {{ formatBaht(peakPoint.total) }}</strong>
        </div>
      </div>

      <div ref="plotRef" class="flow-plot">
        <svg
          class="flow-svg"
          :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
          :width="chartWidth"
          :height="chartHeight"
          role="img"
          :aria-label="chartSummary"
          @pointerleave="clearHover"
        >
          <defs>
            <linearGradient
              v-for="band in bands"
              :id="band.gradientId"
              :key="`grad-${band.key}`"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" :stop-color="band.color" stop-opacity=".72" />
              <stop offset="100%" :stop-color="band.color" stop-opacity=".28" />
            </linearGradient>
          </defs>

          <g class="flow-grid" aria-hidden="true">
            <line
              v-for="tick in gridTicks"
              :key="`grid-${tick.ratio}`"
              :x1="paddingLeft"
              :y1="tick.y"
              :x2="paddingLeft + innerWidth"
              :y2="tick.y"
              :class="{ 'flow-grid__base': tick.ratio === 0 }"
            />
          </g>

          <g class="flow-axis" aria-hidden="true">
            <text
              v-for="tick in gridTicks"
              :key="`y-${tick.ratio}`"
              :x="paddingLeft - 8"
              :y="tick.y + 3"
              text-anchor="end"
            >
              {{ tick.label }}
            </text>
          </g>

          <g class="flow-areas">
            <path
              v-for="band in bands"
              :key="`area-${band.key}`"
              class="flow-area"
              :d="band.areaPath"
              :fill="`url(#${band.gradientId})`"
            />
            <path
              v-for="band in bands"
              :key="`edge-${band.key}`"
              class="flow-edge"
              :d="band.topPath"
              :stroke="band.color"
            />
          </g>

          <line
            v-if="activeDetail"
            class="flow-guide"
            :x1="activeDetail.guideX"
            :y1="PADDING.top"
            :x2="activeDetail.guideX"
            :y2="PADDING.top + innerHeight"
            aria-hidden="true"
          />

          <g class="flow-axis flow-axis--x" aria-hidden="true">
            <text
              v-for="label in axisLabels"
              :key="`x-${label.key}`"
              :x="label.x"
              :y="chartHeight - 10"
              :text-anchor="label.anchor"
            >
              {{ label.text }}
            </text>
          </g>

          <rect
            v-for="hit in hitBands"
            :key="`hit-${hit.key}`"
            class="flow-hit"
            :x="hit.x"
            :y="PADDING.top"
            :width="hit.width"
            :height="innerHeight"
            @pointerenter="setHover($event, hit.index)"
            @click="pinPeriod(hit.index)"
          />
        </svg>

        <div
          v-if="activeDetail"
          class="flow-tooltip"
          :style="{ left: `${activeDetail.left}px` }"
          role="status"
          aria-live="polite"
        >
          <small>{{ activeDetail.periodLabel }}</small>
          <ul>
            <li v-for="row in activeDetail.rows" :key="`tip-${row.key}`">
              <i :style="{ background: row.color }" aria-hidden="true"></i>
              <span>{{ row.emoji }} {{ row.label }}</span>
              <b>{{ formatBaht(row.amount) }}</b>
            </li>
          </ul>
          <p>
            <span>รวม</span>
            <b>{{ formatBaht(activeDetail.total) }}</b>
          </p>
        </div>
      </div>

      <p class="flow-hint">
        กดแถบช่วงเวลาเพื่อปักหมุดรายละเอียด · กดปุ่มหมวดด้านล่างเพื่อเอาหมวดออกจากกอง
      </p>

      <ul class="flow-legend">
        <li v-for="key in data.categoryOrder" :key="`legend-${key}`">
          <button
            type="button"
            class="flow-legend__button"
            :class="{ 'is-hidden': hiddenKeys.includes(key) }"
            :aria-pressed="!hiddenKeys.includes(key)"
            @click="toggleCategory(key)"
          >
            <i :style="{ background: data.categoryMeta[key].color }" aria-hidden="true"></i>
            <span>{{ data.categoryMeta[key].emoji }} {{ data.categoryMeta[key].label }}</span>
            <b>{{ formatBaht(data.categoryMeta[key].total) }}</b>
            <small>{{ formatPercent(data.categoryMeta[key].percentage) }}</small>
          </button>
        </li>
      </ul>

      <details class="flow-fallback">
        <summary>ดูข้อมูลเป็นตาราง</summary>
        <div class="flow-table-wrap">
          <table>
            <caption class="sr-only">
              {{ typeLabel }}สะสมรายหมวดย้อนหลัง {{ data.points.length }} {{ unitLabel }}
            </caption>
            <thead>
              <tr>
                <th scope="col">หมวด</th>
                <th v-for="point in data.points" :key="`th-${point.period}`" scope="col">
                  {{ point.axisLabel }}
                </th>
                <th scope="col">รวม</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="key in data.categoryOrder" :key="`tr-${key}`">
                <th scope="row">
                  {{ data.categoryMeta[key].emoji }} {{ data.categoryMeta[key].label }}
                </th>
                <td v-for="point in data.points" :key="`td-${key}-${point.period}`">
                  {{ formatBaht(point.categories[key] ?? 0) }}
                </td>
                <td>{{ formatBaht(data.categoryMeta[key].total) }}</td>
              </tr>
              <tr>
                <th scope="row">รวมทุกหมวด</th>
                <td v-for="point in data.points" :key="`total-${point.period}`">
                  {{ formatBaht(point.total) }}
                </td>
                <td>{{ formatBaht(data.grandTotal) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </div>

    <div v-else class="chart-empty">
      <div class="chart-empty__icon" aria-hidden="true">◤</div>
      <div>
        <strong>ยังไม่มีข้อมูลให้ซ้อนเป็นกอง</strong>
        <p>เมื่อมี{{ typeLabel }}ในช่วง {{ data.points.length }} {{ unitLabel }}ที่ผ่านมา กราฟจะขึ้นให้ทันที</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.chart-panel { padding: 20px 22px 18px; border: 1px solid var(--line); border-radius: 19px; background: var(--paper); box-shadow: 0 8px 24px rgba(23,45,36,.045); }
.chart-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.chart-eyebrow { color: #71877d; font-size: .57rem; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; }
.chart-heading h2 { margin: 3px 0 0; color: var(--ink); font: 700 .95rem 'Noto Sans Thai', sans-serif; }

.flow-controls { display: flex; align-items: center; gap: 8px; }
.overview-tabs { display: grid; grid-template-columns: repeat(2, 1fr); padding: 3px; border-radius: 9px; background: #e9efeb; }
.overview-tabs button { min-height: 27px; padding: 3px 11px; border: 0; border-radius: 7px; color: #728078; background: transparent; font: 700 .58rem 'Noto Sans Thai', sans-serif; }
.overview-tabs button.active { color: #20563e; background: #fff; box-shadow: 0 2px 7px rgba(25,77,59,.1); }
.type-toggle { display: flex; padding: 3px; border-radius: 9px; background: #e9efeb; }
.type-toggle button { min-height: 27px; padding: 3px 10px; border: 0; border-radius: 7px; color: #728078; background: transparent; font: 700 .58rem 'Noto Sans Thai', sans-serif; }
.type-toggle button.active { color: #20563e; background: #fff; box-shadow: 0 2px 7px rgba(25,77,59,.1); }

.flow-body { display: grid; gap: 11px; }
.flow-summary { display: flex; flex-wrap: wrap; gap: 8px; }
.flow-summary div { display: grid; gap: 1px; padding: 7px 11px; border: 1px solid var(--line); border-radius: 11px; }
.flow-summary small { color: var(--muted); font: 700 .5rem 'Noto Sans Thai', sans-serif; letter-spacing: .04em; }
.flow-summary strong { color: var(--ink); font: 700 .66rem 'Noto Sans Thai', sans-serif; }

.flow-plot { position: relative; width: 100%; min-width: 0; }
.flow-svg { display: block; width: 100%; height: auto; touch-action: pan-y; }

/* สีทั้งหมดผูกกับ CSS variable ธีม opium จึงใช้ได้โดยไม่ต้องเขียนกฎซ้ำ */
.flow-grid line { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 5; }
.flow-grid line.flow-grid__base { stroke-dasharray: none; }
.flow-axis text { fill: var(--muted); font-family: 'Manrope', 'Noto Sans Thai', sans-serif; font-size: 9.5px; }
.flow-axis--x text { font-size: 10px; }
.flow-guide { stroke: var(--muted); stroke-width: 1; stroke-dasharray: 3 4; opacity: .6; }

.flow-area { transition: opacity .18s ease; }
.flow-edge { fill: none; stroke-width: 1.5; stroke-linejoin: round; stroke-linecap: round; }
.flow-hit { fill: transparent; cursor: pointer; }

.flow-tooltip { position: absolute; top: 8px; z-index: 2; display: grid; gap: 4px; min-width: 158px; max-width: 240px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 11px; background: var(--paper); box-shadow: 0 10px 26px rgba(23,45,36,.16); transform: translateX(-50%); pointer-events: none; }
.flow-tooltip small { color: var(--muted); font: 700 .52rem 'Noto Sans Thai', sans-serif; }
.flow-tooltip ul { display: grid; gap: 3px; margin: 0; padding: 0; list-style: none; }
.flow-tooltip li { display: grid; align-items: center; grid-template-columns: 7px minmax(0, 1fr) auto; gap: 6px; }
.flow-tooltip li i { width: 7px; height: 7px; border-radius: 50%; }
.flow-tooltip li span { overflow: hidden; color: var(--ink); font: 600 .54rem 'Noto Sans Thai', sans-serif; text-overflow: ellipsis; white-space: nowrap; }
.flow-tooltip li b { color: var(--ink); font: 700 .54rem 'Manrope', sans-serif; }
.flow-tooltip p { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 2px 0 0; padding-top: 4px; border-top: 1px solid var(--line); }
.flow-tooltip p span { color: var(--muted); font: 700 .54rem 'Noto Sans Thai', sans-serif; }
.flow-tooltip p b { color: var(--ink); font: 700 .64rem 'Manrope', sans-serif; }

.flow-hint { margin: 0; color: var(--muted); font: 500 .53rem 'Noto Sans Thai', sans-serif; text-align: center; }

.flow-legend { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.flow-legend__button { display: inline-flex; align-items: center; gap: 6px; padding: 5px 9px; border: 1px solid var(--line); border-radius: 999px; background: transparent; cursor: pointer; transition: border-color .16s, background .16s, opacity .16s; }
.flow-legend__button:hover { background: var(--green-light); }
.flow-legend__button:focus-visible { outline: 3px solid rgba(73,137,103,.22); outline-offset: 1px; }
.flow-legend__button.is-hidden { opacity: .45; }
.flow-legend__button.is-hidden i { background: var(--muted) !important; }
.flow-legend__button i { width: 8px; height: 8px; flex: 0 0 8px; border-radius: 3px; }
.flow-legend__button span { color: var(--ink); font: 700 .58rem 'Noto Sans Thai', sans-serif; }
.flow-legend__button b { color: var(--ink); font: 700 .58rem 'Manrope', sans-serif; }
.flow-legend__button small { color: var(--muted); font: 700 .52rem 'Manrope', sans-serif; }

.flow-fallback summary { color: var(--muted); font: 700 .55rem 'Noto Sans Thai', sans-serif; cursor: pointer; }
.flow-table-wrap { overflow-x: auto; margin-top: 8px; }
.flow-fallback table { width: 100%; border-collapse: collapse; font-family: 'Noto Sans Thai', sans-serif; font-size: .53rem; }
.flow-fallback th, .flow-fallback td { padding: 4px 6px; border-bottom: 1px solid var(--line); color: var(--muted); text-align: right; white-space: nowrap; }
.flow-fallback thead th, .flow-fallback tbody th { color: var(--ink); font-weight: 700; }
.flow-fallback tbody th { text-align: left; }

.chart-empty { display: flex; min-height: 190px; align-items: center; justify-content: center; gap: 14px; color: #7a8580; font-family: 'Noto Sans Thai', sans-serif; }
.chart-empty__icon { display: grid; width: 48px; height: 48px; place-items: center; border-radius: 14px; color: #658276; background: #edf4f0; font-size: 1.2rem; }
.chart-empty strong { color: var(--ink); font-size: .82rem; }
.chart-empty p { max-width: 320px; margin: 3px 0 0; font-size: .68rem; }

.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

@media (max-width: 580px) {
  .chart-panel { padding: 16px 13px 14px; border-radius: 16px; }
  .chart-heading { align-items: stretch; flex-direction: column; gap: 10px; margin-bottom: 12px; }
  .flow-controls { display: grid; grid-template-columns: 1fr 1fr; }
  .type-toggle { display: grid; grid-template-columns: 1fr 1fr; }
  .flow-summary div { flex: 1; }
  .flow-legend__button { padding: 4px 8px; }
}

@media (prefers-reduced-motion: reduce) {
  .flow-area, .flow-legend__button { transition: none; }
}
</style>
