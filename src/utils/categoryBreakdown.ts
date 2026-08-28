import {
  getCategoryEmoji,
  type Transaction,
  type TransactionCategory,
  type TransactionType,
} from '../types/transaction'

export const categoryPalette = [
  '#398d67',
  '#67ae86',
  '#9cc16f',
  '#e0aa4c',
  '#dd7a63',
  '#9a79b8',
  '#5b91b7',
  '#c77794',
]

export const opiumCategoryPalette = [
  '#ff174f',
  '#c4002f',
  '#ff5a7e',
  '#8d1735',
  '#f2ece8',
  '#9c8f95',
  '#6c2035',
  '#d9d0d4',
]

export interface CategorySlice {
  key: string
  category: TransactionCategory | null
  label: string
  emoji: string
  amount: number
  percentage: number
  color: string
  items: Transaction[]
}

export interface CategoryBreakdown {
  total: number
  slices: CategorySlice[]
}

const UNCATEGORIZED_KEY = '__uncategorized__'

/**
 * รวมยอดตามหมวดหมู่ของธุรกรรมชนิดที่เลือก พร้อมเก็บรายการย่อยไว้ให้กดดูได้
 */
export const buildCategoryBreakdown = (
  transactions: Transaction[],
  type: TransactionType,
  palette: readonly string[] = categoryPalette,
): CategoryBreakdown => {
  const groups = new Map<string, { category: TransactionCategory | null; amount: number; items: Transaction[] }>()
  let total = 0

  for (const transaction of transactions) {
    if (transaction.type !== type) continue

    const amount = Number(transaction.amount)
    const key = transaction.category ?? UNCATEGORIZED_KEY
    const group = groups.get(key) ?? { category: transaction.category, amount: 0, items: [] }

    group.amount += amount
    group.items.push(transaction)
    groups.set(key, group)
    total += amount
  }

  const slices = [...groups.entries()]
    .sort((a, b) => b[1].amount - a[1].amount)
    .map(([key, group], index) => ({
      key,
      category: group.category,
      label: group.category ?? 'ไม่ระบุหมวดหมู่',
      emoji: group.category ? getCategoryEmoji(group.category) : '🏷️',
      amount: group.amount,
      percentage: total > 0 ? (group.amount / total) * 100 : 0,
      color: palette[index % palette.length],
      items: [...group.items].sort((a, b) => {
        const byAmount = Number(b.amount) - Number(a.amount)
        return byAmount !== 0 ? byAmount : b.transaction_date.localeCompare(a.transaction_date)
      }),
    }))

  return { total, slices }
}

export const formatPercent = (percentage: number) =>
  `${percentage > 0 && percentage < 1 ? percentage.toFixed(1) : percentage.toFixed(0)}%`
