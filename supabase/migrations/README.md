# Database migrations

## โครงสร้างที่ใช้

- **`../schema.sql`** = baseline ของฐานข้อมูล รันครั้งเดียวตอนตั้งโปรเจกต์ใหม่
  (เขียนให้รันซ้ำได้ปลอดภัย ดูขั้นตอนใน README หลัก)
- **โฟลเดอร์นี้** = การเปลี่ยนแปลง *หลังจาก* baseline ทุกอย่าง เรียงตามเวลา

เจตนาคือไม่ให้มีไฟล์ SQL สองไฟล์ที่พูดเรื่องเดียวกัน ถ้าคัดลอก baseline
มาไว้ที่นี่ด้วย ไม่นานสองฝั่งจะไม่ตรงกันแล้วไม่มีใครรู้ว่าอันไหนจริง

## เพิ่มการเปลี่ยนแปลงใหม่

ตั้งชื่อไฟล์เป็น `<UTC timestamp>_<คำอธิบายสั้น>.sql` เช่น
`20260901120000_add_transaction_note.sql` — Supabase CLI รันตามลำดับชื่อไฟล์

กฎที่ต้องรักษา:

1. เขียนให้รันซ้ำได้ (`create ... if not exists`, `drop ... if exists`,
   `create or replace function`) เพราะ migration เดิมอาจถูกรันซ้ำบน
   environment ที่สถานะไม่ตรงกัน
2. เปิด RLS ทุกครั้งที่สร้างตารางใหม่ พร้อม policy ครบทั้ง 4 คำสั่ง และ
   `revoke` สิทธิ์ของ role `anon`
3. ถ้าเปลี่ยนขอบเขตของข้อมูล (ความยาว/ช่วงตัวเลข) ต้องแก้
   `src/schemas/transaction.schema.ts` ให้ตรงกันด้วย ไม่งั้นผู้ใช้จะเจอ error
   จากฐานข้อมูลที่อ่านไม่รู้เรื่อง

## คำสั่งที่ใช้

ครั้งแรกในเครื่อง:

```bash
npx supabase init
npx supabase link --project-ref <PROJECT_REF>
```

รอบการทำงานปกติ:

```bash
# สร้างไฟล์ migration เปล่าไว้เขียนเอง
npx supabase migration new add_transaction_note

# หรือให้ CLI เทียบ schema ในเครื่องกับ migration ที่มีแล้วเขียนให้
npx supabase db diff --file add_transaction_note

# ตรวจสอบบนฐานข้อมูลในเครื่องก่อนขึ้นจริง
npx supabase db reset

# ส่งขึ้น environment ที่ link ไว้
npx supabase db push
```

`supabase db reset` จะล้างฐานข้อมูลในเครื่องแล้วรัน baseline + migration ทั้งหมดใหม่
ทำให้รู้ว่าลำดับ migration ยังใช้ได้จริงกับโปรเจกต์ที่เริ่มจากศูนย์

## ก่อน deploy ขึ้น production

- เปิด Point-in-Time Recovery ไว้ก่อน (Dashboard > Database > Backups)
  ที่ตั้งค่าเองไม่ได้จาก repo นี้
- รัน migration บน staging ก่อนเสมอ
- migration ที่ลบคอลัมน์หรือตาราง ให้แยกเป็นสองรอบ deploy
  (รอบแรกหยุดใช้งานคอลัมน์นั้นในโค้ด รอบสองจึงลบ) ไม่งั้นเวอร์ชันเก่าที่ยัง
  ค้างอยู่ในเครื่องผู้ใช้จะพังทันที
