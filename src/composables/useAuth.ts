import type { Session } from '@supabase/supabase-js'
import { onBeforeUnmount, ref } from 'vue'
import { describeError, isAuthExpiredError } from '../lib/api'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

/**
 * ผลของการเจอ error ที่อาจเกี่ยวกับ token
 * - unrelated: ไม่ใช่เรื่อง auth ให้ caller แสดง error ตามปกติ
 * - refreshed: ต่ออายุ token ได้แล้ว caller ควรลองทำงานเดิมซ้ำ
 * - expired: หลุดออกจากระบบแล้ว caller ไม่ต้องแสดง error อะไรเพิ่ม
 */
export type AuthErrorOutcome = 'unrelated' | 'refreshed' | 'expired'

export type HandleAuthError = (error: unknown) => Promise<AuthErrorOutcome>

export interface UseAuthOptions {
  onMessage: (message: string) => void
  onError: (message: string) => void
  /** มี session พร้อมใช้แล้ว: โหลดข้อมูลของผู้ใช้คนนี้ */
  onSessionActive: () => Promise<void> | void
  /** ไม่มี session หรือเปลี่ยนคน: ล้าง state ของคนก่อนหน้าให้หมด */
  onSessionCleared: () => void
  /** เข้าสู่ระบบสำเร็จ ใช้ปิดโหมดดูตัวอย่าง */
  onSignedIn?: () => void
  rememberReturnLocation: () => void
  restoreReturnLocation: () => void
  clearReturnLocation: () => void
}

export const useAuth = (options: UseAuthOptions) => {
  const session = ref<Session | null>(null)
  /** ยังไม่รู้สถานะล็อกอิน = ห้ามวาดหน้าจอไหนเลย ไม่งั้นจะเห็นหน้า login แวบหนึ่ง */
  const authReady = ref(!isSupabaseConfigured)
  const authError = ref('')
  /** true เมื่อถูกเด้งออกเพราะ token หมดอายุ ไม่ใช่เพราะกดออกจากระบบเอง */
  const sessionExpired = ref(false)
  const signingOut = ref(false)
  /** true เมื่อผู้ใช้เข้ามาจากลิงก์ตั้งรหัสผ่านใหม่ ต้องให้ตั้งรหัสก่อนใช้งานต่อ */
  const passwordRecovery = ref(false)

  let unsubscribeAuth: (() => void) | undefined

  const userId = () => session.value?.user.id ?? null

  /**
   * เซสชันหมดอายุกลางการใช้งานเป็นเรื่องปกติ
   * ลองต่ออายุ token ให้เงียบ ๆ ก่อน ถ้าไม่ได้จริงจึงพาไปหน้าเข้าสู่ระบบ
   * พร้อมข้อความบอกสาเหตุ และจำหน้าเดิมไว้พากลับมา
   */
  const handleAuthError: HandleAuthError = async (error) => {
    if (!supabase || !isAuthExpiredError(error)) return 'unrelated'

    try {
      const { data, error: refreshError } = await supabase.auth.refreshSession()
      if (!refreshError && data.session) {
        session.value = data.session
        return 'refreshed'
      }
    } catch {
      // ต่ออายุไม่ได้ ตกไปที่การบังคับล็อกอินใหม่ด้านล่าง
    }

    options.rememberReturnLocation()
    sessionExpired.value = true
    options.onSessionCleared()
    session.value = null

    try {
      await supabase.auth.signOut({ scope: 'local' })
    } catch {
      // ล้าง token ฝั่ง client ไม่สำเร็จก็ยังถือว่าหลุดออกจากระบบแล้ว
    }

    return 'expired'
  }

  const initialize = async () => {
    if (!supabase) {
      authReady.value = true
      return
    }

    authReady.value = false
    authError.value = ''
    const client = supabase

    try {
      const { data, error } = await client.auth.getSession()
      if (error) throw error

      session.value = data.session
      if (data.session) await options.onSessionActive()

      const { data: authListener } = client.auth.onAuthStateChange((event, nextSession) => {
        if (event === 'PASSWORD_RECOVERY') passwordRecovery.value = true

        // ต่ออายุสำเร็จ ผู้ใช้ไม่ต้องรู้ตัว และไม่ต้องโหลดข้อมูลใหม่
        if (event === 'TOKEN_REFRESHED') {
          session.value = nextSession
          sessionExpired.value = false
          return
        }

        const previousUserId = session.value?.user.id
        const nextUserId = nextSession?.user.id
        session.value = nextSession
        authError.value = ''
        if (nextSession) options.onSignedIn?.()

        if (!nextSession) {
          options.onSessionCleared()
        } else if (nextUserId !== previousUserId) {
          options.onSessionCleared()
          // ถอยออกจาก callback ของ Supabase ก่อนยิง query ชุดใหม่
          setTimeout(() => void options.onSessionActive(), 0)
        }

        if (nextSession && sessionExpired.value) {
          sessionExpired.value = false
          options.restoreReturnLocation()
        }
      })

      unsubscribeAuth = () => authListener.subscription.unsubscribe()
    } catch (error) {
      session.value = null
      authError.value = describeError(error, 'ตรวจสอบสถานะการเข้าสู่ระบบไม่สำเร็จ')
    } finally {
      authReady.value = true
    }
  }

  const signOut = async () => {
    if (!supabase || signingOut.value) return

    signingOut.value = true
    const { error } = await supabase.auth.signOut()

    if (error) {
      options.onError(`ออกจากระบบไม่สำเร็จ: ${describeError(error)}`)
    } else {
      session.value = null
      // ออกจากระบบเองไม่ใช่เซสชันหมดอายุ จึงไม่ต้องพากลับหน้าเดิมตอนล็อกอินใหม่
      sessionExpired.value = false
      options.clearReturnLocation()
      options.onSessionCleared()
    }

    signingOut.value = false
  }

  const finishPasswordRecovery = () => {
    passwordRecovery.value = false
    options.onMessage('ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว ครั้งต่อไปใช้รหัสนี้เข้าสู่ระบบได้เลย')
    if (session.value) void options.onSessionActive()
  }

  const cancelPasswordRecovery = async () => {
    passwordRecovery.value = false
    await signOut()
  }

  onBeforeUnmount(() => unsubscribeAuth?.())

  return {
    session,
    authReady,
    authError,
    sessionExpired,
    signingOut,
    passwordRecovery,
    userId,
    initialize,
    signOut,
    handleAuthError,
    finishPasswordRecovery,
    cancelPasswordRecovery,
  }
}
