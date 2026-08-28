import type { App } from 'vue'

/**
 * การรายงาน error ไปยัง Sentry
 *
 * ปิดอยู่โดยค่าเริ่มต้น เปิดเมื่อใส่ VITE_SENTRY_DSN เท่านั้น
 * และโหลด SDK ด้วย dynamic import เพื่อไม่ให้ก้อน bundle หลักโตขึ้น
 * สำหรับคนที่ไม่ได้ใช้ (แอปนี้เปิดบนมือถือ ทุก kB มีความหมาย)
 */

const dsn = import.meta.env.VITE_SENTRY_DSN?.trim()

export const isMonitoringEnabled = Boolean(dsn)

const parseSampleRate = (value: string | undefined) => {
  const rate = Number(value)
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) return 0.1
  return rate
}

/** ตัวส่ง error ที่ใช้จริง จะถูกแทนเมื่อ Sentry โหลดเสร็จ */
let report: (error: unknown, context?: Record<string, unknown>) => void = () => {}

/**
 * ส่ง error ที่ดักไว้เองไปยังระบบ monitoring
 * เรียกได้เสมอ ถ้าไม่ได้เปิด monitoring ไว้ก็ไม่เกิดอะไรขึ้น
 */
export const reportError = (error: unknown, context?: Record<string, unknown>) => {
  report(error, context)
}

export const initMonitoring = async (app: App) => {
  if (!dsn) return

  try {
    const Sentry = await import('@sentry/vue')

    Sentry.init({
      app,
      dsn,
      environment: import.meta.env.VITE_APP_ENV ?? import.meta.env.MODE,
      tracesSampleRate: parseSampleRate(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE),
      // แอปนี้เก็บข้อมูลการเงินส่วนบุคคล จึงไม่ส่งเนื้อหาที่ผู้ใช้กรอกออกไป
      sendDefaultPii: false,
      beforeSend: (event) => {
        // ตัด query string ทิ้ง เผื่อมี token จากลิงก์อีเมลติดมากับ URL
        if (event.request?.url) {
          event.request.url = event.request.url.split('?')[0].split('#')[0]
        }
        return event
      },
    })

    report = (error, context) => {
      Sentry.captureException(error, context ? { extra: context } : undefined)
    }
  } catch (error) {
    // ถ้า monitoring ตั้งค่าไม่สำเร็จ แอปต้องยังใช้งานได้ตามปกติ
    console.error('[monitoring] init failed', error)
  }
}
