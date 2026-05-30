-- รันใน Supabase SQL Editor
-- https://supabase.com/dashboard → SQL Editor → New Query

CREATE TABLE IF NOT EXISTS meter_users (
  id           bigserial PRIMARY KEY,
  user_id      text UNIQUE NOT NULL,
  display_name text,
  picture_url  text,
  status_message text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meter_readings (
  id           bigserial PRIMARY KEY,
  user_id      text,
  meter_value  numeric(10, 2) NOT NULL,
  note         text,
  source       text NOT NULL DEFAULT 'web',
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meter_readings_user_id ON meter_readings (user_id);
CREATE INDEX IF NOT EXISTS idx_meter_readings_recorded_at ON meter_readings (recorded_at DESC);

-- เปิดให้ anon key อ่าน-เขียน-ลบได้ (สำหรับโปรเจกต์ส่วนตัว)
ALTER TABLE meter_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE meter_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow all users table" ON meter_users
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "allow all readings table" ON meter_readings
  FOR ALL USING (true) WITH CHECK (true);
