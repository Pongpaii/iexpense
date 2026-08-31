import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = {
  offline: false,
  selectResult: { data: null as unknown, error: null as unknown },
}
const upsert = vi.fn().mockResolvedValue({ data: null, error: null })
const maybeSingle = vi.fn(() => Promise.resolve(state.selectResult))
const eq = vi.fn(() => ({ maybeSingle }))
const select = vi.fn(() => ({ eq }))
const from = vi.fn(() => ({ select, upsert }))

vi.mock('../../lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => from(...args) },
}))

vi.mock('../../lib/api', () => ({
  describeError: (error: unknown) => String(error),
  isOffline: () => state.offline,
  withRetry: async (operation: () => PromiseLike<unknown>) => operation(),
}))

const capSettings = {
  enabled: true,
  weekday: { cap: 300, items: [] },
  weekend: { cap: 250, items: [] },
}

const importSubject = async () => {
  const [{ useServerSettings }, { useSalarySettings, SALARY_STORAGE_KEY }, { DAILY_CAP_STORAGE_KEY }] =
    await Promise.all([
      import('../useServerSettings'),
      import('../useSalarySettings'),
      import('../useDailyCap'),
    ])
  return { useServerSettings, useSalarySettings, SALARY_STORAGE_KEY, DAILY_CAP_STORAGE_KEY }
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  state.offline = false
  state.selectResult = { data: null, error: null }
  upsert.mockClear().mockResolvedValue({ data: null, error: null })
  maybeSingle.mockClear()
  eq.mockClear()
  select.mockClear()
  from.mockClear()
})

describe('useServerSettings', () => {
  it('โหลดค่าจากเซิร์ฟเวอร์และบันทึกลง cache', async () => {
    state.selectResult = {
      data: {
        user_id: 'user-1',
        monthly_salary: '42000.50',
        daily_cap_json: capSettings,
        updated_at: '2026-03-15T00:00:00.000Z',
      },
      error: null,
    }
    const { useServerSettings, SALARY_STORAGE_KEY, DAILY_CAP_STORAGE_KEY } = await importSubject()
    const settings = useServerSettings(() => 'user-1')

    await settings.loadSettings()

    expect(from).toHaveBeenCalledWith('user_settings')
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(settings.serverSalary.value).toBe(42000.5)
    expect(localStorage.getItem(SALARY_STORAGE_KEY)).toBe('42000.5')
    expect(JSON.parse(localStorage.getItem(DAILY_CAP_STORAGE_KEY) ?? '{}')).toMatchObject(capSettings)
  })

  it('ย้ายค่าจาก localStorage ขึ้นเซิร์ฟเวอร์เมื่อยังไม่มี row', async () => {
    localStorage.setItem('money-flow.monthly-salary.v1', '31500')
    localStorage.setItem('money-flow.daily-cap.v1', JSON.stringify(capSettings))
    const { useServerSettings } = await importSubject()
    const settings = useServerSettings(() => 'user-1')

    await settings.loadSettings()

    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: 'user-1',
        monthly_salary: 31500,
        daily_cap_json: capSettings,
      },
      { onConflict: 'user_id' },
    )
    expect(settings.serverSalary.value).toBe(31500)
    expect(settings.serverCapJson.value).toEqual(capSettings)
  })

  it('ใช้งาน cache โดยไม่เรียกเซิร์ฟเวอร์เมื่อออฟไลน์', async () => {
    state.offline = true
    localStorage.setItem('money-flow.monthly-salary.v1', '28000')
    localStorage.setItem('money-flow.daily-cap.v1', JSON.stringify(capSettings))
    const { useServerSettings } = await importSubject()
    const settings = useServerSettings(() => 'user-1')

    await settings.loadSettings()

    expect(from).not.toHaveBeenCalled()
    expect(upsert).not.toHaveBeenCalled()
    expect(settings.serverSalary.value).toBe(28000)
    expect(settings.serverCapJson.value).toEqual(capSettings)
  })

  it('บันทึกเงินเดือนลง cache และ upsert ไปยังเซิร์ฟเวอร์', async () => {
    const { useServerSettings, useSalarySettings, SALARY_STORAGE_KEY } = await importSubject()
    const settings = useServerSettings(() => 'user-1')

    const saveResult = useSalarySettings().saveMonthlySalary(45678.9)
    await Promise.resolve()
    await Promise.resolve()

    expect(saveResult).toEqual({ ok: true, persisted: true })
    expect(localStorage.getItem(SALARY_STORAGE_KEY)).toBe('45678.9')
    expect(settings.serverSalary.value).toBe(45678.9)
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', monthly_salary: 45678.9 }),
      { onConflict: 'user_id' },
    )
  })
})
