const RATE = 8
let records = []
let chartMode = 'day'
let chart = null
let heatmapMode = 'day'
let lineProfile = null
let lineUserId = null
let lineReady = false

function updateClock() {
  const el = document.getElementById('clock')
  if (!el) return
  const d = new Date()
  el.textContent = d.toLocaleString('th-TH', {
    day: '2-digit', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}
updateClock()
setInterval(updateClock, 1000)

function showToast(msg) {
  const t = document.getElementById('toast')
  t.textContent = msg
  t.classList.add('show')
  clearTimeout(t._tid)
  t._tid = setTimeout(() => t.classList.remove('show'), 2400)
}

function showLiffToast(msg) {
  const t = document.getElementById('liffToast')
  if (!t) return showToast(msg)
  t.textContent = msg
  t.classList.add('show')
  clearTimeout(t._tid)
  t._tid = setTimeout(() => t.classList.remove('show'), 2600)
}

function fmtNum(n) {
  return (+n).toLocaleString('th-TH', { maximumFractionDigits: 2 })
}
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('th-TH', {
    day: '2-digit', month: 'short', year: '2-digit'
  })
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('th-TH', {
    hour: '2-digit', minute: '2-digit'
  })
}

function setEl(id, val) {
  const el = document.getElementById(id)
  if (el) el.textContent = val
}

async function fetchConfig() {
  try {
    const res = await fetch('/api/config')
    if (res.ok) {
      const cfg = await res.json()
      lineReady = !!cfg.liffId
      const badge = document.getElementById('liffStatusBadge')
      if (badge) badge.textContent = cfg.liffId ? 'LINE Ready' : 'LINE ยังไม่ตั้งค่า'
    }
  } catch (_) {}
}

async function initLiff() {
  await fetchConfig()
  if (typeof liff === 'undefined') {
    renderFallbackMode()
    return
  }
  try {
    const cfg = await (await fetch('/api/config')).json()
    if (!cfg.liffId) {
      renderFallbackMode()
      return
    }
    await liff.init({ liffId: cfg.liffId })
    if (!liff.isLoggedIn()) {
      renderLineLoginState(false)
      return
    }
    renderLineLoginState(true)
    lineProfile = await liff.getProfile()
    lineUserId = lineProfile.userId
    await syncLineProfile()
    await fetchRecords()
  } catch (e) {
    renderFallbackMode()
    console.warn('LIFF init error:', e)
  }
}

function renderFallbackMode() {
  const badge = document.getElementById('liffStatusBadge')
  if (badge) badge.textContent = 'Standalone mode'
}

function renderLineLoginState(isLoggedIn) {
  const loginBtn = document.getElementById('btnLineLogin')
  const logoutBtn = document.getElementById('btnLineLogout')
  const userBox = document.getElementById('lineUserBox')
  if (loginBtn) loginBtn.classList.toggle('hidden', isLoggedIn)
  if (logoutBtn) logoutBtn.classList.toggle('hidden', !isLoggedIn)
  if (userBox) userBox.classList.toggle('hidden', !isLoggedIn)
}

async function syncLineProfile() {
  if (!lineProfile) return
  await fetch('/api/liff/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile: lineProfile })
  })
  const nameEl = document.getElementById('lineName')
  const idEl = document.getElementById('lineId')
  const picEl = document.getElementById('lineAvatar')
  if (nameEl) nameEl.textContent = lineProfile.displayName || 'LINE User'
  if (idEl) idEl.textContent = lineProfile.userId
  if (picEl && lineProfile.pictureUrl) picEl.src = lineProfile.pictureUrl
}

async function lineAction(action, meterValue = null) {
  if (!lineUserId) return showLiffToast('กรุณา login LINE ก่อน')
  const res = await fetch('/api/liff/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, meter_value: meterValue, user_id: lineUserId })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด')
  return data
}

async function shareLatest() {
  try {
    const data = await lineAction('latest')
    const txt = data.summary || 'ยังไม่มีข้อมูล'
    if (typeof liff !== 'undefined' && liff.isReady) {
      if (liff.isApiAvailable('shareTargetPicker')) {
        await liff.shareTargetPicker([{ type: 'text', text: txt }])
        showLiffToast('ส่งสรุปแล้ว')
        return
      }
      if (liff.isApiAvailable('sendMessages')) {
        await liff.sendMessages([{ type: 'text', text: txt }])
        showLiffToast('ส่งสรุปแล้ว')
        return
      }
    }
    showLiffToast(txt)
  } catch (e) {
    showLiffToast(e.message)
  }
}

function parseMeterInput() {
  const meterEl = document.getElementById('inputMeter')
  const meter = parseFloat(meterEl?.value)
  return Number.isNaN(meter) ? null : meter
}

async function addRecord() {
  const meterEl = document.getElementById('inputMeter')
  const noteEl = document.getElementById('inputNote')
  const btn = document.getElementById('btnSave')
  const btnText = document.getElementById('btnText')
  const meter = parseMeterInput()
  if (meter === null || meter < 0) {
    showToast('กรุณากรอกเลขมิเตอร์')
    meterEl.focus()
    return
  }
  if (records.length > 0) {
    const last = records[records.length - 1]
    if (meter < last.meter_value) {
      const ok = confirm(`เลขมิเตอร์ ${meter} น้อยกว่าครั้งก่อน (${last.meter_value})\nแน่ใจว่าจะบันทึก?`)
      if (!ok) return
    }
  }
  btn.disabled = true
  btnText.textContent = 'กำลังบันทึก...'
  try {
    const payload = { meter_value: meter, note: noteEl.value.trim(), user_id: lineUserId || null, source: lineUserId ? 'liff' : 'web' }
    const res = await fetch('/api/records', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'เกิดข้อผิดพลาด')
    }
    records.push(await res.json())
    meterEl.value = ''
    noteEl.value = ''
    render()
    showToast('บันทึกเรียบร้อย')
  } catch (e) {
    showToast('บันทึกไม่ได้: ' + e.message)
  } finally {
    btn.disabled = false
    btnText.textContent = 'บันทึกตอนนี้'
  }
}

async function cancelLastRecord() {
  if (!confirm('ยกเลิกรายการล่าสุด?')) return
  try {
    if (lineUserId) {
      await lineAction('cancel')
    }
    const res = await fetch('/api/records/latest?userId=' + encodeURIComponent(lineUserId || ''), { method: 'DELETE' })
    if (!res.ok && !lineUserId) throw new Error('ยกเลิกไม่ได้')
    await fetchRecords()
    showToast('ยกเลิกรายการล่าสุดแล้ว')
  } catch (e) {
    showToast(e.message)
  }
}

async function deleteRecord(id) {
  if (!confirm('ลบรายการนี้?')) return
  try {
    const res = await fetch('/api/records/' + id, { method: 'DELETE', headers: lineUserId ? { 'x-line-user-id': lineUserId } : {} })
    if (!res.ok) throw new Error('ลบไม่ได้')
    records = records.filter(r => r.id !== id)
    render()
    showToast('ลบแล้ว')
  } catch (e) {
    showToast(e.message)
  }
}

function getUsage() {
  return records.map((r, i) => {
    const units = i === 0 ? 0 : Math.max(0, r.meter_value - records[i - 1].meter_value)
    return { ...r, units, cost: +(units * RATE).toFixed(2) }
  })
}

function autoFillInputMeter() {
  const meterEl = document.getElementById('inputMeter')
  if (!meterEl || meterEl.value) return
  const last = records[records.length - 1]
  if (!last) return
  const usage = getUsage().filter(r => r.units > 0)
  const recentAvg = usage.length ? usage.slice(-4).reduce((sum, r) => sum + r.units, 0) / Math.min(4, usage.length) : 2.5
  const suggested = Math.max(last.meter_value + 1, last.meter_value + Math.round(recentAvg || 2.5))
  meterEl.value = suggested.toFixed(2).replace(/\.00$/, '')
  meterEl.placeholder = `เดาไว้ก่อน: ${meterEl.value}`
}

function getHeatmapData(usage, mode = 'day') {
  if (!records.length) return []
  const dayMap = new Map(usage.map(r => [new Date(r.recorded_at).toDateString(), r.units]))
  const out = []
  if (mode === 'year') {
    const monthMap = new Map()
    usage.forEach(r => {
      const d = new Date(r.recorded_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthMap.set(key, (monthMap.get(key) || 0) + r.units)
    })
    ;[...monthMap.keys()].sort().forEach(key => out.push({ key, units: monthMap.get(key) || 0 }))
    return out
  }
  if (mode === 'month') {
    const ref = new Date(records[records.length - 1].recorded_at)
    const cursor = new Date(ref.getFullYear(), ref.getMonth(), 1)
    const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0)
    while (cursor <= end) {
      out.push({ key: cursor.toDateString(), units: dayMap.get(cursor.toDateString()) || 0 })
      cursor.setDate(cursor.getDate() + 1)
    }
    return out
  }
  const ref = new Date(records[records.length - 1].recorded_at)
  const cursor = new Date(ref)
  cursor.setDate(ref.getDate() - 27)
  for (let i = 0; i < 28; i++) {
    out.push({ key: cursor.toDateString(), units: dayMap.get(cursor.toDateString()) || 0 })
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

function getHeatClass(v, max) {
  if (max <= 0) return 's0'
  const ratio = v / max
  if (ratio < 0.2) return 's1'
  if (ratio < 0.45) return 's2'
  if (ratio < 0.75) return 's3'
  return 's4'
}

function render() {
  const usage = getUsage()
  const withData = usage.filter(r => r.units > 0)
  const last = withData[withData.length - 1]
  setEl('lastUnit', last ? fmtNum(last.units) : '—')
  setEl('lastCost', last ? fmtNum(last.cost) : '—')
  const now = new Date()
  const monthData = usage.filter(r => {
    const d = new Date(r.recorded_at)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const mU = monthData.reduce((s, r) => s + r.units, 0)
  setEl('monthUnit', mU > 0 ? fmtNum(mU) : '—')
  setEl('monthCost', mU > 0 ? fmtNum(mU * RATE) : '—')
  setEl('countBadge', records.length > 0 ? records.length + ' รายการ' : '')
  updateAlerts(usage)
  renderTable(usage)
  renderChart(withData)
  renderHeatmap(usage, heatmapMode)
}

function renderTable(usage) {
  const tbody = document.getElementById('historyBody')
  const empty = document.getElementById('emptyMsg')
  tbody.innerHTML = ''
  if (records.length === 0) {
    empty.classList.add('show')
    return
  }
  empty.classList.remove('show')
  const reversed = [...usage].reverse()
  reversed.forEach(r => {
    const isFirst = records.findIndex(x => x.id === r.id) === 0
    const tr = document.createElement('tr')
    const usagePill = isFirst ? '<span class="pill pill-gray">เริ่มต้น</span>' : '<span class="pill pill-green">+' + fmtNum(r.units) + '</span>'
    const costCell = isFirst ? '—' : fmtNum(r.cost) + ' ฿'
    tr.innerHTML = `
      <td>${fmtDate(r.recorded_at)}</td>
      <td>${fmtTime(r.recorded_at)}</td>
      <td class="num-col">${fmtNum(r.meter_value)}</td>
      <td class="num-col">${usagePill}</td>
      <td class="num-col">${costCell}</td>
      <td class="note-cell">${r.note || ''}</td>
      <td><button class="btn-del" onclick="deleteRecord(${r.id})" aria-label="ลบรายการ"><i class="ti ti-trash" aria-hidden="true"></i></button></td>`
    tbody.appendChild(tr)
  })
}

function switchTab(mode, el) {
  chartMode = mode
  document.querySelectorAll('.tab-group[role="tablist"] .tab').forEach(t => t.classList.remove('active'))
  el.classList.add('active')
  renderChart(getUsage().filter(r => r.units > 0))
}

function renderChart(usageData) {
  const chartEmpty = document.getElementById('chartEmpty')
  const canvas = document.getElementById('myChart')
  if (usageData.length < 2) {
    chartEmpty.classList.remove('hidden')
    canvas.style.display = 'none'
    if (chart) { chart.destroy(); chart = null }
    return
  }
  chartEmpty.classList.add('hidden')
  canvas.style.display = 'block'
  let labels = [], data = []
  if (chartMode === 'day') {
    labels = usageData.map(r => fmtDate(r.recorded_at))
    data = usageData.map(r => r.units)
  } else {
    const monthly = {}
    usageData.forEach(r => {
      const d = new Date(r.recorded_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthly[key] = +(((monthly[key] || 0) + r.units).toFixed(2))
    })
    const sorted = Object.keys(monthly).sort()
    labels = sorted.map(k => {
      const [y, m] = k.split('-')
      return new Date(+y, +m - 1).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })
    })
    data = sorted.map(k => monthly[k])
  }
  if (chart) chart.destroy()
  chart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets: [{ label: 'หน่วย', data, borderColor: '#1a1a18', backgroundColor: 'rgba(26, 26, 24, 0.08)', pointBackgroundColor: '#ffffff', pointBorderColor: '#1a1a18', pointBorderWidth: 2, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2.5, tension: 0.38, fill: true }] },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1a1a18', titleColor: 'rgba(255,255,255,0.5)', bodyColor: '#fff', padding: 10, cornerRadius: 6, callbacks: { title: ctx => ctx[0].label, label: ctx => `${fmtNum(ctx.parsed.y)} หน่วย  ·  ${fmtNum(ctx.parsed.y * RATE)} บาท` } } }, scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: '#8a8a84', font: { size: 11, family: "'IBM Plex Sans Thai', sans-serif" }, maxRotation: 45, autoSkip: true, maxTicksLimit: 10 } }, y: { grid: { color: '#f2f2ec' }, border: { display: false, dash: [3, 3] }, ticks: { color: '#8a8a84', font: { size: 11, family: "'IBM Plex Mono', monospace" }, maxTicksLimit: 5 }, beginAtZero: true } } }
  })
}

function renderHeatmap(usageData, mode = 'day') {
  const grid = document.getElementById('heatmapGrid')
  const skeleton = document.getElementById('heatmapSkeleton')
  const empty = document.getElementById('heatmapEmpty')
  if (!grid || !skeleton || !empty) return
  grid.innerHTML = ''
  skeleton.classList.remove('hidden')
  empty.classList.add('hidden')
  const days = getHeatmapData(usageData, mode)
  if (!days.length) {
    skeleton.classList.add('hidden')
    empty.classList.remove('hidden')
    return
  }
  skeleton.classList.add('hidden')
  const max = Math.max(...days.map(d => d.units), 0)
  days.forEach(d => {
    const cell = document.createElement('button')
    cell.type = 'button'
    cell.className = `heat-cell ${getHeatClass(d.units, max)}`
    cell.title = mode === 'year'
      ? `${d.key} · ${fmtNum(d.units)} หน่วย`
      : `${new Date(d.key).toLocaleDateString('th-TH')} · ${fmtNum(d.units)} หน่วย`
    cell.innerHTML = `<span>${mode === 'year' ? d.key.slice(-2) : new Date(d.key).getDate()}</span>`
    grid.appendChild(cell)
  })
}

function updateAlerts(usage) {
  const dayBadge = document.getElementById('dayAlertBadge')
  const weekBadge = document.getElementById('weekAlertBadge')
  const today = new Date().toDateString()
  const todayUnits = usage.find(r => new Date(r.recorded_at).toDateString() === today)?.units || 0
  const weekUnits = getLastDaysUnits(usage, 7)
  const avgDay = avgUnits(usage, 7)
  const trend = buildTrendSummary(usage)
  setEl('avgDayUnit', trend.avgDay > 0 ? fmtNum(trend.avgDay) : '—')
  setEl('peakDayUnit', trend.peak ? fmtNum(trend.peak.units) : '—')
  setEl('peakDayLabel', trend.peak ? trend.peak.label : '—')
  setEl('lowDayUnit', trend.low ? fmtNum(trend.low.units) : '—')
  setEl('lowDayLabel', trend.low ? trend.low.label : '—')
  setEl('monthCompareValue', trend.monthCompareValue)
  setEl('monthCompareLabel', trend.monthCompareLabel)
  applyAlert(dayBadge, todayUnits, avgDay, 'วันนี้')
  applyAlert(weekBadge, weekUnits, avgUnits(usage, 30), 'สัปดาห์นี้')
}

function applyAlert(el, current, avg, label) {
  if (!el) return
  if (!avg || current === 0) {
    el.textContent = 'รอข้อมูล'
    el.className = 'mini-badge'
    return
  }
  const ratio = current / avg
  if (ratio >= 1.35) {
    el.textContent = `${label}: สูงผิดปกติ`
    el.className = 'mini-badge danger'
  } else if (ratio >= 1.1) {
    el.textContent = `${label}: เริ่มสูง`
    el.className = 'mini-badge warn'
  } else {
    el.textContent = `${label}: ปกติ`
    el.className = 'mini-badge ok'
  }
}

function getLastDaysUnits(usage, days) {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - (days - 1))
  return usage.filter(r => {
    const d = new Date(r.recorded_at)
    return d >= start && d <= end
  }).reduce((s, r) => s + r.units, 0)
}

function avgUnits(usage, days) {
  if (!usage.length) return 0
  return getLastDaysUnits(usage, days) / days
}

function buildTrendSummary(usage) {
  const daily = new Map()
  usage.forEach(r => {
    const k = new Date(r.recorded_at).toDateString()
    daily.set(k, (daily.get(k) || 0) + r.units)
  })
  const items = [...daily.entries()].map(([k, units]) => ({
    key: k,
    units,
    label: new Date(k).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })
  }))
  const valid = items.filter(x => x.units > 0)
  const avgDay = valid.length ? valid.reduce((s, x) => s + x.units, 0) / valid.length : 0
  const peak = valid.reduce((best, cur) => (!best || cur.units > best.units ? cur : best), null)
  const low = valid.reduce((best, cur) => (!best || cur.units < best.units ? cur : best), null)
  const now = new Date()
  const thisMonth = usage.filter(r => {
    const d = new Date(r.recorded_at)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).reduce((s, r) => s + r.units, 0)
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonth = usage.filter(r => {
    const d = new Date(r.recorded_at)
    return d.getMonth() === prev.getMonth() && d.getFullYear() === prev.getFullYear()
  }).reduce((s, r) => s + r.units, 0)
  const diff = thisMonth - lastMonth
  const pct = lastMonth > 0 ? (diff / lastMonth) * 100 : 0
  const sign = diff >= 0 ? '+' : ''
  return {
    avgDay,
    peak,
    low,
    monthCompareValue: lastMonth === 0 ? '—' : `${sign}${fmtNum(diff)} หน่วย (${sign}${fmtNum(pct)}%)`,
    monthCompareLabel: lastMonth === 0 ? 'ยังไม่มีข้อมูลเดือนก่อน' : `เดือนก่อน ${fmtNum(lastMonth)} หน่วย`
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.activeElement.id !== 'inputNote') {
    addRecord()
  }
})

function switchHeatmap(mode, el) {
  heatmapMode = mode
  document.querySelectorAll('.heatmap-card .tab').forEach(t => t.classList.remove('active'))
  el.classList.add('active')
  const usage = getUsage().filter(r => r.units > 0)
  renderHeatmap(usage, heatmapMode)
}

async function sendLiffMessage(text) {
  if (typeof liff === 'undefined') return
  try {
    if (liff.isApiAvailable('sendMessages')) {
      await liff.sendMessages([{ type: 'text', text }])
    }
  } catch (e) {
    console.warn('sendMessages error:', e)
  }
}

async function quickMeterSend() {
  const meter = parseMeterInput()
  if (meter === null) return showLiffToast('ใส่เลขมิเตอร์ก่อน')
  try {
    await lineAction('save', meter)
    await fetchRecords()
    showLiffToast('บันทึกแล้ว')
    await sendLiffMessage(String(meter))
  } catch (e) {
    showLiffToast(e.message)
  }
}

async function quickCancelSend() {
  try {
    const res = await lineAction('cancel')
    await fetchRecords()
    showLiffToast(res.deleted ? 'ยกเลิกแล้ว' : 'ไม่มีรายการให้ยกเลิก')
    await sendLiffMessage('cancel')
  } catch (e) {
    showLiffToast(e.message)
  }
}

async function quickLatestSend() {
  try {
    const res = await lineAction('latest')
    showLiffToast(res.summary || 'ยังไม่มีข้อมูล')
    await sendLiffMessage('latest')
  } catch (e) {
    showLiffToast(e.message)
  }
}

async function onSubmitQuickMeter() {
  if (lineUserId) return quickMeterSend()
  return addRecord()
}

let saveBtn = null
let cancelBtn = null
let latestBtn = null

async function fetchRecords() {
  const empty = document.getElementById('emptyMsg')
  if (empty) empty.classList.remove('show')
  const headers = lineUserId ? { 'x-line-user-id': lineUserId } : {}
  const res = await fetch('/api/records', { headers })
  if (!res.ok) throw new Error(await res.text())
  records = await res.json()
  autoFillInputMeter()
  render()
}

async function initPage() {
  saveBtn = document.getElementById('btnSave')
  cancelBtn = document.getElementById('btnCancelLast')
  latestBtn = document.getElementById('btnShowLatest')
  await initLiff().catch(() => renderFallbackMode())
  if (!lineUserId) {
    await fetchRecords().catch(e => showToast('โหลดข้อมูลไม่ได้: ' + e.message))
  }
}

window.addRecord = addRecord
window.deleteRecord = deleteRecord
window.switchTab = switchTab
window.switchHeatmap = switchHeatmap
window.quickMeterSend = quickMeterSend
window.quickCancelSend = quickCancelSend
window.quickLatestSend = quickLatestSend
window.onSubmitQuickMeter = onSubmitQuickMeter
window.shareLatest = shareLatest
window.liffLogin = async () => {
  if (typeof liff !== 'undefined' && liff.isReady) {
    try { await liff.login(); location.reload() } catch (e) { showLiffToast('Login ไม่ได้') }
  }
}
window.liffLogout = async () => {
  if (typeof liff !== 'undefined' && liff.isReady) {
    try { liff.logout(); location.reload() } catch (e) { showLiffToast('Logout ไม่ได้') }
  }
}

initPage()
