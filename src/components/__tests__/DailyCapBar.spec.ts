import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { useDailyCap } from '../../composables/useDailyCap'
import { makeTransaction } from '../../test-utils/factories'
import DailyCapBar from '../DailyCapBar.vue'

// 2026-03-10 เป็นวันอังคาร ใช้เพดานวันทำงานค่าเริ่มต้น 320 บาท
const DATE = '2026-03-10'

const { clearCapExcludedCategories, setCapEnabled } = useDailyCap()

const digitsOf = (value: string) => value.replace(/[^\d]/g, '')

const mountBar = (transactions: ReturnType<typeof makeTransaction>[]) =>
  mount(DailyCapBar, { props: { date: DATE, transactions, isToday: true } })

beforeEach(() => {
  setCapEnabled(true)
  clearCapExcludedCategories()
})

describe('DailyCapBar — เงินคืนในวันเดียวกัน', () => {
  it('โอนให้เพื่อนแล้วเพื่อนโอนคืน ไม่ขึ้นว่าเกินงบ', () => {
    const wrapper = mountBar([
      makeTransaction({ category: 'อาหาร', amount: 60, transaction_date: DATE }),
      makeTransaction({ category: 'อื่น ๆ', amount: 1_000, transaction_date: DATE }),
      makeTransaction({ type: 'income', category: 'อื่น ๆ', amount: 1_000, transaction_date: DATE }),
    ])

    expect(digitsOf(wrapper.find('.cap-amounts strong').text())).toBe('60')
    expect(wrapper.classes()).not.toContain('cap-card--over')
    expect(wrapper.find('.cap-refund').text()).toContain('ได้คืน')
  })

  it('เงินเดือนเข้าวันนั้นไม่ไปลดยอดใช้จ่าย', () => {
    const wrapper = mountBar([
      makeTransaction({ category: 'อาหาร', amount: 400, transaction_date: DATE }),
      makeTransaction({
        type: 'income',
        category: 'เงินเดือน',
        amount: 17_000,
        transaction_date: DATE,
      }),
    ])

    expect(digitsOf(wrapper.find('.cap-amounts strong').text())).toBe('400')
    expect(wrapper.classes()).toContain('cap-card--over')
    expect(wrapper.find('.cap-refund').exists()).toBe(false)
  })
})
