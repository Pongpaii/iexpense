import {
  getCategoryEmoji,
  type Transaction,
  type TransactionCategory,
  type TransactionType,
} from '../types/transaction'
import { categoryPalette } from './categoryBreakdown'
import { getIsoWeekKey, getIsoWeekStart, isIsoDate, shiftIsoDate, toLocalIsoDate } from './dateUtils'

/** ความละเอียดของแกนเวลา */
export type TrendGranularity = 'week' | 'month'

/** จำนวนสัปดาห์ย้อนหลังที่กราฟแสดง (รวมสัปดาห์ปัจจุบัน) */
export const TREND_WEEK_WINDOW = 12

/** จำนวนเดือนย้อนหลังที่กราฟแสดง (รวมเดือนปัจจุบัน) */
export const TREND_MONTH_WINDOW = 6

/** คีย์ของเส้นที่รวมหมวดหางยาวเข้าด้วยกัน */
export const OTHER_TREND_KEY = '__other_categories__'

const UNCATEGORIZED_KEY = '__uncategorized__'

const dayFormatter = new Intl.DateTimeFormat('th-TH', { day: 'numeric' })
const dayMonthFormatter = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short' })
const monthFormatter = new Intl.DateTimeFormat('th-TH', { month: 'short' })
const monthYearFormatter = new Intl.DateTimeFormat('th-TH', { month: 'short', year: 'numeric' })

export interface TrendPoint {
  /** คีย์ของช่วงเวลา: 'YYYY-Www' (สัปดาห์) หรือ 'YYYY-MM' (เดือน) */
  period: string
  /** ข้อความเต็มสำหรับ tooltip เช่น 'สัปดาห์ 3–9 ส.ค.' */
  periodLabel: string
  amount: number
}

/** ช่วงเวลาหนึ่งช่องบนแกน X */
export interface TrendPeriod {
  key: string
  /** ข้อความเต็ม ใช้ใน tooltip และตารางสำรอง */
  label: string
  /** ข้อความสั้น ใช้ใต้แกน X ที่มีที่จำกัด */
  axisLabel: string
}

export interface CategoryTrend {
  categoryKey: string
  category: TransactionCategory | null
  label: string
  emoji: string
  color: string
  /** เรียงตามลำดับเดียวกับ TrendSummary.periods เสมอ ช่วงที่ไม่มีข้อมูลเป็น 0 */
  data: TrendPoint[]
  total: number
  averagePerPeriod: number
  /** เปลี่ยนแปลงจากช่วงก่อนหน้าเป็นเปอร์เซ็นต์ · null เมื่อช่วงก่อนหน้าเป็น 0 */
  changePercent: number | null
}

export interface TrendSummary {
  /** เรียงจากยอดรวมมากไปน้อย */
  categories: CategoryTrend[]
  periods: TrendPeriod[]
  /** ยอดสูงสุดของจุดใดจุดหนึ่ง ใช้ตั้ง scale แกน Y */
  maxAmount: number
  /** ยอดรวมทุกหมวดในช่วงที่แสดง */
  total: number
  granularity: TrendGranularity
}

const toDate = (isoDate: string) => new Date(`${isoDate}T00:00:00`)

/** 'สัปดาห์ 3–9 ส.ค.' โดยตัดชื่อเดือนต้นสัปดาห์ออกเมื่ออยู่เดือนเดียวกับปลายสัปดาห์ */
const buildWeekLabel = (weekStart: string) => {
  const weekEnd = shiftIsoDate(weekStart, 6)
  const sameMonth = weekStart.slice(0, 7) === weekEnd.slice(0, 7)
  const startLabel = sameMonth
    ? dayFormatter.format(toDate(weekStart))
    : dayMonthFormatter.format(toDate(weekStart))
  return `สัปดาห์ ${startLabel}–${dayMonthFormatter.format(toDate(weekEnd))}`
}

/** สร้างช่องเวลาทั้งหมดย้อนหลังจากวันอ้างอิง โดยช่องล่าสุดอยู่ท้ายสุด */
const buildPeriods = (granularity: TrendGranularity, reference: string): TrendPeriod[] => {
  if (granularity === 'week') {
    const currentWeekStart = getIsoWeekStart(reference)
    return Array.from({ length: TREND_WEEK_WINDOW }, (_, index) => {
      const weekStart = shiftIsoDate(currentWeekStart, (index - (TREND_WEEK_WINDOW - 1)) * 7)
      return {
        key: getIsoWeekKey(weekStart),
        label: buildWeekLabel(weekStart),
        axisLabel: dayMonthFormatter.format(toDate(weekStart)),
      }
    })
  }

  const [year, month] = reference.split('-').map(Number)
  return Array.from({ length: TREND_MONTH_WINDOW }, (_, index) => {
    const date = new Date(year, month - 1 - (TREND_MONTH_WINDOW - 1 - index), 1)
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: monthYearFormatter.format(date),
      axisLabel: monthFormatter.format(date),
    }
  })
}

const periodKeyOf = (isoDate: string, granularity: TrendGranularity) =>
  granularity === 'week' ? getIsoWeekKey(isoDate) : isoDate.slice(0, 7)

/** เปอร์เซ็นต์การเปลี่ยนแปลงของสองช่องท้ายสุด · null เมื่อเทียบไม่ได้ */
const changeBetweenLastPeriods = (amounts: number[]) => {
  if (amounts.length < 2) return null
  const previous = amounts[amounts.length - 2]
  const current = amounts[amounts.length - 1]
  if (previous <= 0) return null
  return ((current - previous) / previous) * 100
}

/**
 * รวมยอดรายหมวดตามช่วงเวลา เพื่อวาดกราฟเส้นเทรนด์
 *
 * ทุกหมวดจะได้จำนวนจุดเท่ากันและเรียงตรงกับ `periods` เสมอ
 * ช่วงที่หมวดนั้นไม่มีรายการจะเป็น 0 ไม่ใช่ค่าว่าง เส้นจึงไม่ขาด
 */
export const buildCategoryTrend = (
  transactions: Transaction[],
  type: TransactionType,
  granularity: TrendGranularity,
  palette: readonly string[] = categoryPalette,
  reference: string = toLocalIsoDate(new Date()),
): TrendSummary => {
  const periods = buildPeriods(granularity, reference)
  const periodIndex = new Map(periods.map((period, index) => [period.key, index]))

  const groups = new Map<
    string,
    { category: TransactionCategory | null; amounts: number[]; total: number }
  >()
  let total = 0

  for (const transaction of transactions) {
    if (transaction.type !== type) continue
    if (!isIsoDate(transaction.transaction_date)) continue

    const index = periodIndex.get(periodKeyOf(transaction.transaction_date, granularity))
    if (index === undefined) continue

    const amount = Number(transaction.amount)
    if (!Number.isFinite(amount)) continue

    const key = transaction.category ?? UNCATEGORIZED_KEY
    const group =
      groups.get(key) ??
      {
        category: transaction.category,
        amounts: Array.from({ length: periods.length }, () => 0),
        total: 0,
      }

    group.amounts[index] += amount
    group.total += amount
    groups.set(key, group)
    total += amount
  }

  const categories = [...groups.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([key, group], index) => ({
      categoryKey: key,
      category: group.category,
      label: group.category ?? 'ไม่ระบุหมวดหมู่',
      emoji: group.category ? getCategoryEmoji(group.category) : '🏷️',
      color: palette[index % palette.length],
      data: group.amounts.map((amount, pointIndex) => ({
        period: periods[pointIndex].key,
        periodLabel: periods[pointIndex].label,
        amount,
      })),
      total: group.total,
      averagePerPeriod: periods.length > 0 ? group.total / periods.length : 0,
      changePercent: changeBetweenLastPeriods(group.amounts),
    }))

  const maxAmount = categories.reduce(
    (largest, category) =>
      category.data.reduce((inner, point) => Math.max(inner, point.amount), largest),
    0,
  )

  return { categories, periods, maxAmount, total, granularity }
}

export interface StackedPoint {
  period: string
  periodLabel: string
  axisLabel: string
  /** categoryKey → ยอดของช่วงนี้ · มีครบทุกหมวดเสมอ ช่วงที่ไม่มีรายการเป็น 0 */
  categories: Record<string, number>
  /** ผลรวมทุกหมวดในช่วงนี้ */
  total: number
}

export interface StackedCategoryMeta {
  label: string
  emoji: string
  color: string
  total: number
  /** สัดส่วนของยอดรวมทั้งช่วงที่แสดง */
  percentage: number
}

export interface StackedAreaData {
  points: StackedPoint[]
  /** เรียงจากยอดรวมมากไปน้อย ใช้ซ้อนพื้นที่จากล่างขึ้นบน */
  categoryOrder: string[]
  categoryMeta: Record<string, StackedCategoryMeta>
  /** ยอดรวมสูงสุดของช่วงใดช่วงหนึ่ง ใช้ตั้ง scale แกน Y */
  maxTotal: number
  /** ยอดรวมทุกหมวดทุกช่วง */
  grandTotal: number
  granularity: TrendGranularity
}

/**
 * จัดข้อมูลสำหรับกราฟพื้นที่สะสม โดยต่อยอดจาก buildCategoryTrend
 * เพื่อให้การจัดกลุ่มช่วงเวลาและการเรียงหมวดเป็นกฎเดียวกันกับกราฟเส้น
 */
export const buildStackedAreaData = (
  transactions: Transaction[],
  type: TransactionType,
  granularity: TrendGranularity,
  palette: readonly string[] = categoryPalette,
  reference: string = toLocalIsoDate(new Date()),
): StackedAreaData => {
  const summary = buildCategoryTrend(transactions, type, granularity, palette, reference)

  const points = summary.periods.map((period, index) => {
    const categories: Record<string, number> = {}
    let total = 0

    for (const category of summary.categories) {
      const amount = category.data[index].amount
      categories[category.categoryKey] = amount
      total += amount
    }

    return {
      period: period.key,
      periodLabel: period.label,
      axisLabel: period.axisLabel,
      categories,
      total,
    }
  })

  const categoryMeta: Record<string, StackedCategoryMeta> = {}
  for (const category of summary.categories) {
    categoryMeta[category.categoryKey] = {
      label: category.label,
      emoji: category.emoji,
      color: category.color,
      total: category.total,
      percentage: summary.total > 0 ? (category.total / summary.total) * 100 : 0,
    }
  }

  return {
    points,
    categoryOrder: summary.categories.map((category) => category.categoryKey),
    categoryMeta,
    maxTotal: points.reduce((largest, point) => Math.max(largest, point.total), 0),
    grandTotal: summary.total,
    granularity,
  }
}

/**
 * ยุบหมวดหางยาวให้เหลือเส้นที่อ่านได้ โดยเก็บ `limit` หมวดแรกไว้
 * แล้วรวมที่เหลือเป็นเส้นเดียว · คืนชุดเดิมเมื่อยุบแล้วไม่ได้ลดจำนวนเส้นจริง
 */
export const collapseTrendCategories = (
  categories: CategoryTrend[],
  limit: number,
  color = '#9aa5a0',
): CategoryTrend[] => {
  if (limit <= 0 || categories.length <= limit + 1) return [...categories]

  const visible = categories.slice(0, limit)
  const rest = categories.slice(limit)
  const periodCount = categories[0].data.length

  const amounts = Array.from({ length: periodCount }, (_, index) =>
    rest.reduce((sum, category) => sum + category.data[index].amount, 0),
  )
  const total = rest.reduce((sum, category) => sum + category.total, 0)

  return [
    ...visible,
    {
      categoryKey: OTHER_TREND_KEY,
      category: null,
      label: `หมวดอื่น ๆ รวม (${rest.length})`,
      emoji: '📦',
      color,
      data: amounts.map((amount, index) => ({
        period: categories[0].data[index].period,
        periodLabel: categories[0].data[index].periodLabel,
        amount,
      })),
      total,
      averagePerPeriod: periodCount > 0 ? total / periodCount : 0,
      changePercent: changeBetweenLastPeriods(amounts),
    },
  ]
}
