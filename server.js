require('dotenv').config()
const express = require('express')
const cors = require('cors')
const crypto = require('crypto')
const ws = require('ws')
const path = require('path')
const line = require('@line/bot-sdk')
const { createClient } = require('@supabase/supabase-js')

const app = express()
const PORT = process.env.PORT || 3000
const staticDir = path.join(__dirname, 'public')

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || '',
  { realtime: { transport: ws } }
)

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || ''
}
const lineClient = lineConfig.channelAccessToken && lineConfig.channelSecret
  ? new line.Client(lineConfig)
  : null

const LIFF_ID = process.env.LINE_LIFF_ID || ''
const READING_TABLE = process.env.SUPABASE_READING_TABLE || 'meter_readings'
const USER_TABLE = process.env.SUPABASE_USER_TABLE || 'meter_users'

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.warn('Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment variables')
}
if (!lineClient) {
  console.warn('Missing LINE_CHANNEL_ACCESS_TOKEN or LINE_CHANNEL_SECRET in environment variables')
}
if (!LIFF_ID) {
  console.warn('Missing LINE_LIFF_ID in environment variables')
}

app.use(cors())
app.use(express.json())
app.use(express.static(staticDir))

function getUserId(req) {
  return req.header('x-line-user-id') || req.query.userId || req.body?.userId || null
}

function normalizeCommand(text) {
  return String(text || '').trim().toLowerCase()
}

function buildUsage(records) {
  return records.map((r, i) => {
    const units = i === 0 ? 0 : Math.max(0, r.meter_value - records[i - 1].meter_value)
    return { ...r, units }
  })
}

function formatSummary(records) {
  if (!records.length) return 'ยังไม่มีข้อมูล'
  const usage = buildUsage(records)
  const latest = usage[usage.length - 1]
  const total = usage.reduce((s, r) => s + r.units, 0)
  const lastUnits = usage.length > 1 ? usage[usage.length - 1].units : 0
  return [
    `ล่าสุด ${latest.meter_value}`,
    `ใช้ไป ${total.toFixed(2)} หน่วย`,
    `ครั้งล่าสุด +${lastUnits.toFixed(2)} หน่วย`,
    `บันทึก ${records.length} รายการ`
  ].join(' · ')
}

async function getRecordsByUser(userId) {
  let query = supabase.from(READING_TABLE).select('*').order('recorded_at', { ascending: true })
  if (userId) query = query.eq('user_id', userId)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

async function createRecord({ meter_value, note, user_id, source = 'web' }) {
  const payload = {
    meter_value: parseFloat(meter_value),
    note: note || null,
    recorded_at: new Date().toISOString()
  }
  if (user_id !== undefined) payload.user_id = user_id
  if (source !== undefined) payload.source = source

  const { data, error } = await supabase.from(READING_TABLE).insert([payload]).select().single()
  if (error) throw error
  return data
}

async function deleteRecordById(id, userId) {
  let query = supabase.from(READING_TABLE).delete().eq('id', id)
  if (userId) query = query.eq('user_id', userId)
  const { error } = await query
  if (error) throw error
  return true
}

async function deleteLastRecord(userId) {
  let query = supabase.from(READING_TABLE).select('*').order('recorded_at', { ascending: false }).limit(1)
  if (userId) query = query.eq('user_id', userId)
  const { data, error } = await query
  if (error) throw error
  if (!data || !data.length) return null
  const last = data[0]
  await deleteRecordById(last.id, userId)
  return last
}

async function upsertUserProfile(profile) {
  if (!profile?.userId) return null
  const payload = {
    user_id: profile.userId,
    display_name: profile.displayName || null,
    picture_url: profile.pictureUrl || null,
    status_message: profile.statusMessage || null,
    updated_at: new Date().toISOString()
  }
  const { data, error } = await supabase.from(USER_TABLE).upsert(payload, { onConflict: 'user_id' }).select().single()
  if (error) throw error
  return data
}

app.get('/api/config', (req, res) => {
  res.json({
    liffId: LIFF_ID,
    lineReady: Boolean(lineClient),
    envReady: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY)
  })
})

app.get('/api/liff/me', async (req, res) => {
  try {
    const userId = getUserId(req)
    if (!userId) return res.status(400).json({ error: 'missing user id' })
    const { data: profile } = await supabase.from(USER_TABLE).select('*').eq('user_id', userId).maybeSingle()
    const records = await getRecordsByUser(userId)
    res.json({ profile, summary: formatSummary(records), records })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/records', async (req, res) => {
  try {
    const userId = getUserId(req)
    const records = await getRecordsByUser(userId)
    res.json(records)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/records', async (req, res) => {
  try {
    const { meter_value, note, user_id, source } = req.body
    if (meter_value === undefined || Number.isNaN(Number(meter_value))) {
      return res.status(400).json({ error: 'meter_value ต้องเป็นตัวเลข' })
    }
    const data = await createRecord({ meter_value, note, user_id, source: source || 'web' })
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.delete('/api/records/:id', async (req, res) => {
  try {
    const userId = getUserId(req)
    await deleteRecordById(req.params.id, userId)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/liff/profile', async (req, res) => {
  try {
    const profile = req.body?.profile
    if (!profile?.userId) return res.status(400).json({ error: 'missing profile' })
    const data = await upsertUserProfile(profile)
    res.json({ success: true, profile: data })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/liff/action', async (req, res) => {
  try {
    const { action, meter_value, note, user_id } = req.body || {}
    if (!user_id) return res.status(400).json({ error: 'missing user_id' })

    if (action === 'cancel') {
      const deleted = await deleteLastRecord(user_id)
      return res.json({ ok: true, deleted })
    }

    if (action === 'latest') {
      const records = await getRecordsByUser(user_id)
      return res.json({ ok: true, summary: formatSummary(records), latest: records.at(-1) || null })
    }

    if (action === 'save') {
      if (meter_value === undefined || Number.isNaN(Number(meter_value))) {
        return res.status(400).json({ error: 'meter_value ต้องเป็นตัวเลข' })
      }
      const record = await createRecord({ meter_value, note, user_id, source: 'liff' })
      return res.json({ ok: true, record })
    }

    return res.status(400).json({ error: 'unknown action' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/line/webhook', async (req, res) => {
  try {
    console.log('[WEBHOOK] 🔔 Received webhook call')
    console.log('[WEBHOOK] Headers:', JSON.stringify(req.headers))
    
    if (!lineClient) {
      console.log('[WEBHOOK] ❌ lineClient is null')
      return res.status(503).json({ error: 'line not configured' })
    }

    const rawBody = req.body
    console.log('[WEBHOOK] rawBody type:', typeof rawBody, 'isBuffer:', Buffer.isBuffer(rawBody))
    
    const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '')
    const signature = req.headers['x-line-signature'] || ''
    const expected = crypto
      .createHmac('SHA256', lineConfig.channelSecret)
      .update(Buffer.isBuffer(rawBody) ? rawBody : bodyStr)
      .digest('base64')

    console.log('[WEBHOOK] signature from LINE:', signature)
    console.log('[WEBHOOK] expected signature:', expected)
    console.log('[WEBHOOK] match:', signature === expected)

    if (signature !== expected) {
      console.warn('[WEBHOOK] ⚠️ LINE webhook signature mismatch')
      return res.json({ ok: true })
    }

    const parsed = JSON.parse(bodyStr)
    const events = parsed.events || []
    console.log('[WEBHOOK] events count:', events.length)

    await Promise.all(events.map(async event => {
      console.log('[WEBHOOK] event type:', event.type, 'message type:', event.message?.type)
      
      if (event.type !== 'message' || event.message.type !== 'text') {
        console.log('[WEBHOOK] skipping non-text message')
        return
      }
      
      const userId = event.source?.userId
      const text = String(event.message.text || '').trim()
      const cmd = text.toLowerCase().trim()
      
      console.log('[WEBHOOK] userId:', userId, 'text:', text, 'cmd:', cmd)

      if (!userId) {
        console.log('[WEBHOOK] no userId, skipping')
        return
      }

      if (cmd === 'cancel' || cmd === 'undo' || cmd === 'ยกเลิก') {
        console.log('[WEBHOOK] processing cancel')
        const deleted = await deleteLastRecord(userId)
        console.log('[WEBHOOK] deleted:', deleted)
        await lineClient.replyMessage(event.replyToken, {
          type: 'text',
          text: deleted
            ? `ยกเลิกรายการล่าสุดแล้ว\nเลขมิเตอร์ ${deleted.meter_value}`
            : 'ยังไม่มีรายการให้ยกเลิก'
        })
        console.log('[WEBHOOK] cancel reply sent')
        return
      }

      if (cmd === 'latest' || cmd === 'ล่าสุด' || cmd === 'summary') {
        console.log('[WEBHOOK] processing latest')
        const records = await getRecordsByUser(userId)
        await lineClient.replyMessage(event.replyToken, {
          type: 'text',
          text: formatSummary(records)
        })
        console.log('[WEBHOOK] latest reply sent')
        return
      }

      if (/^\d+(\.\d+)?$/.test(cmd)) {
        console.log('[WEBHOOK] processing number save:', text)
        const record = await createRecord({ meter_value: text, note: 'LINE', user_id: userId, source: 'line' })
        await lineClient.replyMessage(event.replyToken, {
          type: 'text',
          text: `บันทึกแล้ว\nเลขมิเตอร์ ${record.meter_value}\nเวลา ${new Date(record.recorded_at).toLocaleString('th-TH')}`
        })
        console.log('[WEBHOOK] save reply sent')
        return
      }
      
      console.log('[WEBHOOK] unhandled command:', cmd)
    }))

    res.json({ ok: true })
  } catch (error) {
    console.error('[WEBHOOK] ❌ Error:', error)
    res.json({ ok: true })
  }
})

app.get('*', (req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n⚡ Electricity Tracker รันที่ http://localhost:${PORT}`)
  console.log(`   พร้อมสำหรับ Render/Docker แล้ว\n`)
})
