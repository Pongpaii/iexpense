import { ref } from 'vue'
import { describeError, isOffline, withRetry } from '../lib/api'
import { supabase } from '../lib/supabase'
import {
  applyServerDailyCap,
  cloneDailyCapSettings,
  DAILY_CAP_STORAGE_KEY,
  getDailyCapSnapshot,
  registerServerCapSaver,
  type DailyCapSettings,
} from './useDailyCap'
import {
  applyServerSalary,
  DEFAULT_MONTHLY_SALARY,
  registerServerSalarySaver,
  SALARY_STORAGE_KEY,
} from './useSalarySettings'

interface UserSettingsRow {
  user_id: string
  monthly_salary: number | string
  daily_cap_json: unknown
  updated_at: string
}

const LEGACY_MIGRATION_OWNER_KEY = 'money-flow.settings-migration-owner.v1'
const scopedKey = (base: string, userId: string) => `${base}.${userId}`

const canUseLegacyCache = (userId: string) => {
  try {
    const owner = window.localStorage.getItem(LEGACY_MIGRATION_OWNER_KEY)
    if (owner) return owner === userId
    window.localStorage.setItem(LEGACY_MIGRATION_OWNER_KEY, userId)
    return true
  } catch {
    return false
  }
}

const readCachedSalary = (userId: string | null) => {
  if (!userId) return DEFAULT_MONTHLY_SALARY
  try {
    const scoped = window.localStorage.getItem(scopedKey(SALARY_STORAGE_KEY, userId))
    const raw = scoped ?? (canUseLegacyCache(userId) ? window.localStorage.getItem(SALARY_STORAGE_KEY) : null)
    const amount = Number(raw)
    return Number.isFinite(amount) && amount > 0 && amount <= 100_000_000
      ? Math.round(amount * 100) / 100
      : DEFAULT_MONTHLY_SALARY
  } catch {
    return DEFAULT_MONTHLY_SALARY
  }
}

const readCachedCap = (userId: string | null): DailyCapSettings => {
  if (!userId) return getDailyCapSnapshot()
  try {
    const scoped = window.localStorage.getItem(scopedKey(DAILY_CAP_STORAGE_KEY, userId))
    const raw = scoped ?? (canUseLegacyCache(userId) ? window.localStorage.getItem(DAILY_CAP_STORAGE_KEY) : null)
    return raw ? (JSON.parse(raw) as DailyCapSettings) : getDailyCapSnapshot()
  } catch {
    return getDailyCapSnapshot()
  }
}

export function useServerSettings(userId: () => string | null) {
  const initialUser = userId()
  const serverSalary = ref(readCachedSalary(initialUser))
  const serverCapJson = ref<DailyCapSettings>(readCachedCap(initialUser))
  const loading = ref(false)
  const errorMessage = ref('')

  const cacheSettings = (salary: number, cap: unknown) => {
    const currentUser = userId()
    applyServerSalary(salary)
    applyServerDailyCap(cap)
    serverSalary.value = salary
    serverCapJson.value = getDailyCapSnapshot()

    if (!currentUser) return
    try {
      window.localStorage.setItem(scopedKey(SALARY_STORAGE_KEY, currentUser), String(salary))
      window.localStorage.setItem(
        scopedKey(DAILY_CAP_STORAGE_KEY, currentUser),
        JSON.stringify(serverCapJson.value),
      )
    } catch {
      // The in-memory values remain usable if browser storage is unavailable.
    }
  }

  const upsertPatch = async (patch: Record<string, unknown>) => {
    const currentUser = userId()
    if (!supabase || !currentUser || isOffline()) return false

    const { error } = await withRetry(
      () =>
        supabase!.from('user_settings').upsert(
          { user_id: currentUser, ...patch },
          { onConflict: 'user_id' },
        ),
      { label: 'save-user-settings' },
    )

    if (error) {
      errorMessage.value = `บันทึกการตั้งค่าบนเซิร์ฟเวอร์ไม่สำเร็จ: ${describeError(error)}`
      return false
    }
    errorMessage.value = ''
    return true
  }

  const loadSettings = async () => {
    const currentUser = userId()
    const cachedSalary = readCachedSalary(currentUser)
    const cachedCap = readCachedCap(currentUser)

    if (!supabase || !currentUser || isOffline()) {
      cacheSettings(cachedSalary, cachedCap)
      return
    }

    loading.value = true
    errorMessage.value = ''
    const { data, error } = await withRetry<UserSettingsRow>(
      () =>
        supabase!
          .from('user_settings')
          .select('user_id, monthly_salary, daily_cap_json, updated_at')
          .eq('user_id', currentUser)
          .maybeSingle(),
      { label: 'load-user-settings' },
    )

    if (error) {
      loading.value = false
      cacheSettings(cachedSalary, cachedCap)
      errorMessage.value = `โหลดการตั้งค่าไม่สำเร็จ ใช้ค่าที่บันทึกในเครื่องแทน: ${describeError(error)}`
      return
    }

    if (!data) {
      await upsertPatch({ monthly_salary: cachedSalary, daily_cap_json: cachedCap })
      cacheSettings(cachedSalary, cachedCap)
    } else {
      const salary = Number(data.monthly_salary)
      cacheSettings(Number.isFinite(salary) ? salary : DEFAULT_MONTHLY_SALARY, data.daily_cap_json)
    }
    loading.value = false
  }

  const saveSalary = async (amount: number) => {
    serverSalary.value = amount
    const currentUser = userId()
    if (currentUser) {
      try {
        window.localStorage.setItem(scopedKey(SALARY_STORAGE_KEY, currentUser), String(amount))
      } catch {
        // Server write still proceeds when local cache is unavailable.
      }
    }
    return upsertPatch({ monthly_salary: amount })
  }

  const saveCapSettings = async (settings: DailyCapSettings) => {
    serverCapJson.value = cloneDailyCapSettings(settings)
    const currentUser = userId()
    if (currentUser) {
      try {
        window.localStorage.setItem(
          scopedKey(DAILY_CAP_STORAGE_KEY, currentUser),
          JSON.stringify(settings),
        )
      } catch {
        // Server write still proceeds when local cache is unavailable.
      }
    }
    return upsertPatch({ daily_cap_json: settings })
  }

  registerServerSalarySaver(async (amount) => {
    await saveSalary(amount)
  })
  let capSaveQueue = Promise.resolve<boolean>(true)
  registerServerCapSaver(async (settings) => {
    const snapshot = cloneDailyCapSettings(settings)
    capSaveQueue = capSaveQueue.then(() => saveCapSettings(snapshot))
    await capSaveQueue
  })

  return {
    serverSalary,
    serverCapJson,
    loading,
    errorMessage,
    loadSettings,
    saveSalary,
    saveCapSettings,
  }
}
