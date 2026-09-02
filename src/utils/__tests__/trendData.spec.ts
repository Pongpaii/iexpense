import { describe, expect, it } from 'vitest'
import { makeTransaction } from '../../test-utils/factories'
import {
  buildCategoryTrend,
  buildStackedAreaData,
  collapseTrendCategories,
  OTHER_TREND_KEY,
  TREND_MONTH_WINDOW,
  TREND_WEEK_WINDOW,
  type CategoryTrend,
} from '../trendData'

/** วันพุธที่ 26 ส.ค. 2026 · สัปดาห์นั้นเริ่มวันจันทร์ที่ 24 ส.ค. (2026-W35) */
const REFERENCE = '2026-08-26'

const amountsOf = (category: CategoryTrend) => category.data.map((point) => point.amount)

describe('buildCategoryTrend', () => {
  it('ไม่มีรายการเลยก็ยังคืนช่วงเวลาครบ เพื่อให้กราฟวาดแกนได้', () => {
    const summary = buildCategoryTrend([], 'expense', 'week', undefined, REFERENCE)

    expect(summary.categories).toEqual([])
    expect(summary.periods).toHaveLength(TREND_WEEK_WINDOW)
    expect(summary.maxAmount).toBe(0)
    expect(summary.total).toBe(0)
    expect(summary.granularity).toBe('week')
  })

  it('สร้างช่วงสัปดาห์ย้อนหลังโดยสัปดาห์ล่าสุดอยู่ท้ายสุด', () => {
    const { periods } = buildCategoryTrend([], 'expense', 'week', undefined, REFERENCE)

    expect(periods[0].key).toBe('2026-W24')
    expect(periods[periods.length - 1].key).toBe('2026-W35')
    expect(periods[periods.length - 1].label).toBe('สัปดาห์ 24–30 ส.ค.')
    expect(periods[periods.length - 1].axisLabel).toBe('24 ส.ค.')
  })

  it('สร้างช่วงเดือนย้อนหลัง 6 เดือนโดยเดือนล่าสุดอยู่ท้ายสุด', () => {
    const { periods, granularity } = buildCategoryTrend(
      [],
      'expense',
      'month',
      undefined,
      REFERENCE,
    )

    expect(granularity).toBe('month')
    expect(periods).toHaveLength(TREND_MONTH_WINDOW)
    expect(periods.map((period) => period.key)).toEqual([
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
    ])
    expect(periods[periods.length - 1].label).toBe('ส.ค. 2569')
    expect(periods[periods.length - 1].axisLabel).toBe('ส.ค.')
  })

  it('หมวดเดียวได้จุดเท่าจำนวนช่วง และรวมยอดในสัปดาห์เดียวกันเข้าด้วยกัน', () => {
    const summary = buildCategoryTrend(
      [
        makeTransaction({ category: 'อาหาร', amount: 120, transaction_date: '2026-08-24' }),
        makeTransaction({ category: 'อาหาร', amount: 80, transaction_date: '2026-08-30' }),
      ],
      'expense',
      'week',
      undefined,
      REFERENCE,
    )

    expect(summary.categories).toHaveLength(1)
    const [food] = summary.categories
    expect(food.data).toHaveLength(TREND_WEEK_WINDOW)
    expect(food.label).toBe('อาหาร')
    expect(food.emoji).toBe('🍜')
    expect(food.total).toBe(200)
    // 2026-08-30 เป็นวันอาทิตย์ท้ายสัปดาห์ 2026-W35 จึงต้องถูกนับรวมช่องเดียวกัน
    expect(amountsOf(food)[TREND_WEEK_WINDOW - 1]).toBe(200)
    expect(summary.maxAmount).toBe(200)
    expect(summary.total).toBe(200)
  })

  it('ช่วงที่หมวดนั้นไม่มีรายการต้องเป็น 0 ไม่ใช่ค่าว่าง', () => {
    const summary = buildCategoryTrend(
      [makeTransaction({ category: 'อาหาร', amount: 120, transaction_date: '2026-08-24' })],
      'expense',
      'week',
      undefined,
      REFERENCE,
    )

    const amounts = amountsOf(summary.categories[0])
    expect(amounts.slice(0, TREND_WEEK_WINDOW - 1)).toEqual(
      Array.from({ length: TREND_WEEK_WINDOW - 1 }, () => 0),
    )
    expect(amounts.every((amount) => typeof amount === 'number')).toBe(true)
  })

  it('เรียงหมวดจากยอดรวมมากไปน้อย และไล่สีตาม palette', () => {
    const summary = buildCategoryTrend(
      [
        makeTransaction({ category: 'อาหาร', amount: 100, transaction_date: '2026-08-24' }),
        makeTransaction({ category: 'ช้อปปิ้ง', amount: 900, transaction_date: '2026-08-10' }),
        makeTransaction({ category: 'การเดินทาง', amount: 500, transaction_date: '2026-07-06' }),
      ],
      'expense',
      'week',
      ['#111111', '#222222', '#333333'],
      REFERENCE,
    )

    expect(summary.categories.map((category) => category.label)).toEqual([
      'ช้อปปิ้ง',
      'การเดินทาง',
      'อาหาร',
    ])
    expect(summary.categories.map((category) => category.color)).toEqual([
      '#111111',
      '#222222',
      '#333333',
    ])
    expect(summary.total).toBe(1500)
    expect(summary.maxAmount).toBe(900)
  })

  it('นับเฉพาะชนิดที่เลือก', () => {
    const transactions = [
      makeTransaction({ category: 'อาหาร', amount: 100, transaction_date: '2026-08-24' }),
      makeTransaction({
        category: 'เงินเดือน',
        amount: 30000,
        type: 'income',
        transaction_date: '2026-08-24',
      }),
    ]

    const expense = buildCategoryTrend(transactions, 'expense', 'week', undefined, REFERENCE)
    const income = buildCategoryTrend(transactions, 'income', 'week', undefined, REFERENCE)

    expect(expense.total).toBe(100)
    expect(income.total).toBe(30000)
    expect(income.categories[0].label).toBe('เงินเดือน')
  })

  it('ตัดรายการที่อยู่นอกช่วงและวันที่รูปแบบผิดออก', () => {
    const summary = buildCategoryTrend(
      [
        makeTransaction({ category: 'อาหาร', amount: 100, transaction_date: '2026-08-24' }),
        makeTransaction({ category: 'อาหาร', amount: 700, transaction_date: '2026-01-05' }),
        makeTransaction({ category: 'อาหาร', amount: 400, transaction_date: '2026-8-24' }),
      ],
      'expense',
      'week',
      undefined,
      REFERENCE,
    )

    expect(summary.total).toBe(100)
  })

  it('รายการที่ไม่ระบุหมวดถูกจับกลุ่มไว้ด้วยกัน', () => {
    const summary = buildCategoryTrend(
      [
        makeTransaction({ category: null, amount: 40, transaction_date: '2026-08-24' }),
        makeTransaction({ category: null, amount: 60, transaction_date: '2026-08-17' }),
      ],
      'expense',
      'week',
      undefined,
      REFERENCE,
    )

    expect(summary.categories).toHaveLength(1)
    expect(summary.categories[0].label).toBe('ไม่ระบุหมวดหมู่')
    expect(summary.categories[0].emoji).toBe('🏷️')
    expect(summary.categories[0].total).toBe(100)
  })

  it('แปลงยอดที่มาเป็น string จาก Supabase ให้เป็นตัวเลข', () => {
    const summary = buildCategoryTrend(
      [
        makeTransaction({
          category: 'อาหาร',
          amount: '250.5' as unknown as number,
          transaction_date: '2026-08-24',
        }),
      ],
      'expense',
      'week',
      undefined,
      REFERENCE,
    )

    expect(summary.categories[0].total).toBe(250.5)
  })

  it('คำนวณค่าเฉลี่ยต่อช่วงจากจำนวนช่วงทั้งหมด ไม่ใช่เฉพาะช่วงที่มีข้อมูล', () => {
    const summary = buildCategoryTrend(
      [makeTransaction({ category: 'อาหาร', amount: 1200, transaction_date: '2026-08-24' })],
      'expense',
      'month',
      undefined,
      REFERENCE,
    )

    expect(summary.categories[0].averagePerPeriod).toBe(1200 / TREND_MONTH_WINDOW)
  })

  describe('changePercent', () => {
    it('เทียบช่วงล่าสุดกับช่วงก่อนหน้า', () => {
      const summary = buildCategoryTrend(
        [
          makeTransaction({ category: 'อาหาร', amount: 100, transaction_date: '2026-08-17' }),
          makeTransaction({ category: 'อาหาร', amount: 150, transaction_date: '2026-08-24' }),
        ],
        'expense',
        'week',
        undefined,
        REFERENCE,
      )

      expect(summary.categories[0].changePercent).toBeCloseTo(50)
    })

    it('เป็นค่าลบเมื่อช่วงล่าสุดลดลง', () => {
      const summary = buildCategoryTrend(
        [
          makeTransaction({ category: 'อาหาร', amount: 200, transaction_date: '2026-08-17' }),
          makeTransaction({ category: 'อาหาร', amount: 150, transaction_date: '2026-08-24' }),
        ],
        'expense',
        'week',
        undefined,
        REFERENCE,
      )

      expect(summary.categories[0].changePercent).toBeCloseTo(-25)
    })

    it('คืน null เมื่อช่วงก่อนหน้าเป็น 0 เพราะหารไม่ได้', () => {
      const summary = buildCategoryTrend(
        [makeTransaction({ category: 'อาหาร', amount: 150, transaction_date: '2026-08-24' })],
        'expense',
        'week',
        undefined,
        REFERENCE,
      )

      expect(summary.categories[0].changePercent).toBeNull()
    })

    it('คืน -100 เมื่อช่วงล่าสุดไม่มีรายการแต่ช่วงก่อนหน้ามี', () => {
      const summary = buildCategoryTrend(
        [makeTransaction({ category: 'อาหาร', amount: 150, transaction_date: '2026-08-17' })],
        'expense',
        'week',
        undefined,
        REFERENCE,
      )

      expect(summary.categories[0].changePercent).toBeCloseTo(-100)
    })
  })
})

describe('collapseTrendCategories', () => {
  const build = (count: number) =>
    buildCategoryTrend(
      Array.from({ length: count }, (_, index) =>
        makeTransaction({
          category: (['อาหาร', 'การเดินทาง', 'ช้อปปิ้ง', 'ท่องเที่ยว', 'ที่พัก', 'สุขภาพ', 'การศึกษา'] as const)[
            index
          ],
          amount: (count - index) * 100,
          transaction_date: index % 2 === 0 ? '2026-08-24' : '2026-08-17',
        }),
      ),
      'expense',
      'week',
      undefined,
      REFERENCE,
    ).categories

  it('คืนชุดเดิมเมื่อยุบแล้วไม่ได้ลดจำนวนเส้น', () => {
    const categories = build(6)
    expect(collapseTrendCategories(categories, 5).map((item) => item.categoryKey)).toEqual(
      categories.map((item) => item.categoryKey),
    )
  })

  it('คืนชุดเดิมเมื่อ limit ไม่ถูกต้อง', () => {
    const categories = build(7)
    expect(collapseTrendCategories(categories, 0)).toHaveLength(7)
  })

  it('ยุบหมวดที่เหลือเป็นเส้นเดียวและรวมยอดตรงทุกช่วง', () => {
    const categories = build(7)
    const collapsed = collapseTrendCategories(categories, 5)

    expect(collapsed).toHaveLength(6)
    const others = collapsed[collapsed.length - 1]
    expect(others.categoryKey).toBe(OTHER_TREND_KEY)
    expect(others.label).toBe('หมวดอื่น ๆ รวม (2)')
    expect(others.total).toBe(categories[5].total + categories[6].total)
    expect(others.data).toHaveLength(TREND_WEEK_WINDOW)

    others.data.forEach((point, index) => {
      expect(point.amount).toBe(
        categories[5].data[index].amount + categories[6].data[index].amount,
      )
      expect(point.period).toBe(categories[0].data[index].period)
    })
  })
})

describe('buildStackedAreaData', () => {
  it('ไม่มีรายการเลยก็ยังคืนช่วงเวลาครบและยอดเป็น 0', () => {
    const data = buildStackedAreaData([], 'expense', 'week', undefined, REFERENCE)

    expect(data.points).toHaveLength(TREND_WEEK_WINDOW)
    expect(data.categoryOrder).toEqual([])
    expect(data.categoryMeta).toEqual({})
    expect(data.maxTotal).toBe(0)
    expect(data.grandTotal).toBe(0)
    expect(data.points.every((point) => point.total === 0)).toBe(true)
  })

  it('รวมยอดทุกหมวดในแต่ละช่วงเป็น total ของช่วงนั้น', () => {
    const data = buildStackedAreaData(
      [
        makeTransaction({ category: 'อาหาร', amount: 300, transaction_date: '2026-08-24' }),
        makeTransaction({ category: 'การเดินทาง', amount: 200, transaction_date: '2026-08-24' }),
        makeTransaction({ category: 'อาหาร', amount: 100, transaction_date: '2026-08-17' }),
      ],
      'expense',
      'week',
      undefined,
      REFERENCE,
    )

    const latest = data.points[data.points.length - 1]
    const previous = data.points[data.points.length - 2]

    expect(latest.total).toBe(500)
    expect(previous.total).toBe(100)
    expect(data.maxTotal).toBe(500)
    expect(data.grandTotal).toBe(600)
  })

  it('ทุกช่วงมีคีย์ของทุกหมวดครบ เพื่อให้ซ้อนพื้นที่ได้โดยไม่ต้องเช็ค undefined', () => {
    const data = buildStackedAreaData(
      [
        makeTransaction({ category: 'อาหาร', amount: 300, transaction_date: '2026-08-24' }),
        makeTransaction({ category: 'การเดินทาง', amount: 200, transaction_date: '2026-08-17' }),
      ],
      'expense',
      'week',
      undefined,
      REFERENCE,
    )

    for (const point of data.points) {
      expect(Object.keys(point.categories).sort()).toEqual(['การเดินทาง', 'อาหาร'])
    }
    expect(data.points[data.points.length - 1].categories['การเดินทาง']).toBe(0)
  })

  it('เรียงลำดับการซ้อนจากหมวดที่ใช้มากสุดไปน้อยสุด', () => {
    const data = buildStackedAreaData(
      [
        makeTransaction({ category: 'อาหาร', amount: 100, transaction_date: '2026-08-24' }),
        makeTransaction({ category: 'ช้อปปิ้ง', amount: 900, transaction_date: '2026-08-24' }),
        makeTransaction({ category: 'การเดินทาง', amount: 500, transaction_date: '2026-08-17' }),
      ],
      'expense',
      'week',
      undefined,
      REFERENCE,
    )

    expect(data.categoryOrder).toEqual(['ช้อปปิ้ง', 'การเดินทาง', 'อาหาร'])
  })

  it('คำนวณสัดส่วนของแต่ละหมวดจากยอดรวมทั้งหมด', () => {
    const data = buildStackedAreaData(
      [
        makeTransaction({ category: 'อาหาร', amount: 750, transaction_date: '2026-08-24' }),
        makeTransaction({ category: 'การเดินทาง', amount: 250, transaction_date: '2026-08-17' }),
      ],
      'expense',
      'week',
      undefined,
      REFERENCE,
    )

    expect(data.categoryMeta['อาหาร'].percentage).toBeCloseTo(75)
    expect(data.categoryMeta['การเดินทาง'].percentage).toBeCloseTo(25)
    expect(data.categoryMeta['อาหาร'].emoji).toBe('🍜')
  })

  it('ใช้ช่วงเดือนได้และแนบป้ายกำกับทั้งแบบเต็มและแบบสั้น', () => {
    const data = buildStackedAreaData([], 'expense', 'month', undefined, REFERENCE)

    expect(data.granularity).toBe('month')
    expect(data.points).toHaveLength(TREND_MONTH_WINDOW)
    expect(data.points[data.points.length - 1].period).toBe('2026-08')
    expect(data.points[data.points.length - 1].periodLabel).toBe('ส.ค. 2569')
    expect(data.points[data.points.length - 1].axisLabel).toBe('ส.ค.')
  })
})
