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

แอปใช้การล็อกอินแบบ Magic Link และ **ไม่เปิดให้สมัครสมาชิกเอง** (`shouldCreateUser: false`) จึงต้องสร้างผู้ใช้ก่อน:

Supabase Dashboard → Authentication → Users → **Add user** → ใส่อีเมล

จากนั้นไปที่ Authentication → URL Configuration แล้วเพิ่ม Site URL / Redirect URL ให้ตรงกับที่ใช้งาน เช่น
- `http://localhost:5173` สำหรับตอนพัฒนา
- โดเมนจริงของคุณสำหรับ production

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

## 8. โหมด Demo

ปุ่ม **เข้าดูตัวอย่างแอป (Demo)** ที่หน้าล็อกอินจะเข้าแอปโดยไม่ต้องมีบัญชี

- ข้อมูลตัวอย่างย้อนหลัง 6 เดือนถูกสร้างขึ้นในหน่วยความจำจาก `src/utils/demoData.ts` และคิดจากวันที่ปัจจุบัน
- ไม่มีการเรียก Supabase และไม่มีการเขียนข้อมูลใด ๆ
- เพิ่ม / แก้ไข / ลบ ถูกปิดทั้งหมด (ฟอร์มถูก disable, ปุ่มแก้ไข-ลบถูกซ่อน, danger zone ในหน้าตั้งค่าถูกซ่อน)
- ตั้งค่าเงินเดือนยังปรับได้ เพราะเก็บใน localStorage ของเบราว์เซอร์เท่านั้น
- ออกจากโหมดนี้ได้จากปุ่ม "เข้าสู่ระบบ" บนแถบแจ้งเตือน หรือไอคอนออกที่มุมขวาบน

## 9. แก้ปัญหาที่พบบ่อย

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

**กด Magic Link แล้วเด้งกลับหน้าล็อกอิน**
Redirect URL ใน Supabase ไม่ตรงกับ origin ที่เปิดเว็บ ตรวจที่ Authentication → URL Configuration

**ล็อกอินได้แต่ไม่เห็นข้อมูล / บันทึกไม่ได้**
ยังไม่ได้รัน `supabase/schema.sql` หรือ RLS policy ไม่ครบ ลองรันสคริปต์ซ้ำ (เขียนให้รันซ้ำได้ปลอดภัย)

## โครงสร้างโปรเจกต์คร่าว ๆ

```
src/
  App.vue                  หน้าหลัก จัดการ state, auth, โหมด demo
  components/
    AuthGate.vue           หน้าล็อกอิน + ปุ่มเข้าโหมด demo
    TransactionForm.vue    ฟอร์มบันทึกรายการ
    TransactionList.vue    รายการธุรกรรม (รองรับโหมดอ่านอย่างเดียว)
    SummaryCards.vue       การ์ดสรุปยอด
    CashFlowChart.vue      กราฟแท่งรายรับ-รายจ่าย 6 เดือน
    CategoryDonut.vue      กราฟวงกลมแยกหมวดหมู่ กดดูรายการในแต่ละ % ได้
    ExpenseAnalytics.vue   วิเคราะห์รายจ่ายรายเดือน + เทียบเดือนก่อน
    MoneyBuddy.vue         ผู้ช่วยคาดการณ์เงินคงเหลือ
    SettingsModal.vue      ตั้งค่าเงินเดือน / จัดการข้อมูล
  utils/
    categoryBreakdown.ts   รวมยอดตามหมวดหมู่ให้กราฟวงกลม
    demoData.ts            ชุดข้อมูลตัวอย่างของโหมด demo
    forecast.ts, format.ts
  lib/supabase.ts          สร้าง Supabase client จาก env
supabase/schema.sql        สคริปต์สร้างตารางและ RLS
```
