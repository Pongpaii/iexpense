<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useSalarySettings } from '../composables/useSalarySettings'

const props = defineProps<{
  open: boolean
  transactionCount: number
  busy: boolean
}>()

const emit = defineEmits<{
  close: []
  manage: []
  reset: []
}>()

const {
  monthlySalary,
  salaryDay,
  salaryHidden,
  saveMonthlySalary,
  toggleSalaryVisibility,
} = useSalarySettings()
const confirmingReset = ref(false)
const salaryDraft = ref<number | string>(monthlySalary.value)
const salaryError = ref('')
const salaryNotice = ref('')
let salaryNoticeTimer: ReturnType<typeof window.setTimeout> | undefined

const showSalaryNotice = (message: string) => {
  salaryNotice.value = message
  window.clearTimeout(salaryNoticeTimer)
  salaryNoticeTimer = window.setTimeout(() => {
    salaryNotice.value = ''
  }, 4000)
}

const toggleSalaryPrivacy = () => {
  const result = toggleSalaryVisibility()
  const action = salaryHidden.value ? 'เบลอเงินเดือนแล้ว' : 'แสดงเงินเดือนแล้ว'
  showSalaryNotice(result.persisted ? action : `${action} แต่จำค่าได้เฉพาะรอบนี้`)
}

const resetSalaryEditor = () => {
  salaryDraft.value = monthlySalary.value
  salaryError.value = ''
  salaryNotice.value = ''
}

watch(() => props.open, (open) => {
  if (open) resetSalaryEditor()
})

const submitSalary = () => {
  const amount = Number(salaryDraft.value)

  if (!Number.isFinite(amount) || amount <= 0) {
    salaryError.value = 'กรอกเงินเดือนที่มากกว่า 0 บาท'
    return
  }

  if (amount > 100_000_000) {
    salaryError.value = 'จำนวนเงินเดือนสูงเกินกว่าที่ระบบรองรับ'
    return
  }

  const result = saveMonthlySalary(amount)
  if (!result.ok) {
    salaryError.value = 'บันทึกเงินเดือนไม่สำเร็จ กรุณาตรวจสอบจำนวนเงิน'
    return
  }

  salaryDraft.value = monthlySalary.value
  salaryError.value = ''
  showSalaryNotice(result.persisted
    ? 'บันทึกแล้ว น้องถุงเงินคำนวณใหม่ให้ทันที'
    : 'ใช้ค่านี้ในรอบปัจจุบัน แต่เบราว์เซอร์ไม่อนุญาตให้บันทึกถาวร')
}

const close = () => {
  if (props.busy) return
  confirmingReset.value = false
  emit('close')
}

const startManaging = () => {
  emit('manage')
  close()
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && props.open) close()
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.clearTimeout(salaryNoticeTimer)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="modal-backdrop" role="presentation" @mousedown.self="close">
        <section
          class="settings-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
        >
          <header class="settings-header">
            <div>
              <span>ตั้งค่า</span>
              <h2 id="settings-title">จัดการข้อมูล</h2>
            </div>
            <button class="close-button" type="button" aria-label="ปิดหน้าต่างตั้งค่า" :disabled="busy" @click="close">×</button>
          </header>

          <div class="settings-body">
            <form class="setting-card salary-card" @submit.prevent="submitSalary">
              <div class="setting-icon setting-icon--salary" aria-hidden="true">฿</div>
              <div class="setting-copy salary-copy">
                <strong>เงินเดือนสำหรับการคาดการณ์</strong>
                <p>
                  สมมติว่าเงินเข้าทุกวันที่ {{ salaryDay }} ของเดือน
                  (กุมภาพันธ์ใช้วันสุดท้ายของเดือน)
                </p>

                <label class="salary-field" for="monthly-salary">
                  <span>เงินเดือนต่อเดือน</span>
                  <span class="salary-input-wrap">
                    <b aria-hidden="true">฿</b>
                    <input
                      id="monthly-salary"
                      v-model.number="salaryDraft"
                      :type="salaryHidden ? 'password' : 'number'"
                      min="1"
                      max="100000000"
                      step="1"
                      inputmode="decimal"
                      autocomplete="off"
                      :disabled="busy"
                      aria-describedby="salary-feedback"
                      @input="salaryError = ''; salaryNotice = ''"
                    />
                    <button
                      class="salary-visibility"
                      type="button"
                      :aria-label="salaryHidden ? 'แสดงเงินเดือน' : 'เบลอเงินเดือน'"
                      :aria-pressed="!salaryHidden"
                      :title="salaryHidden ? 'แสดงเงินเดือน' : 'เบลอเงินเดือน'"
                      :disabled="busy"
                      @click="toggleSalaryPrivacy"
                    >
                      <svg v-if="salaryHidden" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.3A10.7 10.7 0 0 1 12 4c5.5 0 9 5.1 9 5.1a14.8 14.8 0 0 1-2.5 2.8M6.6 6.7C4.4 8.2 3 10.9 3 10.9S6.5 16 12 16c1 0 2-.2 2.8-.5" />
                      </svg>
                      <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M3 12s3.5-5 9-5 9 5 9 5-3.5 5-9 5-9-5-9-5Z" />
                        <circle cx="12" cy="12" r="2.5" />
                      </svg>
                    </button>
                    <em>บาท</em>
                  </span>
                </label>

                <small
                  v-if="salaryError"
                  id="salary-feedback"
                  class="salary-feedback salary-feedback--error"
                  role="alert"
                >{{ salaryError }}</small>
                <small
                  v-else-if="salaryNotice"
                  id="salary-feedback"
                  class="salary-feedback salary-feedback--success"
                  role="status"
                >{{ salaryNotice }}</small>
                <small v-else id="salary-feedback">
                  ค่าเริ่มต้น 17,000 บาท · เก็บเฉพาะในเบราว์เซอร์เครื่องนี้
                </small>
              </div>
              <button class="setting-button salary-save" type="submit" :disabled="busy">
                บันทึกเงินเดือน
              </button>
            </form>

            <article class="setting-card">
              <div class="setting-icon setting-icon--manage" aria-hidden="true">✓</div>
              <div class="setting-copy">
                <strong>เลือกลบรายการ</strong>
                <p>เลือกธุรกรรมหลายรายการแล้วลบพร้อมกันได้</p>
                <small>มีข้อมูลทั้งหมด {{ transactionCount }} รายการ</small>
              </div>
              <button
                class="setting-button"
                type="button"
                :disabled="transactionCount === 0 || busy"
                @click="startManaging"
              >
                จัดการรายการ
              </button>
            </article>

            <div class="danger-zone">
              <div class="danger-heading">
                <span>Danger zone</span>
                <p>การดำเนินการส่วนนี้ไม่สามารถย้อนกลับได้</p>
              </div>

              <article class="setting-card setting-card--danger">
                <div class="setting-icon setting-icon--danger" aria-hidden="true">↻</div>
                <div class="setting-copy">
                  <strong>รีเซ็ตข้อมูลทั้งหมด</strong>
                  <p>ลบรายรับและรายจ่ายทุกแถวออกจากฐานข้อมูล</p>
                </div>

                <button
                  v-if="!confirmingReset"
                  class="setting-button setting-button--danger"
                  type="button"
                  :disabled="transactionCount === 0 || busy"
                  @click="confirmingReset = true"
                >
                  รีเซ็ตข้อมูล
                </button>
              </article>

              <div v-if="confirmingReset" class="reset-confirm" role="alert">
                <div>
                  <strong>ยืนยันลบ {{ transactionCount }} รายการทั้งหมด?</strong>
                  <p>กราฟ ยอดสรุป และอารมณ์น้องถุงเงินจะกลับสู่ค่าเริ่มต้น</p>
                </div>
                <div class="confirm-actions">
                  <button type="button" :disabled="busy" @click="confirmingReset = false">ยกเลิก</button>
                  <button class="confirm-delete" type="button" :disabled="busy" @click="emit('reset')">
                    <span v-if="busy" class="mini-spinner" aria-hidden="true"></span>
                    {{ busy ? 'กำลังลบ...' : 'ใช่ ลบทั้งหมด' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  z-index: 100;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(10, 28, 21, 0.58);
  backdrop-filter: blur(5px);
}

.settings-modal {
  width: min(620px, 100%);
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 30px 90px rgba(7, 28, 19, 0.3);
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 26px 19px;
  border-bottom: 1px solid #e8ebe7;
}

.settings-header span,
.danger-heading > span {
  color: #698176;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.settings-header h2 {
  margin: 3px 0 0;
  color: #18231f;
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: 1.2rem;
}

.close-button {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 0;
  border-radius: 10px;
  color: #68736e;
  background: #f1f4f1;
  font-size: 1.3rem;
}

.settings-body {
  padding: 22px 26px 26px;
}

.setting-card {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 17px;
  border: 1px solid #e3e8e3;
  border-radius: 15px;
  background: #fbfcfb;
}

.setting-icon {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 13px;
  font-weight: 800;
}

.salary-card {
  align-items: start;
  margin-bottom: 12px;
  border-color: #cfe3d7;
  background: linear-gradient(135deg, #f8fcf9, #eef8f2);
}

.setting-icon--salary {
  color: #1d6d49;
  background: #dff2e7;
  font-family: 'Manrope', sans-serif;
  font-size: 1rem;
}

.salary-copy {
  display: grid;
  gap: 3px;
}

.salary-field {
  display: grid;
  gap: 5px;
  margin-top: 9px;
  color: #4f675c;
  font-size: 0.62rem;
  font-weight: 700;
}

.salary-input-wrap {
  display: grid;
  min-height: 42px;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 7px;
  padding: 0 11px;
  border: 1px solid #cfdcd4;
  border-radius: 10px;
  background: #fff;
  transition: border-color 0.16s, box-shadow 0.16s;
}

.salary-input-wrap:focus-within {
  border-color: #5e987a;
  box-shadow: 0 0 0 3px rgba(65, 139, 99, 0.12);
}

.salary-input-wrap b {
  color: #2c7955;
  font-family: 'Manrope', sans-serif;
  font-size: 0.8rem;
}

.salary-input-wrap input {
  width: 100%;
  min-width: 0;
  padding: 7px 0;
  border: 0;
  outline: 0;
  color: #1f352b;
  background: transparent;
  font-family: 'Manrope', sans-serif;
  font-size: 0.86rem;
  font-weight: 700;
}

.salary-visibility {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 8px;
  color: #537166;
  background: #eef4f0;
}

.salary-visibility:hover:not(:disabled) {
  color: #235f43;
  background: #e1eee6;
}

.salary-visibility:focus-visible {
  outline: 3px solid rgba(41, 116, 79, 0.28);
  outline-offset: 1px;
}

.salary-visibility svg {
  width: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.salary-input-wrap em {
  color: #819087;
  font-size: 0.59rem;
  font-style: normal;
  font-weight: 600;
}

.setting-copy .salary-feedback--error {
  color: #b74740;
}

.setting-copy .salary-feedback--success {
  color: #277451;
}

.salary-save {
  align-self: end;
}

.setting-icon--manage {
  color: #267551;
  background: #e3f2e9;
}

.setting-icon--danger {
  color: #ba473f;
  background: #f9e5e2;
}

.setting-copy {
  min-width: 0;
  font-family: 'Noto Sans Thai', sans-serif;
}

.setting-copy strong {
  color: #25322c;
  font-size: 0.83rem;
}

.setting-copy p,
.danger-heading p,
.reset-confirm p {
  margin: 3px 0 0;
  color: #7d8782;
  font-size: 0.69rem;
  line-height: 1.5;
}

.setting-copy small {
  display: block;
  margin-top: 5px;
  color: #4f7765;
  font-size: 0.62rem;
}

.setting-button {
  padding: 9px 12px;
  border: 1px solid #cfdad3;
  border-radius: 9px;
  color: #285e46;
  background: #fff;
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: 0.69rem;
  font-weight: 700;
}

.setting-button:hover:not(:disabled) {
  border-color: #67937f;
  background: #f2f8f4;
}

.danger-zone {
  margin-top: 26px;
  padding-top: 19px;
  border-top: 1px dashed #dbdfdc;
}

.danger-heading {
  margin-bottom: 10px;
}

.danger-heading > span {
  color: #bc5048;
}

.setting-card--danger {
  border-color: #efd7d4;
  background: #fffafa;
}

.setting-button--danger {
  color: #b43f38;
  border-color: #e7bdb9;
}

.setting-button--danger:hover:not(:disabled) {
  border-color: #d87870;
  background: #fff1ef;
}

.reset-confirm {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  margin-top: 10px;
  padding: 14px 15px;
  border: 1px solid #eac3bf;
  border-radius: 12px;
  color: #8f332d;
  background: #fff2f0;
  font-family: 'Noto Sans Thai', sans-serif;
}

.reset-confirm strong {
  font-size: 0.76rem;
}

.confirm-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 7px;
}

.confirm-actions button {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid #dfc3c0;
  border-radius: 8px;
  color: #76514e;
  background: #fff;
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: 0.65rem;
  font-weight: 700;
}

.confirm-actions .confirm-delete {
  color: white;
  border-color: #bd4941;
  background: #bd4941;
}

.mini-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

.modal-enter-active,
.modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-active .settings-modal,
.modal-leave-active .settings-modal { transition: transform 0.2s ease, opacity 0.2s ease; }
.modal-enter-from,
.modal-leave-to { opacity: 0; }
.modal-enter-from .settings-modal,
.modal-leave-to .settings-modal { opacity: 0; transform: translateY(12px) scale(0.98); }

@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 580px) {
  .modal-backdrop { align-items: end; padding: 0; }
  .settings-modal { max-height: 92vh; border-radius: 22px 22px 0 0; }
  .settings-header, .settings-body { padding-inline: 18px; }
  .setting-card { grid-template-columns: 42px 1fr; }
  .setting-button { grid-column: 1 / -1; }
  .reset-confirm { align-items: stretch; flex-direction: column; }
  .confirm-actions { justify-content: flex-end; }
}
</style>
