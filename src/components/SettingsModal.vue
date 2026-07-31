<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

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

const confirmingReset = ref(false)

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
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
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
