import { computed, ref, watch } from 'vue'
import { describeError, isOffline, OfflineError, withRetry } from '../lib/api'
import { supabase } from '../lib/supabase'
import { validateTransactionInput } from '../schemas/transaction.schema'
import type { Transaction, TransactionInput } from '../types/transaction'
import type { HandleAuthError } from './useAuth'
import { useOfflineQueue } from './useOfflineQueue'

export interface UseTransactionsOptions {
  userId: () => string | null
  /** โหมดดูตัวอย่าง: อ่านได้ เขียนไม่ได้ */
  isDemoMode: () => boolean
  onMessage: (message: string) => void
  onError: (message: string) => void
  clearError: () => void
  handleAuthError: HandleAuthError
  /** เรียกหลังข้อมูลเปลี่ยน เพื่อให้ระบบความสำเร็จคำนวณใหม่ */
  onMutated: () => Promise<void> | void
  /** เรียกหลังลบรายการเดียวสำเร็จ เพื่อเปิดหน้าต่าง "เลิกทำ" */
  onDeleted: (transaction: Transaction) => void
  /** ล้างหน้าต่าง "เลิกทำ" ก่อนการลบหลายรายการหรือรีเซ็ต */
  onBeforeBulkChange: () => void
}

const OFFLINE_EDIT_MESSAGE = 'ออฟไลน์อยู่ แก้ไขรายการไม่ได้ กรุณาลองใหม่เมื่อกลับมาออนไลน์'
const OFFLINE_DELETE_MESSAGE = 'ออฟไลน์อยู่ ลบรายการไม่ได้ กรุณาลองใหม่เมื่อกลับมาออนไลน์'
export const SAVE_THROTTLE_MS = 1000

const currentTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

const createIdempotencyKey = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

const errorCode = (error: unknown) => {
  if (!error || typeof error !== 'object' || !('code' in error)) return ''
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : ''
}

/**
 * ขนาดหน้าที่ดึงจากเซิร์ฟเวอร์ต่อรอบ
 *
 * ทำไมยังต้องดึงครบทุกแถวในที่สุด: ยอดคงเหลือยกมา ยอดสะสมทั้งหมด กราฟกระแสเงิน
 * ปฏิทินความร้อน และเงื่อนไขของ badge คำนวณจากประวัติทั้งก้อน
 * ถ้าถือแค่ 50 แถวล่าสุด ตัวเลขสรุปจะผิดทันที
 *
 * ที่แก้ได้คือ "ดึงทีละก้อน" แทนการยิงครั้งเดียวก้อนใหญ่ ผู้ใช้จึงเห็นข้อมูล
 * ชุดแรกเร็วขึ้น และคำขอแต่ละครั้งไม่เสี่ยงชน timeout
 * (ถ้าวันหนึ่งข้อมูลโตจนวิธีนี้ไม่พอ ทางออกคือย้ายการรวมยอดไปเป็น SQL view/RPC)
 */
const FETCH_PAGE_SIZE = 500
/** กันลูปไม่จบถ้าเซิร์ฟเวอร์ตอบผิดปกติ: 500 * 200 = 100,000 แถว */
const MAX_FETCH_PAGES = 200

/**
 * ศูนย์กลางของข้อมูลรายรับรายจ่าย: โหลด เพิ่ม แก้ ลบ และคิวออฟไลน์
 *
 * ทุก mutation ผ่าน withRetry เพื่อทนเน็ตสะดุด และเช็ค handleAuthError
 * ก่อนแสดง error เพราะ token หมดอายุต้องพาไปล็อกอินใหม่ ไม่ใช่ขึ้นข้อความแดง
 */
export const useTransactions = (options: UseTransactionsOptions) => {
  /** แถวที่ยืนยันแล้วจากเซิร์ฟเวอร์ (หรือข้อมูลตัวอย่างในโหมด demo) */
  const serverTransactions = ref<Transaction[]>([])
  const editingTransaction = ref<Transaction | null>(null)
  /** เพิ่มค่าเพื่อบังคับ remount ฟอร์ม ทำให้ฟิลด์ที่ค้างอยู่ถูกล้าง */
  const formVersion = ref(0)
  const loading = ref(false)
  const saving = ref(false)
  const bulkBusy = ref(false)
  const busyId = ref<number | null>(null)
  const lastSaveTimestamp = ref(0)
  const serverBalance = ref(0)
  const monthlySummary = ref({ totalIncome: 0, totalExpense: 0 })

  const {
    isOnline,
    syncing: offlineSyncing,
    lastError: offlineQueueError,
    pendingCount: offlinePendingCount,
    pendingTransactions,
    enqueue: enqueueOffline,
    flush: flushOfflineQueue,
    clearForCurrentUser: clearOfflineQueue,
  } = useOfflineQueue({
    userId: options.userId,
    onSynced: async (count) => {
      await loadTransactions()
      await options.onMutated()
      options.onMessage(
        count === 1 ? 'ซิงก์รายการที่จดตอนออฟไลน์แล้ว' : `ซิงก์ ${count} รายการที่จดตอนออฟไลน์แล้ว`,
      )
    },
  })

  watch(offlineQueueError, (message) => {
    if (message) options.onError(message)
  })

  /**
   * มุมมองเดียวที่ทั้งหน้าจอใช้: แถวจริง + แถวที่ยังรอซิงก์
   * เรียงเหมือน query ฝั่งเซิร์ฟเวอร์ (วันที่ใหม่สุดก่อน แล้วค่อย created_at)
   * เพื่อให้ยอดสรุปและรายการตรงกันทั้งตอนออฟไลน์และออนไลน์
   */
  const transactions = computed<Transaction[]>(() => {
    if (pendingTransactions.value.length === 0) return serverTransactions.value

    return [...pendingTransactions.value, ...serverTransactions.value].sort((a, b) => {
      if (a.transaction_date !== b.transaction_date) {
        return a.transaction_date < b.transaction_date ? 1 : -1
      }
      return a.created_at < b.created_at ? 1 : -1
    })
  })

  /** แถวที่รอซิงก์แก้ไข/ลบไม่ได้ เพราะยังไม่มี id จริงบนเซิร์ฟเวอร์ */
  const isPendingRow = (transaction: Transaction) => transaction.id < 0

  const blockedInDemo = () => {
    if (!options.isDemoMode()) return false
    options.onError('โหมดดูตัวอย่างแก้ไขข้อมูลไม่ได้ เข้าสู่ระบบเพื่อบันทึกรายการจริง')
    return true
  }

  const loadTransactions = async (allowAuthRetry = true): Promise<void> => {
    const currentUser = options.userId()
    if (!supabase || !currentUser) {
      serverTransactions.value = []
      return
    }

    loading.value = true
    options.clearError()

    // เก็บ client ไว้ในตัวแปรท้องถิ่น เพราะ TS มองไม่เห็นการเช็ค null ข้ามเข้า closure
    const client = supabase
    const collected: Transaction[] = []
    let page = 0

    for (; page < MAX_FETCH_PAGES; page += 1) {
      const from = page * FETCH_PAGE_SIZE
      const to = from + FETCH_PAGE_SIZE - 1

      const { data, error } = await withRetry<Transaction[]>(
        () =>
          client
            .from('transactions')
            .select('*')
            .eq('user_id', currentUser)
            .order('transaction_date', { ascending: false })
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(from, to),
        { label: `load-transactions:${page}` },
      )

      if (error) {
        loading.value = false

        // ออฟไลน์ไม่ใช่เรื่องต้องตกใจ ข้อมูลที่โหลดไว้ก่อนหน้ายังอยู่บนหน้าจอ
        if (error instanceof OfflineError) return

        const outcome = await options.handleAuthError(error)
        if (outcome === 'expired') return
        if (outcome === 'refreshed' && allowAuthRetry) {
          await loadTransactions(false)
          return
        }

        options.onError(`โหลดข้อมูลไม่สำเร็จ: ${describeError(error)}`)
        return
      }

      const rows = data ?? []
      collected.push(...rows)

      // เห็นก้อนแรกแล้วให้วาดเลย ไม่ต้องรอครบทุกหน้า
      if (page === 0) {
        serverTransactions.value = [...collected]
        loading.value = false
      }

      // ได้น้อยกว่าที่ขอ = หมดแล้ว
      if (rows.length < FETCH_PAGE_SIZE) break
    }

    loading.value = false
    serverTransactions.value = collected
  }

  const loadTransactionsByMonth = async (yearMonth: string): Promise<void> => {
    const currentUser = options.userId()
    if (!supabase || !currentUser || !/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) return

    const monthStart = `${yearMonth}-01`
    const [year, month] = yearMonth.split('-').map(Number)
    const nextMonth = `${month === 12 ? year + 1 : year}-${String((month % 12) + 1).padStart(2, '0')}-01`
    loading.value = true
    const { data, error } = await withRetry<Transaction[]>(
      () =>
        supabase!
          .from('transactions')
          .select('*')
          .eq('user_id', currentUser)
          .gte('transaction_date', monthStart)
          .lt('transaction_date', nextMonth)
          .order('transaction_date', { ascending: false })
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }),
      { label: 'load-transactions-by-month' },
    )
    loading.value = false

    if (error) {
      if (!(error instanceof OfflineError) && (await options.handleAuthError(error)) !== 'expired') {
        options.onError(`โหลดข้อมูลรายเดือนไม่สำเร็จ: ${describeError(error)}`)
      }
      return
    }
    serverTransactions.value = data ?? []
  }

  const loadTransactionsByDate = async (isoDate: string): Promise<void> => {
    const currentUser = options.userId()
    if (!supabase || !currentUser) return

    loading.value = true
    const { data, error } = await withRetry<Transaction[]>(
      () =>
        supabase!
          .from('transactions')
          .select('*')
          .eq('user_id', currentUser)
          .eq('transaction_date', isoDate)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }),
      { label: 'load-transactions-by-date' },
    )
    loading.value = false
    if (!error) serverTransactions.value = data ?? []
    else if (!(error instanceof OfflineError) && (await options.handleAuthError(error)) !== 'expired') {
      options.onError(`โหลดข้อมูลรายวันไม่สำเร็จ: ${describeError(error)}`)
    }
  }

  const loadBalance = async (): Promise<void> => {
    const currentUser = options.userId()
    if (!supabase || !currentUser) return
    const { data, error } = await withRetry<number>(
      () => supabase!.rpc('get_user_balance', { p_user_id: currentUser }),
      { label: 'load-balance' },
    )
    if (!error) serverBalance.value = Number(data ?? 0)
  }

  const loadMonthlySummary = async (yearMonth: string): Promise<void> => {
    const currentUser = options.userId()
    if (!supabase || !currentUser) return
    const { data, error } = await withRetry<Array<{ total_income: number; total_expense: number }>>(
      () => supabase!.rpc('get_monthly_summary', { p_user_id: currentUser, p_month: yearMonth }),
      { label: 'load-monthly-summary' },
    )
    if (!error) {
      const row = data?.[0]
      monthlySummary.value = {
        totalIncome: Number(row?.total_income ?? 0),
        totalExpense: Number(row?.total_expense ?? 0),
      }
    }
  }

  const saveTransaction = async (input: TransactionInput) => {
    if (saving.value) return

    const now = Date.now()
    if (now - lastSaveTimestamp.value < SAVE_THROTTLE_MS) {
      options.onError('กรุณารอสักครู่ก่อนบันทึกรายการถัดไป')
      return
    }

    if (blockedInDemo()) return
    const currentUser = options.userId()
    if (!supabase || !currentUser) return

    // ฟอร์ม validate มาแล้ว แต่นี่เป็นทางเข้าเดียวของการเขียนข้อมูล
    // จึงกันไว้อีกชั้นเผื่อมี caller อื่นในอนาคต
    const validated = validateTransactionInput(input)
    if (!validated.success || !validated.data) {
      options.onError(Object.values(validated.fieldErrors)[0] ?? 'ข้อมูลรายการไม่ถูกต้อง')
      return
    }

    const target = editingTransaction.value
    const operationKey = target ? null : createIdempotencyKey()
    const payload = target
      ? validated.data
      : { ...validated.data, client_timezone: currentTimezone() }
    lastSaveTimestamp.value = now

    // ออฟไลน์: การ "เพิ่ม" เก็บเข้าคิวไว้ก่อนได้ แต่การ "แก้" ต้องมีแถวจริงบนเซิร์ฟเวอร์
    if (isOffline()) {
      if (target) {
        options.onError(OFFLINE_EDIT_MESSAGE)
        return
      }

      if (enqueueOffline(payload, operationKey ?? undefined)) {
        formVersion.value += 1
        options.onMessage('ออฟไลน์อยู่ เก็บรายการไว้ในคิวแล้ว ระบบจะซิงก์ให้เมื่อกลับมาออนไลน์')
      }
      return
    }

    saving.value = true
    options.clearError()

    const client = supabase

    const { error } = await withRetry(
      () =>
        target
          ? client
              .from('transactions')
              .update(payload)
              .eq('id', target.id)
              .eq('user_id', currentUser)
              .select('id')
          : client
              .from('transactions')
              .insert({
                ...payload,
                user_id: currentUser,
                idempotency_key: operationKey,
              })
              .select('id'),
      { label: target ? 'update-transaction' : 'insert-transaction' },
    )

    saving.value = false

    const duplicateCommitted = !target && errorCode(error) === '23505'
    if (!error || duplicateCommitted) {
      options.onMessage(target ? 'แก้ไขรายการเรียบร้อยแล้ว' : 'เพิ่มรายการเรียบร้อยแล้ว')
      editingTransaction.value = null
      formVersion.value += 1
      await loadTransactions()
      await options.onMutated()
      return
    }

    // เน็ตหลุดกลางการบันทึกรายการใหม่: ไม่ทิ้งของที่ผู้ใช้พิมพ์มาแล้ว
    if (error instanceof OfflineError && !target) {
      if (enqueueOffline(payload, operationKey ?? undefined)) {
        formVersion.value += 1
        options.onMessage('เน็ตหลุดตอนบันทึก เก็บรายการไว้ในคิวแล้ว ระบบจะซิงก์ให้ทีหลัง')
      }
      return
    }

    if ((await options.handleAuthError(error)) === 'expired') return

    options.onError(`บันทึกข้อมูลไม่สำเร็จ: ${describeError(error)}`)
  }

  const editTransaction = (transaction: Transaction) => {
    if (blockedInDemo()) return
    if (isPendingRow(transaction)) {
      options.onError('รายการนี้ยังรอซิงก์อยู่ แก้ไขได้เมื่อซิงก์เสร็จแล้ว')
      return
    }
    editingTransaction.value = transaction
  }

  const cancelEdit = () => {
    editingTransaction.value = null
  }

  const deleteTransaction = async (transaction: Transaction) => {
    if (busyId.value !== null || bulkBusy.value) return
    if (blockedInDemo()) return
    if (isPendingRow(transaction)) {
      options.onError('รายการนี้ยังรอซิงก์อยู่ ลบได้เมื่อซิงก์เสร็จแล้ว')
      return
    }
    if (isOffline()) {
      options.onError(OFFLINE_DELETE_MESSAGE)
      return
    }

    const currentUser = options.userId()
    if (
      !supabase ||
      !currentUser ||
      !window.confirm(`ต้องการลบ “${transaction.description}” ใช่หรือไม่?`)
    ) return

    busyId.value = transaction.id
    options.clearError()

    const client = supabase

    const { error } = await withRetry(
      () =>
        client
          .from('transactions')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', transaction.id)
          .eq('user_id', currentUser),
      { label: 'delete-transaction' },
    )

    if (error) {
      if ((await options.handleAuthError(error)) !== 'expired') {
        options.onError(`ลบข้อมูลไม่สำเร็จ: ${describeError(error)}`)
      }
    } else {
      if (editingTransaction.value?.id === transaction.id) editingTransaction.value = null
      serverTransactions.value = serverTransactions.value.filter(
        (item) => item.id !== transaction.id,
      )
      options.onDeleted(transaction)
      await options.onMutated()
    }

    busyId.value = null
  }

  /** เขียนรายการที่เพิ่งลบกลับเข้าไป ใช้โดย useUndoDelete */
  const restoreTransaction = async (transaction: Transaction): Promise<boolean> => {
    const currentUser = options.userId()
    if (!supabase || !currentUser) return false

    options.clearError()
    const client = supabase

    const { data, error } = await withRetry<boolean>(
      () => client.rpc('restore_transaction', { p_transaction_id: transaction.id }),
      { label: 'undo-delete' },
    )

    if (error || data !== true) {
      if ((await options.handleAuthError(error)) !== 'expired') {
        options.onError(`กู้คืนรายการไม่สำเร็จ: ${describeError(error)}`)
      }
      return false
    }

    await loadTransactions()
    await options.onMutated()
    options.onMessage('นำรายการกลับมาแล้ว')
    return true
  }

  const deleteSelectedTransactions = async (selectedIds: number[]) => {
    if (bulkBusy.value || busyId.value !== null) return
    if (blockedInDemo()) return
    if (isOffline()) {
      options.onError(OFFLINE_DELETE_MESSAGE)
      return
    }

    // แถวที่รอซิงก์ (id ติดลบ) ยังไม่มีอยู่บนเซิร์ฟเวอร์ จึงลบผ่าน API ไม่ได้
    const ids = selectedIds.filter((id) => id > 0)
    if (ids.length < selectedIds.length) {
      options.onError('รายการที่รอซิงก์จะถูกข้ามไป ลบได้เมื่อซิงก์เสร็จแล้ว')
    }

    const currentUser = options.userId()
    if (
      !supabase ||
      !currentUser ||
      ids.length === 0 ||
      !window.confirm(`ยืนยันลบธุรกรรมที่เลือก ${ids.length} รายการ? การดำเนินการนี้ย้อนกลับไม่ได้`)
    ) return

    options.onBeforeBulkChange()
    bulkBusy.value = true
    options.clearError()

    const client = supabase

    const { error } = await withRetry(
      () =>
        client
          .from('transactions')
          .update({ deleted_at: new Date().toISOString() })
          .eq('user_id', currentUser)
          .in('id', ids),
      { label: 'bulk-delete' },
    )

    let deleted = false

    if (error) {
      if ((await options.handleAuthError(error)) !== 'expired') {
        options.onError(`ลบรายการที่เลือกไม่สำเร็จ: ${describeError(error)}`)
      }
    } else {
      const deletedIds = new Set(ids)
      if (editingTransaction.value && deletedIds.has(editingTransaction.value.id)) {
        editingTransaction.value = null
      }
      serverTransactions.value = serverTransactions.value.filter(({ id }) => !deletedIds.has(id))
      await options.onMutated()
      options.onMessage(`ลบ ${ids.length} รายการเรียบร้อยแล้ว`)
      deleted = true
    }

    bulkBusy.value = false
    return deleted
  }

  const resetAllTransactions = async () => {
    if (bulkBusy.value || busyId.value !== null) return false
    if (blockedInDemo()) return false
    if (isOffline()) {
      options.onError('ออฟไลน์อยู่ รีเซ็ตข้อมูลไม่ได้ กรุณาลองใหม่เมื่อกลับมาออนไลน์')
      return false
    }

    const currentUser = options.userId()
    if (!supabase || !currentUser || transactions.value.length === 0) return false

    options.onBeforeBulkChange()
    bulkBusy.value = true
    options.clearError()

    const client = supabase

    const { error } = await withRetry(
      () =>
        client
          .from('transactions')
          .update({ deleted_at: new Date().toISOString() })
          .eq('user_id', currentUser)
          .is('deleted_at', null),
      { label: 'reset-transactions' },
    )

    let reset = false

    if (error) {
      if ((await options.handleAuthError(error)) !== 'expired') {
        options.onError(`รีเซ็ตข้อมูลไม่สำเร็จ: ${describeError(error)}`)
      }
    } else {
      serverTransactions.value = []
      clearOfflineQueue()
      editingTransaction.value = null
      options.onMessage('รีเซ็ตข้อมูลทั้งหมดเรียบร้อยแล้ว')
      reset = true
    }

    bulkBusy.value = false
    return reset
  }

  /** ใส่ข้อมูลตัวอย่างสำหรับโหมดดูตัวอย่าง (ไม่แตะเซิร์ฟเวอร์) */
  const setTransactions = (rows: Transaction[]) => {
    serverTransactions.value = rows
  }

  /** ล้าง state ทั้งหมดของผู้ใช้คนก่อน ใช้ตอนออกจากระบบหรือสลับบัญชี */
  const resetState = () => {
    serverTransactions.value = []
    editingTransaction.value = null
    loading.value = false
    saving.value = false
    bulkBusy.value = false
    busyId.value = null
    lastSaveTimestamp.value = 0
    serverBalance.value = 0
    monthlySummary.value = { totalIncome: 0, totalExpense: 0 }
    formVersion.value += 1
  }

  return {
    transactions,
    serverTransactions,
    editingTransaction,
    formVersion,
    loading,
    saving,
    bulkBusy,
    busyId,
    isOnline,
    offlineSyncing,
    offlinePendingCount,
    serverBalance,
    monthlySummary,
    isPendingRow,
    loadTransactions,
    loadTransactionsByMonth,
    loadTransactionsByDate,
    loadBalance,
    loadMonthlySummary,
    saveTransaction,
    editTransaction,
    cancelEdit,
    deleteTransaction,
    restoreTransaction,
    deleteSelectedTransactions,
    resetAllTransactions,
    setTransactions,
    resetState,
    flushOfflineQueue,
    clearOfflineQueue,
  }
}
