import type { CategoryBudget } from '../composables/useCategoryBudgets'
import {
  getCategoryEmoji,
  type Transaction,
  type TransactionCategory,
} from '../types/transaction'
import { categoryPalette } from './categoryBreakdown'

/** เกณฑ์เตือนก่อนเกินงบ: ใช้ถึง 80% ของงบแล้วถือว่าใกล้เต็ม */
export const BUDGET_NEAR_THRESHOLD = 80

export type BudgetStatus = 'under' | 'near' | 'over'

export interface BudgetVsActual {
  category: TransactionCategory
  label: string
  emoji: string
  color: string
  /** งบที่ตั้งไว้สำหรับเดือนนี้ */
  budget: number
  /** จ่ายจริงในเดือนที่เลือก */
  actual: number
  /** budget - actual · ติดลบ = เกินงบ */
  remaining: number
  /** actual / budget * 100 */
  percentage: number
  status: BudgetStatus
  transactionCount: number
}

export interface NoBudgetCategory {
  category: TransactionCategory | null
  label: string
  emoji: string
  actual: number
  transactionCount: number
}

export interface BudgetComparisonSummary {
  /** เรียงจากใช้เกินงบมากสุดไปน้อยสุด */
  items: BudgetVsActual[]
  totalBudget: number
  /** จ่ายจริงเฉพาะหมวดที่ตั้งงบไว้ */
  totalActual: number
  overBudgetCount: number
  underBudgetCount: number
  /** เงินที่ยังเหลือรวมทุกหมวด · 0 เมื่อใช้เกินไปแล้วทั้งหมด */
  totalRemaining: number
  /** ใช้เกินไปเท่าไรรวมทุกหมวด */
  totalOverspend: number
  /** หมวดที่มีรายจ่ายแต่ไม่ได้ตั้งงบ เรียงจากมากไปน้อย */
  noBudgetCategories: NoBudgetCategory[]
  /** จ่ายจริงทั้งเดือน รวมหมวดที่ไม่ได้ตั้งงบ */
  monthTotal: number
}

const statusOf = (percentage: number): BudgetStatus => {
  if (percentage > 100) return 'over'
  return percentage >= BUDGET_NEAR_THRESHOLD ? 'near' : 'under'
}

/**
 * เทียบงบรายหมวดกับรายจ่ายจริงของเดือนที่เลือก
 *
 * นับเฉพาะ type = 'expense' เพราะงบเป็นเรื่องของการใช้จ่าย
 * หมวดที่ตั้งงบไว้แต่ยังไม่มีรายการก็ต้องแสดง เพื่อให้เห็นว่างบยังว่างอยู่
 */
export const buildBudgetComparison = (
  transactions: Transaction[],
  budgets: CategoryBudget[],
  month: string,
  palette: readonly string[] = categoryPalette,
): BudgetComparisonSummary => {
  const spent = new Map<string, { amount: number; count: number }>()
  let monthTotal = 0

  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue
    if (transaction.transaction_date.slice(0, 7) !== month) continue

    const amount = Number(transaction.amount)
    if (!Number.isFinite(amount)) continue

    const key = transaction.category ?? ''
    const group = spent.get(key) ?? { amount: 0, count: 0 }
    group.amount += amount
    group.count += 1
    spent.set(key, group)
    monthTotal += amount
  }

  const budgetedCategories = new Set(budgets.map((item) => item.category))

  const items = budgets
    .map((item) => {
      const actual = spent.get(item.category)?.amount ?? 0
      const percentage = item.budget > 0 ? (actual / item.budget) * 100 : 0

      return {
        category: item.category,
        label: item.category,
        emoji: getCategoryEmoji(item.category),
        color: '',
        budget: item.budget,
        actual,
        remaining: item.budget - actual,
        percentage,
        status: statusOf(percentage),
        transactionCount: spent.get(item.category)?.count ?? 0,
      }
    })
    .sort((a, b) => {
      const byPercentage = b.percentage - a.percentage
      return byPercentage !== 0 ? byPercentage : b.budget - a.budget
    })
    .map((item, index) => ({ ...item, color: palette[index % palette.length] }))

  const noBudgetCategories = [...spent.entries()]
    .filter(([key]) => !budgetedCategories.has(key as TransactionCategory))
    .map(([key, group]) => ({
      category: (key || null) as TransactionCategory | null,
      label: key || 'ไม่ระบุหมวดหมู่',
      emoji: key ? getCategoryEmoji(key as TransactionCategory) : '🏷️',
      actual: group.amount,
      transactionCount: group.count,
    }))
    .sort((a, b) => b.actual - a.actual)

  return {
    items,
    totalBudget: items.reduce((sum, item) => sum + item.budget, 0),
    totalActual: items.reduce((sum, item) => sum + item.actual, 0),
    overBudgetCount: items.filter((item) => item.status === 'over').length,
    underBudgetCount: items.filter((item) => item.status !== 'over').length,
    totalRemaining: items.reduce((sum, item) => sum + Math.max(item.remaining, 0), 0),
    totalOverspend: items.reduce((sum, item) => sum + Math.max(-item.remaining, 0), 0),
    noBudgetCategories,
    monthTotal,
  }
}
