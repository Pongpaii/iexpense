<script setup lang="ts">
import { computed, ref } from 'vue'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

const props = defineProps<{
  initialError?: string
}>()

const emit = defineEmits<{
  demo: []
}>()

const email = ref('')
const loading = ref(false)
const sent = ref(false)
const errorMessage = ref('')

const displayedError = computed(() => errorMessage.value || props.initialError || '')

const signIn = async () => {
  if (!supabase) {
    errorMessage.value = 'ยังไม่ได้ตั้งค่า Supabase กรุณาตรวจสอบ Environment Variables'
    return
  }

  const normalizedEmail = email.value.trim()
  if (!normalizedEmail || loading.value) return

  loading.value = true
  errorMessage.value = ''

  try {
    const redirectUrl = new URL(import.meta.env.BASE_URL, window.location.origin).toString()
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: redirectUrl,
      },
    })

    if (error) throw error
    sent.value = true
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : 'ส่งลิงก์เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่'
  } finally {
    loading.value = false
  }
}

const requestAnotherLink = () => {
  sent.value = false
  errorMessage.value = ''
}
</script>

<template>
  <main class="auth-page">
    <section class="auth-card" aria-labelledby="auth-title">
      <div class="auth-brand" aria-hidden="true">฿</div>
      <span class="auth-kicker">Money Flow</span>
      <h1 id="auth-title">ยินดีต้อนรับกลับ</h1>

      <template v-if="!isSupabaseConfigured">
        <p class="auth-description">
          ยังไม่ได้เชื่อมต่อ Supabase กรุณาเพิ่ม Project URL และ Anon Key ใน Environment Variables
        </p>
      </template>

      <template v-else-if="sent">
        <div class="mail-sent" role="status" aria-live="polite">
          <span aria-hidden="true">✓</span>
          <div>
            <strong>ส่ง Magic Link แล้ว</strong>
            <p>เปิดอีเมล <b>{{ email.trim() }}</b> แล้วกดลิงก์เพื่อเข้าสู่ระบบ</p>
          </div>
        </div>
        <button class="secondary-button" type="button" @click="requestAnotherLink">
          ส่งไปยังอีเมลอื่น
        </button>
      </template>

      <form v-else class="auth-form" @submit.prevent="signIn">
        <p class="auth-description">
          กรอกอีเมลที่ลงทะเบียนใน Supabase ระบบจะส่งลิงก์สำหรับเข้าสู่ระบบให้คุณ
        </p>

        <label for="auth-email">
          <span>อีเมล</span>
          <input
            id="auth-email"
            v-model="email"
            type="email"
            autocomplete="email"
            inputmode="email"
            placeholder="you@example.com"
            required
            :disabled="loading"
            @input="errorMessage = ''"
          />
        </label>

        <p v-if="displayedError" class="auth-error" role="alert">{{ displayedError }}</p>

        <button class="primary-button" type="submit" :disabled="loading || !email.trim()">
          <span v-if="loading" class="auth-spinner" aria-hidden="true"></span>
          {{ loading ? 'กำลังส่งลิงก์...' : 'รับ Magic Link' }}
        </button>
      </form>

      <div class="demo-divider"><span>หรือ</span></div>

      <button class="demo-button" type="button" @click="emit('demo')">
        <span aria-hidden="true">👀</span>
        เข้าดูตัวอย่างแอป (Demo)
      </button>
      <p class="demo-note">
        เข้าไม่ได้ก็ดูได้ ข้อมูลเป็นตัวอย่างสมมติ ดูได้อย่างเดียว เพิ่ม/แก้ไข/ลบไม่ได้
      </p>

      <small>เข้าได้เฉพาะบัญชีที่สร้างไว้แล้ว · ไม่มีการเปิดสมัครสมาชิกใหม่</small>
    </section>
  </main>
</template>

<style scoped>
.auth-page {
  display: grid;
  min-height: 100vh;
  min-height: 100dvh;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(circle at 15% 15%, rgba(201, 240, 108, 0.2), transparent 32%),
    linear-gradient(145deg, #153d30, #1d5a43 58%, #286b4f);
  font-family: 'Noto Sans Thai', sans-serif;
}

.auth-card {
  width: min(430px, 100%);
  padding: 34px;
  border: 1px solid rgba(255, 255, 255, 0.74);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 28px 80px rgba(5, 28, 19, 0.3);
  text-align: center;
}

.auth-brand {
  display: grid;
  width: 54px;
  height: 54px;
  margin: 0 auto 14px;
  place-items: center;
  border-radius: 17px;
  color: #194d3b;
  background: #c9f06c;
  font-family: 'Manrope', sans-serif;
  font-size: 1.45rem;
  font-weight: 800;
  box-shadow: 0 9px 20px rgba(87, 125, 34, 0.2);
}

.auth-kicker {
  color: #55806d;
  font-size: 0.63rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

h1 {
  margin: 5px 0 8px;
  color: #19372a;
  font-size: 1.45rem;
}

.auth-description {
  margin: 0 0 20px;
  color: #708078;
  font-size: 0.76rem;
  line-height: 1.65;
}

.auth-form,
.auth-form label {
  display: grid;
  gap: 8px;
}

.auth-form label {
  text-align: left;
}

.auth-form label > span {
  color: #3c5e4f;
  font-size: 0.68rem;
  font-weight: 700;
}

.auth-form input {
  min-height: 48px;
  padding: 10px 13px;
  border: 1px solid #d2ded7;
  border-radius: 11px;
  outline: none;
  color: #1d3329;
  background: #fbfdfc;
  font: 600 0.78rem 'Manrope', 'Noto Sans Thai', sans-serif;
  transition: border-color 0.16s, box-shadow 0.16s;
}

.auth-form input:focus {
  border-color: #5b9577;
  box-shadow: 0 0 0 4px rgba(64, 137, 99, 0.13);
}

.primary-button,
.secondary-button {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-top: 8px;
  padding: 9px 15px;
  border-radius: 11px;
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: 0.74rem;
  font-weight: 800;
}

.primary-button {
  border: 1px solid #194d3b;
  color: white;
  background: #194d3b;
}

.secondary-button {
  border: 1px solid #cbdad2;
  color: #285c44;
  background: #fff;
}

.primary-button:disabled {
  opacity: 0.55;
}

.auth-error {
  margin: 3px 0 0;
  padding: 9px 11px;
  border-radius: 9px;
  color: #a13c36;
  background: #fff0ee;
  font-size: 0.66rem;
  text-align: left;
}

.mail-sent {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 10px;
  margin: 20px 0 10px;
  padding: 14px;
  border: 1px solid #cfe4d7;
  border-radius: 13px;
  color: #285e46;
  background: #eff8f2;
  text-align: left;
}

.mail-sent > span {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 50%;
  color: #fff;
  background: #3b9065;
  font-weight: 800;
}

.mail-sent strong {
  font-size: 0.75rem;
}

.mail-sent p {
  margin: 3px 0 0;
  overflow-wrap: anywhere;
  color: #688075;
  font-size: 0.66rem;
  line-height: 1.5;
}

.demo-divider {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px;
  margin: 18px 0 14px;
  color: #a3aea8;
  font-size: 0.6rem;
  font-weight: 700;
}

.demo-divider::before,
.demo-divider::after {
  content: '';
  height: 1px;
  background: #e2e9e5;
}

.demo-button {
  display: inline-flex;
  width: 100%;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 9px 15px;
  border: 1px solid #cbdad2;
  border-radius: 11px;
  color: #285c44;
  background: #f4faf6;
  font-family: 'Noto Sans Thai', sans-serif;
  font-size: 0.74rem;
  font-weight: 800;
  transition: border-color 0.16s, background 0.16s;
}

.demo-button:hover {
  border-color: #9dc0ac;
  background: #eaf5ee;
}

.demo-button:focus-visible {
  outline: 3px solid rgba(64, 137, 99, 0.28);
  outline-offset: 2px;
}

.demo-note {
  margin: 9px 0 0;
  color: #8a968f;
  font-size: 0.6rem;
  line-height: 1.5;
}

.auth-card > small {
  display: block;
  margin-top: 18px;
  color: #96a19b;
  font-size: 0.58rem;
}

.auth-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.34);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 480px) {
  .auth-page { padding: 15px; }
  .auth-card { padding: 27px 20px; border-radius: 20px; }
}

@media (prefers-reduced-motion: reduce) {
  .auth-spinner { animation: none; }
}
</style>
