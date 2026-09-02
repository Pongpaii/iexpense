import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = {
  offline: false,
  selectResult: { data: null as unknown, error: null as unknown },
  upsertResult: { data: null as unknown, error: null as unknown },
  session: { user: { id: 'user-1' } } as { user: { id: string } } | null,
}

const upsert = vi.fn(() => Promise.resolve(state.upsertResult))
const maybeSingle = vi.fn(() => Promise.resolve(state.selectResult))
const eq = vi.fn(() => ({ maybeSingle }))
const select = vi.fn(() => ({ eq }))
const from = vi.fn(() => ({ select, upsert }))
const getSession = vi.fn(() => Promise.resolve({ data: { session: state.session } }))

vi.mock('../../lib/supabase', () => ({
  supabase: { from, auth: { getSession } },
}))

vi.mock('../../lib/api', () => ({
  describeError: (error: unknown) => String(error),
  isOffline: () => state.offline,
  withRetry: async (operation: () => PromiseLike<unknown>) => operation(),
}))

const importSubject = async () => import('../useCategoryBudgets')

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  state.offline = false
  state.selectResult = { data: null, error: null }
  state.upsertResult = { data: null, error: null }
  state.session = { user: { id: 'user-1' } }
  from.mockClear()
  select.mockClear()
  eq.mockClear()
  maybeSingle.mockClear()
  upsert.mockClear()
  getSession.mockClear()
})

describe('normalizeCategoryBudgets', () => {
  it('ทิ้ง entry ที่หมวดไม่รู้จัก งบไม่ใช่เลขบวก หรือรูปแบบผิด', async () => {
    const { normalizeCategoryBudgets } = await importSubject()

    expect(
      normalizeCategoryBudgets([
        { category: 'อาหาร', budget: 500 },
        { category: 'หมวดที่ไม่มีจริง', budget: 500 },
        { category: 'การเดินทาง', budget: 0 },
        { category: 'ช้อปปิ้ง', budget: -10 },
        { category: 'ที่พัก', budget: 'abc' },
        'ไม่ใช่ object',
        null,
      ]),
    ).toEqual([{ category: 'อาหาร', budget: 500 }])
  })

  it('ตัดหมวดซ้ำ เก็บค่าแรกไว้', async () => {
    const { normalizeCategoryBudgets } = await importSubject()

    expect(
      normalizeCategoryBudgets([
        { category: 'อาหาร', budget: 500 },
        { category: 'อาหาร', budget: 900 },
      ]),
    ).toEqual([{ category: 'อาหาร', budget: 500 }])
  })

  it('เรียงตามลำดับหมวดในระบบ ไม่ใช่ลำดับที่ส่งเข้ามา', async () => {
    const { normalizeCategoryBudgets } = await importSubject()

    expect(
      normalizeCategoryBudgets([
        { category: 'สุขภาพ', budget: 100 },
        { category: 'อาหาร', budget: 200 },
      ]).map((item) => item.category),
    ).toEqual(['อาหาร', 'สุขภาพ'])
  })

  it('คืน array ว่างเมื่อค่าที่ได้ไม่ใช่ array', async () => {
    const { normalizeCategoryBudgets } = await importSubject()

    expect(normalizeCategoryBudgets(null)).toEqual([])
    expect(normalizeCategoryBudgets({ category: 'อาหาร' })).toEqual([])
  })

  it('จำกัดจำนวน entry ไม่ให้เกินเพดานของฐานข้อมูล', async () => {
    const { normalizeCategoryBudgets, MAX_CATEGORY_BUDGETS } = await importSubject()
    const many = Array.from({ length: 30 }, (_, index) => ({
      category: index % 2 === 0 ? 'อาหาร' : 'การเดินทาง',
      budget: 100 + index,
    }))

    expect(normalizeCategoryBudgets(many).length).toBeLessThanOrEqual(MAX_CATEGORY_BUDGETS)
  })
})

describe('useCategoryBudgets', () => {
  it('โหลดค่าจากเซิร์ฟเวอร์และเก็บ cache ตาม user', async () => {
    state.selectResult = {
      data: { category_budgets_json: [{ category: 'อาหาร', budget: 4200 }] },
      error: null,
    }
    const { useCategoryBudgets, CATEGORY_BUDGET_STORAGE_KEY } = await importSubject()

    const store = useCategoryBudgets()
    await store.reload()

    expect(from).toHaveBeenCalledWith('user_settings')
    expect(select).toHaveBeenCalledWith('category_budgets_json')
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(store.budgets.value).toEqual([{ category: 'อาหาร', budget: 4200 }])
    expect(store.hasBudgets.value).toBe(true)
    expect(localStorage.getItem(`${CATEGORY_BUDGET_STORAGE_KEY}.user-1`)).toBe(
      JSON.stringify([{ category: 'อาหาร', budget: 4200 }]),
    )
  })

  it('ยังไม่ล็อกอิน = ไม่ยิงเซิร์ฟเวอร์ และไม่มีงบ', async () => {
    state.session = null
    const { useCategoryBudgets } = await importSubject()

    const store = useCategoryBudgets()
    await store.reload()

    expect(from).not.toHaveBeenCalled()
    expect(store.budgets.value).toEqual([])
    expect(store.hasBudgets.value).toBe(false)
  })

  it('setBudget บันทึกขึ้นเซิร์ฟเวอร์พร้อม user_id', async () => {
    const { useCategoryBudgets } = await importSubject()
    const store = useCategoryBudgets()
    await store.reload()

    const saved = await store.setBudget('อาหาร', 3500)

    expect(saved).toBe(true)
    expect(upsert).toHaveBeenCalledWith(
      { user_id: 'user-1', category_budgets_json: [{ category: 'อาหาร', budget: 3500 }] },
      { onConflict: 'user_id' },
    )
    expect(store.getBudget('อาหาร')).toBe(3500)
    expect(store.getBudget('การเดินทาง')).toBeNull()
  })

  it('setBudget ด้วยยอด 0 หรือติดลบ = ถอดงบหมวดนั้นออก', async () => {
    const { useCategoryBudgets } = await importSubject()
    const store = useCategoryBudgets()
    await store.reload()
    await store.setBudget('อาหาร', 3500)

    await store.setBudget('อาหาร', 0)

    expect(store.budgets.value).toEqual([])
  })

  it('removeBudget เอาออกเฉพาะหมวดที่ระบุ', async () => {
    const { useCategoryBudgets } = await importSubject()
    const store = useCategoryBudgets()
    await store.reload()
    await store.replaceBudgets([
      { category: 'อาหาร', budget: 1000 },
      { category: 'การเดินทาง', budget: 500 },
    ])

    await store.removeBudget('อาหาร')

    expect(store.budgets.value).toEqual([{ category: 'การเดินทาง', budget: 500 }])
  })

  it('บันทึกไม่สำเร็จแล้วคืนค่าเดิม ไม่โชว์สิ่งที่เซิร์ฟเวอร์ไม่ได้รับ', async () => {
    const { useCategoryBudgets } = await importSubject()
    const store = useCategoryBudgets()
    await store.reload()
    await store.setBudget('อาหาร', 1000)

    state.upsertResult = { data: null, error: { message: 'เซิร์ฟเวอร์ล่ม' } }
    const saved = await store.setBudget('การเดินทาง', 700)

    expect(saved).toBe(false)
    expect(store.budgets.value).toEqual([{ category: 'อาหาร', budget: 1000 }])
    expect(store.errorMessage.value).toContain('บันทึกงบรายหมวดไม่สำเร็จ')
  })

  it('คอลัมน์ยังไม่มีในฐานข้อมูล = ขึ้นธง needsMigration พร้อมบอกไฟล์ migration ที่ต้องรัน', async () => {
    state.selectResult = {
      data: null,
      error: { code: '42703', message: 'column user_settings.category_budgets_json does not exist' },
    }
    const { useCategoryBudgets } = await importSubject()

    const store = useCategoryBudgets()
    await store.reload()

    expect(store.needsMigration.value).toBe(true)
    expect(store.errorMessage.value).toContain('20260902000100_add_category_budgets.sql')
  })

  it('ยังไม่มีตาราง user_settings เลย = บอกให้รัน schema.sql ไม่ใช่ error ดิบจาก PostgREST', async () => {
    state.selectResult = {
      data: null,
      error: {
        code: 'PGRST205',
        message: "Could not find the table 'public.user_settings' in the schema cache",
      },
    }
    const { useCategoryBudgets } = await importSubject()

    const store = useCategoryBudgets()
    await store.reload()

    expect(store.needsMigration.value).toBe(true)
    expect(store.errorMessage.value).toContain('schema.sql')
    expect(store.errorMessage.value).not.toContain('schema cache')
  })

  it('ฐานข้อมูลยังไม่พร้อม = ยังเก็บงบไว้ในเครื่องได้ ไม่ย้อนค่าที่ผู้ใช้กรอกทิ้ง', async () => {
    const { useCategoryBudgets, CATEGORY_BUDGET_STORAGE_KEY } = await importSubject()
    const store = useCategoryBudgets()
    await store.reload()

    state.upsertResult = {
      data: null,
      error: {
        code: 'PGRST205',
        message: "Could not find the table 'public.user_settings' in the schema cache",
      },
    }
    const saved = await store.setBudget('อาหาร', 2500)

    expect(saved).toBe(false)
    expect(store.needsMigration.value).toBe(true)
    expect(store.budgets.value).toEqual([{ category: 'อาหาร', budget: 2500 }])
    expect(localStorage.getItem(`${CATEGORY_BUDGET_STORAGE_KEY}.user-1`)).toContain('2500')
  })

  it('ออฟไลน์ = เก็บลงเครื่องแล้วบอกผู้ใช้ ไม่ยิงเซิร์ฟเวอร์', async () => {
    const { useCategoryBudgets, CATEGORY_BUDGET_STORAGE_KEY } = await importSubject()
    const store = useCategoryBudgets()
    await store.reload()

    state.offline = true
    const saved = await store.setBudget('อาหาร', 2200)

    expect(saved).toBe(false)
    expect(upsert).not.toHaveBeenCalled()
    expect(store.budgets.value).toEqual([{ category: 'อาหาร', budget: 2200 }])
    expect(localStorage.getItem(`${CATEGORY_BUDGET_STORAGE_KEY}.user-1`)).toContain('2200')
    expect(store.errorMessage.value).toContain('ออฟไลน์')
  })

  it('อ่าน cache ในเครื่องได้เมื่อเซิร์ฟเวอร์ตอบไม่ได้', async () => {
    const { useCategoryBudgets, CATEGORY_BUDGET_STORAGE_KEY } = await importSubject()
    localStorage.setItem(
      `${CATEGORY_BUDGET_STORAGE_KEY}.user-1`,
      JSON.stringify([{ category: 'ที่พัก', budget: 8000 }]),
    )
    state.selectResult = { data: null, error: { message: 'เชื่อมต่อไม่ได้' } }

    const store = useCategoryBudgets()
    await store.reload()

    expect(store.budgets.value).toEqual([{ category: 'ที่พัก', budget: 8000 }])
    expect(store.errorMessage.value).toContain('ใช้ค่าที่บันทึกในเครื่องแทน')
  })

  it('clearBudgets ล้างทั้งหมดและบันทึก array ว่าง', async () => {
    const { useCategoryBudgets } = await importSubject()
    const store = useCategoryBudgets()
    await store.reload()
    await store.setBudget('อาหาร', 1000)

    await store.clearBudgets()

    expect(store.budgets.value).toEqual([])
    expect(upsert).toHaveBeenLastCalledWith(
      { user_id: 'user-1', category_budgets_json: [] },
      { onConflict: 'user_id' },
    )
  })
})
