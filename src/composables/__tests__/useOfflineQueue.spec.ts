import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withSetup } from '../../test-utils/withSetup'
import type { TransactionInput } from '../../types/transaction'

const insertResults: Array<{ data: unknown; error: unknown }> = []
const insert = vi.fn((payload: unknown) => {
  const result = insertResults.shift() ?? { data: { id: 1 }, error: null }
  const chain = {
    select: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve(result)),
  }
  return chain
})
const from = vi.fn(() => ({ insert }))

vi.mock('../../lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => from(...args) },
}))

vi.mock('../../lib/api', () => ({
  describeError: (error: unknown) => String(error),
  isOffline: () => false,
  isRetryableError: () => false,
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  withRetry: async (operation: () => PromiseLike<unknown>) => operation(),
}))

const { useOfflineQueue } = await import('../useOfflineQueue')

const makeInput = (description: string): TransactionInput => ({
  description,
  amount: 50,
  type: 'expense',
  category: 'อาหาร',
  transaction_date: '2026-03-15',
})

beforeEach(() => {
  localStorage.clear()
  insertResults.length = 0
  insert.mockClear()
  from.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
})

describe('useOfflineQueue', () => {
  it('ส่ง queueId เดิมเป็น idempotency_key ใน payload', async () => {
    const { result, unmount } = withSetup(() => useOfflineQueue({ userId: () => 'user-1' }))
    result.enqueue(makeInput('กาแฟ'))
    const queueId = result.pending.value[0].queueId

    await result.flush()

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      description: 'กาแฟ',
      user_id: 'user-1',
      idempotency_key: queueId,
    }))
    expect(result.pendingCount.value).toBe(0)
    unmount()
  })

  it('ถือ error 23505 ว่าสำเร็จและนำรายการออกจากคิว', async () => {
    insertResults.push({ data: null, error: { code: '23505' } })
    const onSynced = vi.fn()
    const { result, unmount } = withSetup(() =>
      useOfflineQueue({ userId: () => 'user-1', onSynced }),
    )
    result.enqueue(makeInput('รายการซ้ำ'))

    await result.flush()

    expect(result.pendingCount.value).toBe(0)
    expect(onSynced).toHaveBeenCalledWith(1)
    expect(JSON.parse(localStorage.getItem('moneyflow.offline-queue.v1') ?? '[]')).toEqual([])
    unmount()
  })

  it('หน่วง 200ms ระหว่างแต่ละรายการ', async () => {
    vi.useFakeTimers()
    const { result, unmount } = withSetup(() => useOfflineQueue({ userId: () => 'user-1' }))
    result.enqueue(makeInput('รายการแรก'))
    result.enqueue(makeInput('รายการที่สอง'))

    const flushing = result.flush()
    await Promise.resolve()
    expect(insert).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(199)
    expect(insert).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    await flushing
    expect(insert).toHaveBeenCalledTimes(2)
    unmount()
  })
})
