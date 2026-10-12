import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetHeatmapFilter, useHeatmapFilter } from '../../composables/useHeatmapFilter'
import { makeTransaction } from '../../test-utils/factories'
import HeatmapCalendar from '../HeatmapCalendar.vue'

const { setCategoryHidden } = useHeatmapFilter()

const MONTH = '2026-03'

const transactions = [
  makeTransaction({ category: 'อาหาร', amount: 120, transaction_date: '2026-03-02' }),
  makeTransaction({ category: 'ที่พัก', amount: 5_000, transaction_date: '2026-03-05' }),
  makeTransaction({ category: 'การเดินทาง', amount: 80, transaction_date: '2026-03-05' }),
]

const digitsOf = (value: string) => value.replace(/[^\d]/g, '')

const mountCalendar = () =>
  mount(HeatmapCalendar, { props: { transactions, month: MONTH } })

/** ยอด "รายจ่ายเดือนนี้" เป็นตัวเลขตัวแรกในแถบสถิติของการ์ด */
const monthExpenseText = (wrapper: ReturnType<typeof mountCalendar>) =>
  digitsOf(wrapper.findAll('.heatmap-stats b')[0].text())

beforeEach(() => {
  window.localStorage.clear()
  resetHeatmapFilter()
})

describe('HeatmapCalendar — ตัวกรองหมวดหมู่', () => {
  it('นับทุกหมวดเมื่อยังไม่ได้ซ่อนอะไร', () => {
    const wrapper = mountCalendar()

    expect(monthExpenseText(wrapper)).toBe('5200')
    expect(wrapper.text()).toContain('เลือกหมวดที่จะแสดง')
  })

  it('ซ่อนหมวดแล้วปฏิทินหยุดนับยอดของหมวดนั้น', async () => {
    const wrapper = mountCalendar()
    setCategoryHidden('ที่พัก', true)
    await wrapper.vm.$nextTick()

    expect(monthExpenseText(wrapper)).toBe('200')
    expect(wrapper.text()).toContain('ซ่อนอยู่ 1 หมวด')
    expect(wrapper.text()).toContain('ที่พัก')
  })

  it('กดปุ่มแล้วเปิดแผงให้ติ๊กหมวดได้ครบทุกหมวด', async () => {
    const wrapper = mountCalendar()

    expect(wrapper.find('.heatmap-filter__panel').exists()).toBe(false)
    await wrapper.find('.heatmap-filter__toggle').trigger('click')

    const chips = wrapper.findAll('.heatmap-chip')
    expect(chips.length).toBeGreaterThan(0)
    expect(wrapper.find('.heatmap-filter__panel').text()).toContain('อาหาร')
  })

  it('ติ๊กที่ชิปแล้วซ่อนหมวดนั้นทันที', async () => {
    const wrapper = mountCalendar()
    await wrapper.find('.heatmap-filter__toggle').trigger('click')

    const foodChip = wrapper
      .findAll('.heatmap-chip')
      .find((chip) => chip.text().includes('อาหาร'))
    await foodChip!.find('input').setValue(true)

    expect(monthExpenseText(wrapper)).toBe('5080')
    expect(foodChip!.classes()).toContain('is-off')
  })
})


describe('HeatmapCalendar — ยอดสุทธิรายวัน', () => {
  const mountWith = (list: ReturnType<typeof makeTransaction>[]) =>
    mount(HeatmapCalendar, { props: { transactions: list, month: MONTH } })

  const cellOf = (wrapper: ReturnType<typeof mountWith>, date: string) =>
    wrapper.find(`.heatmap-cell[aria-label^="${Number(date.slice(-2))} "]`)

  it('โอนให้เพื่อนแล้วเพื่อนโอนคืนวันเดียวกัน ช่องวันนั้นไม่ขึ้นเป็นรายจ่าย', () => {
    const wrapper = mountWith([
      makeTransaction({ category: 'อื่น ๆ', amount: 1_000, transaction_date: '2026-03-10' }),
      makeTransaction({
        type: 'income',
        category: 'อื่น ๆ',
        amount: 1_000,
        transaction_date: '2026-03-10',
      }),
    ])

    const cell = cellOf(wrapper, '2026-03-10')
    expect(cell.classes()).toContain('heatmap-cell--level-0')
    expect(cell.find('.heatmap-cell__expense').exists()).toBe(false)
    expect(cell.find('.heatmap-cell__even').exists()).toBe(true)
  })

  it('แสดงยอดสุทธิ (รายจ่าย − รายรับ) ตัวเดียวในช่อง', () => {
    const wrapper = mountWith([
      makeTransaction({ amount: 700, transaction_date: '2026-03-10' }),
      makeTransaction({ type: 'income', amount: 200, transaction_date: '2026-03-10' }),
      makeTransaction({ amount: 100, transaction_date: '2026-03-11' }),
      makeTransaction({ type: 'income', amount: 400, transaction_date: '2026-03-11' }),
    ])

    const spendDay = cellOf(wrapper, '2026-03-10')
    expect(digitsOf(spendDay.find('.heatmap-cell__expense').text())).toBe('500')
    expect(spendDay.find('.heatmap-cell__income').exists()).toBe(false)

    const earnDay = cellOf(wrapper, '2026-03-11')
    expect(earnDay.find('.heatmap-cell__expense').exists()).toBe(false)
    expect(digitsOf(earnDay.find('.heatmap-cell__income').text())).toBe('300')
    expect(earnDay.classes()).toContain('heatmap-cell--level-0')
  })
})
