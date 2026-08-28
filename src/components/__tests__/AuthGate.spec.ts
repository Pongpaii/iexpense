import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const signInWithPassword = vi.fn()
const resetPasswordForEmail = vi.fn()

// ต้อง mock ก่อน import คอมโพเนนต์ เพราะ AuthGate เรียก supabase ตรง ๆ
vi.mock('../../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => signInWithPassword(...args),
      resetPasswordForEmail: (...args: unknown[]) => resetPasswordForEmail(...args),
    },
  },
}))

const AuthGate = (await import('../AuthGate.vue')).default

type GateWrapper = VueWrapper<InstanceType<typeof AuthGate>>

const mountGate = (props: Record<string, unknown> = {}): GateWrapper =>
  mount(AuthGate, { props }) as GateWrapper

const signIn = async (wrapper: GateWrapper, email: string, password: string) => {
  await wrapper.find('#auth-email').setValue(email)
  await wrapper.find('#auth-password').setValue(password)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

beforeEach(() => {
  signInWithPassword.mockReset().mockResolvedValue({ error: null })
  resetPasswordForEmail.mockReset().mockResolvedValue({ error: null })
})

describe('AuthGate', () => {
  it('แสดงฟอร์มเข้าสู่ระบบเป็นหน้าเริ่มต้น', () => {
    const wrapper = mountGate()

    expect(wrapper.find('#auth-email').exists()).toBe(true)
    expect(wrapper.find('#auth-password').exists()).toBe(true)
  })

  it('แสดงข้อความ error ที่ส่งมาจากภายนอก เช่น เซสชันหมดอายุ', () => {
    const wrapper = mountGate({ initialError: 'เซสชันหมดอายุแล้ว' })

    expect(wrapper.text()).toContain('เซสชันหมดอายุแล้ว')
  })

  describe('การเข้าสู่ระบบ', () => {
    it('ส่งอีเมลและรหัสผ่านไปที่ Supabase', async () => {
      const wrapper = mountGate()
      await signIn(wrapper, 'user@example.com', 'secret123')

      expect(signInWithPassword).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'secret123',
      })
    })

    it('ตัดช่องว่างหัวท้ายของอีเมลก่อนส่ง', async () => {
      const wrapper = mountGate()
      await signIn(wrapper, '  user@example.com  ', 'secret123')

      expect(signInWithPassword).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'user@example.com' }),
      )
    })

    it('ไม่ยิงคำขอเมื่อยังกรอกไม่ครบ', async () => {
      const wrapper = mountGate()
      await wrapper.find('#auth-email').setValue('user@example.com')
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(signInWithPassword).not.toHaveBeenCalled()
    })

    it('ยิงคำขอครั้งเดียวแม้กด submit ซ้ำระหว่างรอผล', async () => {
      let release: (value: { error: null }) => void = () => {}
      signInWithPassword.mockReturnValue(
        new Promise<{ error: null }>((resolve) => {
          release = resolve
        }),
      )

      const wrapper = mountGate()
      await wrapper.find('#auth-email').setValue('user@example.com')
      await wrapper.find('#auth-password').setValue('secret123')
      await wrapper.find('form').trigger('submit')
      await wrapper.find('form').trigger('submit')

      expect(signInWithPassword).toHaveBeenCalledTimes(1)

      release({ error: null })
      await flushPromises()
    })

    it('แสดงข้อความที่อ่านเข้าใจได้เมื่อเข้าสู่ระบบไม่ผ่าน', async () => {
      signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })

      const wrapper = mountGate()
      await signIn(wrapper, 'user@example.com', 'wrong-password')

      // ต้องไม่โชว์ข้อความดิบของ Supabase และไม่บอกว่าอีเมลนี้มีอยู่จริงหรือไม่
      expect(wrapper.text()).not.toContain('Invalid login credentials')
      expect(wrapper.find('.auth-error, [role="alert"]').exists()).toBe(true)
    })

    it('ล้างรหัสผ่านออกจากฟอร์มเมื่อเข้าสู่ระบบสำเร็จ', async () => {
      const wrapper = mountGate()
      await signIn(wrapper, 'user@example.com', 'secret123')

      expect((wrapper.find('#auth-password').element as HTMLInputElement).value).toBe('')
    })

    it('สลับการมองเห็นรหัสผ่านได้', async () => {
      const wrapper = mountGate()
      const toggle = wrapper.find('.password-field button')

      expect(wrapper.find('#auth-password').attributes('type')).toBe('password')

      await toggle.trigger('click')

      expect(wrapper.find('#auth-password').attributes('type')).toBe('text')
    })
  })

  describe('การขอลิงก์ตั้งรหัสผ่านใหม่', () => {
    const openForgotMode = async (wrapper: GateWrapper) => {
      const forgot = wrapper
        .findAll('.text-button')
        .find((button) => button.text().includes('ลืมรหัสผ่าน'))
      await forgot?.trigger('click')
    }

    /** โหมดลืมรหัสผ่านใช้ id คนละตัวกับฟอร์มเข้าสู่ระบบ */
    const requestResetLink = async (wrapper: GateWrapper, email: string) => {
      await wrapper.find('#reset-email').setValue(email)
      await wrapper.find('form').trigger('submit')
      await flushPromises()
    }

    it('สลับเข้าโหมดลืมรหัสผ่านได้', async () => {
      const wrapper = mountGate()
      await openForgotMode(wrapper)

      expect(wrapper.text()).toContain('ตั้งรหัสผ่านใหม่')
    })

    it('ส่งอีเมลขอลิงก์แล้วแสดงผลว่าส่งแล้ว', async () => {
      const wrapper = mountGate()
      await openForgotMode(wrapper)
      await requestResetLink(wrapper, 'user@example.com')

      expect(resetPasswordForEmail).toHaveBeenCalledWith(
        'user@example.com',
        expect.objectContaining({ redirectTo: expect.any(String) }),
      )
      expect(wrapper.text()).toContain('ส่งลิงก์ตั้งรหัสผ่านแล้ว')
    })

    it('ไม่ยิงคำขอเมื่อยังไม่กรอกอีเมล', async () => {
      const wrapper = mountGate()
      await openForgotMode(wrapper)
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(resetPasswordForEmail).not.toHaveBeenCalled()
    })

    it('กลับไปหน้าเข้าสู่ระบบได้หลังส่งลิงก์แล้ว', async () => {
      const wrapper = mountGate()
      await openForgotMode(wrapper)
      await requestResetLink(wrapper, 'user@example.com')

      await wrapper.find('.secondary-button').trigger('click')

      expect(wrapper.find('#auth-password').exists()).toBe(true)
    })
  })

  it('มีทางเข้าโหมดดูตัวอย่างที่ส่ง event demo', async () => {
    const wrapper = mountGate()
    const demoButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('ตัวอย่าง'))

    await demoButton?.trigger('click')

    expect(wrapper.emitted('demo')).toHaveLength(1)
  })
})
