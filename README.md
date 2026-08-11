# คู่มือติดตั้ง Money Flow (iexpense)

แอปบันทึกรายรับรายจ่ายภาษาไทย สร้างด้วย Vue 3 + TypeScript + Vite และใช้ Supabase เป็นฐานข้อมูล/ระบบล็อกอิน

## 1. สิ่งที่ต้องมีก่อน

| อย่าง | เวอร์ชันที่แนะนำ | หมายเหตุ |
| --- | --- | --- |
| Node.js | 22.12+ หรือ 24 LTS | Vite 8 ต้องใช้ Node ≥ 20.19 |
| npm | มาพร้อม Node | หรือใช้ pnpm / yarn ก็ได้ |
| บัญชี Supabase | – | จำเป็นเฉพาะเมื่อต้องการใช้งานจริง (บันทึกข้อมูล) |

ตรวจเวอร์ชัน:

```powershell
node -v
npm -v
```

> อยากลองดูหน้าตาแอปก่อนโดยไม่ตั้งค่า Supabase ก็ได้ — ที่หน้าเข้าสู่ระบบมีปุ่ม **เข้าดูตัวอย่างแอป (Demo)** ซึ่งใช้ข้อมูลสมมติในหน่วยความจำ ดูได้อย่างเดียว ไม่ต้องมีฐานข้อมูล

## 2. ติดตั้งโปรเจกต์

```powershell
git clone <URL ของ repo นี้>
cd iexpense
npm install
```

## 3. ตั้งค่า Environment Variables

คัดลอกไฟล์ตัวอย่างแล้วเติมค่าจริง:

```powershell
Copy-Item .env.example .env
```

`.env` ต้องมีสองค่านี้ (หาได้จาก Supabase Dashboard → Project Settings → API):

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

ข้อควรรู้
- ใช้ **anon public key** เท่านั้น ห้ามใส่ service role key เพราะไฟล์นี้ถูก bundle ไปฝั่งเบราว์เซอร์
- `.env` ถูก ignore ไว้ใน git แล้ว
- ถ้าไม่ใส่ค่า แอปจะยังเปิดได้แต่จะขึ้นข้อความว่ายังไม่ได้เชื่อมฐานข้อมูล และใช้ได้แค่โหมด Demo

## 4. เตรียมฐานข้อมูล Supabase

1. สร้างโปรเจกต์ใหม่ใน [Supabase](https://supabase.com/dashboard)
2. เปิด **SQL Editor** แล้ววางเนื้อหาทั้งไฟล์ `supabase/schema.sql` และกด Run

สคริปต์นี้จะสร้าง
- ตาราง `public.transactions` (ผูกกับ `auth.users` ผ่าน `user_id`)
- เปิด Row Level Security พร้อม policy ให้แต่ละคนเห็นเฉพาะข้อมูลของตัวเอง
- index สำหรับ query ตามผู้ใช้และตามวันที่

> ถ้าเป็นโปรเจกต์เดิมที่มีข้อมูลอยู่ก่อน ต้องกำหนด `user_id` ให้ทุกแถวก่อน ไม่งั้นคำสั่ง `set not null` จะล้มเหลว สำรองข้อมูลไว้ก่อนรัน

## 5. สร้างผู้ใช้

แอปใช้การล็อกอินด้วย **อีเมล + รหัสผ่าน** และ **ไม่เปิดให้สมัครสมาชิกเอง** จึงต้องสร้างผู้ใช้จากฝั่งผู้ดูแลก่อน

Supabase Dashboard → Authentication → Users → **Add user** → ใส่อีเมลและรหัสผ่าน แล้วติ๊ก Auto Confirm User
เพื่อไม่ต้องรอยืนยันอีเมล

ตั้งค่าที่ควรตรวจในโปรเจกต์ Supabase
- Authentication → Sign In / Providers → เปิด **Email** และปิด **Allow new users to sign up** (แอปไม่เรียก `signUp` อยู่แล้ว
  ปิดไว้อีกชั้นเพื่อกันคนสมัครเองผ่าน API)
- Authentication → URL Configuration → เพิ่ม Site URL และ Redirect URLs ให้ตรงกับที่ใช้งาน เช่น
  `http://localhost:5173` สำหรับตอนพัฒนา และโดเมนจริงสำหรับ production
  (ลิงก์ตั้งรหัสผ่านใหม่จะเด้งกลับมาที่ URL เหล่านี้)

### ผู้ใช้เดิมที่เคยใช้ Magic Link
บัญชีที่สร้างไว้สำหรับ Magic Link จะยังไม่มีรหัสผ่าน เข้าสู่ระบบด้วยรหัสผ่านจะไม่ผ่าน แก้ได้สองทาง
1. Dashboard → Authentication → Users → เลือกผู้ใช้ → ตั้งรหัสผ่านให้
2. ที่หน้าเข้าสู่ระบบกด **ลืมรหัสผ่าน?** เพื่อรับลิงก์ตั้งรหัสผ่านใหม่ทางอีเมล

### ลืมรหัสผ่าน
กด "ลืมรหัสผ่าน?" → ระบบส่งลิงก์ทางอีเมล → กดลิงก์แล้วแอปจะแสดงหน้าตั้งรหัสผ่านใหม่ (ยาวอย่างน้อย 8 ตัวอักษร)
การส่งอีเมลใช้โควตาของ Supabase ซึ่งจำกัด 2 ฉบับต่อชั่วโมงถ้ายังไม่ได้ตั้ง custom SMTP

## 6. รันแอป

```powershell
npm run dev
```

เปิด `http://localhost:5173`

คำสั่งอื่น

| คำสั่ง | ทำอะไร |
| --- | --- |
| `npm run dev` | dev server พร้อม hot reload |
| `npm run build` | ตรวจ type ด้วย `vue-tsc` แล้ว build ลง `dist/` |
| `npm run preview` | เปิดเซิร์ฟเวอร์ดูผล build |
| `npm run type-check` | ตรวจ type อย่างเดียว |

## 7. Deploy

โปรเจกต์เป็น static SPA ธรรมดา ใช้ได้กับ Vercel / Netlify / Cloudflare Pages

- Build command: `npm run build`
- Output directory: `dist`
- ต้องตั้ง Environment Variables `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY` ในหน้า setting ของ host ด้วย (ค่าจะถูกฝังตอน build)
- เพิ่มโดเมนที่ deploy เข้าไปใน Redirect URLs ของ Supabase

## 8. Build APK ด้วย GitHub Actions (ไม่ต้องลง Android Studio)

เครื่องผู้ใช้ **ไม่ต้องมี Android Studio หรือ Android SDK** เพราะ workflow `.github/workflows/android.yml` จะ build บน GitHub runner ด้วย JDK 21 และ Android SDK 36 โดยลำดับงานคือ:

1. `npm ci`
2. `npm run build`
3. `npx cap sync android`
4. `android/gradlew assembleDebug`
5. อัปโหลด `app-debug.apk` เป็น artifact ชื่อ `money-flow-debug-apk`

### ตั้ง GitHub Secrets

ไปที่ repository บน GitHub → **Settings** → **Secrets and variables** → **Actions** → **New repository secret** แล้วสร้างให้ครบสองชื่อ (ตัวพิมพ์ใหญ่/เล็กต้องตรง):

- `VITE_SUPABASE_URL` — URL ของ Supabase project
- `VITE_SUPABASE_ANON_KEY` — anon public key ของ Supabase

ใช้ค่าเดียวกับใน `.env` แต่ห้าม commit `.env`, secret หรือ keystore เข้า git ค่า Vite ทั้งสองจะถูกฝังใน web bundle ตอน workflow build ดังนั้นต้องใช้ anon public key เท่านั้น ห้ามใช้ service role key

### สั่ง build และดาวน์โหลด APK

1. push การเปลี่ยนแปลงขึ้น GitHub (workflow จะทำงานเมื่อไฟล์แอป/Android ที่กำหนดเปลี่ยนบน `main`) หรือไปที่แท็บ **Actions** → **Build Android APK** → **Run workflow**
2. รอ job **Build debug APK** เป็นสีเขียว
3. เปิด workflow run นั้น เลื่อนลงส่วน **Artifacts** แล้วดาวน์โหลด `money-flow-debug-apk`
4. แตกไฟล์ ZIP จะได้ `app-debug.apk`

> `main` เชื่อมกับ Vercel production อยู่ ควรตรวจ type และ web build ให้ผ่านก่อน push ทุกครั้ง การเพิ่ม Capacitor ไม่เปลี่ยน Vercel output ซึ่งยังเป็น `dist/` เหมือนเดิม

### คำสั่งใดต้องมี Android SDK

- ไม่ต้องมี SDK: ติดตั้ง npm packages, `npx cap init`, `npx cap add android`, `npm run build` และตรวจ TypeScript
- ต้องมี SDK/JDK หรือเครื่องมือ Android: Gradle `assembleDebug`, emulator, `adb` และ `npx cap open android` (ต้องมี Android Studio)
- `npx cap sync android` ทำหน้าที่ copy web assets/plugins และไม่ได้ compile APK แต่โปรเจกต์นี้ตั้งใจให้ workflow เป็นผู้รัน เพื่อไม่ให้ผู้ใช้ต้องเตรียม native toolchain ในเครื่อง

## 9. ติดตั้ง APK ลงมือถือ Android

1. ดาวน์โหลด artifact และแตก `app-debug.apk` ตามขั้นตอนด้านบน
2. ส่ง APK ไปมือถือผ่านสาย USB, cloud drive หรือแอปส่งไฟล์
3. เปิดไฟล์ APK บนมือถือ หาก Android ถาม ให้เปิดสิทธิ์ **ติดตั้งแอปที่ไม่รู้จัก (Install unknown apps)** เฉพาะแอปที่ใช้เปิดไฟล์
4. ยืนยันติดตั้ง แล้วเปิดแอป **Money Flow**
5. เข้าสู่ระบบหรือใช้ Demo ได้เหมือนเว็บ จากนั้นไปที่ไอคอนตั้งค่าเพื่อเลือกเวลาและเปิดแจ้งเตือนรายวัน ระบบจึงจะขอสิทธิ์แจ้งเตือน (Android 13+)

APK นี้เป็น **debug build** สำหรับติดตั้งทดสอบเอง ยังไม่เหมาะสำหรับ Play Store และไม่ได้ใช้ release signing หาก APK จาก workflow รอบใหม่ติดตั้งทับไม่ได้เพราะ debug signature เปลี่ยน ให้ถอนเวอร์ชันเดิมก่อนแล้วติดตั้งใหม่ (ข้อมูลธุรกรรมใน Supabase ไม่หาย แต่ค่าบนอุปกรณ์ เช่น เวลาแจ้งเตือน อาจต้องตั้งใหม่)

## 10. โหมด Demo

ปุ่ม **เข้าดูตัวอย่างแอป (Demo)** ที่หน้าล็อกอินจะเข้าแอปโดยไม่ต้องมีบัญชี

- ข้อมูลตัวอย่างย้อนหลัง 6 เดือนถูกสร้างขึ้นในหน่วยความจำจาก `src/utils/demoData.ts` และคิดจากวันที่ปัจจุบัน
- ไม่มีการเรียก Supabase และไม่มีการเขียนข้อมูลใด ๆ
- เพิ่ม / แก้ไข / ลบ ถูกปิดทั้งหมด (ฟอร์มถูก disable, ปุ่มแก้ไข-ลบถูกซ่อน, danger zone ในหน้าตั้งค่าถูกซ่อน)
- ตั้งค่าเงินเดือนยังปรับได้ เพราะเก็บใน localStorage ของเบราว์เซอร์เท่านั้น
- ออกจากโหมดนี้ได้จากปุ่ม "เข้าสู่ระบบ" บนแถบแจ้งเตือน หรือไอคอนออกที่มุมขวาบน

## 11. แก้ปัญหาที่พบบ่อย

**`npm : File ...\npm.ps1 cannot be loaded because running scripts is disabled`**
PowerShell ปิดการรันสคริปต์อยู่ เลือกทางใดทางหนึ่ง
```powershell
# ทางที่ 1: อนุญาตสำหรับ user ปัจจุบัน
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

# ทางที่ 2: เรียกผ่าน node โดยตรง (ไม่ต้องแก้ policy)
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run dev
```

**ขึ้นว่า "ยังไม่ได้เชื่อมฐานข้อมูล"**
`.env` ไม่มีค่า หรือแก้ `.env` แล้วยังไม่ได้รีสตาร์ท dev server (Vite อ่าน env ตอนบูตเท่านั้น)

**ขึ้นว่า "อีเมลหรือรหัสผ่านไม่ถูกต้อง" ทั้งที่มั่นใจว่าถูก**
บัญชีนั้นอาจยังไม่มีรหัสผ่าน (เคยใช้ Magic Link) หรือยังไม่ยืนยันอีเมล ตั้งรหัสผ่านให้จาก Dashboard
หรือใช้ปุ่มลืมรหัสผ่าน

**กดลิงก์ตั้งรหัสผ่านแล้วเด้งกลับหน้าล็อกอิน**
Redirect URL ใน Supabase ไม่ตรงกับ origin ที่เปิดเว็บ ตรวจที่ Authentication → URL Configuration

**ล็อกอินได้แต่ไม่เห็นข้อมูล / บันทึกไม่ได้**
ยังไม่ได้รัน `supabase/schema.sql` หรือ RLS policy ไม่ครบ ลองรันสคริปต์ซ้ำ (เขียนให้รันซ้ำได้ปลอดภัย)

## 12. โครงสร้างโปรเจกต์คร่าว ๆ

```
src/
  App.vue                  หน้าหลัก จัดการ state, auth, โหมด demo
  components/
    AuthGate.vue           หน้าล็อกอินด้วยอีเมล+รหัสผ่าน, ลืมรหัสผ่าน, ปุ่มเข้าโหมด demo
    PasswordResetScreen.vue หน้าตั้งรหัสผ่านใหม่ เปิดจากลิงก์ในอีเมล
    TransactionForm.vue    ฟอร์มบันทึกรายการ
    TransactionList.vue    รายการธุรกรรม (รองรับโหมดอ่านอย่างเดียว)
    SummaryCards.vue       การ์ดสรุปยอด
    CashFlowChart.vue      กราฟแท่งรายรับ-รายจ่าย 6 เดือน
    CategoryDonut.vue      กราฟวงกลมแยกหมวดหมู่ กดดูรายการในแต่ละ % ได้
    BubbleGalaxy.vue       แท็บฟองเงิน ฟองละหนึ่งของที่จ่ายซ้ำ ขนาดตามจำนวนครั้ง
    ExpenseAnalytics.vue   วิเคราะห์รายจ่ายรายเดือน + เทียบเดือนก่อน
    MoneyBuddy.vue         ผู้ช่วยคาดการณ์เงินคงเหลือ
    SettingsModal.vue      ตั้งค่าเงินเดือน / จัดการข้อมูล
  utils/
    categoryBreakdown.ts   รวมยอดตามหมวดหมู่ให้กราฟวงกลม
    demoData.ts            ชุดข้อมูลตัวอย่างของโหมด demo
    authErrors.ts          แปล error ของ Supabase Auth เป็นภาษาไทย
    bubbleField.ts         ฟิสิกส์และการจัดขนาด/ตัดชื่อของฟองเงิน (แยกให้ทดสอบได้)
    spendingHabits.ts      รวมรายการชื่อซ้ำเป็นของที่จ่ายบ่อย พร้อมจำนวนครั้งและยอดรวม
    forecast.ts, format.ts
  lib/supabase.ts          สร้าง Supabase client จาก env
supabase/schema.sql        สคริปต์สร้างตารางและ RLS
```
