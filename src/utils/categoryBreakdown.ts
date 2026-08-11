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
      color: categoryPalette[index % categoryPalette.length],
      items: [...group.items].sort((a, b) => {
        const byAmount = Number(b.amount) - Number(a.amount)
        return byAmount !== 0 ? byAmount : b.transaction_date.localeCompare(a.transaction_date)
      }),
    }))

  return { total, slices }
}

/** ผลจากการกดหมวดหมู่บนกราฟวงกลม ใช้ส่งไปกรองรายการในลิสต์ */
export interface CategorySelection {
  key: string
  label: string
  emoji: string
  category: TransactionCategory | null
  type: TransactionType
}

/** ใช้กรองรายการในลิสต์ให้ตรงกับหมวดที่กดบนกราฟวงกลม */
export const matchesSelection = (transaction: Transaction, selection: CategorySelection) =>
  transaction.type === selection.type &&
  (transaction.category ?? UNCATEGORIZED_KEY) === selection.key

export const formatPercent = (percentage: number) =>
  `${percentage > 0 && percentage < 1 ? percentage.toFixed(1) : percentage.toFixed(0)}%`
