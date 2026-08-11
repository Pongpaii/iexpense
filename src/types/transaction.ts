export type TransactionType = 'income' | 'expense'

export const transactionCategories = [
  { value: 'อาหาร', emoji: '🍜' },
  { value: 'การเดินทาง', emoji: '🚗' },
  { value: 'ช้อปปิ้ง', emoji: '🛍️' },
  { value: 'ท่องเที่ยว', emoji: '✈️' },
  { value: 'ที่พัก', emoji: '🏠' },
  { value: 'บิลและบริการ', emoji: '🧾' },
  { value: 'สุขภาพ', emoji: '💊' },
  { value: 'การศึกษา', emoji: '📚' },
  { value: 'เงินเดือน', emoji: '💰' },
  { value: 'อื่น ๆ', emoji: '✨' },
] as const

export type TransactionCategory = (typeof transactionCategories)[number]['value']

export const getCategoryEmoji = (category: TransactionCategory | null | undefined) =>
  transactionCategories.find((option) => option.value === category)?.emoji ?? '🏷️'

export interface Transaction {
  id: number
  user_id: string
  space_id?: string | null
  description: string
  amount: number
  type: TransactionType
  category: TransactionCategory | null
  transaction_date: string
  created_at: string
}

export type TransactionInput = Pick<
  Transaction,
  'description' | 'amount' | 'type' | 'category' | 'transaction_date'
>

/** สมาชิกของ space ที่ใช้ร่วมกัน ใช้แสดงว่าใครเป็นคนบันทึกรายการ */
export interface SpaceMember {
  user_id: string
  email: string | null
  role: 'owner' | 'member'
}

export interface SpaceSummary {
  space_id: string
  space_name: string
  invite_code: string
  member_role: 'owner' | 'member'
  is_owner: boolean
}
