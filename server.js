require('dotenv').config()
const express = require('express')
const cors = require('cors')
const ws = require('ws')
const { createClient } = require('@supabase/supabase-js')
const path = require('path')

const app = express()
const PORT = process.env.PORT || 3000
const staticDir = path.join(__dirname, 'public')

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.warn('Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment variables')
}

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || '',
  {
    realtime: {
      transport: ws
    }
  }
)

app.use(cors())
app.use(express.json())
app.use(express.static(staticDir))

// ดึงข้อมูลทั้งหมด เรียงตามวันที่
app.get('/api/records', async (req, res) => {
  const { data, error } = await supabase
    .from('meter_readings')
    .select('*')
    .order('recorded_at', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// บันทึกเลขมิเตอร์ใหม่
app.post('/api/records', async (req, res) => {
  const { meter_value, note } = req.body

  if (meter_value === undefined || isNaN(meter_value)) {
    return res.status(400).json({ error: 'meter_value ต้องเป็นตัวเลข' })
  }

  const { data, error } = await supabase
    .from('meter_readings')
    .insert([{
      meter_value: parseFloat(meter_value),
      note: note || null,
      recorded_at: new Date().toISOString()
    }])
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ลบรายการ
app.delete('/api/records/:id', async (req, res) => {
  const { id } = req.params
  const { error } = await supabase
    .from('meter_readings')
    .delete()
    .eq('id', id)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
})

// Serve index.html สำหรับทุก route
app.get('*', (req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n⚡ Electricity Tracker รันที่ http://localhost:${PORT}`)
  console.log(`   พร้อมสำหรับ Render/Docker แล้ว\n`)
})
