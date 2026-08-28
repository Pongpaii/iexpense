<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import {
  transactionCategories,
  type Transaction,
  type TransactionCategory,
  type TransactionInput,
  type TransactionType,
} from '../types/transaction'

const props = defineProps<{
  editing: Transaction | null
  busy: boolean
  disabled?: boolean
  defaultDate?: string
}>()

const emit = defineEmits<{
  submit: [value: TransactionInput]
  cancel: []
}>()

interface FormState {
  description: string
  amount: number | null
  type: TransactionType
  category: TransactionCategory | ''
  transaction_date: string
}

const today = () => {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

const defaultTransactionDate = () => props.defaultDate ?? today()

const form = reactive<FormState>({
  description: '',
  amount: null,
  type: 'expense',
  category: '',
  transaction_date: defaultTransactionDate(),
})

const isEditing = computed(() => props.editing !== null)

const resetForm = () => {
  form.description = ''
  form.amount = null
  form.type = 'expense'
  form.category = ''
  form.transaction_date = defaultTransactionDate()
}

const toggleCategory = (category: TransactionCategory) => {
  form.category = form.category === category ? '' : category
}

watch(
  () => props.editing,
  (transaction) => {
    if (!transaction) {
      resetForm()
      return
    }

    form.description = transaction.description
    form.amount = transaction.amount
    form.type = transaction.type
    form.category = transaction.category ?? ''
    form.transaction_date = transaction.transaction_date
  },
  { immediate: true },
)

watch(
  () => props.defaultDate,
  (date) => {
    if (!props.editing && date) form.transaction_date = date
  },
)

const handleSubmit = () => {
  const description = form.description.trim()
  if (!description || !form.amount || form.amount <= 0) return

  emit('submit', {
    description,
    amount: Number(form.amount),
    type: form.type,
    category: form.category || null,
    transaction_date: form.transaction_date,
  })
}
</script>

<template>
  <section class="panel form-panel">
    <div class="panel-heading">
      <div>
        <span class="eyebrow">{{ isEditing ? 'แก้ไขข้อมูล' : 'รายการใหม่' }}</span>
        <h2>{{ isEditing ? 'แก้ไขรายการ' : 'เพิ่มรายรับ–รายจ่าย' }}</h2>
      </div>
      <button v-if="isEditing" class="text-button" type="button" @click="emit('cancel')">
        ยกเลิก
      </button>
    </div>

    <form class="transaction-form" @submit.prevent="handleSubmit">
      <fieldset :disabled="busy || disabled">
        <label class="field field--wide">
          <span>ชื่อรายการ</span>
          <input
            v-model="form.description"
            type="text"
            maxlength="120"
            placeholder="เช่น ค่าอาหารกลางวัน"
            required
          />
        </label>

        <label class="field">
          <span>จำนวนเงิน (บาท)</span>
          <input
            v-model.number="form.amount"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            required
          />
        </label>

        <label class="field">
          <span>วันที่</span>
          <span class="date-input-wrap">
            <input v-model="form.transaction_date" type="date" required />
          </span>
        </label>

        <div class="field field--wide">
          <span>ประเภท</span>
          <div class="type-switch">
            <label :class="{ active: form.type === 'income' }">
              <input v-model="form.type" type="radio" value="income" />
              <span class="type-dot type-dot--income"></span>
              รายรับ
            </label>
            <label :class="{ active: form.type === 'expense' }">
              <input v-model="form.type" type="radio" value="expense" />
              <span class="type-dot type-dot--expense"></span>
              รายจ่าย
            </label>
          </div>
        </div>

        <div class="field field--wide category-field">
          <div class="category-label">
            <span>หมวดหมู่</span>
            <small>{{ form.category ? 'กดซ้ำเพื่อยกเลิก' : 'ไม่บังคับ' }}</small>
          </div>
          <div class="category-grid" role="group" aria-label="เลือกหมวดหมู่">
            <button
              v-for="option in transactionCategories"
              :key="option.value"
              class="category-button"
              :class="{ active: form.category === option.value }"
              type="button"
              :aria-pressed="form.category === option.value"
              @click="toggleCategory(option.value)"
            >
              <span class="category-emoji" aria-hidden="true">{{ option.emoji }}</span>
              <span>{{ option.value }}</span>
              <i aria-hidden="true">✓</i>
            </button>
          </div>
        </div>

        <button class="primary-button field--wide" type="submit">
          <span v-if="busy" class="spinner" aria-hidden="true"></span>
          {{ busy ? 'กำลังบันทึก...' : isEditing ? 'บันทึกการแก้ไข' : 'เพิ่มรายการ' }}
        </button>
      </fieldset>
    </form>
  </section>
</template>

<style scoped>
.category-field { gap: 7px; }

.category-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #515d57;
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: 0.72rem;
  font-weight: 600;
}

.category-label small {
  color: #99a19d;
  font-size: 0.56rem;
  font-weight: 500;
}

.category-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.category-button {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 36px;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  overflow: hidden;
  border: 1px solid #e0e5e1;
  border-radius: 9px;
  color: #5e6b64;
  background: #fafbf9;
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: 0.61rem;
  font-weight: 600;
  text-align: left;
  transition: border-color 0.16s, background 0.16s, color 0.16s, transform 0.16s;
}

.category-button:hover:not(:disabled) {
  border-color: #93aa9f;
  background: #f3f7f4;
  transform: translateY(-1px);
}

.category-button.active {
  color: #1f5d40;
  border-color: #5f987c;
  background: #e8f4ed;
  box-shadow: inset 0 0 0 1px rgba(51, 129, 91, 0.08);
}

.category-emoji {
  flex: 0 0 auto;
  font-size: 0.92rem;
}

.category-button > span:nth-child(2) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-button i {
  position: absolute;
  right: 5px;
  top: 4px;
  color: #31805a;
  font-size: 0.52rem;
  font-style: normal;
  opacity: 0;
  transform: scale(0.5);
  transition: opacity 0.16s, transform 0.16s;
}

.category-button.active i {
  opacity: 1;
  transform: scale(1);
}
</style>
