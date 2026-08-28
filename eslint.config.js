import js from '@eslint/js'
import prettierConfig from 'eslint-config-prettier'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    // โค้ดที่ build แล้วและโปรเจกต์เนทีฟไม่ต้อง lint
    ignores: [
      'dist/**',
      'dev-dist/**',
      'coverage/**',
      'node_modules/**',
      'android/**',
      'ios/**',
      'public/**',
      '*.tsbuildinfo',
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommended,
  pluginVue.configs['flat/recommended'],

  {
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: {
        // ให้ vue-eslint-parser ส่ง <script lang="ts"> ต่อให้ TS parser
        parser: tseslint.parser,
      },
    },
    rules: {
      // App.vue / ชื่อไฟล์คอมโพเนนต์คำเดียวเป็นแบบแผนของโปรเจกต์นี้
      'vue/multi-word-component-names': 'off',
      // ตัวแปรที่ตั้งใจไม่ใช้ ให้ตั้งชื่อขึ้นต้นด้วย _
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // any ที่หลุดมาจาก error ของ Supabase มีจริง แต่ควรเห็นเป็นคำเตือน
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  {
    // ไฟล์ config ระดับโปรเจกต์รันบน Node ไม่ใช่เบราว์เซอร์
    files: ['*.config.{js,ts}', 'vite.config.ts', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },

  // ต้องอยู่ท้ายสุด: ปิดกฎที่ชนกับการจัดรูปแบบของ Prettier
  prettierConfig,
)
