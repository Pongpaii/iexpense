<script setup lang="ts">
import { computed, defineAsyncComponent, h, nextTick, onMounted, ref, watch } from 'vue'
import AchievementToast from './components/AchievementToast.vue'
import AuthGate from './components/AuthGate.vue'
import CategoryDonut from './components/CategoryDonut.vue'
import DailyCapBar from './components/DailyCapBar.vue'
import EditTransactionModal from './components/EditTransactionModal.vue'
import MoneyBuddy from './components/MoneyBuddy.vue'
import SkeletonPanel from './components/SkeletonPanel.vue'
import PasswordResetScreen from './components/PasswordResetScreen.vue'
import SettingsModal from './components/SettingsModal.vue'
import StreakPill from './components/StreakPill.vue'
import SummaryCards from './components/SummaryCards.vue'
import TransactionForm from './components/TransactionForm.vue'
import TransactionList from './components/TransactionList.vue'
import { useAchievements } from './composables/useAchievements'
import { useAppMessages } from './composables/useAppMessages'
import { useAuth } from './composables/useAuth'
import { useInstallPrompt } from './composables/useInstallPrompt'
import { useNavigation } from './composables/useNavigation'
import { useTransactions } from './composables/useTransactions'
import { useUndoDelete } from './composables/useUndoDelete'
import { isSupabaseConfigured } from './lib/supabase'
import type { Transaction, TransactionType } from './types/transaction'
import { createDemoTransactions, DEMO_USER_EMAIL } from './utils/demoData'
import { exportMonthlyCsv } from './utils/monthlyExport'

/**
 * คอมโพเนนต์หนักที่ไม่ได้ใช้ตั้งแต่วินาทีแรก แยกเป็น chunk ของตัวเอง
 *
 * หน้าแรกที่ผู้ใช้เห็นคือหน้า "จดรายการ" กราฟ ปฏิทินความร้อน ฟองเงิน
 * และตู้ความสำเร็จจึงไม่จำเป็นต้องอยู่ใน bundle ก้อนแรก
 * ใส่ loadingComponent ไว้เพื่อให้ระหว่างดาวน์โหลด chunk พื้นที่ยังคงความสูงเดิม
 */
const lazyPanel = (
  loader: () => Promise<unknown>,
  skeleton: { height?: number; rows?: number; variant?: 'chart' | 'list'; label: string },
) =>
  defineAsyncComponent({
    loader: loader as never,
    loadingComponent: {
      name: 'LazyPanelFallback',
      render: () => h(SkeletonPanel, skeleton),
    },
    delay: 120,
  })

const CashFlowChart = lazyPanel(() => import('./components/CashFlowChart.vue'), {
  height: 210,
  label: 'กำลังโหลดกราฟกระแสเงิน',
})
const ExpenseAnalytics = lazyPanel(() => import('./components/ExpenseAnalytics.vue'), {
  height: 260,
  label: 'กำลังโหลดบทวิเคราะห์รายจ่าย',
})
const HeatmapCalendar = lazyPanel(() => import('./components/HeatmapCalendar.vue'), {
  height: 200,
  label: 'กำลังโหลดปฏิทินการใช้จ่าย',
})
const BubbleGalaxy = lazyPanel(() => import('./components/BubbleGalaxy.vue'), {
  height: 380,
  label: 'กำลังโหลดฟองเงิน',
})
/**
 * ตู้ความสำเร็จเป็น modal ไม่ใส่ loadingComponent เพราะ skeleton แบบ panel
 * จะโผล่มาอยู่ในเลย์เอาต์ปกติ ไม่ใช่ในหน้าต่างซ้อน
 * ใช้ v-if ที่ template คู่กัน เพื่อให้ chunk โหลดตอนกดเปิดจริง ๆ
 */
const AchievementGallery = defineAsyncComponent(
  () => import('./components/AchievementGallery.vue'),
)

type ViewMode = 'month' | 'all'

const toLocalIsoDate = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// --- state ที่เป็นเรื่องของหน้าจอนี้จริง ๆ เท่านั้น ---
// ตัวที่เกี่ยวกับข้อมูล/auth/การนำทาง ย้ายไปอยู่ใน composables แล้ว
const exportBusy = ref(false)
const settingsOpen = ref(false)
const achievementsOpen = ref(false)
const selectionMode = ref(false)
const demoMode = ref(false)
const viewMode = ref<ViewMode>('month')
const todayDate = toLocalIsoDate(new Date())
const selectedOverviewMonth = ref(todayDate.slice(0, 7))
const selectedRecordDate = ref(todayDate)
const isOverviewMonthValid = computed(() => /^\d{4}-(0[1-9]|1[0-2])$/.test(selectedOverviewMonth.value))

const { errorMessage, successMessage, showMessage, clearError, clearAll: clearMessages } =
  useAppMessages()

const {
  canInstall,
  installing: installBusy,
  install: installApp,
  dismiss: dismissInstall,
} = useInstallPrompt()

const showError = (message: string) => {
  errorMessage.value = message
}

const { activePage, navigateTo, rememberReturnLocation, restoreReturnLocation, clearReturnLocation } =
  useNavigation({
    // กลับมาหน้าจดรายการแล้วต้องออกจากโหมดเลือกหลายรายการเสมอ
    onNavigate: (page) => {
      if (page === 'record') selectionMode.value = false
    },
  })

// undo ต้องเกิดก่อน tx เพราะ tx ต้องรู้ว่าจะเปิดหน้าต่าง "เลิกทำ" ที่ไหน
// ส่วน restore อ้างถึง tx แบบ lazy จึงไม่เป็นวงกลม
const undo = useUndoDelete({ restore: (transaction) => tx.restoreTransaction(transaction) })

const auth = useAuth({
  onMessage: showMessage,
  onError: showError,
  onSessionActive: async () => {
    await tx.loadTransactions()
    await loadAchievements()
    await checkAchievements()
    await tx.flushOfflineQueue()
  },
  onSessionCleared: () => clearAuthenticatedState(),
  onSignedIn: () => {
    demoMode.value = false
  },
  rememberReturnLocation,
  restoreReturnLocation,
  clearReturnLocation,
})

const tx = useTransactions({
  userId: auth.userId,
  isDemoMode: () => demoMode.value,
  onMessage: showMessage,
  onError: showError,
  clearError,
  handleAuthError: auth.handleAuthError,
  onMutated: async () => {
    await checkAchievements()
  },
  onDeleted: undo.offerUndo,
  onBeforeBulkChange: undo.clearUndo,
})

const { session, authReady, authError, sessionExpired, signingOut, passwordRecovery } = auth
const { signOut, finishPasswordRecovery, cancelPasswordRecovery } = auth
const { deletedTransaction, undoBusy, clearUndo, undoDelete } = undo
const {
  transactions,
  editingTransaction,
  formVersion,
  loading,
  saving,
  bulkBusy,
  busyId,
  isOnline,
  offlineSyncing,
  offlinePendingCount,
  saveTransaction,
  editTransaction,
  deleteTransaction,
  flushOfflineQueue,
} = tx

const recordTransactions = computed(() =>
  transactions.value.filter(({ transaction_date }) => transaction_date === selectedRecordDate.value),
)

const filteredTransactions = computed(() => {
  if (viewMode.value === 'all') return transactions.value
  if (!isOverviewMonthValid.value) return []

  return transactions.value.filter(({ transaction_date }) =>
    transaction_date.startsWith(selectedOverviewMonth.value),
  )
})

const overviewPeriodLabel = computed(() => {
  if (viewMode.value === 'all') return 'เงินทั้งหมด'
  if (!isOverviewMonthValid.value) return 'เลือกเดือน'

  return new Intl.DateTimeFormat('th-TH', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${selectedOverviewMonth.value}-01T12:00:00`))
})

const previousOverviewMonth = computed(() => {
  if (!isOverviewMonthValid.value) return ''
  const [year, month] = selectedOverviewMonth.value.split('-').map(Number)
  const previous = new Date(year, month - 2, 1)
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`
})

const previousMonthTransactions = computed(() => {
  if (!previousOverviewMonth.value) return []
  return transactions.value.filter(({ transaction_date }) =>
    transaction_date.startsWith(previousOverviewMonth.value),
  )
})

const displayedTransactions = computed(() =>
  selectionMode.value ? transactions.value : filteredTransactions.value,
)

const sumTransactions = (items: Transaction[], type: TransactionType) =>
  items
    .filter((transaction) => transaction.type === type)
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0)

const income = computed(() => sumTransactions(filteredTransactions.value, 'income'))
const expense = computed(() => sumTransactions(filteredTransactions.value, 'expense'))
const openingBalance = computed(() => {
  if (viewMode.value !== 'month' || !isOverviewMonthValid.value) return 0

  const monthStart = `${selectedOverviewMonth.value}-01`
  const transactionsBeforeMonth = transactions.value.filter(
    ({ transaction_date }) => transaction_date < monthStart,
  )

  return (
    sumTransactions(transactionsBeforeMonth, 'income') -
    sumTransactions(transactionsBeforeMonth, 'expense')
  )
})
const balance = computed(() => openingBalance.value + income.value - expense.value)

const recordIncome = computed(() => sumTransactions(recordTransactions.value, 'income'))
const recordExpense = computed(() => sumTransactions(recordTransactions.value, 'expense'))
const recordBalance = computed(() => {
  const transactionsThroughSelectedDate = transactions.value.filter(
    ({ transaction_date }) => transaction_date <= selectedRecordDate.value,
  )

  return (
    sumTransactions(transactionsThroughSelectedDate, 'income') -
    sumTransactions(transactionsThroughSelectedDate, 'expense')
  )
})

const allIncome = computed(() => sumTransactions(transactions.value, 'income'))
const allExpense = computed(() => sumTransactions(transactions.value, 'expense'))
const allBalance = computed(() => allIncome.value - allExpense.value)

const {
  rows: achievementRows,
  unlockedCount: achievementsUnlocked,
  totalCount: achievementsTotal,
  progressPercent: achievementsPercent,
  loading: achievementsLoading,
  errorMessage: achievementsError,
  currentPending: pendingBadge,
  loadAchievements,
  checkAchievements,
  dismissPending,
  reset: resetAchievements,
} = useAchievements({
  transactions: () => transactions.value,
  balance: allBalance,
  userId: () => session.value?.user.id ?? null,
  demoMode,
})

// ความสำเร็จเป็นฟีเจอร์เสริม แต่ถ้าเขียน/อ่านไม่สำเร็จต้องให้ผู้ใช้เห็นสาเหตุ ไม่ใช่เงียบไป
watch(achievementsError, (message) => {
  if (message) errorMessage.value = message
})

const isRecordToday = computed(() => selectedRecordDate.value === todayDate)

const recordDateLabel = computed(() =>
  new Intl.DateTimeFormat('th-TH', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${selectedRecordDate.value}T12:00:00`)),
)

const shiftRecordDate = (amount: number) => {
  const date = new Date(`${selectedRecordDate.value}T12:00:00`)
  date.setDate(date.getDate() + amount)
  const nextDate = toLocalIsoDate(date)
  if (nextDate <= todayDate) selectedRecordDate.value = nextDate
}

const goToToday = () => {
  selectedRecordDate.value = todayDate
}

const emptyListHint = computed(() => {
  if (selectionMode.value || viewMode.value === 'all') {
    return 'ยังไม่มีรายการ ลองเพิ่มรายรับหรือรายจ่ายรายการแรก'
  }
  if (!selectedOverviewMonth.value) return 'เลือกเดือนที่ต้องการดูรายการ'
  return `ยังไม่มีรายการใน${overviewPeriodLabel.value}`
})

const handleMonthlyExport = async () => {
  if (exportBusy.value || viewMode.value !== 'month') return

  if (!isOverviewMonthValid.value) {
    errorMessage.value = 'กรุณาเลือกเดือนที่ต้องการส่งออกให้ถูกต้อง'
    return
  }

  if (filteredTransactions.value.length === 0) {
    errorMessage.value = 'เดือนนี้ยังไม่มีข้อมูลให้ส่งออก'
    return
  }

  exportBusy.value = true
  errorMessage.value = ''

  try {
    const result = await exportMonthlyCsv({
      month: selectedOverviewMonth.value,
      monthLabel: overviewPeriodLabel.value,
      transactions: filteredTransactions.value,
      openingBalance: openingBalance.value,
      income: income.value,
      expense: expense.value,
      closingBalance: balance.value,
    })

    if (result === 'downloaded') showMessage('ดาวน์โหลดรายงาน CSV เรียบร้อยแล้ว')
    if (result === 'shared') showMessage('สร้างรายงานพร้อมแชร์เรียบร้อยแล้ว')
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? `ส่งออกรายงานไม่สำเร็จ: ${error.message}`
      : 'ส่งออกรายงานไม่สำเร็จ กรุณาลองอีกครั้ง'
  } finally {
    exportBusy.value = false
  }
}

const enterDemoMode = () => {
  demoMode.value = true
  clearError()
  clearUndo()
  tx.setTransactions(createDemoTransactions())
  selectedRecordDate.value = todayDate
  selectedOverviewMonth.value = todayDate.slice(0, 7)
  viewMode.value = 'month'
  selectionMode.value = false
  navigateTo('record')
  void loadAchievements()
  showMessage('เข้าโหมดดูตัวอย่างแล้ว ข้อมูลทั้งหมดเป็นตัวอย่างสมมติ')
}

const exitDemoMode = () => {
  demoMode.value = false
  clearAuthenticatedState()
  navigateTo('record')
}

/** เลือกวันจากปฏิทินความร้อนแล้วกระโดดไปหน้าจดรายการของวันนั้น */
const openRecordDay = (date: string) => {
  if (date > todayDate) return
  selectedRecordDate.value = date
  navigateTo('record')
}

const startSelectionMode = async () => {
  viewMode.value = 'all'
  selectionMode.value = true
  navigateTo('overview')
  await nextTick()
  document.querySelector('.overview-list')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

/** ปิดโหมดเลือกหลายรายการเมื่อการลบสำเร็จ ส่วนที่เหลือ useTransactions จัดการเอง */
const handleBulkDelete = async (ids: number[]) => {
  if (await tx.deleteSelectedTransactions(ids)) selectionMode.value = false
}

const handleResetAll = async () => {
  if (await tx.resetAllTransactions()) {
    selectionMode.value = false
    settingsOpen.value = false
  }
}

/** ล้างทุกอย่างที่ผูกกับผู้ใช้คนก่อน ใช้ตอนออกจากระบบหรือสลับบัญชี */
const clearAuthenticatedState = () => {
  clearUndo()
  resetAchievements()
  tx.resetState()
  selectionMode.value = false
  settingsOpen.value = false
  achievementsOpen.value = false
  exportBusy.value = false
  clearMessages()
}

// การถอด listener ของ hash, undo timer และ auth subscription
// อยู่ใน onBeforeUnmount ของแต่ละ composable แล้ว
onMounted(() => void auth.initialize())
</script>

<template>
  <main v-if="!authReady" class="auth-loading-page" role="status" aria-live="polite">
    <div class="auth-loading-card">
      <span class="auth-loading-spinner" aria-hidden="true"></span>
      <strong>กำลังตรวจสอบการเข้าสู่ระบบ</strong>
      <small>รอสักครู่นะ</small>
    </div>
  </main>

  <PasswordResetScreen
    v-else-if="passwordRecovery"
    @done="finishPasswordRecovery"
    @cancel="cancelPasswordRecovery"
  />

  <AuthGate
    v-else-if="!session && !demoMode"
    :initial-error="sessionExpired
      ? 'เซสชันหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่ ระบบจะพากลับไปหน้าที่ค้างไว้'
      : authError"
    @demo="enterDemoMode"
  />

  <div v-else class="app-shell" :class="{ 'app-shell--demo': demoMode }">
    <header class="topbar">
      <nav class="navbar container">
        <a class="brand" href="#record" aria-label="Money Flow หน้าจดรายการ" @click="activePage = 'record'">
          <span class="brand-mark">฿</span>
          <span>Money Flow</span>
        </a>

        <div class="page-nav" role="navigation" aria-label="เมนูหลัก">
          <button type="button" :class="{ active: activePage === 'record' }" @click="navigateTo('record')">
            <span aria-hidden="true">＋</span> จดรายการ
          </button>
          <button type="button" :class="{ active: activePage === 'overview' }" @click="navigateTo('overview')">
            <span aria-hidden="true">▥</span> ภาพรวม
          </button>
          <button type="button" :class="{ active: activePage === 'bubbles' }" @click="navigateTo('bubbles')">
            <span aria-hidden="true">◍</span> ฟองเงิน
          </button>
        </div>

        <div class="nav-actions">
          <span
            v-if="!isOnline || offlinePendingCount > 0"
            class="offline-badge"
            :class="{ 'offline-badge--syncing': isOnline && offlineSyncing }"
            role="status"
            aria-live="polite"
            :title="!isOnline
              ? 'ไม่มีการเชื่อมต่ออินเทอร์เน็ต รายการที่จดจะถูกเก็บไว้ในคิว'
              : `มี ${offlinePendingCount} รายการรอซิงก์`"
          >
            <span class="offline-dot" aria-hidden="true"></span>
            <span class="offline-copy">
              <small>{{ !isOnline ? 'ออฟไลน์' : offlineSyncing ? 'กำลังซิงก์' : 'รอซิงก์' }}</small>
              <b v-if="offlinePendingCount > 0">{{ offlinePendingCount }} รายการ</b>
              <b v-else>เก็บไว้ในเครื่อง</b>
            </span>
            <button
              v-if="isOnline && offlinePendingCount > 0 && !offlineSyncing"
              type="button"
              class="offline-retry"
              aria-label="ลองซิงก์อีกครั้ง"
              @click="flushOfflineQueue()"
            >
              ซิงก์
            </button>
          </span>

          <span
            class="connection-badge"
            :class="demoMode ? 'demo-badge' : 'connected'"
            :title="demoMode ? 'โหมดดูตัวอย่าง' : session?.user.email ?? 'เข้าสู่ระบบแล้ว'"
          >
            <span class="connection-dot"></span>
            <span class="account-copy">
              <small>{{ demoMode ? 'โหมดดูตัวอย่าง' : 'เข้าสู่ระบบแล้ว' }}</small>
              <b>{{ demoMode ? DEMO_USER_EMAIL : session?.user.email ?? 'บัญชีผู้ใช้' }}</b>
            </span>
          </span>
          <button
            v-if="demoMode"
            class="logout-trigger"
            type="button"
            aria-label="ออกจากโหมดดูตัวอย่าง"
            title="ออกจากโหมดดูตัวอย่าง"
            @click="exitDemoMode"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10M14 8l4 4-4 4M9 12h9" />
            </svg>
          </button>
          <button
            v-else
            class="logout-trigger"
            type="button"
            :disabled="signingOut"
            :aria-label="signingOut ? 'กำลังออกจากระบบ' : 'ออกจากระบบ'"
            title="ออกจากระบบ"
            @click="signOut"
          >
            <span v-if="signingOut" class="logout-spinner" aria-hidden="true"></span>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10M14 8l4 4-4 4M9 12h9" />
            </svg>
          </button>
          <button
            class="achievements-trigger"
            type="button"
            :aria-label="`เปิดตู้ความสำเร็จ ปลดล็อคแล้ว ${achievementsUnlocked} จาก ${achievementsTotal} ใบ`"
            :title="`ความสำเร็จ ${achievementsUnlocked}/${achievementsTotal}`"
            @click="achievementsOpen = true"
          >
            <span aria-hidden="true">🏆</span>
            <b v-if="achievementsUnlocked > 0" aria-hidden="true">{{ achievementsUnlocked }}</b>
          </button>
          <button class="settings-trigger" type="button" aria-label="เปิดการตั้งค่า" @click="settingsOpen = true">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 8.7a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6Z" />
              <path d="M19.3 13.4c.1-.5.1-1 0-1.4l1.7-1.3-2-3.4-2 .8c-.4-.3-.8-.5-1.2-.7L15.5 5h-4l-.3 2.4c-.4.2-.8.4-1.2.7l-2-.8-2 3.4L7.7 12c-.1.5-.1 1 0 1.4L6 14.7l2 3.4 2-.8c.4.3.8.5 1.2.7l.3 2.4h4l.3-2.4c.4-.2.8-.4 1.2-.7l2 .8 2-3.4-1.7-1.3Z" />
            </svg>
          </button>
        </div>
      </nav>
    </header>

    <main class="container dashboard">
      <aside v-if="demoMode" class="demo-banner" role="status">
        <div class="demo-banner__icon" aria-hidden="true">👀</div>
        <div class="demo-banner__copy">
          <strong>กำลังดูตัวอย่างแอป</strong>
          <p>
            ข้อมูล 6 เดือนนี้เป็นตัวอย่างสมมติ ลองกดดูกราฟ สลับเดือน และเปิดสัดส่วนหมวดหมู่ได้เต็มที่
            แต่เพิ่ม แก้ไข หรือลบไม่ได้
          </p>
        </div>
        <button type="button" @click="exitDemoMode">เข้าสู่ระบบ</button>
      </aside>

      <aside v-else-if="!isSupabaseConfigured" class="setup-notice" role="status">
        <div class="setup-notice__icon">!</div>
        <div>
          <strong>ยังไม่ได้เชื่อมฐานข้อมูล</strong>
          <p>ใส่ Project URL และ Anon Key ในไฟล์ <code>.env</code> แล้วเปิดเว็บใหม่</p>
        </div>
      </aside>

      <aside v-if="canInstall" class="install-banner" role="complementary">
        <div class="install-banner__icon" aria-hidden="true">⬇</div>
        <div class="install-banner__copy">
          <strong>ติดตั้ง Money Flow ไว้บนเครื่อง</strong>
          <p>เปิดได้จากหน้าโฮมเหมือนแอปทั่วไป และใช้จดรายการตอนไม่มีเน็ตได้</p>
        </div>
        <button class="install-banner__primary" type="button" :disabled="installBusy" @click="installApp">
          {{ installBusy ? 'กำลังติดตั้ง...' : 'ติดตั้ง' }}
        </button>
        <button
          class="install-banner__close"
          type="button"
          aria-label="ไม่ติดตั้งตอนนี้"
          @click="dismissInstall()"
        >
          ×
        </button>
      </aside>

      <div v-if="errorMessage" class="alert alert--error" role="alert">
        <span>!</span>{{ errorMessage }}
        <button type="button" aria-label="ปิดข้อความ" @click="errorMessage = ''">×</button>
      </div>

      <div v-if="successMessage" class="toast" role="status">✓ {{ successMessage }}</div>

      <Transition name="undo-toast">
        <div v-if="deletedTransaction" class="undo-toast" role="status">
          <div class="undo-icon" aria-hidden="true">↶</div>
          <div>
            <strong>ลบ “{{ deletedTransaction.description }}” แล้ว</strong>
            <small>กู้คืนได้อีกครู่หนึ่ง</small>
          </div>
          <button type="button" :disabled="undoBusy" @click="undoDelete">
            <span v-if="undoBusy" class="spinner spinner--dark" aria-hidden="true"></span>
            {{ undoBusy ? 'กำลังกู้คืน' : 'เลิกทำ' }}
          </button>
          <button class="undo-close" type="button" aria-label="ปิด" :disabled="undoBusy" @click="clearUndo">×</button>
        </div>
      </Transition>

      <Transition name="page" mode="out-in">
        <section v-if="activePage === 'record'" key="record" class="app-page record-page">
        <header class="page-heading record-heading">
          <div>
            <span>{{ isRecordToday ? 'Quick record' : 'บันทึกย้อนหลัง' }}</span>
            <h1>{{ isRecordToday ? 'วันนี้จดอะไรบ้าง?' : recordDateLabel }}</h1>
          </div>

          <div class="record-heading-actions">
            <div class="day-navigation" role="group" aria-label="เปลี่ยนวันที่บันทึก">
              <button type="button" aria-label="วันก่อนหน้า" title="วันก่อนหน้า" @click="shiftRecordDate(-1)">‹</button>
              <button class="today-jump" type="button" :disabled="isRecordToday" @click="goToToday">
                {{ isRecordToday ? 'วันนี้' : 'กลับวันนี้' }}
              </button>
              <button type="button" aria-label="วันถัดไป" title="วันถัดไป" :disabled="isRecordToday" @click="shiftRecordDate(1)">›</button>
            </div>
            <button class="text-link" type="button" @click="navigateTo('overview')">ดูภาพรวม →</button>
          </div>
        </header>

        <StreakPill class="record-streak" :transactions="transactions" :persist="!demoMode" />

        <div class="record-grid">
          <TransactionForm
            :key="formVersion"
            class="dashboard-form"
            :editing="null"
            :busy="saving"
            :disabled="!isSupabaseConfigured || demoMode"
            :default-date="selectedRecordDate"
            @submit="saveTransaction"
          />

          <section class="today-column" aria-label="รายการวันนี้">
            <DailyCapBar
              class="record-cap"
              :date="selectedRecordDate"
              :transactions="recordTransactions"
              :is-today="isRecordToday"
              @edit="settingsOpen = true"
            />

            <SummaryCards
              :loading="loading && transactions.length === 0"
              :balance="recordBalance"
              :income="recordIncome"
              :expense="recordExpense"
              :balance-label="isRecordToday ? 'ยอดคงเหลือปัจจุบัน' : 'ยอดคงเหลือ ณ วันนั้น'"
              :income-label="isRecordToday ? 'รายรับวันนี้' : 'รายรับวันนั้น'"
              :expense-label="isRecordToday ? 'รายจ่ายวันนี้' : 'รายจ่ายวันนั้น'"
            />
            <TransactionList
              class="record-list"
              :transactions="recordTransactions"
              :loading="loading"
              :busy-id="busyId"
              :selection-mode="false"
              :bulk-busy="bulkBusy"
              :read-only="demoMode"
              :empty-hint="isRecordToday ? 'วันนี้ยังไม่มีรายการ เริ่มจดจากฟอร์มได้เลย' : `${recordDateLabel} ยังไม่มีรายการ`"
              @edit="editTransaction"
              @delete="deleteTransaction"
              @bulk-delete="handleBulkDelete"
              @cancel-selection="selectionMode = false"
            />

            <CategoryDonut
              class="donut-card--wide record-donut"
              :transactions="recordTransactions"
              type="expense"
              show-type-toggle
              eyebrow="Daily breakdown"
              :title="isRecordToday ? 'สัดส่วนหมวดหมู่วันนี้' : `สัดส่วนหมวดหมู่ ${recordDateLabel}`"
              :show-item-date="false"
              :empty-hint="isRecordToday
                ? 'จดรายการของวันนี้แล้วกราฟวงกลมจะแยกสัดส่วนให้ทันที'
                : 'ยังไม่มีรายการของวันนั้น เลือกวันอื่นหรือเพิ่มรายการได้เลย'"
            />
          </section>

          <MoneyBuddy
            class="compact-buddy record-buddy"
            :income="allIncome"
            :expense="allExpense"
            :balance="allBalance"
            :transactions="transactions"
            scope-label="เงินทั้งหมด"
            @edit-salary="settingsOpen = true"
          />
        </div>
      </section>

        <section v-else-if="activePage === 'overview'" key="overview" class="app-page overview-page">
        <section class="overview-panel" aria-labelledby="overview-title">
          <div class="overview-controls">
            <div class="overview-title">
              <div>
                <span>ภาพรวมย้อนหลัง</span>
                <h1 id="overview-title">{{ overviewPeriodLabel }}</h1>
              </div>
              <small>{{ filteredTransactions.length }} รายการ</small>
            </div>

            <div class="overview-filter-controls">
              <div class="overview-tabs" role="group" aria-label="ช่วงเวลาของภาพรวม">
                <button type="button" :class="{ active: viewMode === 'month' }" @click="viewMode = 'month'">
                  รายเดือน
                </button>
                <button type="button" :class="{ active: viewMode === 'all' }" @click="viewMode = 'all'">
                  ทั้งหมด
                </button>
              </div>

              <label v-if="viewMode === 'month'" class="month-picker">
                <span>เลือกเดือน</span>
                <input
                  v-model="selectedOverviewMonth"
                  type="month"
                  :max="todayDate.slice(0, 7)"
                  aria-label="เลือกเดือนที่ต้องการดู"
                />
              </label>

              <button
                v-if="viewMode === 'month'"
                class="export-button"
                type="button"
                :disabled="exportBusy || !isOverviewMonthValid || filteredTransactions.length === 0"
                :title="!isOverviewMonthValid
                  ? 'กรุณาเลือกเดือนให้ถูกต้อง'
                  : filteredTransactions.length === 0
                    ? 'เดือนนี้ยังไม่มีข้อมูลให้ส่งออก'
                    : 'ส่งออกรายงานประจำเดือนเป็นไฟล์ CSV'"
                @click="handleMonthlyExport"
              >
                <span v-if="exportBusy" class="export-spinner" aria-hidden="true"></span>
                <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
                </svg>
                <span>{{ exportBusy ? 'กำลังสร้างไฟล์' : 'Export CSV' }}</span>
                <small v-if="!exportBusy">{{ filteredTransactions.length }} รายการ</small>
              </button>
            </div>
          </div>

          <SummaryCards
            :loading="loading && transactions.length === 0"
            :balance="balance"
            :income="income"
            :expense="expense"
            :balance-label="viewMode === 'month' ? 'ยอดคงเหลือสะสม' : 'ยอดคงเหลือทั้งหมด'"
            :income-label="viewMode === 'month' ? 'รายรับของเดือน' : 'รายรับทั้งหมด'"
            :expense-label="viewMode === 'month' ? 'รายจ่ายของเดือน' : 'รายจ่ายทั้งหมด'"
          />
        </section>

        <HeatmapCalendar
          class="overview-heatmap"
          :transactions="transactions"
          :month="isOverviewMonthValid ? selectedOverviewMonth : todayDate.slice(0, 7)"
          @select-day="openRecordDay"
          @change-month="viewMode = 'month'; selectedOverviewMonth = $event"
        />

        <div class="overview-workspace">
          <TransactionList
            class="overview-list"
            :transactions="displayedTransactions"
            :loading="loading"
            :busy-id="busyId"
            :selection-mode="selectionMode"
            :bulk-busy="bulkBusy"
            :read-only="demoMode"
            :empty-hint="emptyListHint"
            @edit="editTransaction"
            @delete="deleteTransaction"
            @bulk-delete="handleBulkDelete"
            @cancel-selection="selectionMode = false"
          />

          <div class="overview-analysis">
            <CashFlowChart class="compact-chart overview-chart" :transactions="transactions" />
            <div v-if="viewMode === 'month'" class="overview-insights">
              <ExpenseAnalytics
                :transactions="filteredTransactions"
                :previous-transactions="previousMonthTransactions"
                :month-label="overviewPeriodLabel"
              />
            </div>

            <CategoryDonut
              v-else
              class="overview-donut"
              :transactions="filteredTransactions"
              type="expense"
              show-type-toggle
              eyebrow="All-time breakdown"
              title="สัดส่วนหมวดหมู่ทั้งหมด"
              empty-hint="เมื่อมีรายการในระบบ ระบบจะแยกสัดส่วนตามหมวดหมู่ให้ทันที"
            />
          </div>
        </div>
        </section>

        <section v-else key="bubbles" class="app-page bubbles-page">
          <BubbleGalaxy :transactions="transactions" />
        </section>
      </Transition>
    </main>

    <EditTransactionModal
      :transaction="editingTransaction"
      :busy="saving"
      @close="editingTransaction = null"
      @submit="saveTransaction"
    />

    <SettingsModal
      :open="settingsOpen"
      :transaction-count="transactions.length"
      :busy="bulkBusy"
      :read-only="demoMode"
      @close="settingsOpen = false"
      @manage="startSelectionMode"
      @reset="handleResetAll"
    />

    <AchievementGallery
      v-if="achievementsOpen"
      :open="achievementsOpen"
      :rows="achievementRows"
      :unlocked-count="achievementsUnlocked"
      :total-count="achievementsTotal"
      :progress-percent="achievementsPercent"
      :loading="achievementsLoading"
      :read-only="demoMode"
      @close="achievementsOpen = false"
    />

    <AchievementToast :badge="pendingBadge" @done="dismissPending" />
  </div>
</template>

<style scoped>
.auth-loading-page {
  display: grid;
  min-height: 100vh;
  min-height: 100dvh;
  place-items: center;
  padding: 24px;
  color: #fff;
  background: linear-gradient(145deg, #153d30, #1d5a43 58%, #286b4f);
  font-family: 'Noto Sans Thai', sans-serif;
}

.auth-loading-card {
  display: grid;
  min-width: min(300px, 100%);
  justify-items: center;
  gap: 7px;
  padding: 28px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 20px 55px rgba(7, 28, 19, 0.2);
}

.auth-loading-card strong { font-size: 0.82rem; }
.auth-loading-card small { color: rgba(255, 255, 255, 0.62); font-size: 0.64rem; }

.auth-loading-spinner {
  width: 28px;
  height: 28px;
  margin-bottom: 5px;
  border: 3px solid rgba(255, 255, 255, 0.25);
  border-top-color: var(--lime);
  border-radius: 50%;
  animation: auth-spin 0.75s linear infinite;
}

@keyframes auth-spin {
  to { transform: rotate(360deg); }
}

.app-shell {
  min-height: 100vh;
}

.topbar {
  position: sticky;
  z-index: 30;
  top: 0;
  height: 62px;
  color: white;
  background: #194d3b;
  box-shadow: 0 6px 24px rgba(19, 57, 43, 0.14);
}

.navbar {
  height: 100%;
  padding-top: 0;
}

.page-nav {
  position: absolute;
  left: 50%;
  display: flex;
  padding: 3px;
  border: 1px solid rgba(255, 255, 255, 0.11);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.07);
  transform: translateX(-50%);
}

.page-nav button {
  display: inline-flex;
  min-height: 31px;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border: 0;
  border-radius: 7px;
  color: rgba(255, 255, 255, 0.66);
  background: transparent;
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: 0.66rem;
  font-weight: 700;
}

.page-nav button.active {
  color: var(--green);
  background: var(--lime);
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nav-actions .connection-badge {
  max-width: 210px;
  padding: 5px 9px;
  border-radius: 10px;
}

.install-banner {
  position: relative;
  display: flex;
  align-items: center;
  gap: 13px;
  margin-bottom: 12px;
  padding: 13px 15px;
  border: 1px solid #cfe3d6;
  border-radius: 14px;
  background: linear-gradient(120deg, #f2f9f5, #eaf4ee);
}

.install-banner__icon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border-radius: 10px;
  color: #fff;
  background: #2f815c;
  font-size: 0.95rem;
}

.install-banner__copy {
  min-width: 0;
  flex: 1;
}

.install-banner__copy strong {
  color: #1f5d40;
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: 0.74rem;
}

.install-banner__copy p {
  margin: 2px 0 0;
  color: #62736a;
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: 0.63rem;
  line-height: 1.5;
}

.install-banner__primary {
  min-height: 36px;
  flex: 0 0 auto;
  padding: 8px 15px;
  border: 0;
  border-radius: 9px;
  color: #fff;
  background: #2f815c;
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: 0.68rem;
  font-weight: 700;
  cursor: pointer;
}

.install-banner__primary:disabled {
  opacity: 0.6;
  cursor: default;
}

.install-banner__close {
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  border: 0;
  border-radius: 8px;
  color: #7b8a82;
  background: transparent;
  font-size: 1rem;
  cursor: pointer;
}

.install-banner__close:hover {
  color: #1f5d40;
  background: rgba(47, 129, 92, 0.1);
}

.install-banner__primary:focus-visible,
.install-banner__close:focus-visible {
  outline: 3px solid rgba(47, 129, 92, 0.35);
  outline-offset: 2px;
}

@media (max-width: 580px) {
  .install-banner {
    flex-wrap: wrap;
  }

  .install-banner__primary {
    width: 100%;
  }
}

.offline-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 9px;
  border: 1px solid rgba(240, 190, 108, 0.4);
  border-radius: 10px;
  background: rgba(240, 190, 108, 0.16);
}

.offline-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  border-radius: 50%;
  background: #f0be6c;
}

.offline-badge--syncing .offline-dot {
  animation: offline-pulse 1.1s ease-in-out infinite;
}

@keyframes offline-pulse {
  50% { opacity: 0.25; }
}

.offline-copy {
  display: grid;
  min-width: 0;
  line-height: 1.15;
}

.offline-copy small {
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.45rem;
  font-weight: 600;
}

.offline-copy b {
  overflow: hidden;
  color: #f7e2bd;
  font-size: 0.58rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.offline-retry {
  padding: 4px 7px;
  border: 1px solid rgba(247, 226, 189, 0.35);
  border-radius: 7px;
  color: #f7e2bd;
  background: transparent;
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: 0.55rem;
  font-weight: 700;
  cursor: pointer;
}

.offline-retry:hover {
  color: #194d3b;
  background: #f7e2bd;
}

.offline-retry:focus-visible {
  outline: 2px solid rgba(201, 240, 108, 0.55);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .offline-badge--syncing .offline-dot { animation: none; }
}

.account-copy {
  display: grid;
  min-width: 0;
  line-height: 1.15;
}

.account-copy small {
  color: rgba(255, 255, 255, 0.52);
  font-size: 0.45rem;
  font-weight: 600;
}

.account-copy b {
  overflow: hidden;
  color: rgba(255, 255, 255, 0.86);
  font-size: 0.58rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.logout-trigger {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.17);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.78);
  background: rgba(255, 255, 255, 0.07);
  transition: color 0.2s, background 0.2s;
}

.logout-trigger:hover:not(:disabled) {
  color: #194d3b;
  background: #f1d5d1;
}

.logout-trigger:focus-visible,
.settings-trigger:focus-visible {
  outline: 3px solid rgba(201, 240, 108, 0.45);
  outline-offset: 2px;
}

.logout-trigger svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.logout-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: auth-spin 0.7s linear infinite;
}

.achievements-trigger {
  position: relative;
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.17);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.07);
  font-size: 0.92rem;
  line-height: 1;
  transition: background 0.2s, transform 0.2s;
}

.achievements-trigger:hover {
  background: rgba(240, 214, 108, 0.22);
  transform: translateY(-1px);
}

.achievements-trigger:focus-visible {
  outline: 3px solid rgba(201, 240, 108, 0.45);
  outline-offset: 2px;
}

.achievements-trigger b {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 16px;
  padding: 1px 4px;
  border-radius: 999px;
  color: #194d3b;
  background: var(--lime);
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: 0.48rem;
  font-weight: 800;
  line-height: 1.35;
}

.settings-trigger {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.17);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.78);
  background: rgba(255, 255, 255, 0.07);
  transition: color 0.2s, background 0.2s, transform 0.2s;
}

.settings-trigger:hover {
  color: var(--green);
  background: var(--lime);
  transform: rotate(12deg);
}

.settings-trigger svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.dashboard {
  display: block;
  width: min(1180px, calc(100% - 32px));
  min-height: 0;
  padding-block: 12px 28px;
}

.app-page {
  display: block;
}

.page-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 48px;
  gap: 14px;
  padding: 2px 3px 9px;
}

.page-heading span,
.overview-title span {
  color: #71877d;
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.page-heading h1,
.overview-title h1 {
  margin: 1px 0 0;
  color: var(--ink);
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: 1rem;
}

.text-link {
  padding: 6px 8px;
  border: 0;
  color: #356f54;
  background: transparent;
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: 0.65rem;
  font-weight: 700;
}

.record-heading-actions {
  display: flex;
  align-items: center;
  gap: 9px;
}

.day-navigation {
  display: flex;
  align-items: center;
  padding: 3px;
  border: 1px solid #dce4de;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 4px 13px rgba(25, 77, 59, 0.05);
}

.day-navigation button {
  display: grid;
  min-width: 30px;
  height: 30px;
  place-items: center;
  padding: 0 8px;
  border: 0;
  border-radius: 7px;
  color: #426454;
  background: transparent;
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: 1.05rem;
  font-weight: 700;
  transition: color 0.16s, background 0.16s, transform 0.16s;
}

.day-navigation button:hover:not(:disabled) {
  color: #174d36;
  background: #edf5f0;
}

.day-navigation .today-jump {
  min-width: 58px;
  border-inline: 1px solid #edf0ed;
  border-radius: 0;
  font-size: 0.61rem;
}

.day-navigation button:disabled {
  opacity: 0.4;
}

.record-streak {
  margin: 0 3px 11px;
}

.overview-heatmap {
  margin-top: 12px;
}

.record-grid {
  display: grid;
  grid-template-columns: minmax(290px, 0.72fr) minmax(440px, 1.25fr) minmax(285px, 0.7fr);
  align-items: start;
  gap: 12px;
}

.dashboard-form,
.record-buddy,
.record-list,
.record-donut {
  min-width: 0;
  height: auto;
}

.today-column {
  display: grid;
  min-width: 0;
  grid-auto-rows: auto;
  gap: 10px;
}

.overview-panel {
  display: grid;
  grid-template-columns: minmax(230px, 0.55fr) minmax(560px, 1.45fr);
  align-items: stretch;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 8px 24px rgba(23, 45, 36, 0.045);
}

.overview-controls {
  display: flex;
  min-width: 0;
  justify-content: space-between;
  flex-direction: column;
  gap: 8px;
  padding: 4px;
}

.overview-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.overview-title small {
  padding: 4px 7px;
  border-radius: 999px;
  color: #61796e;
  background: #edf3ef;
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: 0.57rem;
  white-space: nowrap;
}

.overview-filter-controls {
  display: grid;
  grid-template-columns: minmax(130px, 0.85fr) minmax(150px, 1.15fr);
  align-items: end;
  gap: 7px;
}

.overview-tabs {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  padding: 3px;
  border-radius: 9px;
  background: #e9efeb;
}

.overview-tabs button {
  min-height: 34px;
  padding: 4px 7px;
  border: 0;
  border-radius: 7px;
  color: #728078;
  background: transparent;
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: 0.62rem;
  font-weight: 700;
}

.overview-tabs button.active {
  color: #20563e;
  background: #fff;
  box-shadow: 0 2px 7px rgba(25, 77, 59, 0.1);
}

.month-picker {
  display: grid;
  min-width: 0;
  gap: 3px;
  color: #71877d;
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: 0.53rem;
  font-weight: 700;
}

.month-picker input {
  width: 100%;
  min-width: 0;
  height: 40px;
  padding: 6px 9px;
  border: 1px solid #dce4de;
  border-radius: 9px;
  color: #294d3e;
  background: #fff;
  font: 600 0.66rem 'Noto Sans Thai', sans-serif;
  color-scheme: light;
  outline: none;
  transition: border-color 0.16s, box-shadow 0.16s;
}

.month-picker input:focus {
  border-color: #6d9c83;
  box-shadow: 0 0 0 3px rgba(73, 137, 103, 0.12);
}

.export-button {
  display: flex;
  grid-column: 1 / -1;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 8px 11px;
  border: 1px solid #194d3b;
  border-radius: 10px;
  color: #fff;
  background: linear-gradient(135deg, #194d3b, #286b4f);
  box-shadow: 0 6px 16px rgba(25, 77, 59, 0.16);
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: 0.66rem;
  font-weight: 800;
  transition: transform 0.16s, box-shadow 0.16s, opacity 0.16s;
}

.export-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(25, 77, 59, 0.22);
}

.export-button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
  box-shadow: none;
}

.export-button svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.export-button small {
  margin-left: auto;
  padding: 2px 6px;
  border-radius: 999px;
  color: #194d3b;
  background: var(--lime);
  font-size: 0.52rem;
  font-weight: 800;
}

.export-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

.overview-workspace {
  display: grid;
  grid-template-columns: minmax(480px, 1.4fr) minmax(320px, 0.75fr);
  align-items: start;
  gap: 12px;
  margin-top: 12px;
}

.overview-analysis {
  display: grid;
  min-width: 0;
  gap: 12px;
}

.overview-insights,
.overview-list,
.overview-chart,
.overview-donut {
  min-width: 0;
  height: auto;
}

.demo-banner {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
  margin-bottom: 11px;
  padding: 11px 13px;
  border: 1px solid #e5dcc0;
  border-radius: 13px;
  background: #fcf8ea;
  font-family: 'Noto Sans Thai', sans-serif;
}

.demo-banner__icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 11px;
  background: #f5eccc;
  font-size: 1rem;
}

.demo-banner__copy strong {
  color: #6f5c22;
  font-size: 0.74rem;
}

.demo-banner__copy p {
  margin: 2px 0 0;
  color: #8d7c4e;
  font-size: 0.62rem;
  line-height: 1.5;
}

.demo-banner button {
  min-height: 34px;
  padding: 7px 13px;
  border: 1px solid #194d3b;
  border-radius: 9px;
  color: #fff;
  background: #194d3b;
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: 0.65rem;
  font-weight: 800;
  white-space: nowrap;
}

.demo-badge {
  border-color: rgba(240, 214, 108, 0.35) !important;
  background: rgba(240, 214, 108, 0.14) !important;
}

.demo-badge .connection-dot {
  background: #f0d66c;
}

.undo-toast {
  position: fixed;
  z-index: 80;
  right: 22px;
  bottom: 22px;
  display: grid;
  max-width: min(390px, calc(100% - 24px));
  grid-template-columns: 34px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: 14px;
  color: white;
  background: #193c2f;
  box-shadow: 0 18px 50px rgba(10, 35, 25, 0.28);
  font-family: 'Noto Sans Thai', sans-serif;
}

.undo-icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 10px;
  color: #194d3b;
  background: var(--lime);
  font-size: 1rem;
  font-weight: 800;
}

.undo-toast strong,
.undo-toast small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.undo-toast strong { font-size: 0.72rem; }
.undo-toast small { margin-top: 2px; color: rgba(255, 255, 255, 0.58); font-size: 0.58rem; }

.undo-toast > button:not(.undo-close) {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border: 1px solid rgba(201, 240, 108, 0.42);
  border-radius: 8px;
  color: var(--lime);
  background: rgba(201, 240, 108, 0.08);
  font-size: 0.65rem;
  font-weight: 800;
}

.undo-close {
  padding: 3px;
  border: 0;
  color: rgba(255, 255, 255, 0.5);
  background: transparent;
  font-size: 1rem;
}

.undo-toast-enter-active,
.undo-toast-leave-active {
  transition: opacity 0.2s ease, transform 0.28s cubic-bezier(.2, .9, .2, 1);
}

.undo-toast-enter-from,
.undo-toast-leave-to {
  opacity: 0;
  transform: translateY(16px) scale(0.97);
}

.page-enter-active,
.page-leave-active {
  transition: opacity 0.2s ease, transform 0.24s cubic-bezier(.2, .8, .2, 1);
}

.page-enter-from {
  opacity: 0;
  transform: translateY(9px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (prefers-reduced-motion: reduce) {
  .page-enter-active,
  .page-leave-active {
    transition: none;
  }
}

@media (max-width: 1100px) {
  .record-grid {
    grid-template-columns: minmax(290px, 0.7fr) minmax(430px, 1.3fr);
  }

  .record-buddy {
    grid-column: 1 / -1;
  }

  .overview-panel {
    grid-template-columns: 1fr;
  }

  .overview-controls {
    display: grid;
    grid-template-columns: 1fr minmax(260px, 0.7fr);
    align-items: center;
  }
}

@media (max-width: 780px) {
  .dashboard { min-height: auto; }
  .app-page { flex: none; }
  .page-nav { position: static; transform: none; }
  .record-grid,
  .overview-workspace { grid-template-columns: 1fr; }
  .record-buddy { grid-column: auto; }
  .dashboard-form,
  .record-buddy,
  .record-list,
  .overview-list,
  .overview-analysis,
  .overview-chart { height: auto; }
}

@media (max-width: 580px) {
  .undo-toast {
    right: 12px;
    bottom: 12px;
    left: 12px;
    grid-template-columns: 30px minmax(0, 1fr) auto;
  }
  .undo-close { display: none; }
  .undo-icon { width: 30px; height: 30px; }
  .topbar { height: auto; min-height: 58px; }
  .navbar { flex-wrap: wrap; gap: 7px; padding-block: 9px; }
  .brand > span:last-child { display: none; }
  .page-nav { order: 3; width: 100%; }
  .page-nav button { flex: 1; justify-content: center; }
  .connection-badge { max-width: 145px; font-size: 0.6rem; }
  .dashboard { padding-top: 9px; }
  .page-heading { min-height: 44px; }
  .record-heading { align-items: stretch; flex-direction: column; gap: 7px; }
  .record-heading-actions { justify-content: space-between; }
  .day-navigation { flex: 1; }
  .day-navigation .today-jump { flex: 1; }
  .overview-panel { gap: 8px; padding: 8px; }
  .overview-controls { grid-template-columns: 1fr; }
  .overview-filter-controls { grid-template-columns: 1fr; }
  .record-grid,
  .overview-analysis,
  .overview-workspace,
  .today-column { gap: 9px; }
  .overview-workspace { margin-top: 9px; }
  .overview-heatmap { margin-top: 9px; }
  .record-streak { margin: 0 1px 9px; }
  .demo-banner { grid-template-columns: 32px minmax(0, 1fr); }
  .demo-banner__icon { width: 32px; height: 32px; border-radius: 9px; }
  .demo-banner button { grid-column: 1 / -1; }
}
</style>
