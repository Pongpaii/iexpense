import { describe, expect, it } from 'vitest'
import { makeTransaction } from '../../test-utils/factories'
import type { TransactionCategory } from '../../types/transaction'
import { isRefundCandidate, offsetSameCategoryRefunds } from '../refundOffset'

const expense = (amount: number, category: TransactionCategory | null) =>
  makeTransaction({ type: 'expense', amount, category })
const income = (amount: number, category: TransactionCategory | null) =>
  makeTransaction({ type: 'income', amount, category })

describe('isRefundCandidate', () => {
  it('รับเฉพาะรายรับที่มีหมวดและไม่ใช่เงินเดือน', () => {
    expect(isRefundCandidate(income(100, 'อื่น ๆ'))).toBe(true)
    expect(isRefundCandidate(income(100, 'เงินเดือน'))).toBe(false)
    expect(isRefundCandidate(income(100, null))).toBe(false)
    expect(isRefundCandidate(expense(100, 'อื่น ๆ'))).toBe(false)
  })
})

describe('offsetSameCategoryRefunds', () => {
  it('เพื่อนโอนคืนเต็มจำนวน รายจ่ายก้อนนั้นหายไปจากงบ', () => {
    const food = expense(60, 'อาหาร')
    const result = offsetSameCategoryRefunds(
      [food, expense(500, 'อื่น ๆ')],
      [income(500, 'อื่น ๆ')],
    )

    expect(result.expenses).toEqual([food])
    expect(result.refundedTotal).toBe(500)
    expect(result.refundCount).toBe(1)
  })

  it('คืนบางส่วนจะลดยอดของรายการที่ใหญ่ที่สุดก่อน', () => {
    const small = expense(50, 'อาหาร')
    const big = expense(400, 'อาหาร')
    const result = offsetSameCategoryRefunds([small, big], [income(300, 'อาหาร')])

    expect(result.expenses.map((item) => item.amount)).toEqual([50, 100])
    expect(result.refundedTotal).toBe(300)
  })

  it('คืนเกินรายจ่ายไม่ทำให้ยอดติดลบ และนับยอดคืนเท่าที่หักได้จริง', () => {
    const result = offsetSameCategoryRefunds([expense(200, 'อื่น ๆ')], [income(900, 'อื่น ๆ')])

    expect(result.expenses).toEqual([])
    expect(result.refundedTotal).toBe(200)
  })

  it('ไม่หักข้ามหมวด', () => {
    const transport = expense(80, 'การเดินทาง')
    const result = offsetSameCategoryRefunds([transport], [income(80, 'อาหาร')])

    expect(result.expenses).toEqual([transport])
    expect(result.refundedTotal).toBe(0)
  })

  it('เงินเดือนไม่ถูกนับเป็นเงินคืน', () => {
    const result = offsetSameCategoryRefunds(
      [expense(300, 'อาหาร')],
      [income(17_000, 'เงินเดือน')],
    )

    expect(result.expenses.map((item) => item.amount)).toEqual([300])
    expect(result.refundedTotal).toBe(0)
  })

  it('หมวดที่ผู้ใช้กันออกจากงบไม่ถูกนำมาหัก', () => {
    const result = offsetSameCategoryRefunds([], [income(3_000, 'ที่พัก')], ['ที่พัก'])

    expect(result.refundedTotal).toBe(0)
    expect(result.refundCount).toBe(0)
  })

  it('ไม่แก้ object เดิม', () => {
    const original = expense(400, 'อาหาร')
    offsetSameCategoryRefunds([original], [income(100, 'อาหาร')])

    expect(original.amount).toBe(400)
  })
})
