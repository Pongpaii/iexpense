import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // ไม่ใช้ vite.config.ts ตรง ๆ เพราะไม่ต้องการให้ปลั๊กอิน PWA
  // มาสร้าง service worker ตอนรันเทสต์
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    // เขียน import { describe, it, expect } from 'vitest' ให้ชัดเจน
    // จะได้ไม่ต้องพึ่ง global ที่ TS มองไม่เห็น
    globals: false,
    include: ['src/**/__tests__/**/*.spec.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,vue}'],
      exclude: [
        'src/**/__tests__/**',
        'src/test-utils/**',
        'src/main.ts',
        'src/**/*.d.ts',
        // ไฟล์ข้อมูลตัวอย่างและนิยาม badge เป็นค่าคงที่ ไม่มี logic ให้ทดสอบ
        'src/utils/demoData.ts',
        'src/types/**',
      ],
    },
  },
})
