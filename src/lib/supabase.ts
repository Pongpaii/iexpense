import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        // ต่ออายุ access token ให้เองก่อนหมด ผู้ใช้จะไม่หลุดกลางทางระหว่างจดรายการ
        autoRefreshToken: true,
        // เก็บ session ไว้ใน localStorage เพื่อให้เปิดแอป/WebView ใหม่ยังล็อกอินอยู่
        persistSession: true,
        // จำเป็นสำหรับลิงก์ยืนยันอีเมลและลิงก์ตั้งรหัสผ่านใหม่
        detectSessionInUrl: true,
      },
      global: {
        headers: { 'x-application-name': 'money-flow' },
      },
    })
  : null
