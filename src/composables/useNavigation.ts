import { onBeforeUnmount, onMounted, ref } from 'vue'

export type AppPage = 'record' | 'overview' | 'bubbles'

/** ที่เก็บหน้าที่ผู้ใช้ค้างอยู่ ใช้พากลับมาหลังต้องล็อกอินใหม่ */
const RETURN_TO_KEY = 'moneyflow.return-to'

const pageFromHash = (): AppPage => {
  if (window.location.hash === '#overview') return 'overview'
  if (window.location.hash === '#bubbles') return 'bubbles'
  return 'record'
}

export interface UseNavigationOptions {
  /**
   * เรียกทุกครั้งที่หน้าเปลี่ยน ไม่ว่าจะเปลี่ยนจากการกดเมนูหรือจาก hash
   * App ใช้จุดนี้รีเซ็ตโหมดเลือกหลายรายการเมื่อกลับไปหน้าจดรายการ
   */
  onNavigate?: (page: AppPage) => void
}

/**
 * แอปนี้ใช้ hash routing แบบเบา ๆ ไม่ได้ใช้ vue-router
 * composable นี้จึงรับหน้าที่ให้ hash กับ state ตรงกันเสมอ ทั้งตอนกดเมนู
 * ตอนกด back/forward ของเบราว์เซอร์ และตอนเปิดลิงก์ตรงเข้ามา
 */
export const useNavigation = ({ onNavigate }: UseNavigationOptions = {}) => {
  const activePage = ref<AppPage>(pageFromHash())

  const applyPage = (page: AppPage) => {
    activePage.value = page
    onNavigate?.(page)
  }

  const navigateTo = (page: AppPage) => {
    applyPage(page)
    const targetHash = `#${page}`
    if (window.location.hash !== targetHash) window.location.hash = targetHash
  }

  const syncPageFromHash = () => applyPage(pageFromHash())

  const rememberReturnLocation = () => {
    try {
      sessionStorage.setItem(RETURN_TO_KEY, window.location.hash || '#record')
    } catch {
      // sessionStorage ใช้ไม่ได้ในบางโหมด: ยอมเสีย deep link ดีกว่าแอปพัง
    }
  }

  const clearReturnLocation = () => {
    try {
      sessionStorage.removeItem(RETURN_TO_KEY)
    } catch {
      // ไม่มีอะไรต้องทำถ้า sessionStorage ใช้ไม่ได้
    }
  }

  const restoreReturnLocation = () => {
    let target: string | null = null
    try {
      target = sessionStorage.getItem(RETURN_TO_KEY)
    } catch {
      // อ่านไม่ได้ = ถือว่าไม่มีปลายทางที่จำไว้
    }

    // ใช้ครั้งเดียวแล้วทิ้ง ไม่ให้ค้างไปเด้งหน้าผิดในรอบถัดไป
    if (target) clearReturnLocation()

    // ถ้า hash ตรงอยู่แล้ว hashchange จะไม่ยิง ต้อง sync state เอง
    if (target && target !== window.location.hash) {
      window.location.hash = target
      return
    }
    syncPageFromHash()
  }

  onMounted(() => window.addEventListener('hashchange', syncPageFromHash))
  onBeforeUnmount(() => window.removeEventListener('hashchange', syncPageFromHash))

  return {
    activePage,
    navigateTo,
    syncPageFromHash,
    rememberReturnLocation,
    restoreReturnLocation,
    clearReturnLocation,
  }
}
