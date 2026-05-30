const RATE = 8
let records = []
let chartMode = 'day'
let chart = null

// ── Clock ──────────────────────────────────────────────
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

// ── Toast ──────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast')
  t.textContent = msg
  t.classList.add('show')
  clearTimeout(t._tid)
  t._tid = setTimeout(() => t.classList.remove('show'), 2400)
}

// ── Format helpers ─────────────────────────────────────
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

// ── API ────────────────────────────────────────────────
async function fetchRecords() {
  document.getElementById('emptyMsg').classList.remove('show')
  try {
    const res = await fetch('/api/records')
    if (!res.ok) throw new Error(await res.text())
    records = await res.json()
    autoFillInputMeter()
    render()
  } catch (e) {
    showToast('โหลดข้อมูลไม่ได้: ' + e.message)
    document.getElementById('emptyMsg').classList.add('show')
  }
}

async function addRecord() {
  const meterEl = document.getElementById('inputMeter')
  const noteEl  = document.getElementById('inputNote')
  const btn     = document.getElementById('btnSave')
  const btnText = document.getElementById('btnText')

  const meter = parseFloat(meterEl.value)
  if (isNaN(meter) || meter < 0) {
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
    const res = await fetch('/api/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meter_value: meter, note: noteEl.value.trim() })
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'เกิดข้อผิดพลาด')
    }
    records.push(await res.json())
    meterEl.value = ''
    noteEl.value  = ''
    render()
    showToast('บันทึกเรียบร้อย')
  } catch (e) {
    showToast('บันทึกไม่ได้: ' + e.message)
  } finally {
    btn.disabled = false
    btnText.textContent = 'บันทึกตอนนี้'
  }
}

async function deleteRecord(id) {
  if (!confirm('ลบรายการนี้?')) return
  try {
    const res = await fetch('/api/records/' + id, { method: 'DELETE' })
    if (!res.ok) throw new Error('ลบไม่ได้')
    records = records.filter(r => r.id !== id)
    render()
    showToast('ลบแล้ว')
  } catch (e) {
    showToast(e.message)
  }
}

// ── Compute usage ──────────────────────────────────────
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
  const recentAvg = usage.length
    ? usage.slice(-4).reduce((sum, r) => sum + r.units, 0) / Math.min(4, usage.length)
    : 2.5
  const suggested = Math.max(last.meter_value + 1, last.meter_value + Math.round(recentAvg || 2.5))
  meterEl.value = suggested.toFixed(2).replace(/\.00$/, '')
  meterEl.placeholder = `เดาไว้ก่อน: ${meterEl.value}`
}

function getHeatmapData(usage) {
  if (!records.length) return []
  const map = new Map()
  const first = new Date(records[0].recorded_at)
  const last = new Date(records[records.length - 1].recorded_at)
  const cursor = new Date(first.getFullYear(), first.getMonth(), first.getDate())
  const end = new Date(last.getFullYear(), last.getMonth(), last.getDate())
  const dayMap = new Map(usage.map(r => [new Date(r.recorded_at).toDateString(), r.units]))

  while (cursor <= end) {
    const key = cursor.toDateString()
    map.set(key, dayMap.get(key) || 0)
    cursor.setDate(cursor.getDate() + 1)
  }
  return [...map.entries()].map(([key, units]) => ({ key, units }))
}

function getHeatClass(v, max) {
  if (max <= 0) return 's0'
  const ratio = v / max
  if (ratio < 0.2) return 's1'
  if (ratio < 0.45) return 's2'
  if (ratio < 0.75) return 's3'
  return 's4'
}

// ── Render ─────────────────────────────────────────────
function render() {
  const usage = getUsage()
  const withData = usage.filter(r => r.units > 0)

  // Sidebar stats
  const last = withData[withData.length - 1]
  setEl('lastUnit', last ? fmtNum(last.units) : '—')
  setEl('lastCost', last ? fmtNum(last.cost)  : '—')

  const now = new Date()
  const monthData = usage.filter(r => {
    const d = new Date(r.recorded_at)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const mU = monthData.reduce((s, r) => s + r.units, 0)
  setEl('monthUnit', mU > 0 ? fmtNum(mU) : '—')
  setEl('monthCost', mU > 0 ? fmtNum(mU * RATE) : '—')

  // Count badge
  setEl('countBadge', records.length > 0 ? records.length + ' รายการ' : '')

  // Table
  renderTable(usage)

  // Chart
  renderChart(withData)

  // Heatmap
  renderHeatmap(usage)
}

function setEl(id, val) {
  const el = document.getElementById(id)
  if (el) el.textContent = val
}

function renderTable(usage) {
  const tbody  = document.getElementById('historyBody')
  const empty  = document.getElementById('emptyMsg')
  tbody.innerHTML = ''

  if (records.length === 0) {
    empty.classList.add('show')
    return
  }
  empty.classList.remove('show')

  const reversed = [...usage].reverse()
  reversed.forEach((r, ri) => {
    const isFirst = records.findIndex(x => x.id === r.id) === 0
    const tr = document.createElement('tr')

    const usagePill = isFirst
      ? '<span class="pill pill-gray">เริ่มต้น</span>'
      : '<span class="pill pill-green">+' + fmtNum(r.units) + '</span>'

    const costCell = isFirst ? '—' : fmtNum(r.cost) + ' ฿'

    tr.innerHTML = `
      <td>${fmtDate(r.recorded_at)}</td>
      <td>${fmtTime(r.recorded_at)}</td>
      <td class="num-col">${fmtNum(r.meter_value)}</td>
      <td class="num-col">${usagePill}</td>
      <td class="num-col">${costCell}</td>
      <td class="note-cell">${r.note || ''}</td>
      <td>
        <button class="btn-del" onclick="deleteRecord(${r.id})" aria-label="ลบรายการ">
          <i class="ti ti-trash" aria-hidden="true"></i>
        </button>
      </td>`
    tbody.appendChild(tr)
  })
}

// ── Chart ──────────────────────────────────────────────
function switchTab(mode, el) {
  chartMode = mode
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
  el.classList.add('active')
  renderChart(getUsage().filter(r => r.units > 0))
}

function renderChart(usageData) {
  const chartEmpty = document.getElementById('chartEmpty')
  const canvas     = document.getElementById('myChart')

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
    data   = usageData.map(r => r.units)
  } else {
    const monthly = {}
    usageData.forEach(r => {
      const d   = new Date(r.recorded_at)
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
    data: {
      labels,
      datasets: [{
        label: 'หน่วย',
        data,
        borderColor: '#1a1a18',
        backgroundColor: 'rgba(26, 26, 24, 0.08)',
        pointBackgroundColor: '#ffffff',
        pointBorderColor: '#1a1a18',
        pointBorderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2.5,
        tension: 0.38,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a1a18',
          titleColor: 'rgba(255,255,255,0.5)',
          bodyColor: '#fff',
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            title: ctx => ctx[0].label,
            label: ctx => `${fmtNum(ctx.parsed.y)} หน่วย  ·  ${fmtNum(ctx.parsed.y * RATE)} บาท`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: '#8a8a84',
            font: { size: 11, family: "'IBM Plex Sans Thai', sans-serif" },
            maxRotation: 45,
            autoSkip: true,
            maxTicksLimit: 10
          }
        },
        y: {
          grid: { color: '#f2f2ec' },
          border: { display: false, dash: [3, 3] },
          ticks: {
            color: '#8a8a84',
            font: { size: 11, family: "'IBM Plex Mono', monospace" },
            maxTicksLimit: 5
          },
          beginAtZero: true
        }
      }
    }
  })
}

function renderHeatmap(usageData) {
  const wrap = document.getElementById('heatmapWrap')
  if (!wrap) return
  wrap.innerHTML = ''

  const days = getHeatmapData(usageData)
  if (!days.length) {
    wrap.innerHTML = '<div class="heatmap-empty">ยังไม่มีข้อมูลสำหรับ heatmap</div>'
    return
  }

  const max = Math.max(...days.map(d => d.units), 0)
  days.forEach(d => {
    const cell = document.createElement('div')
    cell.className = `heat-cell ${getHeatClass(d.units, max)}`
    cell.title = `${d.key} · ${fmtNum(d.units)} หน่วย`
    cell.innerHTML = `<span>${new Date(d.key).getDate()}</span>`
    wrap.appendChild(cell)
  })
}

// Enter key
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.activeElement.id !== 'inputNote') {
    addRecord()
  }
})

const inputMeter = document.getElementById('inputMeter')
if (inputMeter) {
  inputMeter.placeholder = 'เดาไว้ก่อน...'
}

fetchRecords()
