# Money Flow (iExpense)

แอปบันทึกรายรับ–รายจ่ายภาษาไทยสำหรับเว็บ, PWA และ Android สร้างด้วย Vue 3, TypeScript, Vite, Supabase และ Capacitor

Money Flow รองรับการล็อกอิน, การวิเคราะห์ค่าใช้จ่าย, การทำงานขณะออฟไลน์, การแจ้งเตือนรายวัน, ธีม OPIUM และโหมด Demo ที่ทดลองใช้ได้โดยไม่ต้องมีฐานข้อมูล

## ความสามารถหลัก

- บันทึก แก้ไข ลบ และเลือกลบธุรกรรมหลายรายการ
- สรุปยอดคงเหลือ รายรับ และรายจ่าย
- กราฟกระแสเงินสด, สัดส่วนหมวดหมู่, Heatmap และ Bubble Galaxy
- วิเคราะห์พฤติกรรมการใช้จ่ายและคาดการณ์เงินคงเหลือ
- ตั้งค่าเงินเดือน, เพดานรายวัน และการแจ้งเตือน
- ระบบ achievement และ streak
- ธีมปกติและธีม OPIUM ที่จำค่าบนอุปกรณ์
- PWA พร้อม install prompt และ service worker แบบ auto-update
- Android app ผ่าน Capacitor พร้อม GitHub Actions สำหรับสร้าง APK
- โหมด Demo แบบอ่านอย่างเดียว ไม่เรียก Supabase

## Production capabilities

- ตรวจข้อมูลด้วย Zod ทั้งในฟอร์มและก่อนส่ง API
- Database constraints, validation triggers และ Row Level Security
- API timeout และ retry แบบ exponential backoff สำหรับข้อผิดพลาดชั่วคราว
- ตรวจจับ session หมดอายุและลอง refresh ก่อนบังคับให้เข้าสู่ระบบใหม่
- Offline queue สำหรับ transaction ใหม่ พร้อมซิงก์อัตโนมัติเมื่อออนไลน์
- Error Boundary, global error handlers และ optional Sentry monitoring
- Lazy-loaded analytics components และ Skeleton loading
- ดึง transaction จาก Supabase เป็นช่วงและแสดงรายการครั้งละ 50 แถว
- Security headers และ cache policy สำหรับ Vercel
- CI ตรวจ TypeScript, ESLint, 319 tests และ production build

## เทคโนโลยี

| ส่วน       | เทคโนโลยี                                     |
| ---------- | --------------------------------------------- |
| Frontend   | Vue 3, TypeScript, Vite                       |
| Validation | Zod                                           |
| Backend    | Supabase Auth, PostgreSQL, Row Level Security |
| Mobile     | Capacitor Android/iOS                         |
| PWA        | vite-plugin-pwa, Workbox                      |
| Testing    | Vitest, Vue Test Utils, Happy DOM             |
| Monitoring | Sentry (เลือกเปิดใช้ได้)                      |
| CI/CD      | GitHub Actions, Vercel                        |

## สิ่งที่ต้องมี

| เครื่องมือ             | เวอร์ชัน/หมายเหตุ                              |
| ---------------------- | ---------------------------------------------- |
| Node.js                | 22.12+ หรือ 24 LTS; Vite 8 ต้องการ Node 20.19+ |
| npm                    | ติดตั้งมากับ Node.js                           |
| Supabase project       | จำเป็นสำหรับการล็อกอินและบันทึกข้อมูลจริง      |
| Android Studio/JDK/SDK | จำเป็นเฉพาะเมื่อ build Android ในเครื่อง       |

ตรวจเวอร์ชัน:

```powershell
node -v
npm -v
```

## ติดตั้งโปรเจกต์

```powershell
git clone <REPOSITORY_URL>
cd iexpense
npm install
```

สำหรับ CI หรือการติดตั้งตาม `package-lock.json` แบบแน่นอน:

```powershell
npm ci
```

ถ้า PowerShell บล็อก `npm.ps1` ให้เรียกผ่าน `cmd`:

```powershell
cmd /c "npm install"
```

## Environment variables

คัดลอกไฟล์ตัวอย่าง:

```powershell
Copy-Item .env.example .env
```

ค่าที่จำเป็น:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

ค่าที่เลือกเปิดใช้ได้:

```env
VITE_SENTRY_DSN=
VITE_SENTRY_TRACES_SAMPLE_RATE=0.1
VITE_APP_ENV=development
```

ข้อควรระวัง:

- ใช้เฉพาะ Supabase anon/publishable key ในแอป
- ห้ามใส่ `service_role`, database password หรือ server secret ในตัวแปรที่ขึ้นต้นด้วย `VITE_`
- ตัวแปร `VITE_` ทั้งหมดจะถูกฝังใน JavaScript bundle และผู้ใช้สามารถอ่านได้
- `.env` และ `.env.*` ถูก ignore จาก Git แต่ `.env.example` ยังคง track เป็น template
- หากไม่ได้ตั้งค่า Supabase แอปยังเปิดในโหมด Demo ได้

## เตรียมฐานข้อมูล Supabase

### โปรเจกต์ใหม่

1. สร้าง Supabase project
2. เปิด **SQL Editor**
3. รันเนื้อหาทั้งหมดจาก `supabase/schema.sql`
4. ตรวจสอบตาราง, triggers, indexes และ RLS policies

Schema จะสร้างและป้องกันข้อมูลหลักดังนี้:

- `public.transactions` ผูกกับ `auth.users`
- `public.user_achievements`
- RLS ให้ผู้ใช้เข้าถึงเฉพาะข้อมูลของตัวเอง
- ปิดสิทธิ์ role `anon` สำหรับข้อมูลส่วนตัว
- ตรวจและทำความสะอาด transaction ที่ระดับฐานข้อมูล
- บังคับ `user_id = auth.uid()`
- จำกัดจำนวนเงิน, ความยาวคำอธิบาย และช่วงวันที่

> หากฐานข้อมูลเดิมมีข้อมูลอยู่แล้ว ให้สำรองข้อมูลและตรวจ `user_id` ของทุกแถวก่อนเปลี่ยน constraint หรือรัน migration

### การเปลี่ยน schema หลังจาก baseline

เก็บ migration ใหม่ไว้ใน `supabase/migrations/` และตั้งชื่อด้วย UTC timestamp เช่น:

```text
20260901120000_add_transaction_note.sql
```

อ่านกติกาและขั้นตอนเพิ่มเติมได้ที่ `supabase/migrations/README.md`

ก่อน migration บน Production:

- สำรองข้อมูลหรือเปิด Point-in-Time Recovery
- ทดสอบบน staging ก่อน
- แก้ Zod schema ฝั่งแอปให้ตรงกับ database constraints
- แยก destructive migration เป็นหลายรอบ deploy

## เตรียม Authentication

แอปใช้ email และ password และไม่มีหน้าสมัครสมาชิกสาธารณะ

1. ไปที่ **Supabase Dashboard → Authentication → Users**
2. เลือก **Add user**
3. ใส่อีเมลและรหัสผ่าน
4. เปิด Auto Confirm User หากไม่ต้องการขั้นตอนยืนยันอีเมล

ค่าที่ควรตรวจ:

- เปิด Email provider
- ปิด public sign-up หากต้องการให้ผู้ดูแลสร้างบัญชีเท่านั้น
- ตั้ง Site URL และ Redirect URLs ให้ตรงกับ localhost และ Production domain
- ตั้ง custom SMTP หากต้องการส่งอีเมลจริงเกินโควตาเริ่มต้นของ Supabase
- ตรวจ Auth rate limits จาก Dashboard

บัญชีเดิมที่เคยใช้ Magic Link อาจยังไม่มีรหัสผ่าน ให้ผู้ดูแลตั้งรหัสผ่านหรือใช้เมนู **ลืมรหัสผ่าน?**

## รันแอปในเครื่อง

```powershell
npm run dev
```

เปิด `http://localhost:5173`

หากใช้เครื่องที่บล็อก `npm.ps1`:

```powershell
cmd /c "npm run dev"
```

## คำสั่งสำหรับพัฒนาและตรวจคุณภาพ

| คำสั่ง                  | ทำอะไร                                     |
| ----------------------- | ------------------------------------------ |
| `npm run dev`           | เปิด Vite development server               |
| `npm run type-check`    | ตรวจ TypeScript/Vue types                  |
| `npm run lint`          | ตรวจ ESLint                                |
| `npm run lint:fix`      | แก้ lint ที่แก้อัตโนมัติได้                |
| `npm run format:check`  | ตรวจรูปแบบด้วย Prettier                    |
| `npm run format`        | จัดรูปแบบไฟล์                              |
| `npm run test:run`      | รัน unit/component tests ครั้งเดียว        |
| `npm run test:coverage` | รัน tests พร้อม coverage                   |
| `npm run build`         | ตรวจ types และ build Production ลง `dist/` |
| `npm run preview`       | เปิดดู Production build ในเครื่อง          |

ก่อนเปิด Pull Request หรือ push เข้า `main` ควรรัน:

```powershell
npm run lint
npm run type-check
npm run test:run
npm run build
```

สถานะชุดทดสอบล่าสุด:

```text
12 test files passed
319 tests passed
0 tests failed
```

## GitHub Actions

Repository มี workflow สองชุด:

| Workflow          | ไฟล์                            | หน้าที่                                    |
| ----------------- | ------------------------------- | ------------------------------------------ |
| CI                | `.github/workflows/ci.yml`      | Type-check, lint, tests, web build         |
| Build Android APK | `.github/workflows/android.yml` | Build web, sync Capacitor, build debug APK |

CI ทำงานเมื่อ push เข้า `main` หรือเปิด Pull Request ส่วน Android workflow ทำงานเมื่อ push ไฟล์ที่เกี่ยวข้องเข้า `main` และสั่งรันเองผ่าน `workflow_dispatch` ได้

## Build APK ผ่าน GitHub Actions

วิธีนี้ไม่ต้องติดตั้ง Android Studio หรือ Android SDK ในเครื่องผู้ใช้ GitHub runner จะใช้ Node.js 24, JDK 21 และ Android SDK 36

### 1. ตั้ง GitHub Secrets

ไปที่:

```text
Repository → Settings → Secrets and variables → Actions
```

สร้าง Repository secrets:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

ใช้ anon/publishable key เท่านั้น ห้ามใช้ service role key

### 2. สั่ง Build

เลือกได้สองวิธี:

1. Push การเปลี่ยนแปลงที่เกี่ยวข้องเข้า `main`; workflow จะเริ่มอัตโนมัติ
2. ไปที่ **Actions → Build Android APK → Run workflow → main → Run workflow**

Workflow จะรัน:

```text
npm ci
npm run build
npx cap sync android
./gradlew assembleDebug --no-daemon
```

### 3. ดาวน์โหลด APK

1. รอ job **Build debug APK** เป็นสีเขียว
2. เปิด workflow run
3. เลื่อนลงส่วน **Artifacts**
4. ดาวน์โหลด `money-flow-debug-apk`
5. แตก ZIP เพื่อรับ `app-debug.apk`

Artifact ถูกเก็บไว้ 14 วัน

APK นี้เป็น debug build สำหรับทดสอบและแจกภายใน ยังไม่ใช่ signed release สำหรับ Google Play

## ติดตั้ง APK ลง Android

1. ส่ง `app-debug.apk` ไปยังโทรศัพท์
2. เปิดไฟล์ APK
3. อนุญาต **Install unknown apps** เฉพาะแอปที่ใช้เปิดไฟล์
4. ยืนยันการติดตั้ง
5. เปิดแอป **Money Flow** และเข้าสู่ระบบหรือเลือกโหมด Demo

หาก debug APK รอบใหม่ติดตั้งทับไม่ได้ ให้ถอนเวอร์ชันเดิมแล้วติดตั้งใหม่ ข้อมูล transaction ที่อยู่ใน Supabase จะไม่หาย แต่ค่าที่เก็บเฉพาะอุปกรณ์อาจต้องตั้งใหม่

## Build Android ในเครื่อง

ทุกครั้งที่เปลี่ยนเว็บ ให้ build และ sync ก่อน:

```powershell
npm run build
npx cap sync android
```

สร้าง Debug APK บน Windows:

```powershell
.\android\gradlew.bat -p android assembleDebug
```

ไฟล์ที่ได้:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

เปิด Android Studio:

```powershell
npx cap open android
```

สำหรับ Play Store ให้ตั้ง release signing และสร้าง Android App Bundle (`.aab`) ห้าม commit keystore หรือรหัสผ่านเข้า repository

## Deploy เว็บ

โปรเจกต์เป็น static SPA และมี config พร้อมสำหรับ Vercel

### Vercel

ใช้ `vercel.json` ซึ่งกำหนด:

```text
Build command: npm run build
Output directory: dist
```

ทุก platform ต้องตั้ง environment variables อย่างน้อย:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

หากใช้ monitoring ให้เพิ่ม:

```text
VITE_SENTRY_DSN
VITE_SENTRY_TRACES_SAMPLE_RATE
VITE_APP_ENV=production
```

หลัง deploy ต้องเพิ่ม Production domain ใน Supabase Auth Redirect URLs

## Offline และ Error handling

- แอปเก็บ transaction ใหม่ไว้ใน offline queue เมื่ออินเทอร์เน็ตขาด
- เมื่อกลับมาออนไลน์ แอปจะพยายามซิงก์รายการที่ค้าง
- Pending rows แสดงรวมกับรายการจาก server
- การแก้ไขและลบขณะ offline ถูกปิด เพราะต้องอ้างอิง server row จริง
- API ที่ล้มเหลวชั่วคราวจะ retry ด้วย backoff
- หาก session หมดอายุ แอปจะลอง refresh session และจำหน้าที่ผู้ใช้อยู่
- Error Boundary ป้องกัน component error ทำให้หน้าจอขาว
- Sentry จะเริ่มทำงานเฉพาะเมื่อกำหนด `VITE_SENTRY_DSN`

## โหมด Demo

กด **เข้าดูตัวอย่างแอป (Demo)** จากหน้าเข้าสู่ระบบเพื่อทดลองโดยไม่ต้องมีบัญชี

- สร้างข้อมูลตัวอย่างย้อนหลังในหน่วยความจำ
- ไม่เรียกหรือเขียนข้อมูลลง Supabase
- ปิดการเพิ่ม แก้ไข ลบ และ danger zone
- ใช้ analytics และธีมได้เหมือนแอปจริง
- ออกจาก Demo ได้จากแถบแจ้งเตือนหรือปุ่มเข้าสู่ระบบ

## โครงสร้างโปรเจกต์

```text
src/
  App.vue                        composition root และหน้าหลัก
  components/
    AuthGate.vue                 login, reset password และ Demo entry
    ErrorBoundary.vue            fallback เมื่อ component เกิด error
    TransactionForm.vue          ฟอร์มเพิ่ม/แก้ไขพร้อม Zod validation
    TransactionList.vue          รายการและ incremental rendering
    SummaryCards.vue             การ์ดสรุปพร้อม Skeleton state
    SettingsModal.vue            การตั้งค่า, export และ OPIUM theme
    CategoryDonut.vue            สัดส่วนรายจ่ายตามหมวดหมู่
    BubbleGalaxy.vue             Bubble visualization
    ExpenseAnalytics.vue         วิเคราะห์รายจ่าย
    MoneyBuddy.vue               คาดการณ์สถานะเงิน
  composables/
    useAuth.ts                   session, login และ password recovery
    useTransactions.ts           fetch/mutate และ offline integration
    useOfflineQueue.ts           queue และ sync รายการ offline
    useNavigation.ts             route/hash state
    useUndoDelete.ts             undo transaction deletion
    useInstallPrompt.ts          PWA installation
    useTheme.ts                  persisted default/OPIUM theme
  schemas/
    transaction.schema.ts        client transaction constraints
  lib/
    api.ts                       timeout, retry และ user-facing errors
    monitoring.ts                optional Sentry integration
    supabase.ts                  Supabase client
  utils/                         analytics, formatting, forecast และ demo data
supabase/
  schema.sql                     baseline schema, triggers และ RLS
  migrations/                    schema changes หลัง baseline
android/                         Capacitor Android project
.github/workflows/               CI และ Android APK workflows
```

## Security checklist ก่อน Production

- ใช้ anon/publishable key ฝั่ง client เท่านั้น
- ตรวจ RLS และ policies ทุกตาราง
- ปิด public sign-up หากระบบไม่เปิดให้สมัครเอง
- ตั้ง Auth rate limits และ custom SMTP
- เปิด database backups หรือ Point-in-Time Recovery
- ตั้ง environment variables บน hosting และ GitHub Actions
- ตั้ง Sentry DSN และ sample rate ตามความเหมาะสม
- ทดสอบ migration บน staging ก่อน Production
- ห้าม commit `.env`, service role key, keystore หรือ signing password

## แก้ปัญหาที่พบบ่อย

### PowerShell บล็อก npm.ps1

```powershell
cmd /c "npm run dev"
```

หรืออนุญาต script สำหรับผู้ใช้ปัจจุบัน:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### แอปแจ้งว่ายังไม่ได้เชื่อมฐานข้อมูล

ตรวจ `.env`, ชื่อตัวแปร และ restart Vite เพราะ environment variables ถูกอ่านตอนเริ่ม process

### เข้าสู่ระบบได้แต่ไม่เห็นหรือบันทึกข้อมูลไม่ได้

ตรวจว่าได้รัน `supabase/schema.sql`, ผู้ใช้ได้รับการยืนยัน และ RLS policies ถูกสร้างครบ

### ลิงก์ตั้งรหัสผ่านกลับมาหน้า login

ตรวจ Site URL และ Redirect URLs ใน Supabase Authentication

### GitHub Actions build APK ไม่ผ่าน

ตรวจตามลำดับ:

1. Repository secrets มีชื่อถูกต้อง
2. เปิด log ของ step แรกที่เป็นสีแดง
3. ตรวจว่า `npm run build` ผ่านในเครื่อง
4. ตรวจ Android SDK/Gradle error ใน step **Build debug APK**
5. ห้ามดาวน์โหลดจากหน้า job; Artifact อยู่ด้านล่างของหน้า workflow run

### APK ติดตั้งทับไม่ได้

Debug signature อาจต่างจาก APK ที่ติดตั้งอยู่ ถอนแอปเดิมแล้วติดตั้งใหม่ หรือสร้าง signed release ด้วย keystore เดิม

## หมายเหตุการ Release

ก่อนออกเวอร์ชัน Android ใหม่ ให้เพิ่มค่าใน `android/app/build.gradle`:

```gradle
versionCode 2
versionName "1.1.0"
```

`versionCode` ต้องเพิ่มขึ้นทุกครั้ง ส่วน `versionName` คือเวอร์ชันที่ผู้ใช้มองเห็น
