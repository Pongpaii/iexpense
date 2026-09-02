import { computed, ref } from 'vue'
import { describeError, isOffline, withRetry } from '../lib/api'
import { supabase } from '../lib/supabase'
import { transactionCategories, type TransactionCategory } from '../types/transaction'

export interface CategoryBudget {
  category: TransactionCategory
  /** งบต่อเดือน หน่วยบาท มากกว่า 0 เสมอ (ไม่ตั้งงบ = ไม่มี entry) */
  budget: number
}

interface UserSettingsBudgetRow {
  category_budgets_json: unknown
}

export const CATEGORY_BUDGET_STORAGE_KEY = 'money-flow.category-budgets.v1'

/** ต้องตรงกับ constraint user_settings_category_budgets_valid */
export const MAX_CATEGORY_BUDGETS = 20
export const MAX_CATEGORY_BUDGET_AMOUNT = 100_000_000

const validCategories = new Set<string>(transactionCategories.map((option) => option.value))

/**
 * คัดเฉพาะ entry ที่ใช้งานได้จริง: หมวดต้องเป็นหมวดที่ระบบรู้จัก และงบต้องเป็นเลขบวก
 * ข้อมูลที่ผิดรูปถูกทิ้งเงียบ ๆ เพราะอาจมาจากเวอร์ชันเก่าหรือคนแก้ JSON ตรง ๆ
 */
export const normalizeCategoryBudgets = (value: unknown): CategoryBudget[] => {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const result: CategoryBudget[] = []

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue

    const { category, budget } = entry as { category?: unknown; budget?: unknown }
    if (typeof category !== 'string' || !validCategories.has(category)) continue
    if (seen.has(category)) continue

    const amount = Number(budget)
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_CATEGORY_BUDGET_AMOUNT) continue

    seen.add(category)
    result.push({ category: category as TransactionCategory, budget: Math.round(amount * 100) / 100 })
    if (result.length >= MAX_CATEGORY_BUDGETS) break
  }

  // เรียงตามลำดับหมวดในระบบ เพื่อให้ payload เสถียรและ diff อ่านง่าย
  return result.sort(
    (a, b) =>
      transactionCategories.findIndex((option) => option.value === a.category)
      - transactionCategories.findIndex((option) => option.value === b.category),
  )
}

// --- state ระดับโมดูล: ทุกคอมโพเนนต์ที่เรียกใช้เห็นค่าชุดเดียวกัน ---
const budgets = ref<CategoryBudget[]>([])
const loading = ref(false)
const errorMessage = ref('')
/** true เมื่อฐานข้อมูลยังไม่มีคอลัมน์ category_budgets_json (ยังไม่ได้รัน migration) */
const needsMigration = ref(false)
let loadPromise: Promise<void> | null = null
/** user ของข้อมูลที่อยู่ใน budgets ตอนนี้ ใช้ตรวจว่าต้องโหลดใหม่เมื่อสลับบัญชี */
let loadedUserId: string | null = null

const scopedKey = (userId: string) => `${CATEGORY_BUDGET_STORAGE_KEY}.${userId}`

const readCache = (userId: string): CategoryBudget[] => {
  try {
    const raw = window.localStorage.getItem(scopedKey(userId))
    return raw ? normalizeCategoryBudgets(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

const writeCache = (userId: string, list: CategoryBudget[]) => {
  try {
    window.localStorage.setItem(scopedKey(userId), JSON.stringify(list))
  } catch {
    // ค่าในหน่วยความจำยังใช้ได้ ถ้า storage เขียนไม่ได้ก็ข้ามไป
  }
}

/**
 * อ่าน user จาก session ทุกครั้ง ไม่ cache ไว้
 * ถ้า cache ไว้ แล้วมีคนสลับบัญชีในเบราว์เซอร์เดียวกัน งบของคนก่อนจะถูกเขียนทับ
 * getSession อ่านจาก storage ของ client ไม่ยิงเน็ต จึงเรียกบ่อยได้
 */
const resolveUserId = async () => {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

/** คอลัมน์ยังไม่มีในฐานข้อมูล = ยังไม่ได้รัน migration ไม่ใช่ error ที่ผู้ใช้แก้ได้ */
const isMissingColumnError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  if (code === '42703') return true
  return typeof message === 'string' && message.includes('category_budgets_json')
}

const handleError = (error: unknown, fallback: string) => {
  if (isMissingColumnError(error)) {
    needsMigration.value = true
    errorMessage.value = 'ฐานข้อมูลยังไม่มีคอลัมน์งบรายหมวด กรุณารัน migration ล่าสุดก่อนใช้งาน'
    return
  }
  errorMessage.value = `${fallback}: ${describeError(error)}`
}

const load = async (force = false) => {
  const userId = await resolveUserId()
  // โหลดซ้ำเมื่อสั่ง force หรือเมื่อ user เปลี่ยน ไม่งั้นใช้ผลเดิมที่โหลดไว้แล้ว
  if (loadPromise && !force && loadedUserId === userId) return loadPromise

  loadedUserId = userId
  loadPromise = (async () => {
    if (!userId) {
      budgets.value = []
      return
    }

    budgets.value = readCache(userId)
    if (!supabase || isOffline() || needsMigration.value) return

    loading.value = true
    const { data, error } = await withRetry<UserSettingsBudgetRow>(
      () =>
        supabase!
          .from('user_settings')
          .select('category_budgets_json')
          .eq('user_id', userId)
          .maybeSingle(),
      { label: 'load-category-budgets' },
    )
    loading.value = false

    if (error) {
      handleError(error, 'โหลดงบรายหมวดไม่สำเร็จ ใช้ค่าที่บันทึกในเครื่องแทน')
      return
    }

    errorMessage.value = ''
    if (!data) return

    const serverBudgets = normalizeCategoryBudgets(data.category_budgets_json)
    budgets.value = serverBudgets
    writeCache(userId, serverBudgets)
  })()

  return loadPromise
}

const persist = async (next: CategoryBudget[]) => {
  const normalized = normalizeCategoryBudgets(next)
  const previous = budgets.value
  budgets.value = normalized

  const userId = await resolveUserId()
  if (userId) writeCache(userId, normalized)

  if (!supabase || !userId) return false
  if (isOffline()) {
    errorMessage.value = 'ออฟไลน์อยู่ งบถูกเก็บไว้ในเครื่องแล้ว จะบันทึกขึ้นเซิร์ฟเวอร์เมื่อกลับมาออนไลน์'
    return false
  }

  const { error } = await withRetry(
    () =>
      supabase!
        .from('user_settings')
        .upsert(
          { user_id: userId, category_budgets_json: normalized },
          { onConflict: 'user_id' },
        ),
    { label: 'save-category-budgets' },
  )

  if (error) {
    // คืนค่าเดิมเพื่อไม่ให้หน้าจอโชว์สิ่งที่เซิร์ฟเวอร์ไม่ได้รับ
    budgets.value = previous
    if (userId) writeCache(userId, previous)
    handleError(error, 'บันทึกงบรายหมวดไม่สำเร็จ')
    return false
  }

  errorMessage.value = ''
  return true
}

/**
 * งบรายหมวดต่อเดือน เก็บใน user_settings.category_budgets_json
 *
 * ซิงก์ข้ามแท็บด้วย storage event แบบเดียวกับ useTheme ไม่ได้ใช้ realtime channel
 * เพราะการตั้งค่าเปลี่ยนน้อยมาก ไม่คุ้มกับการเปิด websocket ค้างไว้
 */
export const useCategoryBudgets = () => {
  void load()

  const getBudget = (category: TransactionCategory) =>
    budgets.value.find((item) => item.category === category)?.budget ?? null

  const setBudget = async (category: TransactionCategory, amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return removeBudget(category)

    const capped = Math.min(Math.round(amount * 100) / 100, MAX_CATEGORY_BUDGET_AMOUNT)
    const others = budgets.value.filter((item) => item.category !== category)
    if (others.length >= MAX_CATEGORY_BUDGETS) {
      errorMessage.value = `ตั้งงบได้มากที่สุด ${MAX_CATEGORY_BUDGETS} หมวด`
      return false
    }

    return persist([...others, { category, budget: capped }])
  }

  const removeBudget = async (category: TransactionCategory) =>
    persist(budgets.value.filter((item) => item.category !== category))

  const replaceBudgets = async (next: CategoryBudget[]) => persist(next)

  const clearBudgets = async () => persist([])

  return {
    budgets,
    loading,
    errorMessage,
    needsMigration,
    hasBudgets: computed(() => budgets.value.length > 0),
    reload: () => load(true),
    getBudget,
    setBudget,
    removeBudget,
    replaceBudgets,
    clearBudgets,
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (!loadedUserId || event.key !== scopedKey(loadedUserId)) return
    if (!event.newValue) {
      budgets.value = []
      return
    }
    try {
      budgets.value = normalizeCategoryBudgets(JSON.parse(event.newValue))
    } catch {
      // แท็บอื่นเขียนค่าที่อ่านไม่ออก ปล่อยให้ค่าที่มีอยู่ทำงานต่อ
    }
  })
}
