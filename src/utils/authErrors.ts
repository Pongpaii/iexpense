/**
 * แปลข้อความ error ของ Supabase Auth เป็นภาษาไทย
 * ตั้งใจไม่แยกระหว่าง "ไม่มีอีเมลนี้" กับ "รหัสผ่านผิด" เพื่อไม่ให้หน้าเข้าสู่ระบบ
 * ถูกใช้ไล่เดาว่าอีเมลไหนมีบัญชีอยู่
 */
export const describeAuthError = (message: string) => {
  const normalized = message.toLowerCase()

  if (normalized.includes('invalid login credentials')) {
    return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง ลองอีกครั้ง หรือกด "ลืมรหัสผ่าน" เพื่อตั้งรหัสใหม่'
  }

  if (normalized.includes('email not confirmed')) {
    return 'บัญชีนี้ยังไม่ได้ยืนยันอีเมล กดยืนยันในอีเมลที่ได้รับก่อนเข้าสู่ระบบ'
  }

  if (normalized.includes('email logins are disabled') || normalized.includes('provider is not enabled')) {
    return 'โปรเจกต์ Supabase ปิดการเข้าสู่ระบบด้วยอีเมลอยู่ ให้เปิด Email provider ในหน้า Authentication'
  }

  if (
    normalized.includes('rate limit')
    || normalized.includes('too many requests')
    || normalized.includes('for security purposes')
  ) {
    return 'ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่ (การส่งอีเมลของ Supabase จำกัดไว้ 2 ฉบับต่อชั่วโมง)'
  }

  if (normalized.includes('password should be at least')) {
    const minimum = message.match(/\d+/)?.[0] ?? '6'
    return `รหัสผ่านต้องยาวอย่างน้อย ${minimum} ตัวอักษร`
  }

  if (normalized.includes('new password should be different')) {
    return 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม'
  }

  if (normalized.includes('same_password')) {
    return 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม'
  }

  if (normalized.includes('token has expired') || normalized.includes('invalid or has expired')) {
    return 'ลิงก์หมดอายุแล้ว ขอลิงก์ตั้งรหัสผ่านใหม่อีกครั้ง'
  }

  if (normalized.includes('user not found')) {
    return 'ไม่พบบัญชีนี้ ติดต่อผู้ดูแลเพื่อสร้างบัญชีให้ก่อน'
  }

  if (normalized.includes('failed to fetch') || normalized.includes('network')) {
    return 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่'
  }

  return message
}
