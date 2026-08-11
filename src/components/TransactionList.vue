<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getCategoryEmoji, type Transaction } from '../types/transaction'
import { formatBaht, formatDate } from '../utils/format'

const props = withDefaults(
  defineProps<{
    transactions: Transaction[]
    loading: boolean
    busyId: number | null
    selectionMode: boolean
    bulkBusy: boolean
    emptyHint: string
    readOnly?: boolean
    showAuthor?: boolean
    memberLabels?: Record<string, string>
  }>(),
  { readOnly: false, showAuthor: false, memberLabels: () => ({}) },
)

/** แสดงชื่อผู้บันทึกเฉพาะเมื่อ space มีสมาชิกมากกว่าหนึ่งคน */
const authorLabel = (transaction: Transaction) =>
  props.showAuthor ? props.memberLabels[transaction.user_id] ?? 'สมาชิก' : ''

const emit = defineEmits<{
  edit: [transaction: Transaction]
  delete: [transaction: Transaction]
  bulkDelete: [ids: number[]]
  cancelSelection: []
}>()

const selectedIds = ref<number[]>([])

const allSelected = computed(
  () => props.transactions.length > 0 && selectedIds.value.length === props.transactions.length,
)

const isSelected = (id: number) => selectedIds.value.includes(id)

const toggleSelection = (id: number) => {
  selectedIds.value = isSelected(id)
    ? selectedIds.value.filter((selectedId) => selectedId !== id)
    : [...selectedIds.value, id]
}

const toggleAll = () => {
  selectedIds.value = allSelected.value ? [] : props.transactions.map(({ id }) => id)
}

const requestBulkDelete = () => {
  if (selectedIds.value.length === 0) return
  emit('bulkDelete', [...selectedIds.value])
}

watch(
  () => props.selectionMode,
  (enabled) => {
    if (!enabled) selectedIds.value = []
  },
)

watch(
  () => props.transactions,
  (transactions) => {
    const availableIds = new Set(transactions.map(({ id }) => id))
    selectedIds.value = selectedIds.value.filter((id) => availableIds.has(id))
  },
)
</script>

<template>
  <section class="panel list-panel" :class="{ 'list-panel--selecting': selectionMode }">
    <div class="panel-heading list-heading">
      <div>
        <span class="eyebrow">{{ selectionMode ? 'จัดการข้อมูล' : 'ประวัติ' }}</span>
        <h2>{{ selectionMode ? `เลือกแล้ว ${selectedIds.length} รายการ` : 'รายการล่าสุด' }}</h2>
      </div>

      <div v-if="selectionMode" class="selection-tools">
        <button class="select-all-button" type="button" :disabled="bulkBusy" @click="toggleAll">
          {{ allSelected ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด' }}
        </button>
        <button class="cancel-select-button" type="button" :disabled="bulkBusy" @click="emit('cancelSelection')">
          เสร็จสิ้น
        </button>
      </div>
      <div v-else class="list-meta">
        <span v-if="readOnly" class="read-only-chip">ดูอย่างเดียว</span>
        <span class="item-count">{{ transactions.length }} รายการ</span>
      </div>
    </div>

    <div v-if="selectionMode && transactions.length > 0" class="selection-bar">
      <span>แตะช่องด้านซ้ายเพื่อเลือกรายการ</span>
      <button type="button" :disabled="selectedIds.length === 0 || bulkBusy" @click="requestBulkDelete">
        <span v-if="bulkBusy" class="spinner spinner--small" aria-hidden="true"></span>
        {{ bulkBusy ? 'กำลังลบ...' : `ลบที่เลือก (${selectedIds.length})` }}
      </button>
    </div>

    <div v-if="loading" class="state-box" role="status">
      <span class="spinner spinner--dark" aria-hidden="true"></span>
      <p>กำลังโหลดข้อมูล...</p>
    </div>

    <div v-else-if="transactions.length === 0" class="state-box">
      <div class="empty-icon" aria-hidden="true">₿</div>
      <h3>ยังไม่มีรายการ</h3>
      <p>{{ emptyHint }}</p>
    </div>

    <TransitionGroup v-else tag="ul" name="transaction" class="transaction-list">
      <li
        v-for="transaction in transactions"
        :key="transaction.id"
        class="transaction-item"
        :class="{
          'transaction-item--selecting': selectionMode,
          'is-selected': isSelected(transaction.id),
        }"
        @click="selectionMode && toggleSelection(transaction.id)"
      >
        <label v-if="selectionMode" class="select-checkbox" @click.stop>
          <input
            type="checkbox"
            :checked="isSelected(transaction.id)"
            :aria-label="`เลือก ${transaction.description}`"
            :disabled="bulkBusy"
            @change="toggleSelection(transaction.id)"
          />
          <span aria-hidden="true">✓</span>
        </label>

        <div
          class="transaction-icon"
          :class="`transaction-icon--${transaction.type}`"
          aria-hidden="true"
        >
          {{ transaction.type === 'income' ? '↗' : '↘' }}
        </div>

        <div class="transaction-info">
          <strong>{{ transaction.description }}</strong>
          <span>
            {{ formatDate(transaction.transaction_date) }}
            <template v-if="transaction.category">
              · {{ getCategoryEmoji(transaction.category) }} {{ transaction.category }}
            </template>
            <template v-if="authorLabel(transaction)">
              · 👤 {{ authorLabel(transaction) }}
            </template>
          </span>
        </div>

        <div class="transaction-amount" :class="`amount--${transaction.type}`">
          <strong>
            {{ transaction.type === 'income' ? '+' : '−' }}{{ formatBaht(transaction.amount) }}
          </strong>
          <span>{{ transaction.type === 'income' ? 'รายรับ' : 'รายจ่าย' }}</span>
        </div>

        <div v-if="!selectionMode && !readOnly" class="transaction-actions">
          <button
            class="icon-button"
            type="button"
            title="แก้ไขรายการ"
            :disabled="busyId === transaction.id"
            @click="emit('edit', transaction)"
          >
            แก้ไข
          </button>
          <button
            class="icon-button icon-button--danger"
            type="button"
            title="ลบรายการ"
            :disabled="busyId === transaction.id"
            @click="emit('delete', transaction)"
          >
            {{ busyId === transaction.id ? 'กำลังลบ' : 'ลบ' }}
          </button>
        </div>
      </li>
    </TransitionGroup>
  </section>
</template>

<style scoped>
.list-panel {
  display: flex;
  min-height: 0;
  flex-direction: column;
}

.list-panel .transaction-list {
  position: relative;
  min-height: 0;
  overflow-y: auto;
  padding-right: 3px;
  scrollbar-width: thin;
  scrollbar-color: #c9d5ce transparent;
}

.list-panel .state-box {
  flex: 1;
}

.list-heading { align-items: center; }

.list-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.read-only-chip {
  padding: 4px 8px;
  border: 1px solid #e0d7bd;
  border-radius: 999px;
  color: #8a7333;
  background: #fbf5e4;
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: 0.55rem;
  font-weight: 700;
  white-space: nowrap;
}

.selection-tools {
  display: flex;
  align-items: center;
  gap: 6px;
}

.selection-tools button,
.selection-bar button {
  border-radius: 8px;
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: 0.65rem;
  font-weight: 700;
}

.select-all-button,
.cancel-select-button {
  padding: 7px 9px;
  border: 1px solid #d7dfda;
  color: #50655b;
  background: #fff;
}

.cancel-select-button {
  color: #256347;
  background: #edf5f0;
}

.selection-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: -7px 0 10px;
  padding: 10px 12px;
  border-radius: 10px;
  color: #65736c;
  background: #f2f6f3;
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: 0.65rem;
}

.selection-bar button {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 0;
  color: white;
  background: #bd4941;
}

.spinner--small {
  width: 12px;
  height: 12px;
}

.transaction-item--selecting {
  grid-template-columns: 25px 42px minmax(110px, 1fr) auto;
  margin-inline: -8px;
  padding-inline: 8px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s;
}

.transaction-item--selecting.is-selected {
  background: #f0f7f3;
}

.select-checkbox {
  position: relative;
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  cursor: pointer;
}

.select-checkbox input {
  position: absolute;
  width: 20px;
  height: 20px;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.select-checkbox span {
  display: grid;
  width: 19px;
  height: 19px;
  place-items: center;
  border: 1.5px solid #bdc9c2;
  border-radius: 6px;
  color: transparent;
  background: white;
  font-size: 0.65rem;
  font-weight: 800;
  transition: all 0.15s;
}

.select-checkbox input:checked + span {
  color: white;
  border-color: #2f815c;
  background: #2f815c;
}

.transaction-enter-active,
.transaction-leave-active,
.transaction-move {
  transition: opacity 0.25s ease, transform 0.28s cubic-bezier(.2, .8, .2, 1);
}

.transaction-enter-from {
  opacity: 0;
  transform: translateX(-12px) scale(0.98);
}

.transaction-leave-to {
  opacity: 0;
  transform: translateX(16px) scale(0.97);
}

.transaction-leave-active {
  position: absolute;
  width: calc(100% - 36px);
}

.transaction-item:not(.transaction-item--selecting) {
  transition: background 0.18s ease, transform 0.18s ease;
}

.transaction-item:not(.transaction-item--selecting):hover {
  padding-inline: 7px;
  border-radius: 10px;
  background: #f6f9f7;
  transform: translateX(2px);
}

@media (prefers-reduced-motion: reduce) {
  .transaction-enter-active,
  .transaction-leave-active,
  .transaction-move,
  .transaction-item {
    transition: none !important;
  }
}

@media (max-width: 580px) {
  .list-heading { align-items: flex-start; }
  .selection-tools { align-items: flex-end; flex-direction: column; }
  .selection-bar { align-items: stretch; flex-direction: column; }
  .selection-bar button { justify-content: center; }
  .transaction-item--selecting { grid-template-columns: 24px 40px minmax(90px, 1fr) auto; }
}
</style>
