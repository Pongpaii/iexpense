<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useTheme } from '../composables/useTheme'
import type { Transaction, TransactionType } from '../types/transaction'
import { categoryPalette, formatPercent, opiumCategoryPalette } from '../utils/categoryBreakdown'
import { formatBaht } from '../utils/format'
import {
  buildCategoryTrend,
  collapseTrendCategories,
  type CategoryTrend,
  type TrendGranularity,
} from '../utils/trendData'

const props = defineProps<{
  transactions: Transaction[]
}>()

/** จำนวนเส้นที่แสดงแยกกัน ที่เหลือถูกยุบเป็นเส้น "หมวดอื่น ๆ รวม" */
const VISIBLE_LINE_LIMIT = 5

const PADDING = { top: 18, right: 16, bottom: 30 }

const { theme } = useTheme()
const activePalette = computed(() =>
  theme.value === 'opium' ? opiumCategoryPalette : categoryPalette,
)

const granularity = ref<TrendGranularity>('week')
const activeType = ref<TransactionType>('expense')
const hiddenKeys = ref<string[]>([])

interface PointRef {
  key: string
  index: number
}

const hoveredPoint = ref<PointRef | null>(null)
const pinnedPoint = ref<PointRef | null>(null)
const activePoint = computed(() => hoveredPoint.value ?? pinnedPoint.value)

const summary = computed(() =>
  buildCategoryTrend(props.transactions, activeType.value, granularity.value, activePalette.value),
)

const series = computed(() =>
  collapseTrendCategories(
    summary.value.categories,
    VISIBLE_LINE_LIMIT,
    theme.value === 'opium' ? '#9c8f95' : '#9aa5a0',
  ),
)

const visibleSeries = computed(() =>
  series.value.filter((item) => !hiddenKeys.value.includes(item.categoryKey)),
)

const hasData = computed(() => summary.value.total > 0)
const typeLabel = computed(() => (activeType.value === 'expense' ? 'รายจ่าย' : 'รายรับ'))
const unitLabel = computed(() => (granularity.value === 'week' ? 'สัปดาห์' : 'เดือน'))

// เปลี่ยนมุมมองแล้วชุดหมวดเปลี่ยนตาม การซ่อนเดิมจึงไม่มีความหมายอีก
watch([activeType, granularity], () => {
  hiddenKeys.value = []
  hoveredPoint.value = null
  pinnedPoint.value = null
})

watch(series, (next) => {
  const keys = next.map((item) => item.categoryKey)
  hiddenKeys.value = hiddenKeys.value.filter((key) => keys.includes(key))
  if (activePoint.value && !keys.includes(activePoint.value.key)) {
    hoveredPoint.value = null
    pinnedPoint.value = null
  }
})

// --- ขนาดกราฟ: วัดจากคอนเทนเนอร์จริง เพื่อให้ 1 หน่วยใน SVG = 1px ตัวอักษรจึงไม่บิด ---
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

const chartHeight = computed(() => (chartWidth.value < 460 ? 206 : 244))
const paddingLeft = computed(() => (chartWidth.value < 420 ? 48 : 60))
const innerWidth = computed(() =>
  Math.max(chartWidth.value - paddingLeft.value - PADDING.right, 40),
)
const innerHeight = computed(() => chartHeight.value - PADDING.top - PADDING.bottom)

/** ปัดเพดานแกน Y ขึ้นเป็นเลขกลม ๆ เพื่อให้ป้ายกำกับอ่านง่าย */
const niceCeil = (value: number) => {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  for (const step of [1, 1.5, 2, 2.5, 5]) {
    if (value <= step * magnitude) return step * magnitude
  }
  return 10 * magnitude
}

const visibleMax = computed(() =>
  visibleSeries.value.reduce(
    (largest, item) => item.data.reduce((inner, point) => Math.max(inner, point.amount), largest),
    0,
  ),
)
const scaleMax = computed(() => niceCeil(visibleMax.value))

const xAt = (index: number) => {
  const count = summary.value.periods.length
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
  const periods = summary.value.periods
  // ที่ว่างพอสำหรับป้ายละ ~54px จึงเว้นป้ายเป็นช่วง ๆ เมื่อจอแคบ
  const maxLabels = Math.max(Math.floor(innerWidth.value / 54), 2)
  const step = Math.max(1, Math.ceil(periods.length / maxLabels))
  const lastIndex = periods.length - 1

  return periods
    .map((period, index) => ({
      key: period.key,
      text: period.axisLabel,
      x: xAt(index),
      anchor: index === 0 ? 'start' : index === lastIndex ? 'end' : 'middle',
      index,
    }))
    // ไล่จากขวามาซ้าย ช่วงล่าสุดจึงมีป้ายเสมอ
    .filter(({ index }) => (lastIndex - index) % step === 0)
})

interface TrendLine {
  key: string
  label: string
  emoji: string
  color: string
  points: string
  dots: { index: number; x: number; y: number; amount: number; periodLabel: string }[]
}

const lines = computed<TrendLine[]>(() =>
  visibleSeries.value.map((item) => {
    const dots = item.data.map((point, index) => ({
      index,
      x: xAt(index),
      y: yAt(point.amount),
      amount: point.amount,
      periodLabel: point.periodLabel,
    }))

    return {
      key: item.categoryKey,
      label: item.label,
      emoji: item.emoji,
      color: item.color,
      points: dots.map((dot) => `${dot.x},${dot.y}`).join(' '),
      dots,
    }
  }),
)

const activeDetail = computed(() => {
  const point = activePoint.value
  if (!point) return null

  const line = lines.value.find((item) => item.key === point.key)
  const dot = line?.dots[point.index]
  if (!line || !dot) return null

  return {
    emoji: line.emoji,
    label: line.label,
    color: line.color,
    amount: dot.amount,
    periodLabel: dot.periodLabel,
    // จำกัดไม่ให้ tooltip ล้นขอบกราฟ
    left: Math.min(Math.max(dot.x, 78), Math.max(chartWidth.value - 78, 78)),
    top: dot.y,
    guideX: dot.x,
    // จุดที่อยู่สูงเกินไปต้องพลิก tooltip ลงล่าง ไม่ให้ล้นออกนอกการ์ด
    flipped: dot.y < 66,
  }
})

const isActiveDot = (key: string, index: number) =>
  activePoint.value?.key === key && activePoint.value.index === index

const isDimmed = (key: string) => activePoint.value !== null && activePoint.value.key !== key

const hoverDot = (event: PointerEvent, key: string, index: number) => {
  // เมาส์เท่านั้น เพราะบนจอสัมผัส pointerleave จะยิงทันทีที่ยกนิ้ว
  if (event.pointerType !== 'mouse') return
  hoveredPoint.value = { key, index }
}

const clearHover = (event: PointerEvent) => {
  if (event.pointerType !== 'mouse') return
  hoveredPoint.value = null
}

const pinDot = (key: string, index: number) => {
  const current = pinnedPoint.value
  pinnedPoint.value = current?.key === key && current.index === index ? null : { key, index }
}

const toggleSeries = (key: string) => {
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

const changeBadge = (value: number | null) => {
  if (value === null) return '—'
  if (Math.abs(value) < 0.05) return 'คงที่'
  return `${value > 0 ? '↑' : '↓'}${formatPercent(Math.abs(value))}`
}

interface TrendInsight {
  id: string
  icon: string
  text: string
  hint: string
  tone: 'up' | 'down' | 'neutral'
}

const previousPeriodLabel = computed(() => {
  const periods = summary.value.periods
  return periods.length >= 2 ? periods[periods.length - 2].label : ''
})

const rankedByChange = computed(() =>
  summary.value.categories.filter(
    (category): category is CategoryTrend & { changePercent: number } =>
      category.changePercent !== null,
  ),
)

const insights = computed<TrendInsight[]>(() => {
  if (!hasData.value) return []

  const list: TrendInsight[] = []
  const ranked = rankedByChange.value

  const riser = ranked.reduce<(CategoryTrend & { changePercent: number }) | null>(
    (best, category) => (best === null || category.changePercent > best.changePercent ? category : best),
    null,
  )

  const faller = ranked.reduce<(CategoryTrend & { changePercent: number }) | null>(
    (best, category) => (best === null || category.changePercent < best.changePercent ? category : best),
    null,
  )

  if (riser && riser.changePercent > 0.05) {
    list.push({
      id: `up-${riser.categoryKey}`,
      icon: '🔥',
      text: `${riser.emoji} ${riser.label} เพิ่มขึ้น ${formatPercent(riser.changePercent)}`,
      hint: `${unitLabel.value}ล่าสุด ${formatBaht(riser.data[riser.data.length - 1].amount)} · เทียบกับ${previousPeriodLabel.value}`,
      tone: 'up',
    })
  }

  if (faller && faller.changePercent < -0.05 && faller.categoryKey !== riser?.categoryKey) {
    list.push({
      id: `down-${faller.categoryKey}`,
      icon: '📉',
      text: `${faller.emoji} ${faller.label} ลดลง ${formatPercent(Math.abs(faller.changePercent))}`,
      hint: `${unitLabel.value}ล่าสุด ${formatBaht(faller.data[faller.data.length - 1].amount)} · เทียบกับ${previousPeriodLabel.value}`,
      tone: 'down',
    })
  }

  const periodCount = summary.value.periods.length
  list.push({
    id: 'average',
    icon: '💡',
    text: `เฉลี่ย${unitLabel.value}ละ ${formatBaht(summary.value.total / Math.max(periodCount, 1))}`,
    hint: `รวม${typeLabel.value} ${formatBaht(summary.value.total)} ใน ${periodCount} ${unitLabel.value}ที่ผ่านมา`,
    tone: 'neutral',
  })

  return list
})

const chartSummary = computed(
  () =>
    `กราฟเส้นแสดง${typeLabel.value}ของ ${visibleSeries.value.length} หมวด `
    + `ย้อนหลัง ${summary.value.periods.length} ${unitLabel.value} `
    + 'รายละเอียดทั้งหมดอ่านได้จากตารางด้านล่างกราฟ',
)
</script>

<template>
  <section class="chart-panel trend-panel" aria-labelledby="spending-trend-title">
    <header class="chart-heading">
      <div>
        <span class="chart-eyebrow">Spending trend</span>
        <h2 id="spending-trend-title">เทรนด์{{ typeLabel }}ตามหมวด</h2>
      </div>

      <div class="trend-controls">
        <div class="overview-tabs trend-granularity" role="group" aria-label="ความละเอียดของช่วงเวลา">
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

    <div v-if="hasData" class="trend-body">
      <div ref="plotRef" class="trend-plot">
        <svg
          class="trend-svg"
          :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
          :width="chartWidth"
          :height="chartHeight"
          role="img"
          :aria-label="chartSummary"
          @pointerleave="clearHover"
        >
          <rect
            :x="paddingLeft"
            :y="PADDING.top"
            :width="innerWidth"
            :height="innerHeight"
            fill="transparent"
            @click="pinnedPoint = null"
          />

          <g class="trend-grid" aria-hidden="true">
            <line
              v-for="tick in gridTicks"
              :key="`grid-${tick.ratio}`"
              :x1="paddingLeft"
              :y1="tick.y"
              :x2="paddingLeft + innerWidth"
              :y2="tick.y"
              :class="{ 'trend-grid__base': tick.ratio === 0 }"
            />
          </g>

          <g class="trend-axis trend-axis--y" aria-hidden="true">
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

          <g class="trend-axis trend-axis--x" aria-hidden="true">
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

          <line
            v-if="activeDetail"
            class="trend-guide"
            :x1="activeDetail.guideX"
            :y1="PADDING.top"
            :x2="activeDetail.guideX"
            :y2="PADDING.top + innerHeight"
            aria-hidden="true"
          />

          <g
            v-for="line in lines"
            :key="`line-${line.key}`"
            class="trend-series"
            :class="{ 'is-dimmed': isDimmed(line.key) }"
          >
            <polyline class="trend-line" :points="line.points" :stroke="line.color" />

            <g
              v-for="dot in line.dots"
              :key="`dot-${line.key}-${dot.index}`"
              class="trend-dot-group"
            >
              <circle
                class="trend-dot"
                :cx="dot.x"
                :cy="dot.y"
                :r="isActiveDot(line.key, dot.index) ? 6 : 3.6"
                :fill="line.color"
              />
              <circle
                class="trend-hit"
                :cx="dot.x"
                :cy="dot.y"
                r="12"
                @pointerenter="hoverDot($event, line.key, dot.index)"
                @click="pinDot(line.key, dot.index)"
              >
                <title>
                  {{ line.emoji }} {{ line.label }} · {{ dot.periodLabel }} ·
                  {{ formatBaht(dot.amount) }}
                </title>
              </circle>
            </g>
          </g>
        </svg>

        <div
          v-if="activeDetail"
          class="trend-tooltip"
          :class="{ 'is-flipped': activeDetail.flipped }"
          :style="{ left: `${activeDetail.left}px`, top: `${activeDetail.top}px` }"
          role="status"
          aria-live="polite"
        >
          <small>{{ activeDetail.periodLabel }}</small>
          <strong>
            <i :style="{ background: activeDetail.color }" aria-hidden="true"></i>
            {{ activeDetail.emoji }} {{ activeDetail.label }}
          </strong>
          <b>{{ formatBaht(activeDetail.amount) }}</b>
        </div>
      </div>

      <p class="trend-hint">
        กดจุดบนเส้นเพื่อปักหมุดรายละเอียด · กดปุ่มหมวดด้านล่างเพื่อซ่อนหรือแสดงเส้น
      </p>

      <ul class="trend-legend">
        <li v-for="item in series" :key="`legend-${item.categoryKey}`">
          <button
            type="button"
            class="trend-legend__button"
            :class="{ 'is-hidden': hiddenKeys.includes(item.categoryKey) }"
            :aria-pressed="!hiddenKeys.includes(item.categoryKey)"
            @click="toggleSeries(item.categoryKey)"
          >
            <i :style="{ background: item.color }" aria-hidden="true"></i>
            <span>{{ item.emoji }} {{ item.label }}</span>
            <b>{{ formatBaht(item.total) }}</b>
            <small
              :class="{
                'is-up': (item.changePercent ?? 0) > 0,
                'is-down': (item.changePercent ?? 0) < 0,
              }"
            >
              {{ changeBadge(item.changePercent) }}
            </small>
          </button>
        </li>
      </ul>

      <ul class="trend-insights">
        <li v-for="insight in insights" :key="insight.id" :class="`tone-${insight.tone}`">
          <span aria-hidden="true">{{ insight.icon }}</span>
          <div>
            <strong>{{ insight.text }}</strong>
            <small>{{ insight.hint }}</small>
          </div>
        </li>
      </ul>

      <details class="trend-fallback">
        <summary>ดูข้อมูลเป็นตาราง</summary>
        <div class="trend-table-wrap">
          <table>
            <caption class="sr-only">
              {{ typeLabel }}รายหมวดย้อนหลัง {{ summary.periods.length }} {{ unitLabel }}
            </caption>
            <thead>
              <tr>
                <th scope="col">หมวด</th>
                <th v-for="period in summary.periods" :key="`th-${period.key}`" scope="col">
                  {{ period.axisLabel }}
                </th>
                <th scope="col">รวม</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in series" :key="`tr-${item.categoryKey}`">
                <th scope="row">{{ item.emoji }} {{ item.label }}</th>
                <td v-for="point in item.data" :key="`td-${item.categoryKey}-${point.period}`">
                  {{ formatBaht(point.amount) }}
                </td>
                <td>{{ formatBaht(item.total) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </div>

    <div v-else class="chart-empty">
      <div class="chart-empty__icon" aria-hidden="true">◹</div>
      <div>
        <strong>ยังไม่มีข้อมูลให้วาดเทรนด์</strong>
        <p>เมื่อมี{{ typeLabel }}ในช่วง {{ summary.periods.length }} {{ unitLabel }}ที่ผ่านมา กราฟจะขึ้นให้ทันที</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.chart-panel { padding: 20px 22px 18px; border: 1px solid var(--line); border-radius: 19px; background: var(--paper); box-shadow: 0 8px 24px rgba(23,45,36,.045); }
.chart-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.chart-eyebrow { color: #71877d; font-size: .57rem; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; }
.chart-heading h2 { margin: 3px 0 0; color: var(--ink); font: 700 .95rem 'Noto Sans Thai', sans-serif; }

.trend-controls { display: flex; align-items: center; gap: 8px; }
.overview-tabs { display: grid; grid-template-columns: repeat(2, 1fr); padding: 3px; border-radius: 9px; background: #e9efeb; }
.overview-tabs button { min-height: 27px; padding: 3px 11px; border: 0; border-radius: 7px; color: #728078; background: transparent; font: 700 .58rem 'Noto Sans Thai', sans-serif; }
.overview-tabs button.active { color: #20563e; background: #fff; box-shadow: 0 2px 7px rgba(25,77,59,.1); }
.type-toggle { display: flex; padding: 3px; border-radius: 9px; background: #e9efeb; }
.type-toggle button { min-height: 27px; padding: 3px 10px; border: 0; border-radius: 7px; color: #728078; background: transparent; font: 700 .58rem 'Noto Sans Thai', sans-serif; }
.type-toggle button.active { color: #20563e; background: #fff; box-shadow: 0 2px 7px rgba(25,77,59,.1); }

.trend-body { display: grid; gap: 12px; }
.trend-plot { position: relative; width: 100%; min-width: 0; }
.trend-svg { display: block; width: 100%; height: auto; overflow: visible; touch-action: pan-y; }

/* สีของกราฟผูกกับ CSS variable ทั้งหมด ธีม opium จึงใช้ได้โดยไม่ต้องเขียนกฎซ้ำ */
.trend-grid line { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 5; }
.trend-grid line.trend-grid__base { stroke-dasharray: none; }
.trend-axis text { fill: var(--muted); font-family: 'Manrope', 'Noto Sans Thai', sans-serif; font-size: 9.5px; }
.trend-axis--x text { font-size: 10px; }
.trend-guide { stroke: var(--muted); stroke-width: 1; stroke-dasharray: 3 4; opacity: .6; }

.trend-series { transition: opacity .18s ease; }
.trend-series.is-dimmed { opacity: .28; }
.trend-line { fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
.trend-dot { transition: r .16s ease; }
.trend-hit { fill: transparent; cursor: pointer; }

.trend-tooltip { position: absolute; z-index: 2; display: grid; gap: 2px; min-width: 132px; padding: 7px 9px; border: 1px solid var(--line); border-radius: 10px; background: var(--paper); box-shadow: 0 10px 24px rgba(23,45,36,.14); transform: translate(-50%, calc(-100% - 12px)); pointer-events: none; }
.trend-tooltip.is-flipped { transform: translate(-50%, 12px); }
.trend-tooltip small { color: var(--muted); font: 600 .5rem 'Noto Sans Thai', sans-serif; }
.trend-tooltip strong { display: flex; align-items: center; gap: 5px; color: var(--ink); font: 700 .6rem 'Noto Sans Thai', sans-serif; }
.trend-tooltip strong i { width: 7px; height: 7px; flex: 0 0 7px; border-radius: 50%; }
.trend-tooltip b { color: var(--ink); font: 700 .72rem 'Manrope', sans-serif; }

.trend-hint { margin: 0; color: var(--muted); font: 500 .53rem 'Noto Sans Thai', sans-serif; text-align: center; }

.trend-legend { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.trend-legend__button { display: inline-flex; align-items: center; gap: 6px; padding: 5px 9px; border: 1px solid var(--line); border-radius: 999px; background: transparent; cursor: pointer; transition: border-color .16s, background .16s, opacity .16s; }
.trend-legend__button:hover { background: var(--green-light); }
.trend-legend__button:focus-visible { outline: 3px solid rgba(73,137,103,.22); outline-offset: 1px; }
.trend-legend__button.is-hidden { opacity: .45; }
.trend-legend__button.is-hidden i { background: var(--muted) !important; }
.trend-legend__button i { width: 8px; height: 8px; flex: 0 0 8px; border-radius: 3px; }
.trend-legend__button span { color: var(--ink); font: 700 .58rem 'Noto Sans Thai', sans-serif; }
.trend-legend__button b { color: var(--ink); font: 700 .58rem 'Manrope', sans-serif; }
.trend-legend__button small { color: var(--muted); font: 700 .52rem 'Manrope', sans-serif; }
.trend-legend__button small.is-up { color: #c35d51; }
.trend-legend__button small.is-down { color: #32835b; }

.trend-insights { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
.trend-insights li { display: flex; align-items: flex-start; gap: 8px; padding: 9px 11px; border: 1px solid var(--line); border-radius: 12px; }
.trend-insights li.tone-up { border-color: rgba(199,89,78,.35); background: rgba(199,89,78,.07); }
.trend-insights li.tone-down { border-color: rgba(50,131,91,.32); background: rgba(50,131,91,.06); }
.trend-insights li span { font-size: .82rem; line-height: 1.1; }
.trend-insights li div { display: grid; gap: 2px; min-width: 0; }
.trend-insights strong { color: var(--ink); font: 700 .62rem 'Noto Sans Thai', sans-serif; }
.trend-insights small { color: var(--muted); font: 500 .53rem 'Noto Sans Thai', sans-serif; }

.trend-fallback summary { color: var(--muted); font: 700 .55rem 'Noto Sans Thai', sans-serif; cursor: pointer; }
.trend-table-wrap { overflow-x: auto; margin-top: 8px; }
.trend-fallback table { width: 100%; border-collapse: collapse; font-family: 'Noto Sans Thai', sans-serif; font-size: .53rem; }
.trend-fallback th, .trend-fallback td { padding: 4px 6px; border-bottom: 1px solid var(--line); color: var(--muted); text-align: right; white-space: nowrap; }
.trend-fallback thead th, .trend-fallback tbody th { color: var(--ink); font-weight: 700; }
.trend-fallback tbody th { text-align: left; }

.chart-empty { display: flex; min-height: 190px; align-items: center; justify-content: center; gap: 14px; color: #7a8580; font-family: 'Noto Sans Thai', sans-serif; }
.chart-empty__icon { display: grid; width: 48px; height: 48px; place-items: center; border-radius: 14px; color: #658276; background: #edf4f0; font-size: 1.2rem; }
.chart-empty strong { color: var(--ink); font-size: .82rem; }
.chart-empty p { max-width: 320px; margin: 3px 0 0; font-size: .68rem; }

.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

@media (max-width: 580px) {
  .chart-panel { padding: 16px 13px 14px; border-radius: 16px; }
  .chart-heading { align-items: stretch; flex-direction: column; gap: 10px; margin-bottom: 12px; }
  .trend-controls { display: grid; grid-template-columns: 1fr 1fr; }
  .type-toggle { display: grid; grid-template-columns: 1fr 1fr; }
  .trend-insights { grid-template-columns: 1fr; }
  .trend-legend__button { padding: 4px 8px; }
}

@media (prefers-reduced-motion: reduce) {
  .trend-series, .trend-line, .trend-dot, .trend-legend__button { transition: none; }
}
</style>
