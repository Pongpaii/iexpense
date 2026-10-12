import type { Transaction, TransactionCategory } from '../types/transaction'

export interface RefundOffsetResult {
  /** รายจ่ายหลังหักเงินคืนแล้ว รายการที่ถูกหักจนหมดจะไม่อยู่ในลิสต์ */
  expenses: Transaction[]
  /** ยอดเงินคืนที่ใช้หักจริง (ไม่เกินรายจ่ายของหมวดนั้น) */
  refundedTotal: number
  /** จำนวนรายการรายรับที่ถูกนับเป็นเงินคืน */
  refundCount: number
}

const round = (value: number) => Math.round(value * 100) / 100

/**
 * รายรับนี้ถือเป็น "เงินคืน" ได้ไหม
 *
 * ทำไม: ผู้ใช้โอนให้เพื่อนแล้วเพื่อนโอนคืนในวันเดียวกัน ถ้าไม่หัก หลอดงบรายวันจะแดง
 * ทั้งที่จริงไม่ได้ใช้เงินเกิน เงินเดือนไม่ใช่เงินคืนแน่ ๆ และรายรับที่ไม่มีหมวด
 * จับคู่กับรายจ่ายไม่ได้ จึงตัดสองกรณีนี้ออก
 */
export const isRefundCandidate = (transaction: Transaction) =>
  transaction.type === 'income' &&
  transaction.category != null &&
  transaction.category !== 'เงินเดือน'

/**
 * หักรายรับ (ที่ไม่ใช่เงินเดือน) ออกจากรายจ่ายหมวดเดียวกันของวันนั้น
 *
 * - หักได้แค่หมวดเดียวกัน รายรับหมวดอาหารไม่ไปลดค่าเดินทาง
 * - หักไม่เกินรายจ่ายของหมวดนั้น ยอดที่เหลือไม่ติดลบ
 * - หักจากรายการที่ยอดสูงสุดก่อน เพราะก้อนที่โอนให้เพื่อนมักเป็นก้อนใหญ่
 *   ช่องย่อยในแผน (เช่น มื้อเช้า) จะได้ไม่ถูกลดผิดช่อง
 *
 * ฟังก์ชันนี้ใช้กับงบรายวันเท่านั้น ยอดคงเหลือและการ์ดสรุปยังคิดตามจริงทุกรายการ
 */
export const offsetSameCategoryRefunds = (
  expenses: readonly Transaction[],
  incomes: readonly Transaction[],
  excludedCategories: readonly TransactionCategory[] = [],
): RefundOffsetResult => {
  const excluded = new Set<TransactionCategory>(excludedCategories)
  const refundByCategory = new Map<TransactionCategory, { amount: number; count: number }>()

  for (const income of incomes) {
    if (!isRefundCandidate(income) || income.category == null) continue
    if (excluded.has(income.category)) continue

    const bucket = refundByCategory.get(income.category) ?? { amount: 0, count: 0 }
    bucket.amount += Number(income.amount) || 0
    bucket.count += 1
    refundByCategory.set(income.category, bucket)
  }

  if (refundByCategory.size === 0) {
    return { expenses: [...expenses], refundedTotal: 0, refundCount: 0 }
  }

  const reducedAmount = new Map<number, number>()
  let refundedTotal = 0
  let refundCount = 0

  for (const [category, refund] of refundByCategory) {
    const sameCategory = expenses
      .map((transaction, index) => ({ transaction, index }))
      .filter(({ transaction }) => transaction.type === 'expense' && transaction.category === category)
      .sort(
        (left, right) =>
          (Number(right.transaction.amount) || 0) - (Number(left.transaction.amount) || 0) ||
          left.index - right.index,
      )

    if (sameCategory.length === 0) continue

    let left = refund.amount
    for (const { transaction, index } of sameCategory) {
      if (left <= 0) break
      const amount = Number(transaction.amount) || 0
      const taken = Math.min(amount, left)
      left -= taken
      refundedTotal += taken
      reducedAmount.set(index, round(amount - taken))
    }
    refundCount += refund.count
  }

  const adjusted: Transaction[] = []
  expenses.forEach((transaction, index) => {
    const next = reducedAmount.get(index)
    if (next === undefined) {
      adjusted.push(transaction)
      return
    }
    if (next > 0) adjusted.push({ ...transaction, amount: next })
  })

  return { expenses: adjusted, refundedTotal: round(refundedTotal), refundCount }
}
