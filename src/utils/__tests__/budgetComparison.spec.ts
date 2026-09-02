import { describe, expect, it } from 'vitest'
import type { CategoryBudget } from '../../composables/useCategoryBudgets'
import { makeTransaction } from '../../test-utils/factories'
import { buildBudgetComparison } from '../budgetComparison'

const MONTH = '2026-08'

const budgets: CategoryBudget[] = [
  { category: 'อาหาร', budget: 5000 },
  { category: 'การเดินทาง', budget: 1000 },
]

describe('buildBudgetComparison', () => {
  it('ยังไม่ได้ตั้งงบ = ไม่มีแถวให้เทียบ แต่ยังรู้ยอดจ่ายทั้งเดือน', () => {
    const summary = buildBudgetComparison(
      [makeTransaction({ category: 'อาหาร', amount: 300, transaction_date: '2026-08-04' })],
      [],
      MONTH,
    )

    expect(summary.items).toEqual([])
    expect(summary.totalBudget).toBe(0)
    expect(summary.monthTotal).toBe(300)
    expect(summary.noBudgetCategories).toHaveLength(1)
    expect(summary.noBudgetCategories[0].label).toBe('อาหาร')
  })

  it('หมวดที่ตั้งงบแต่ยังไม่มีรายการต้องแสดงด้วย', () => {
    const summary = buildBudgetComparison([], budgets, MONTH)

    expect(summary.items).toHaveLength(2)
    expect(summary.items.every((item) => item.actual === 0)).toBe(true)
    expect(summary.items.every((item) => item.status === 'under')).toBe(true)
    expect(summary.totalBudget).toBe(6000)
    expect(summary.totalRemaining).toBe(6000)
  })

  it('คำนวณ actual, remaining และ percentage จากรายการในเดือนนั้น', () => {
    const summary = buildBudgetComparison(
      [
        makeTransaction({ category: 'อาหาร', amount: 2000, transaction_date: '2026-08-04' }),
        makeTransaction({ category: 'อาหาร', amount: 500, transaction_date: '2026-08-20' }),
      ],
      budgets,
      MONTH,
    )

    const food = summary.items.find((item) => item.category === 'อาหาร')
    expect(food?.actual).toBe(2500)
    expect(food?.remaining).toBe(2500)
    expect(food?.percentage).toBeCloseTo(50)
    expect(food?.transactionCount).toBe(2)
    expect(food?.status).toBe('under')
  })

  it.each([
    [3999, 'under'],
    [4000, 'near'],
    [5000, 'near'],
    [5001, 'over'],
  ])('ยอด %i บาทจากงบ 5000 ได้สถานะ %s', (amount, expected) => {
    const summary = buildBudgetComparison(
      [makeTransaction({ category: 'อาหาร', amount, transaction_date: '2026-08-04' })],
      [{ category: 'อาหาร', budget: 5000 }],
      MONTH,
    )

    expect(summary.items[0].status).toBe(expected)
  })

  it('เกินงบแล้ว remaining ติดลบ และนับจำนวนหมวดที่เกิน', () => {
    const summary = buildBudgetComparison(
      [
        makeTransaction({ category: 'อาหาร', amount: 6000, transaction_date: '2026-08-04' }),
        makeTransaction({ category: 'การเดินทาง', amount: 100, transaction_date: '2026-08-04' }),
      ],
      budgets,
      MONTH,
    )

    const food = summary.items.find((item) => item.category === 'อาหาร')
    expect(food?.remaining).toBe(-1000)
    expect(summary.overBudgetCount).toBe(1)
    expect(summary.underBudgetCount).toBe(1)
    expect(summary.totalOverspend).toBe(1000)
    expect(summary.totalRemaining).toBe(900)
  })

  it('เรียงจากใช้เกินสัดส่วนมากสุดไปน้อยสุด', () => {
    const summary = buildBudgetComparison(
      [
        makeTransaction({ category: 'อาหาร', amount: 1000, transaction_date: '2026-08-04' }),
        makeTransaction({ category: 'การเดินทาง', amount: 900, transaction_date: '2026-08-04' }),
      ],
      budgets,
      MONTH,
    )

    expect(summary.items.map((item) => item.category)).toEqual(['การเดินทาง', 'อาหาร'])
  })

  it('ตัดรายการของเดือนอื่นและรายรับออก', () => {
    const summary = buildBudgetComparison(
      [
        makeTransaction({ category: 'อาหาร', amount: 1000, transaction_date: '2026-08-04' }),
        makeTransaction({ category: 'อาหาร', amount: 9000, transaction_date: '2026-07-31' }),
        makeTransaction({
          category: 'อาหาร',
          amount: 4000,
          type: 'income',
          transaction_date: '2026-08-04',
        }),
      ],
      budgets,
      MONTH,
    )

    expect(summary.items.find((item) => item.category === 'อาหาร')?.actual).toBe(1000)
    expect(summary.monthTotal).toBe(1000)
  })

  it('แยกหมวดที่จ่ายแต่ไม่มีงบ รวมถึงรายการที่ไม่ระบุหมวด', () => {
    const summary = buildBudgetComparison(
      [
        makeTransaction({ category: 'ช้อปปิ้ง', amount: 800, transaction_date: '2026-08-04' }),
        makeTransaction({ category: null, amount: 200, transaction_date: '2026-08-05' }),
        makeTransaction({ category: 'อาหาร', amount: 100, transaction_date: '2026-08-06' }),
      ],
      budgets,
      MONTH,
    )

    expect(summary.noBudgetCategories.map((entry) => entry.label)).toEqual([
      'ช้อปปิ้ง',
      'ไม่ระบุหมวดหมู่',
    ])
    expect(summary.noBudgetCategories[1].emoji).toBe('🏷️')
    expect(summary.monthTotal).toBe(1100)
    expect(summary.totalActual).toBe(100)
  })

  it('ไล่สีตาม palette ตามลำดับที่แสดง', () => {
    const summary = buildBudgetComparison([], budgets, MONTH, ['#111111', '#222222'])
    expect(summary.items.map((item) => item.color)).toEqual(['#111111', '#222222'])
  })
})
