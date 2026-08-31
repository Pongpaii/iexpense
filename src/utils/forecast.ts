import type { Transaction } from '../types/transaction'
import type { TransactionCategory } from '../types/transaction'

export const FORECAST_HORIZON_DAYS = 30
export const FORECAST_HISTORY_DAYS = 90

const MILLISECONDS_PER_DAY = 86_400_000
const SALARY_EARLY_WINDOW_DAYS = 3
const SALARY_LATE_WINDOW_DAYS = 1

/**
 * หมวดหมู่ที่เกิดขึ้นเป็นประจำทุกวัน (daily essentials)
 * ใช้คำนวณค่าเฉลี่ยต่อวันโดยตรง ส่วนหมวดอื่นจะคิดเป็นค่าเฉลี่ยต่อเดือนแทน
 * เพื่อไม่ให้รายจ่ายก้อนใหญ่ที่ไม่ได้เกิดทุกวัน (เช่น ช้อปปิ้ง) ดึงค่าเฉลี่ยให้สูงเกินจริง
 */
const DAILY_CATEGORIES: TransactionCategory[] = [
  'อาหาร',
  'การเดินทาง',
]

/** จำนวนวันและจำนวนรายการที่ต้องมี ก่อนจะเชื่อค่าเฉลี่ยที่สังเกตได้เต็มร้อย */
const FULL_TRUST_DAYS = 30
const FULL_TRUST_RECORDS = 12

type ForecastConfidence = 'low' | 'medium' | 'high'
export type ForecastStatus = 'insufficient' | 'safe' | 'watch' | 'risk'

export interface FinancialForecast {
  /** ค่าที่ใช้พยากรณ์จริง เป็นค่าผสมระหว่างข้อมูลที่สังเกตได้กับค่าอ้างอิงจากเงินเดือน */
  averageDailyExpense: number
  /** ค่าเฉลี่ยดิบจากข้อมูลที่บันทึกไว้ ยังไม่ผสมอะไร */
  observedDailyExpense: number
  /** ค่าเฉลี่ยดิบเฉพาะหมวด daily (อาหาร, เดินทาง) ต่อวัน */
  observedDailyEssential: number
  /** ค่าเฉลี่ยดิบเฉพาะหมวด irregular ต่อวัน (คิดจาก monthly ÷ 30) */
  observedDailyIrregular: number
  /** ค่าอ้างอิงตอนข้อมูลน้อย คิดจากเงินเดือนหารจำนวนวันในรอบ */
  priorDailyExpense: number
  /** น้ำหนักที่ให้กับข้อมูลจริง 0-1 ยิ่งใกล้ 1 ยิ่งเชื่อข้อมูลที่บันทึกไว้ */
  estimateWeight: number
  /** true เมื่อยังเชื่อข้อมูลจริงไม่เต็มร้อย จึงยังเป็นค่าประมาณแบบผสม */
  isEstimateBlended: boolean
  /** true เมื่อข้อมูลครอบคลุมครบหนึ่งรอบเงินเดือนแล้ว */
  hasFullCycleData: boolean
  balanceAfterSalary: number
  balanceBeforeSalary: number
  confidence: ForecastConfidence
  currentBalance: number
  daysUntilSalary: number
  estimatedMoneyLastsDays: number | null
  expenseRecordCount: number
  hasSpendingData: boolean
  historyDays: number
  monthlySalary: number
  nextSalaryDate: string
  projectedBalance30Days: number
  projectedExpense30Days: number
  projectedExpenseUntilSalary: number
  safeDailyBudget: number | null
  salaryDay: number
  salaryPaymentsIn30Days: number
  status: ForecastStatus
}

interface ForecastOptions {
  transactions: Transaction[]
  monthlySalary: number
  salaryDay: number
  today: string
}

interface DatedTransaction {
  amount: number
  date: Date
  dayNumber: number
  transaction: Transaction
}

const parseIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day, 12)

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) return null

  return date
}

const toIsoDate = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const calendarDayNumber = (date: Date) =>
  Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MILLISECONDS_PER_DAY

const daysBetween = (start: Date, end: Date) =>
  Math.round(calendarDayNumber(end) - calendarDayNumber(start))

const addDays = (date: Date, amount: number) => {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + amount)
  return nextDate
}

const salaryDateForMonth = (year: number, month: number, salaryDay: number) => {
  const lastDayOfMonth = new Date(year, month + 1, 0, 12).getDate()
  return new Date(year, month, Math.min(salaryDay, lastDayOfMonth), 12)
}

const nextMonthSalaryDate = (date: Date, salaryDay: number) =>
  salaryDateForMonth(date.getFullYear(), date.getMonth() + 1, salaryDay)

/**
 * ความมั่นใจวัดจากว่าข้อมูลครอบคลุมกี่รอบเงินเดือน ไม่ใช่แค่กี่วัน
 * เพราะรายจ่ายก้อนใหญ่อย่างค่าหอเกิดเดือนละครั้ง เห็นครั้งเดียวยังสรุปไม่ได้
 */
const getConfidence = (historyDays: number, expenseRecordCount: number): ForecastConfidence => {
  if (historyDays >= FULL_TRUST_DAYS * 2 && expenseRecordCount >= 20) return 'high'
  if (historyDays >= 14 && expenseRecordCount >= 5) return 'medium'
  return 'low'
}

const sumByType = (items: DatedTransaction[], type: Transaction['type']) =>
  items
    .filter(({ transaction }) => transaction.type === type)
    .reduce((sum, { amount }) => sum + amount, 0)

export const createFinancialForecast = ({
  transactions,
  monthlySalary,
  salaryDay,
  today,
}: ForecastOptions): FinancialForecast => {
  const parsedToday = parseIsoDate(today) ?? new Date()
  parsedToday.setHours(12, 0, 0, 0)

  const normalizedSalary = Number.isFinite(monthlySalary) && monthlySalary > 0 ? monthlySalary : 0
  const normalizedSalaryDay = Math.min(31, Math.max(1, Math.round(salaryDay)))
  const todayNumber = calendarDayNumber(parsedToday)
  const horizonEnd = addDays(parsedToday, FORECAST_HORIZON_DAYS)
  const horizonEndNumber = calendarDayNumber(horizonEnd)
  const historyStartNumber = calendarDayNumber(
    addDays(parsedToday, -(FORECAST_HISTORY_DAYS - 1)),
  )

  const datedTransactions = transactions.reduce<DatedTransaction[]>((items, transaction) => {
    const date = parseIsoDate(transaction.transaction_date)
    const amount = Number(transaction.amount)
    if (!date || !Number.isFinite(amount) || amount <= 0) return items

    items.push({
      amount,
      date,
      dayNumber: calendarDayNumber(date),
      transaction,
    })
    return items
  }, [])

  const transactionsThroughToday = datedTransactions.filter(({ dayNumber }) => dayNumber <= todayNumber)
  const currentBalance =
    sumByType(transactionsThroughToday, 'income') -
    sumByType(transactionsThroughToday, 'expense')

  const recentExpenses = datedTransactions.filter(({ dayNumber, transaction }) =>
    transaction.type === 'expense' &&
    dayNumber >= historyStartNumber &&
    dayNumber <= todayNumber,
  )
  const observedExpense = recentExpenses.reduce((sum, { amount }) => sum + amount, 0)
  const earliestExpense = recentExpenses.reduce<DatedTransaction | null>((earliest, item) => {
    if (!earliest || item.dayNumber < earliest.dayNumber) return item
    return earliest
  }, null)
  const historyDays = earliestExpense
    ? Math.min(FORECAST_HISTORY_DAYS, daysBetween(earliestExpense.date, parsedToday) + 1)
    : 0
  const expenseRecordCount = recentExpenses.length
  const hasSpendingData = expenseRecordCount > 0 && historyDays > 0

  // --- แยก expense เป็น daily essentials vs irregular ---
  const dailyExpenses = recentExpenses.filter(({ transaction }) =>
    transaction.category != null && DAILY_CATEGORIES.includes(transaction.category),
  )
  const irregularExpenses = recentExpenses.filter(({ transaction }) =>
    transaction.category == null || !DAILY_CATEGORIES.includes(transaction.category),
  )

  const dailyTotal = dailyExpenses.reduce((sum, { amount }) => sum + amount, 0)
  const irregularTotal = irregularExpenses.reduce((sum, { amount }) => sum + amount, 0)

  // Daily essentials → หารด้วยจำนวนวัน (เกิดทุกวัน)
  const observedDailyEssential = hasSpendingData ? dailyTotal / historyDays : 0

  // Irregular → คิดเป็นค่าเฉลี่ยต่อ "เดือน" ก่อน แล้วหาร 30 กลับมาเป็นรายวัน
  // เมื่อ historyDays < 30 จะ clamp เป็น 1 เดือน เพื่อไม่ให้รายจ่ายก้อนใหญ่ที่
  // เกิดครั้งเดียว (เช่น ช้อปปิ้ง) ถูกหารด้วยจำนวนวันน้อยแล้วดึงค่าเฉลี่ยให้สูงเกินจริง
  // เช่น ช้อปปิ้ง ฿3,000 ใน 5 วัน → สูตรเดิม: 600/วัน → สูตรใหม่: 100/วัน (3000/เดือน)
  const historyMonths = Math.max(historyDays / 30, 1)
  const observedMonthlyIrregular = irregularTotal / historyMonths
  const observedDailyIrregular = hasSpendingData ? observedMonthlyIrregular / 30 : 0

  // รวม daily + irregular เป็นค่าเฉลี่ยต่อวันที่แม่นกว่าเดิม
  // ผลต่างจากสูตรเดิม: เมื่อ historyDays < 30 irregular จะไม่ถูก inflate
  // เมื่อ historyDays ≥ 30 ผลจะเท่าเดิมทุกประการ
  const observedDailyExpense = observedDailyEssential + observedDailyIrregular

  // ตอนข้อมูลน้อย ค่าเฉลี่ยดิบเหวี่ยงแรงมาก เช่น จ่ายค่าหอวันที่ 1 แล้วดูวันที่ 3
  // จะได้หลักพันต่อวัน จึงถ่วงเข้าหาค่าอ้างอิงจากเงินเดือน แล้วค่อยเชื่อข้อมูลจริง
  // มากขึ้นเมื่อเก็บข้อมูลได้ครบรอบ
  const priorDailyExpense = normalizedSalary > 0 ? normalizedSalary / FORECAST_HORIZON_DAYS : 0
  const estimateWeight = !hasSpendingData
    ? 0
    : priorDailyExpense <= 0
      ? 1
      : Math.min(
          1,
          historyDays / FULL_TRUST_DAYS,
          expenseRecordCount / FULL_TRUST_RECORDS,
        )
  const averageDailyExpense = hasSpendingData
    ? estimateWeight * observedDailyExpense + (1 - estimateWeight) * priorDailyExpense
    : 0
  const hasFullCycleData = historyDays >= FULL_TRUST_DAYS
  const confidence = getConfidence(historyDays, expenseRecordCount)

  const likelySalaryTransactions = datedTransactions.filter(({ amount, transaction }) => {
    if (transaction.type !== 'income') return false

    const categoryOrDescriptionMatches =
      transaction.category === 'เงินเดือน' ||
      /เงิน\s*เดือน|salary|payroll|ค่าจ้าง/i.test(transaction.description)
    const configuredAmountMatches = normalizedSalary > 0 &&
      Math.abs(amount - normalizedSalary) <= Math.max(1, normalizedSalary * 0.02)

    return categoryOrDescriptionMatches || configuredAmountMatches
  })

  const findRecordedSalary = (payday: Date) => {
    const paydayNumber = calendarDayNumber(payday)
    return likelySalaryTransactions
      .filter(({ dayNumber }) =>
        dayNumber >= paydayNumber - SALARY_EARLY_WINDOW_DAYS &&
        dayNumber <= paydayNumber + SALARY_LATE_WINDOW_DAYS,
      )
      .sort((left, right) => {
        const leftCategoryScore = left.transaction.category === 'เงินเดือน' ? 0 : 1
        const rightCategoryScore = right.transaction.category === 'เงินเดือน' ? 0 : 1
        return leftCategoryScore - rightCategoryScore ||
          Math.abs(left.dayNumber - paydayNumber) - Math.abs(right.dayNumber - paydayNumber)
      })[0] ?? null
  }

  let salaryCycle = salaryDateForMonth(
    parsedToday.getFullYear(),
    parsedToday.getMonth(),
    normalizedSalaryDay,
  )
  if (calendarDayNumber(salaryCycle) < todayNumber) {
    salaryCycle = nextMonthSalaryDate(salaryCycle, normalizedSalaryDay)
  }

  let nextSalaryDate = new Date(salaryCycle)
  let nextSalaryAmount = normalizedSalary

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const recordedSalary = findRecordedSalary(salaryCycle)

    if (recordedSalary && recordedSalary.dayNumber <= todayNumber) {
      salaryCycle = nextMonthSalaryDate(salaryCycle, normalizedSalaryDay)
      continue
    }

    nextSalaryDate = recordedSalary?.date ?? salaryCycle
    nextSalaryAmount = recordedSalary?.amount ?? normalizedSalary
    break
  }

  const nextSalaryNumber = calendarDayNumber(nextSalaryDate)
  const daysUntilSalary = Math.max(0, nextSalaryNumber - todayNumber)
  const knownBeforeSalary = datedTransactions.filter(({ dayNumber }) =>
    dayNumber > todayNumber && dayNumber < nextSalaryNumber,
  )
  const knownIncomeBeforeSalary = sumByType(knownBeforeSalary, 'income')
  const knownExpenseBeforeSalary = sumByType(knownBeforeSalary, 'expense')
  const projectedExpenseUntilSalary =
    averageDailyExpense * daysUntilSalary + knownExpenseBeforeSalary
  const balanceBeforeSalary =
    currentBalance + knownIncomeBeforeSalary - projectedExpenseUntilSalary
  const balanceAfterSalary = balanceBeforeSalary + nextSalaryAmount

  const knownWithinHorizon = datedTransactions.filter(({ dayNumber }) =>
    dayNumber > todayNumber && dayNumber <= horizonEndNumber,
  )
  const knownIncome30Days = sumByType(knownWithinHorizon, 'income')
  const knownExpense30Days = sumByType(knownWithinHorizon, 'expense')
  let projectedSalaryIncome30Days = 0
  let salaryPaymentsIn30Days = 0
  let salaryCursor = salaryDateForMonth(
    parsedToday.getFullYear(),
    parsedToday.getMonth(),
    normalizedSalaryDay,
  )

  if (calendarDayNumber(salaryCursor) < todayNumber) {
    salaryCursor = nextMonthSalaryDate(salaryCursor, normalizedSalaryDay)
  }

  while (calendarDayNumber(salaryCursor) <= horizonEndNumber) {
    const recordedSalary = findRecordedSalary(salaryCursor)

    if (recordedSalary) {
      if (recordedSalary.dayNumber > todayNumber && recordedSalary.dayNumber <= horizonEndNumber) {
        salaryPaymentsIn30Days += 1
      }
    } else {
      projectedSalaryIncome30Days += normalizedSalary
      salaryPaymentsIn30Days += 1
    }

    salaryCursor = nextMonthSalaryDate(salaryCursor, normalizedSalaryDay)
  }

  const projectedExpense30Days =
    averageDailyExpense * FORECAST_HORIZON_DAYS + knownExpense30Days
  const projectedBalance30Days =
    currentBalance + knownIncome30Days + projectedSalaryIncome30Days - projectedExpense30Days
  const paydayDailyBudget = daysUntilSalary > 0
    ? Math.max(currentBalance + knownIncomeBeforeSalary - knownExpenseBeforeSalary, 0) /
      daysUntilSalary
    : null
  const horizonDailyBudget = Math.max(
    currentBalance + knownIncome30Days + projectedSalaryIncome30Days - knownExpense30Days,
    0,
  ) / FORECAST_HORIZON_DAYS
  const safeDailyBudget = paydayDailyBudget === null
    ? horizonDailyBudget
    : Math.min(paydayDailyBudget, horizonDailyBudget)
  const estimatedMoneyLastsDays = averageDailyExpense > 0
    ? Math.max(0, Math.floor(Math.max(currentBalance, 0) / averageDailyExpense))
    : null

  // เตือนได้เมื่อข้อมูลพอจะสรุปเท่านั้น ยกเว้นกรณีเงินติดลบอยู่จริงซึ่งเป็น
  // ข้อเท็จจริงวันนี้ ไม่ใช่การพยากรณ์ จึงต้องเตือนไม่ว่าข้อมูลจะน้อยแค่ไหน
  const canJudgeTrend = hasSpendingData && confidence !== 'low'

  let status: ForecastStatus = 'safe'
  if (currentBalance < 0) {
    status = 'risk'
  } else if (!canJudgeTrend) {
    status = 'insufficient'
  } else if (balanceBeforeSalary < 0 || projectedBalance30Days < 0) {
    status = 'risk'
  } else if (
    averageDailyExpense * FORECAST_HORIZON_DAYS > normalizedSalary ||
    averageDailyExpense > safeDailyBudget * 0.85
  ) {
    status = 'watch'
  }

  return {
    averageDailyExpense,
    observedDailyExpense,
    observedDailyEssential,
    observedDailyIrregular,
    priorDailyExpense,
    estimateWeight,
    isEstimateBlended: hasSpendingData && estimateWeight < 1,
    hasFullCycleData,
    balanceAfterSalary,
    balanceBeforeSalary,
    confidence,
    currentBalance,
    daysUntilSalary,
    estimatedMoneyLastsDays,
    expenseRecordCount,
    hasSpendingData,
    historyDays,
    monthlySalary: normalizedSalary,
    nextSalaryDate: toIsoDate(nextSalaryDate),
    projectedBalance30Days,
    projectedExpense30Days,
    projectedExpenseUntilSalary,
    safeDailyBudget,
    salaryDay: normalizedSalaryDay,
    salaryPaymentsIn30Days,
    status,
  }
}
