const RATE = 8
let records = []
let chartMode = 'day'
let chart = null

// --- Utility ---
function showToast(msg) {
  const t = document.getElementById('toast')
  t.textContent = msg
  t.classList.add('show')
  setTimeout(() => t.classList.remove('show'), 2200)
}

function fmtDateTime(isoStr) {
  const d = new Date(isoStr)
  return d.toLocaleDateString('th-TH', {
    day: '2-digit', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

function fmtNum(n) {
  return n.toLocaleString('th-TH', { maximumFractionDigits: 2 })
}

// อัปเดต badge แสดงเวลาปัจจุบัน
function updateNowBadge() {
  const el = document.getElementById('nowBadge')
  const d = new Date()
  el.textContent = '🕐 ' + d.toLocaleDateString('th-TH', {
    weekday: 'short', day: '2-digit', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}

// --- API calls ---
async function fetchRecords() {
  try {
    const res = await fetch('/api/records')
    if (!res.ok) throw new Error(await res.text())
    records = await res.json()
    render()
  } catch (e) {
    showToast('โหลดข้อมูลไม่ได้: ' + e.message)
  }
}

async function addRecord() {
  const meterInput = document.getElementById('inputMeter')
  const noteInput  = document.getElementById('inputNote')
  const btn        = document.getElementById('btnSave')
  const btnText    = document.getElementById('btnText')

  const meter = parseFloat(meterInput.value)
  if (isNaN(meter) || meter < 0) {
    showToast('กรุณากรอกเลขมิเตอร์ให้ถูกต้อง')
    meterInput.focus()
    return
  }

  // ตรวจสอบว่าน้อยกว่าค่าก่อนหน้าหรือไม่
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
      body: JSON.stringify({ meter_value: meter, note: noteInput.value.trim() })
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'เกิดข้อผิดพลาด')
    }
    const newRec = await res.json()
    records.push(newRec)
    meterInput.value = ''
    noteInput.value  = ''
    render()
    showToast('บันทึกแล้ว ✓')
  } catch (e) {
    showToast('บันทึกไม่ได้: ' + e.message)
  } finally {
    btn.disabled = false
    btnText.textContent = 'บันทึก'
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
    showToast('ลบไม่ได้: ' + e.message)
  }
}

// --- Compute usage between readings ---
function getUsage() {
  return records.map((r, i) => {
    const units = i === 0 ? 0 : Math.max(0, r.meter_value - records[i - 1].meter_value)
    return { ...r, units, cost: +(units * RATE).toFixed(2) }
  })
}

// --- Render ---
function render() {
  const usage = getUsage()

  // Summary cards
  const usageWithData = usage.filter(r => r.units > 0)
  const last = usageWithData[usageWithData.length - 1]

  if (last) {
    document.getElementById('lastUnit').textContent = fmtNum(last.units)
    document.getElementById('lastCost').textContent = fmtNum(last.cost)
  } else {
    document.getElementById('lastUnit').textContent = '—'
    document.getElementById('lastCost').textContent = '—'
  }

  const now = new Date()
  const thisMonth = usage.filter(r => {
    const d = new Date(r.recorded_at)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const mUnits = thisMonth.reduce((s, r) => s + r.units, 0)

  document.getElementById('monthUnit').textContent = mUnits > 0 ? fmtNum(mUnits) : '—'
  document.getElementById('monthCost').textContent = mUnits > 0 ? fmtNum(mUnits * RATE) : '—'

  // History table
  const tbody = document.getElementById('historyBody')
  const emptyMsg = document.getElementById('emptyMsg')
  tbody.innerHTML = ''

  if (records.length === 0) {
    emptyMsg.style.display = 'block'
    renderChart([])
    return
  }
  emptyMsg.style.display = 'none'

  const reversed = [...usage].reverse()
  reversed.forEach(r => {
    const isFirst = records.indexOf(records.find(x => x.id === r.id)) === 0
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>${fmtDateTime(r.recorded_at)}</td>
      <td>${fmtNum(r.meter_value)}</td>
      <td>${isFirst ? '<span class="badge badge-gray">เริ่มต้น</span>' : '<span class="badge">+' + fmtNum(r.units) + '</span>'}</td>
      <td>${isFirst ? '—' : fmtNum(r.cost) + ' ฿'}</td>
      <td class="note-cell">${r.note || ''}</td>
      <td><button class="btn-del" onclick="deleteRecord(${r.id})">ลบ</button></td>
    `
    tbody.appendChild(tr)
  })

  renderChart(usageWithData)
}

function switchTab(mode, el) {
  chartMode = mode
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
  el.classList.add('active')
  renderChart(getUsage().filter(r => r.units > 0))
}

function renderChart(usageData) {
  let labels = [], data = []

  if (chartMode === 'day') {
    labels = usageData.map(r => {
      const d = new Date(r.recorded_at)
      return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })
    })
    data = usageData.map(r => r.units)
  } else {
    const monthly = {}
    usageData.forEach(r => {
      const d = new Date(r.recorded_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthly[key] = (monthly[key] || 0) + r.units
    })
    labels = Object.keys(monthly).sort().map(k => {
      const [y, m] = k.split('-')
      return new Date(+y, +m - 1).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })
    })
    data = Object.keys(monthly).sort().map(k => +monthly[k].toFixed(2))
  }

  if (chart) chart.destroy()

  chart = new Chart(document.getElementById('myChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'หน่วย',
        data,
        backgroundColor: '#B4B2A9',
        borderRadius: 5,
        hoverBackgroundColor: '#5F5E5A'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${fmtNum(ctx.parsed.y)} หน่วย · ${fmtNum(ctx.parsed.y * RATE)} บาท`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#888780', font: { size: 11 }, maxRotation: 45 }
        },
        y: {
          grid: { color: '#f1efe8' },
          ticks: { color: '#888780', font: { size: 11 } },
          beginAtZero: true
        }
      }
    }
  })
}

// Enter key submits
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.activeElement.id !== 'inputNote') {
    addRecord()
  }
})

// Start clock
updateNowBadge()
setInterval(updateNowBadge, 1000)

// Load data
fetchRecords()
