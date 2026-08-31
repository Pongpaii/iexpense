import { describe, expect, it } from 'vitest'
import { makeTransaction } from '../../test-utils/factories'
import type { TransactionCategory } from '../../types/transaction'
import { createFinancialForecast, FORECAST_HORIZON_DAYS } from '../forecast'

const TODAY = '2026-03-15'

/** รายจ่ายรายวันติดต่อกัน `days` วัน โดยวันสุดท้ายคือวันนี้ */
const dailyExpensesEndingToday = (
  days: number,
  amount: number,
  category: TransactionCategory = 'อาหาร',
) =>
  Array.from({ length: days }, (_, index) => {
    const date = new Date(`${TODAY}T12:00:00`)
    date.setDate(date.getDate() - index)
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}`

    return makeTransaction({ type: 'expense', amount, transaction_date: iso, category })
  })

const forecastFor = (
  transactions = [] as ReturnType<typeof makeTransaction>[],
  overrides: { monthlySalary?: number; salaryDay?: number; today?: string } = {},
) =>
  createFinancialForecast({
    transactions,
    monthlySalary: overrides.monthlySalary ?? 30_000,
    salaryDay: overrides.salaryDay ?? 25,
    today: overrides.today ?? TODAY,
  })

describe('createFinancialForecast', () => {
  describe('ยอดคงเหลือปัจจุบัน', () => {
    it('เป็นศูนย์เมื่อไม่มีรายการ', () => {
      expect(forecastFor().currentBalance).toBe(0)
    })

    it('คิดจากรายรับหักรายจ่ายถึงวันนี้', () => {
      const transactions = [
        makeTransaction({ type: 'income', amount: 30_000, transaction_date: '2026-03-01' }),
        makeTransaction({ type: 'expense', amount: 5_000, transaction_date: '2026-03-02' }),
      ]

      expect(forecastFor(transactions).currentBalance).toBe(25_000)
    })

    it('ไม่นับรายการที่ลงวันที่ในอนาคต', () => {
      const transactions = [
        makeTransaction({ type: 'income', amount: 1_000, transaction_date: '2026-03-10' }),
        makeTransaction({ type: 'income', amount: 9_999, transaction_date: '2026-03-20' }),
      ]

      expect(forecastFor(transactions).currentBalance).toBe(1_000)
    })

    it('รวมรายการของวันนี้ด้วย', () => {
      const transactions = [
        makeTransaction({ type: 'income', amount: 500, transaction_date: TODAY }),
      ]

      expect(forecastFor(transactions).currentBalance).toBe(500)
    })
  })

  describe('ข้อมูลไม่พอ', () => {
    it('รายงานว่าไม่มีข้อมูลรายจ่ายเมื่อยังไม่มีรายการ', () => {
      const forecast = forecastFor()

      expect(forecast.hasSpendingData).toBe(false)
      expect(forecast.averageDailyExpense).toBe(0)
      expect(forecast.expenseRecordCount).toBe(0)
      expect(forecast.confidence).toBe('low')
    })

    it('สถานะเป็น insufficient เมื่อข้อมูลยังน้อยเกินจะสรุป', () => {
      const transactions = [
        makeTransaction({ type: 'income', amount: 30_000, transaction_date: '2026-03-01' }),
        makeTransaction({ type: 'expense', amount: 100, transaction_date: '2026-03-14' }),
      ]

      expect(forecastFor(transactions).status).toBe('insufficient')
    })

    it('เตือน risk ทันทีเมื่อเงินติดลบอยู่จริง แม้ข้อมูลจะน้อย', () => {
      // ยอดติดลบเป็นข้อเท็จจริงของวันนี้ ไม่ใช่การพยากรณ์
      const transactions = [
        makeTransaction({ type: 'expense', amount: 500, transaction_date: '2026-03-14' }),
      ]

      expect(forecastFor(transactions).status).toBe('risk')
    })
  })

  describe('ค่าเฉลี่ยรายจ่ายแบบถ่วงน้ำหนัก', () => {
    it('ถ่วงค่าเฉลี่ยเข้าหาค่าอ้างอิงจากเงินเดือนเมื่อข้อมูลน้อย', () => {
      // จ่ายก้อนใหญ่ครั้งเดียวเมื่อวาน ค่าเฉลี่ยดิบจะสูงเกินจริงมาก
      const transactions = [
        makeTransaction({ type: 'expense', amount: 6_000, transaction_date: '2026-03-14', category: 'อาหาร' }),
      ]

      const forecast = forecastFor(transactions)

      expect(forecast.isEstimateBlended).toBe(true)
      expect(forecast.estimateWeight).toBeLessThan(1)
      expect(forecast.averageDailyExpense).toBeLessThan(forecast.observedDailyExpense)
      expect(forecast.averageDailyExpense).toBeGreaterThan(forecast.priorDailyExpense)
    })

    it('ค่าอ้างอิงคือเงินเดือนหารด้วยช่วงพยากรณ์', () => {
      expect(forecastFor([], { monthlySalary: 30_000 }).priorDailyExpense).toBeCloseTo(
        30_000 / FORECAST_HORIZON_DAYS,
      )
    })

    it('เชื่อข้อมูลจริงเต็มร้อยเมื่อไม่ได้ตั้งเงินเดือนไว้', () => {
      const transactions = [
        makeTransaction({ type: 'expense', amount: 100, transaction_date: '2026-03-14' }),
      ]

      const forecast = forecastFor(transactions, { monthlySalary: 0 })

      expect(forecast.priorDailyExpense).toBe(0)
      expect(forecast.estimateWeight).toBe(1)
      expect(forecast.averageDailyExpense).toBeCloseTo(forecast.observedDailyExpense)
    })

    it('เชื่อข้อมูลจริงเต็มร้อยเมื่อเก็บข้อมูลครบหนึ่งรอบเงินเดือนแล้ว', () => {
      const forecast = forecastFor(dailyExpensesEndingToday(35, 300))

      expect(forecast.estimateWeight).toBe(1)
      expect(forecast.isEstimateBlended).toBe(false)
      expect(forecast.hasFullCycleData).toBe(true)
      expect(forecast.averageDailyExpense).toBeCloseTo(300)
    })

    it('ความมั่นใจสูงเมื่อข้อมูลครอบคลุมสองรอบเงินเดือน', () => {
      expect(forecastFor(dailyExpensesEndingToday(70, 300)).confidence).toBe('high')
    })

    it('ความมั่นใจปานกลางเมื่อข้อมูลครอบคลุมราวสองสัปดาห์', () => {
      expect(forecastFor(dailyExpensesEndingToday(20, 300)).confidence).toBe('medium')
    })
  })

  describe('แยกค่าเฉลี่ย daily essentials กับ irregular', () => {
    it('หมวดอาหารและเดินทางถูกคิดเป็นค่าเฉลี่ยต่อวัน', () => {
      const transactions = dailyExpensesEndingToday(30, 200, 'อาหาร')

      const forecast = forecastFor(transactions)

      expect(forecast.observedDailyEssential).toBeCloseTo(200)
      expect(forecast.observedDailyIrregular).toBeCloseTo(0)
    })

    it('หมวดอื่นถูกคิดเป็นค่าเฉลี่ยต่อเดือนแล้วหาร 30', () => {
      // รายจ่าย irregular รวม 3,000 บาท ครอบคลุม 30 วัน → 3,000/เดือน → 100/วัน
      const transactions = [
        makeTransaction({
          type: 'expense',
          amount: 1_500,
          category: 'ช้อปปิ้ง',
          transaction_date: TODAY,
        }),
        makeTransaction({
          type: 'expense',
          amount: 1_500,
          category: 'ช้อปปิ้ง',
          transaction_date: '2026-02-14',
        }),
      ]

      const forecast = forecastFor(transactions)

      expect(forecast.historyDays).toBe(30)
      expect(forecast.observedDailyIrregular).toBeCloseTo(100)
    })

    it('irregular ไม่ inflate เกินจริงเมื่อข้อมูลน้อยกว่า 30 วัน', () => {
      // ช้อปปิ้ง 3000 ใน 5 วัน → สูตรเดิม: 600/วัน → สูตรใหม่: 100/วัน
      const transactions = [
        ...dailyExpensesEndingToday(5, 200, 'อาหาร'),
        makeTransaction({
          type: 'expense', amount: 3_000, category: 'ช้อปปิ้ง',
          transaction_date: '2026-03-14',
        }),
      ]

      const forecast = forecastFor(transactions, { monthlySalary: 0 })

      // Daily: 200/วัน (อาหาร)
      expect(forecast.observedDailyEssential).toBeCloseTo(200)
      // Irregular: clamp เป็น 1 เดือน → 3000/30 = 100/วัน (ไม่ใช่ 3000/5 = 600)
      expect(forecast.observedDailyIrregular).toBeCloseTo(100)
      // รวม: 300 ไม่ใช่ 800 (สูตรเดิม: (1000+3000)/5 = 800)
      expect(forecast.observedDailyExpense).toBeCloseTo(300)
    })

    it('expense ที่ไม่มี category ถูกจัดเป็น irregular', () => {
      const transactions = [
        makeTransaction({ type: 'expense', amount: 600, transaction_date: '2026-03-14', category: null }),
      ]

      const forecast = forecastFor(transactions, { monthlySalary: 0 })

      expect(forecast.observedDailyEssential).toBe(0)
      expect(forecast.observedDailyIrregular).toBeCloseTo(600 / 30) // clamp เป็น 1 เดือน
    })
  })

  describe('รอบเงินเดือน', () => {
    it('ชี้ไปวันเงินเดือนของเดือนนี้เมื่อยังไม่ถึง', () => {
      const forecast = forecastFor([], { salaryDay: 25 })

      expect(forecast.nextSalaryDate).toBe('2026-03-25')
      expect(forecast.daysUntilSalary).toBe(10)
    })

    it('ข้ามไปเดือนถัดไปเมื่อวันเงินเดือนของเดือนนี้ผ่านไปแล้ว', () => {
      const forecast = forecastFor([], { salaryDay: 5 })

      expect(forecast.nextSalaryDate).toBe('2026-04-05')
    })

    it('ปรับวันเงินเดือนที่เกินจำนวนวันในเดือนนั้นให้เป็นวันสุดท้าย', () => {
      const forecast = forecastFor([], { salaryDay: 31, today: '2026-02-10' })

      expect(forecast.nextSalaryDate).toBe('2026-02-28')
    })

    it('บีบวันเงินเดือนให้อยู่ในช่วง 1-31', () => {
      expect(forecastFor([], { salaryDay: 0 }).salaryDay).toBe(1)
      expect(forecastFor([], { salaryDay: 99 }).salaryDay).toBe(31)
    })

    it('ข้ามไปรอบถัดไปเมื่อพบว่าเงินเดือนรอบนี้เข้าแล้ว', () => {
      const transactions = [
        makeTransaction({
          type: 'income',
          amount: 30_000,
          category: 'เงินเดือน',
          transaction_date: '2026-03-10',
        }),
      ]

      const forecast = forecastFor(transactions, { salaryDay: 10 })

      expect(forecast.nextSalaryDate).toBe('2026-04-10')
    })
  })

  describe('การพยากรณ์ยอดคงเหลือ', () => {
    it('หักรายจ่ายที่คาดไว้ออกจากยอดคงเหลือก่อนเงินเดือนเข้า', () => {
      const transactions = [
        makeTransaction({ type: 'income', amount: 30_000, transaction_date: '2026-03-01' }),
        makeTransaction({ type: 'expense', amount: 300, transaction_date: '2026-03-14' }),
      ]

      const forecast = forecastFor(transactions)

      expect(forecast.balanceBeforeSalary).toBeLessThan(forecast.currentBalance)
    })

    it('บวกเงินเดือนรอบถัดไปเข้ายอดหลังเงินเดือน', () => {
      const forecast = forecastFor([], { monthlySalary: 30_000 })

      expect(forecast.balanceAfterSalary - forecast.balanceBeforeSalary).toBeCloseTo(30_000)
    })

    it('รวมรายการล่วงหน้าที่ผู้ใช้จดไว้แล้วเข้าไปในการพยากรณ์', () => {
      const withoutFuture = forecastFor([
        makeTransaction({ type: 'income', amount: 30_000, transaction_date: '2026-03-01' }),
      ])
      const withFuture = forecastFor([
        makeTransaction({ type: 'income', amount: 30_000, transaction_date: '2026-03-01' }),
        makeTransaction({ type: 'expense', amount: 4_000, transaction_date: '2026-03-20' }),
      ])

      expect(withFuture.projectedExpense30Days).toBeCloseTo(
        withoutFuture.projectedExpense30Days + 4_000,
      )
    })

    it('บอกจำนวนวันที่เงินจะพออยู่ได้', () => {
      const transactions = [
        makeTransaction({ type: 'income', amount: 10_000, transaction_date: '2026-03-01' }),
        makeTransaction({ type: 'expense', amount: 200, transaction_date: '2026-03-14' }),
      ]

      const forecast = forecastFor(transactions)

      expect(forecast.estimatedMoneyLastsDays).toBeGreaterThan(0)
      expect(Number.isInteger(forecast.estimatedMoneyLastsDays)).toBe(true)
    })

    it('คืน null สำหรับจำนวนวันที่เงินพอ เมื่อยังไม่มีรายจ่ายเลย', () => {
      expect(forecastFor().estimatedMoneyLastsDays).toBeNull()
    })
  })

  describe('ความทนต่อข้อมูลเสีย', () => {
    it('ข้ามรายการที่วันที่ผิดรูปแบบ', () => {
      const transactions = [
        makeTransaction({ type: 'income', amount: 1_000, transaction_date: 'ไม่ใช่วันที่' }),
        makeTransaction({ type: 'income', amount: 500, transaction_date: '2026-03-01' }),
      ]

      expect(forecastFor(transactions).currentBalance).toBe(500)
    })

    it('ข้ามรายการที่จำนวนเงินไม่เป็นบวก', () => {
      const transactions = [
        makeTransaction({ type: 'income', amount: 0, transaction_date: '2026-03-01' }),
        makeTransaction({ type: 'income', amount: -50, transaction_date: '2026-03-01' }),
        makeTransaction({ type: 'income', amount: 700, transaction_date: '2026-03-01' }),
      ]

      expect(forecastFor(transactions).currentBalance).toBe(700)
    })

    it('ไม่พังเมื่อวันนี้ผิดรูปแบบ', () => {
      expect(() => forecastFor([], { today: 'เมื่อวาน' })).not.toThrow()
    })

    it('ถือว่าเงินเดือนติดลบเป็นศูนย์', () => {
      expect(forecastFor([], { monthlySalary: -5_000 }).monthlySalary).toBe(0)
    })
  })
})
