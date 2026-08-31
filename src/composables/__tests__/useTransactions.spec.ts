import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { makeTransaction } from '../../test-utils/factories'
import type { TransactionInput } from '../../types/transaction'

type QueryChain = Record<string, ReturnType<typeof vi.fn>> & PromiseLike<unknown>

const queryResult = { data: [] as unknown[], error: null as unknown }
const rpcResult = { data: true as unknown, error: null as unknown }
const chains: QueryChain[] = []
const rpc = vi.fn(() => Promise.resolve(rpcResult))
const from = vi.fn(() => {
  const chain = {
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(queryResult).then(resolve, reject),
  } as unknown as QueryChain
  for (const method of ['select', 'eq', 'gte', 'lt', 'order', 'range', 'insert', 'update']) {
    chain[method] = vi.fn(() => chain)
  }
  chains.push(chain)
  return chain
})

vi.mock('../../lib/supabase', () => ({
  supabase: { from, rpc },
}))

vi.mock('../../lib/api', () => {
  class OfflineError extends Error {}
  return {
    OfflineError,
    describeError: (error: unknown) => String(error),
    isOffline: () => false,
    withRetry: async (operation: () => PromiseLike<unknown>) => operation(),
  }
})

vi.mock('../useOfflineQueue', () => ({
  useOfflineQueue: () => ({
    isOnline: ref(true),
    syncing: ref(false),
    lastError: ref(''),
    pendingCount: ref(0),
    pendingTransactions: ref([]),
    enqueue: vi.fn(),
    flush: vi.fn(),
    clearForCurrentUser: vi.fn(),
  }),
}))

const { useTransactions } = await import('../useTransactions')

const input: TransactionInput = {
  description: 'กาแฟ',
  amount: 65,
  type: 'expense',
  category: 'อาหาร',
  transaction_date: '2026-03-15',
}

const createSubject = () => {
  const callbacks = {
    onMessage: vi.fn(),
    onError: vi.fn(),
    clearError: vi.fn(),
    handleAuthError: vi.fn().mockResolvedValue('none'),
    onMutated: vi.fn().mockResolvedValue(undefined),
    onDeleted: vi.fn(),
    onBeforeBulkChange: vi.fn(),
  }
  const result = useTransactions({
    userId: () => 'user-1',
    isDemoMode: () => false,
    ...callbacks,
  })
  return { result, callbacks }
}

beforeEach(() => {
  chains.length = 0
  from.mockClear()
  rpc.mockClear()
  queryResult.data = []
  queryResult.error = null
  rpcResult.data = true
  rpcResult.error = null
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useTransactions', () => {
  it('ปฏิเสธการบันทึกซ้ำที่เร็วเกินไป และยอมให้บันทึกเมื่อครบ 1000ms', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T10:00:00.000Z'))
    const { result, callbacks } = createSubject()

    await result.saveTransaction(input)
    await result.saveTransaction(input)

    expect(chains.filter((chain) => chain.insert.mock.calls.length > 0)).toHaveLength(1)
    expect(callbacks.onError).toHaveBeenCalledWith('กรุณารอสักครู่ก่อนบันทึกรายการถัดไป')

    vi.advanceTimersByTime(1000)
    await result.saveTransaction(input)

    expect(chains.filter((chain) => chain.insert.mock.calls.length > 0)).toHaveLength(2)
  })

  it.each([
    ['2026-03', '2026-03-01', '2026-04-01'],
    ['2026-12', '2026-12-01', '2027-01-01'],
  ])('ใช้ขอบเขตรายเดือนแบบรวมวันแรกและไม่รวมเดือนถัดไปสำหรับ %s', async (month, start, end) => {
    const { result } = createSubject()

    await result.loadTransactionsByMonth(month)

    const chain = chains[0]
    expect(chain.gte).toHaveBeenCalledWith('transaction_date', start)
    expect(chain.lt).toHaveBeenCalledWith('transaction_date', end)
  })

  it('ลบแบบ soft delete และนำรายการออกจาก state หลังสำเร็จ', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const transaction = makeTransaction({ id: 42 })
    const { result, callbacks } = createSubject()
    result.setTransactions([transaction])

    await result.deleteTransaction(transaction)

    const chain = chains[0]
    expect(chain.update).toHaveBeenCalledWith({ deleted_at: expect.any(String) })
    expect(chain.eq).toHaveBeenCalledWith('id', 42)
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(result.transactions.value).toEqual([])
    expect(callbacks.onDeleted).toHaveBeenCalledWith(transaction)
    confirm.mockRestore()
  })

  it('กู้คืนผ่าน RPC เพราะแถวที่ถูกลบมองไม่เห็นจาก query ปกติ แล้วโหลดรายการใหม่', async () => {
    const restored = makeTransaction({ id: 42 })
    queryResult.data = [restored]
    const { result, callbacks } = createSubject()

    const success = await result.restoreTransaction(restored)

    expect(success).toBe(true)
    expect(rpc).toHaveBeenCalledWith('restore_transaction', { p_transaction_id: 42 })
    expect(from).toHaveBeenCalledWith('transactions')
    expect(result.transactions.value).toEqual([restored])
    expect(callbacks.onMutated).toHaveBeenCalledOnce()
    expect(callbacks.onMessage).toHaveBeenCalledWith('นำรายการกลับมาแล้ว')
  })
})
