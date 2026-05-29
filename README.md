# ⚡ Electricity Tracker — บันทึกค่าไฟ

เว็บบันทึกเลขมิเตอร์ไฟฟ้ารายวัน คำนวณหน่วยและค่าไฟอัตโนมัติ

---

## 📋 สิ่งที่ต้องมี

- Node.js (v16+)
- บัญชี Supabase (ฟรี) — https://supabase.com

---

## 🚀 วิธีติดตั้ง

### Deploy บน Render

โปรเจกต์นี้รองรับการ deploy แบบ Docker บน Render แล้ว

1. สร้างเว็บ service ใหม่บน Render
2. เลือก **Deploy from Git Repository**
3. ใช้ `render.yaml` ที่มีในโปรเจกต์ หรือเลือก **Docker** เป็น environment
4. ตั้งค่า Environment Variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `PORT` ไม่จำเป็นต้องตั้งเองบน Render
5. Deploy ได้เลย

### 1. สร้างฐานข้อมูล Supabase

1. เข้า https://supabase.com → สร้างโปรเจกต์ใหม่
2. ไปที่ **SQL Editor** → คลิก **New Query**
3. วาง SQL จากไฟล์ `supabase_schema.sql` แล้วกด **Run**

### 2. ดึง API Keys

ไปที่ **Project Settings → API** แล้วคัดลอก:
- `Project URL` (ขึ้นต้นด้วย `https://xxx.supabase.co`)
- `anon public` key

### 3. ตั้งค่า Environment

```bash
# คัดลอก .env.example เป็น .env
cp .env.example .env
```

แก้ไขไฟล์ `.env`:
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
PORT=3000
```

### 4. ติดตั้ง Dependencies และรัน

```bash
npm install
npm start
```

เปิด browser ไปที่ **http://localhost:3000**

### รันด้วย Docker

```bash
docker build -t electricity-tracker .
docker run -p 3000:3000 \
  -e SUPABASE_URL=your_supabase_url \
  -e SUPABASE_ANON_KEY=your_supabase_anon_key \
  electricity-tracker
```

---

## 📖 วิธีใช้งาน

1. กรอกเลขมิเตอร์ที่อ่านได้ตอนนี้ → กด **บันทึก**
2. ระบบจะบันทึกเวลา ณ ขณะนั้นอัตโนมัติ
3. บันทึกซ้ำได้ทุกวัน/ทุกช่วงที่ต้องการ
4. ดูกราฟรายวัน/รายเดือน และตารางประวัติด้านล่าง

---

## 🗂 โครงสร้างโปรเจกต์

```
electricity-tracker/
├── server.js              # Express server + API routes
├── package.json
├── .env                   # (สร้างเอง ไม่อัปโหลด)
├── .env.example           # ตัวอย่างตัวแปร
├── supabase_schema.sql    # SQL สร้างตาราง
└── public/
    ├── index.html         # หน้าเว็บหลัก
    ├── css/style.css      # สไตล์ทั้งหมด
    └── js/app.js          # Logic frontend
```

---

## ⚙️ ปรับแต่ง

อัตราค่าไฟ (ค่าเริ่มต้น 8 บาท/หน่วย) แก้ได้ที่บรรทัดแรกของ `public/js/app.js`:
```js
const RATE = 8
```

---

## 📊 Supabase Schema

```sql
CREATE TABLE meter_readings (
  id          bigserial PRIMARY KEY,
  meter_value numeric(10, 2) NOT NULL,
  note        text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);
```
