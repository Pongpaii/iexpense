import type { Transaction } from '../types/transaction'

export const FORECAST_HORIZON_DAYS = 30
export const FORECAST_HISTORY_DAYS = 90

const MILLISECONDS_PER_DAY = 86_400_000
const SALARY_EARLY_WINDOW_DAYS = 3
const SALARY_LATE_WINDOW_DAYS = 1

type ForecastConfidence = 'low' | 'medium' | 'high'
export type ForecastStatus = 'insufficient' | 'safe' | 'watch' | 'risk'

export interface FinancialForecast {
  averageDailyExpense: number
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

const getConfidence = (historyDays: number, expenseRecordCount: number): ForecastConfidence => {
  if (historyDays >= 30 && expenseRecordCount >= 10) return 'high'
  if (historyDays >= 7 && expenseRecordCount >= 4) return 'medium'
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
  const averageDailyExpense = hasSpendingData ? observedExpense / historyDays : 0

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

  let status: ForecastStatus = 'safe'
  if (balanceBeforeSalary < 0 || projectedBalance30Days < 0) {
    status = 'risk'
  } else if (!hasSpendingData) {
    status = 'insufficient'
  } else if (
    averageDailyExpense * FORECAST_HORIZON_DAYS > normalizedSalary ||
    averageDailyExpense > safeDailyBudget * 0.85
  ) {
    status = 'watch'
  }

  return {
    averageDailyExpense,
    balanceAfterSalary,
    balanceBeforeSalary,
    confidence: getConfidence(historyDays, expenseRecordCount),
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
