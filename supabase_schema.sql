-- รันใน Supabase SQL Editor
-- https://supabase.com/dashboard → SQL Editor → New Query

CREATE TABLE meter_readings (
  id          bigserial PRIMARY KEY,
  meter_value numeric(10, 2) NOT NULL,
  note        text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- เปิดให้ anon key อ่าน-เขียน-ลบได้ (สำหรับโปรเจกต์ส่วนตัว)
ALTER TABLE meter_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow all" ON meter_readings
  FOR ALL USING (true) WITH CHECK (true);
