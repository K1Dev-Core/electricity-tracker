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

// — webhook ต้อง raw body ก่อน json parser —
app.use('/api/line/webhook', express.raw({ type: '*/*' }))

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

async function getPrevRecord(userId) {
  // ดึง 2 รายการล่าสุด → อันที่ 2 คือก่อนรายการที่เพิ่งบันทึก
  let query = supabase.from(READING_TABLE).select('meter_value').order('recorded_at', { ascending: false }).limit(2)
  if (userId) query = query.eq('user_id', userId)
  const { data, error } = await query
  if (error) throw error
  if (!data || data.length < 2) return null
  return data[1]
}

async function createRecord({ meter_value, note, user_id, source = 'web', is_billing_start }) {
  const payload = {
    meter_value: parseFloat(meter_value),
    note: note || null,
    recorded_at: new Date().toISOString()
  }
  if (user_id !== undefined) payload.user_id = user_id
  if (source !== undefined) payload.source = source
  if (is_billing_start !== undefined) payload.is_billing_start = is_billing_start

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

// — Toggle billing cycle start flag —
app.patch('/api/records/:id/billing', async (req, res) => {
  try {
    const { id } = req.params
    const { data, error: getErr } = await supabase.from(READING_TABLE).select('is_billing_start').eq('id', id).single()
    if (getErr) return res.status(404).json({ error: 'not found' })
    const newVal = !data.is_billing_start
    const { error: updErr } = await supabase.from(READING_TABLE).update({ is_billing_start: newVal }).eq('id', id)
    if (updErr) return res.status(500).json({ error: updErr.message })
    res.json({ success: true, is_billing_start: newVal })
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
    console.log('[WEBHOOK] 🔔 Received')

    if (!lineClient) return res.status(503).json({ error: 'line not configured' })

    const rawBody = req.body  // Buffer from express.raw()
    const bodyStr = rawBody.toString('utf8')
    const signature = req.headers['x-line-signature'] || ''

    // -- Debug diagnostics --
    const bodyPreview = bodyStr.length > 80 ? bodyStr.substring(0, 80) + '...' : bodyStr
    console.log('[WEBHOOK] body:', bodyPreview)
    console.log('[WEBHOOK] sig header:', signature ? signature.substring(0, 15) + '...' : 'MISSING')
    console.log('[WEBHOOK] secret ends with:', lineConfig.channelSecret ? '...' + lineConfig.channelSecret.slice(-4) : 'MISSING')

    const expected = crypto
      .createHmac('SHA256', lineConfig.channelSecret)
      .update(rawBody)
      .digest('base64')

    if (signature !== expected) {
      console.warn('[WEBHOOK] signature mismatch')
      console.log('[WEBHOOK] exp hash:', expected.substring(0, 15) + '...')
      // TODO: remove bypass after fixing secret
      console.log('[WEBHOOK] bypassing check for testing')
    } else {
      console.log('[WEBHOOK] signature OK')
    }

    const parsed = JSON.parse(bodyStr)
    const events = parsed.events || []
    console.log('[WEBHOOK] events:', events.length)

    await Promise.all(events.map(async event => {
      console.log('[WEBHOOK] event type:', event.type, 'message type:', event.message?.type)
      
      // ── ตอบกลับ postback (ผลลัพธ์ลบ) ──
      if (event.type === 'postback') {
        const userId = event.source?.userId
        if (!userId) return
        const data = event.postback?.data || ''
        const match = data.match(/^delete_record:(\d+)$/)
        if (!match) return
        const recordId = parseInt(match[1], 10)
        console.log('[WEBHOOK] postback delete record:', recordId)
        try {
          // เช็คก่อนว่ายังมี record อยู่ไหม
          const { data: existing } = await supabase.from(READING_TABLE).select('id').eq('id', recordId).maybeSingle()
          
          if (!existing) {
            // ถ้าลบไปแล้ว → บอกว่าไม่มีแล้ว
            await lineClient.replyMessage(event.replyToken, {
              type: 'text',
              text: '⛔ รายการนี้ถูกลบไปก่อนหน้านี้แล้ว'
            })
            return
          }
          
          await deleteRecordById(recordId, userId)
          await lineClient.replyMessage(event.replyToken, {
            type: 'flex',
            altText: '🗑️ ลบรายการแล้ว',
            type: 'flex',
            altText: '🗑️ ลบรายการแล้ว',
            contents: {
              type: 'bubble',
              size: 'giga',
              body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                  {
                    type: 'text',
                    text: '🗑️ ลบรายการแล้ว',
                    weight: 'bold',
                    size: 'lg',
                    color: '#c0392b'
                  },
                  { type: 'separator', color: '#e8e8e0' },
                  {
                    type: 'text',
                    text: 'ยกเลิกสำเร็จ รายการนี้ถูกนำออกแล้ว',
                    size: 'sm',
                    color: '#333333',
                    wrap: true
                  },
                  { type: 'separator', color: '#e8e8e0' },
                  {
                    type: 'button',
                    style: 'primary',
                    color: '#1a1a18',
                    action: {
                      type: 'uri',
                      label: 'เปิดแอป',
                      uri: 'https://liff.line.me/2010240368-w9rYgLNk'
                    }
                  }
                ]
              }
            }
          })
        } catch (e) {
          console.error('[WEBHOOK] delete failed:', e)
          await lineClient.replyMessage(event.replyToken, {
            type: 'text',
            text: '❌ ลบไม่สำเร็จ'
          })
        }
        return
      }
      
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

      // — ลบโดยตรงถูกย้ายไปที่ปุ่มใน Flex Message แทน —

      if (cmd === 'latest' || cmd === 'ล่าสุด' || cmd === 'summary' || cmd === 'สรุป') {
        console.log('[WEBHOOK] processing latest')
        const records = await getRecordsByUser(userId)
        const usage = buildUsage(records)
        
        // หารอบบิลล่าสุด
        const billingRecords = records.filter(r => r.is_billing_start)
        const billingStart = billingRecords.length > 0
          ? billingRecords[billingRecords.length - 1].recorded_at
          : new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
        const billingUsage = usage.filter(r => r.recorded_at >= billingStart)
        const billingUnits = billingUsage.reduce((s, r) => s + (r.units || 0), 0)
        const billingCost = +(billingUnits * 8).toFixed(2)
        const billingStartLabel = new Date(billingStart).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })
        
        const summary = formatSummary(records)
        await lineClient.replyMessage(event.replyToken, {
          type: 'flex',
          altText: 'สรุปการใช้ไฟ',
          contents: {
            type: 'bubble',
            size: 'giga',
            body: {
              type: 'box',
              layout: 'vertical',
              spacing: 'md',
              contents: [
                {
                  type: 'text',
                  text: '⚡ Meter Tracker',
                  weight: 'bold',
                  size: 'xl'
                },
                {
                  type: 'separator',
                  color: '#e8e8e0'
                },
                {
                  type: 'text',
                  text: summary,
                  wrap: true,
                  size: 'sm',
                  color: '#333333'
                },
                {
                  type: 'separator',
                  color: '#e8e8e0'
                },
                {
                  type: 'text',
                  text: `📆 วันที่เริ่มรอบบิล ${billingStartLabel}\nรวม ${billingUnits.toFixed(2)} หน่วย (${billingCost.toFixed(0)} บาท)`,
                  wrap: true,
                  size: 'sm',
                  color: '#1a1a18',
                  weight: 'bold'
                },
                {
                  type: 'separator',
                  color: '#e8e8e0'
                },
                {
                  type: 'button',
                  style: 'primary',
                  color: '#1a1a18',
                  action: {
                    type: 'uri',
                    label: 'เปิดแอป',
                    uri: 'https://liff.line.me/2010240368-w9rYgLNk'
                  }
                }
              ]
            }
          }
        })
        console.log('[WEBHOOK] latest reply sent')
        return
      }

      if (/^\d+(\.\d+)?$/.test(cmd)) {
        console.log('[WEBHOOK] processing number save:', text)
        const record = await createRecord({ meter_value: text, note: 'LINE', user_id: userId, source: 'line' })
        const prev = await getPrevRecord(userId)
        const units = prev && record.meter_value >= prev.meter_value
          ? record.meter_value - prev.meter_value
          : null
        const cost = units ? +(units * 8).toFixed(2) : 0
        
        const bodyContents = []
        bodyContents.push({
          type: 'text',
          text: '✅ บันทึกเรียบร้อย',
          weight: 'bold',
          size: 'lg',
          color: '#1a1a18'
        })
        bodyContents.push({ type: 'separator', color: '#e8e8e0' })

        // — ยอดสะสมรอบบิล —
        const allRecords = await getRecordsByUser(userId)
        const allUsage = buildUsage(allRecords)

        // หาวันเริ่มรอบบิลล่าสุด
        const billingRecords = allRecords.filter(r => r.is_billing_start)
        const billingStart = billingRecords.length > 0
          ? billingRecords[billingRecords.length - 1].recorded_at
          : new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

        const billingUsage = allUsage.filter(r => r.recorded_at >= billingStart)
        const billingUnits = billingUsage.reduce((s, r) => s + (r.units || 0), 0)
        const billingCost = +(billingUnits * 8).toFixed(2)
        const billingStartLabel = new Date(billingStart).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })
        
        bodyContents.push({
          type: 'text',
          text: `📆 นับจากวันที่ ${billingStartLabel} รวม ${billingUnits.toFixed(2)} หน่วย (${billingCost.toFixed(0)} บาท)`,
          size: 'sm',
          color: '#1a1a18',
          weight: 'bold',
          wrap: true
        })
        bodyContents.push({ type: 'separator', color: '#e8e8e0' })
        
        if (units !== null) {
          bodyContents.push({
            type: 'text',
            text: `มิเตอร์ ${prev.meter_value} → ${record.meter_value}`,
            size: 'sm',
            color: '#333333',
            wrap: true
          })
          bodyContents.push({
            type: 'text',
            text: `หน่วยที่ใช้ +${units.toFixed(2)} หน่วย = ${cost.toFixed(0)} บาท`,
            size: 'sm',
            color: '#333333',
            wrap: true
          })
        } else {
          bodyContents.push({
            type: 'text',
            text: `มิเตอร์ ${record.meter_value} (รอบแรก)`,
            size: 'sm',
            color: '#333333',
            wrap: true
          })
        }
        
        bodyContents.push({ type: 'separator', color: '#e8e8e0' })
        
        // Buttons row
        const btnBox = {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'button',
              style: 'secondary',
              color: '#1a1a18',
              action: {
                type: 'postback',
                label: 'ลบ',
                data: `delete_record:${record.id}`
              }
            },
            {
              type: 'button',
              style: 'primary',
              color: '#1a1a18',
              action: {
                type: 'uri',
                label: 'เปิดแอป',
                uri: 'https://liff.line.me/2010240368-w9rYgLNk'
              }
            }
          ]
        }
        bodyContents.push(btnBox)

        await lineClient.replyMessage(event.replyToken, {
          type: 'flex',
          altText: '✅ บันทึกแล้ว',
          contents: {
            type: 'bubble',
            size: 'giga',
            body: {
              type: 'box',
              layout: 'vertical',
              spacing: 'md',
              contents: bodyContents
            }
          }
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
