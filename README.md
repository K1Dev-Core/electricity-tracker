# ⚡ Electricity Tracker — บันทึกค่าไฟ

เว็บบันทึกเลขมิเตอร์ไฟฟ้ารายวัน คำนวณหน่วยและค่าไฟอัตโนมัติ พร้อมโหมด LINE LIFF / Chat command

---

## สิ่งที่ต้องมี

- Node.js 18+
- บัญชี Supabase
- LINE Developers account
- LIFF app
- Messaging API channel

---

## ติดตั้งแบบเร็ว

```bash
cp .env.example .env
npm install
npm start
```

---

## ตั้งค่า Supabase

1. เข้า Supabase → SQL Editor
2. วางไฟล์ `supabase_schema.sql`
3. กด Run
4. ไปที่ Project Settings → API แล้วคัดลอก:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`

ตารางที่ใช้:
- `meter_users` เก็บข้อมูลผู้ใช้ LINE
- `meter_readings` เก็บเลขมิเตอร์แต่ละคน

---

## ตั้งค่า LINE / LIFF แบบสั้น

### 1) สร้าง LIFF

- เข้า LINE Developers
- เปิด Messaging API channel
- ไปที่ LIFF → Add LIFF app
- ตั้ง Endpoint URL เป็นโดเมนแอปนี้ เช่น
  - `https://your-domain.com`
- คัดลอก `LIFF ID` มาใส่ใน `.env`

### 2) ตั้งค่า Webhook

- เปิด Use webhook = Enabled
- ใส่ Webhook URL:
  - `https://your-domain.com/api/line/webhook`
- เปิด Always reply if user sends text ได้ตามต้องการ

### 3) ใส่ค่าใน `.env`

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
LINE_CHANNEL_SECRET=your_line_channel_secret
LINE_LIFF_ID=your_liff_id
```

---

## วิธีใช้ผ่าน LINE

พิมพ์ในแชตได้เลย:
- `8247` → บันทึกเลขมิเตอร์
- `cancel` / `ยกเลิก` → ยกเลิกรายการล่าสุด
- `latest` / `ล่าสุด` → ดูสรุปล่าสุด

ในหน้า LIFF มีปุ่มกดเร็ว:
- บันทึกเลขมิเตอร์
- ดูผลล่าสุด
- ยกเลิกรายการล่าสุด
- ส่งสรุปกลับแชต

---

## รันบนเครื่อง

```bash
npm start
```

เปิดที่ `http://localhost:3000`

---

## Schema

ไฟล์ SQL อยู่ที่ `supabase_schema.sql`

---

