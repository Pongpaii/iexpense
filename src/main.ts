import { createApp, h } from 'vue'
import App from './App.vue'
import ErrorBoundary from './components/ErrorBoundary.vue'
import { initializeTheme } from './composables/useTheme'
import { initMonitoring, reportError } from './lib/monitoring'
import './style.css'
import './opium.css'

// Apply the persisted theme before Vue renders to avoid a flash of the default theme.
initializeTheme()

// ครอบ App ด้วย ErrorBoundary ที่ระดับ root: ถ้า component ไหนพังกลางทาง
// ผู้ใช้จะเห็นการ์ดบอกวิธีแก้ ไม่ใช่หน้าจอขาวเปล่า ๆ
const app = createApp({
  name: 'MoneyFlowRoot',
  render: () => h(ErrorBoundary, null, { default: () => h(App) }),
})

// onErrorCaptured จับได้แค่ error ที่เกิดในลูกของ boundary
// errorHandler จับที่เหลือของ Vue
app.config.errorHandler = (error, _instance, info) => {
  console.error('[vue:error]', info, error)
  reportError(error, { source: 'vue:errorHandler', info })
}

app.config.warnHandler = (message, _instance, trace) => {
  if (import.meta.env.DEV) console.warn('[vue:warn]', message, trace)
}

// Promise ที่ reject ทิ้งไว้ไม่ผ่าน Vue จึงต้องดักแยก
window.addEventListener('unhandledrejection', (event) => {
  console.error('[unhandledrejection]', event.reason)
  reportError(event.reason, { source: 'unhandledrejection' })
})

window.addEventListener('error', (event) => {
  reportError(event.error ?? event.message, { source: 'window:error' })
})

// ไม่ await: monitoring เป็นของเสริม อย่าให้การแสดงหน้าจอต้องรอ network
void initMonitoring(app)

app.mount('#app')
