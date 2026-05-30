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

-- เพิ่มคอลัมน์ source ถ้ายังไม่มี (สำหรับตารางเก่า)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meter_readings' AND column_name = 'source'
  ) THEN
    ALTER TABLE meter_readings ADD COLUMN source text NOT NULL DEFAULT 'web';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meter_readings' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE meter_readings ADD COLUMN user_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meter_readings' AND column_name = 'is_billing_start'
  ) THEN
    ALTER TABLE meter_readings ADD COLUMN is_billing_start boolean NOT NULL DEFAULT false;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_meter_readings_user_id ON meter_readings (user_id);
CREATE INDEX IF NOT EXISTS idx_meter_readings_recorded_at ON meter_readings (recorded_at DESC);

-- เปิดให้ anon key อ่าน-เขียน-ลบได้ (สำหรับโปรเจกต์ส่วนตัว)
ALTER TABLE meter_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE meter_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow all users table" ON meter_users;
DROP POLICY IF EXISTS "allow all readings table" ON meter_readings;

CREATE POLICY "allow all users table" ON meter_users
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "allow all readings table" ON meter_readings
  FOR ALL USING (true) WITH CHECK (true);
