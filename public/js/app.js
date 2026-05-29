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
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'หน่วย',
        data,
        backgroundColor: '#c8c8c0',
        hoverBackgroundColor: '#1a1a18',
        borderRadius: 4,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
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

// Enter key
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.activeElement.id !== 'inputNote') {
    addRecord()
  }
})

fetchRecords()
