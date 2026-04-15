import Chart from 'chart.js/auto'

let uvChart   = null
let rainChart = null
let windChart = null

// ── Shared Tufte-minimal aesthetics ─────────────────────
const MONO   = "'IBM Plex Mono', monospace"
const TICK_C = '#9c9488'

// X-axis tick sets per mode
const KEY_HOURS_DAY  = new Set(['06:00','08:00','10:00','12:00','14:00','16:00','18:00','20:00'])
const KEY_HOURS_FULL = new Set(['00:00','03:00','06:00','09:00','12:00','15:00','18:00','21:00'])

function xAxis(labels, isoTimes, fullDay = false) {
  const KEY_HOURS = fullDay ? KEY_HOURS_FULL : KEY_HOURS_DAY
  return {
    grid:   { display: false },
    border: { display: false },
    ticks: {
      color:       TICK_C,
      font:        { family: MONO, size: 10 },
      maxRotation: 0,
      autoSkip:    false,
      callback(_, i) {
        if (!isoTimes[i]) return null
        const h = new Date(isoTimes[i]).getHours()
        const key = String(h).padStart(2,'0') + ':00'
        return KEY_HOURS.has(key) ? key : null
      },
    },
  }
}

// ── Kindergarten time zone (08:00–14:00) ─────────────────
// show:      render the zone at all (false on weekends)
// showLabel: show '🌲 Waldzeit' label (true on UV chart only)
function makeKindergartenPlugin(show, showLabel) {
  return {
    id: 'kindergarten',
    beforeDatasetsDraw(chart) {
      if (!show) return
      const { ctx, chartArea: { top, bottom }, scales: { x } } = chart
      const labels   = chart.data.labels
      const startIdx = labels.indexOf('08:00')
      const endIdx   = labels.indexOf('14:00')
      if (startIdx < 0 || endIdx < 0) return

      const xStart = x.getPixelForValue(startIdx)
      const xEnd   = x.getPixelForValue(endIdx)
      if (xEnd <= xStart) return

      ctx.save()
      ctx.fillStyle = 'rgba(200, 245, 66, 0.07)'
      ctx.fillRect(xStart, top, xEnd - xStart, bottom - top)

      if (showLabel) {
        ctx.fillStyle    = 'rgba(100, 130, 50, 0.5)'
        ctx.font         = `400 8px ${MONO}`
        ctx.textAlign    = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText('🌲 Waldzeit', xStart + 6, top + 6)
      }
      ctx.restore()
    },
  }
}

// ── Crosshair plugin (registered globally) ───────────────
const crosshairPlugin = {
  id: 'crosshair',
  afterDraw(chart) {
    const x = chart._crosshairX
    if (x === undefined) return
    const { ctx, chartArea: { top, bottom, left, right }, scales } = chart
    if (x < left || x > right) return

    const dark      = document.documentElement.getAttribute('data-theme') === 'dark'
    const lineColor = dark ? 'rgba(255,255,255,0.28)' : 'rgba(26,24,20,0.22)'
    const pillBg    = dark ? '#1e1c19' : '#ffffff'
    const pillBord  = dark ? 'rgba(255,255,255,0.10)' : '#e8e4dc'
    const textColor = dark ? '#f0ece4' : '#1a1814'

    ctx.save()

    // Dashed vertical line
    ctx.beginPath()
    ctx.moveTo(x, top)
    ctx.lineTo(x, bottom)
    ctx.lineWidth   = 1
    ctx.strokeStyle = lineColor
    ctx.setLineDash([4, 4])
    ctx.stroke()
    ctx.setLineDash([])

    // Value pill per dataset
    const xScale = scales.x
    if (!xScale) { ctx.restore(); return }
    const idx = Math.round(xScale.getValueForPixel(x))
    if (idx < 0 || idx >= chart.data.labels.length) { ctx.restore(); return }

    chart.data.datasets.forEach(ds => {
      const val = ds.data[idx]
      if (val == null) return
      const yScale = scales[ds.yAxisID ?? 'y']
      if (!yScale) return

      const yPx  = yScale.getPixelForValue(val)
      const label = chart._crosshairFmt ? chart._crosshairFmt(val) : String(val)

      const PAD = 5
      ctx.font = `400 10px ${MONO}`
      const tw  = ctx.measureText(label).width
      const bw  = tw + PAD * 2
      const bh  = 16

      // Clamp pill position inside chart area
      let bx = Math.max(left, Math.min(right - bw, x - bw / 2))
      let by = Math.max(top,  Math.min(bottom - bh, yPx - bh - 6))

      ctx.fillStyle   = pillBg
      ctx.strokeStyle = pillBord
      ctx.lineWidth   = 1
      ctx.beginPath()
      ctx.roundRect(bx, by, bw, bh, 4)
      ctx.fill()
      ctx.stroke()

      ctx.fillStyle    = textColor
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, bx + bw / 2, by + bh / 2)
    })

    ctx.restore()
  },
}
Chart.register(crosshairPlugin)

// Attach mouse/touch crosshair events to a chart canvas
function attachCrosshair(canvas, chart, fmtFn) {
  chart._crosshairFmt = fmtFn

  const set = clientX => {
    chart._crosshairX = clientX - canvas.getBoundingClientRect().left
    chart.update('none')
  }
  const clear = () => {
    delete chart._crosshairX
    chart.update('none')
  }

  canvas.addEventListener('mousemove',  e => set(e.clientX))
  canvas.addEventListener('mouseleave', clear)
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); set(e.touches[0].clientX) }, { passive: false })
  canvas.addEventListener('touchend',   clear)
}

// Clear all crosshairs when user touches outside any chart
document.addEventListener('touchstart', e => {
  if (e.target.tagName !== 'CANVAS') {
    for (const c of [
      () => uvChart, () => rainChart, () => windChart, () => tempChart,
    ]) {
      const inst = c()
      if (inst && inst._crosshairX !== undefined) {
        delete inst._crosshairX
        inst.update('none')
      }
    }
  }
}, { passive: true })

// ── Threshold line plugin ────────────────────────────────
// lines: [{ value, color, label, tickLabel? }]
function makeThresholdPlugin(lines, yScaleKey = 'y') {
  return {
    id: 'thresh_' + yScaleKey + '_' + Math.random().toString(36).slice(2),
    afterDatasetsDraw(chart) {
      const { ctx, chartArea: { left, right, top, bottom }, scales } = chart
      const y = scales[yScaleKey]
      if (!y) return
      ctx.save()
      for (const line of lines) {
        const yPx = y.getPixelForValue(line.value)
        if (yPx < top || yPx > bottom) continue
        ctx.strokeStyle = line.color ?? '#94a3b8'
        ctx.lineWidth   = 1
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(left, yPx)
        ctx.lineTo(right, yPx)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle    = line.color ?? '#94a3b8'
        ctx.font         = `400 9px ${MONO}`
        ctx.textAlign    = 'right'
        ctx.textBaseline = 'bottom'
        ctx.fillText(line.label, right - 3, yPx - 2)
      }
      ctx.restore()
    },
  }
}

// Y-axis with ticks only at threshold values
function thresholdYAxis(thresholds, extra = {}) {
  const values = thresholds.map(t => t.value)
  return {
    grid:   { display: false },
    border: { display: false },
    afterBuildTicks(axis) { axis.ticks = values.map(v => ({ value: v })) },
    ticks: {
      color: TICK_C,
      font:  { family: MONO, size: 9 },
      callback(v) {
        const hit = thresholds.find(t => Math.abs(t.value - v) < 0.01)
        return hit ? (hit.tickLabel ?? String(hit.value)) : null
      },
    },
    ...extra,
  }
}

// ── "Jetzt" marker ───────────────────────────────────────
// nowIdx < 0 means "not today" — line is hidden entirely.
// bubbleValue: optional string shown in a colored pill at the
// intersection of the Jetzt line and the data curve.
// bubbleBg: background color for that pill.
function makeJetztPlugin(nowIdx, data = null, bubbleValue = null, bubbleBg = null) {
  return {
    id: 'jetzt',
    afterDatasetsDraw(chart) {
      if (nowIdx < 0) return
      const dark = document.documentElement.getAttribute('data-theme') === 'dark'
      const lineColor  = dark ? '#ffffff' : '#1a1814'
      const labelColor = dark ? '#f0ece4' : '#1a1814'

      const { ctx, chartArea: { top, bottom }, scales } = chart
      const x   = scales.x
      const xPx = x.getPixelForValue(nowIdx)

      ctx.save()

      // Glow pass — blurred halo
      ctx.shadowColor = lineColor
      ctx.shadowBlur  = 4
      ctx.strokeStyle = lineColor
      ctx.lineWidth   = 1.5
      ctx.setLineDash([])
      ctx.globalAlpha = 0.45
      ctx.beginPath()
      ctx.moveTo(xPx, top)
      ctx.lineTo(xPx, bottom)
      ctx.stroke()

      // Crisp solid pass on top
      ctx.shadowBlur  = 0
      ctx.globalAlpha = 1
      ctx.beginPath()
      ctx.moveTo(xPx, top)
      ctx.lineTo(xPx, bottom)
      ctx.stroke()

      // "Jetzt" label — inside chart area, 8px from top edge
      ctx.fillStyle    = labelColor
      ctx.font         = `500 9px ${MONO}`
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText('Jetzt', xPx, top + 8)

      // Value bubble at intersection with data line (UV & Temp only)
      if (bubbleValue !== null && data !== null && nowIdx >= 0 && nowIdx < data.length) {
        // Find the Y scale (UV uses 'y', others don't pass data)
        const yScale = scales.y ?? scales.yLeft
        if (yScale) {
          const val  = data[nowIdx]
          const yPx  = yScale.getPixelForValue(val)

          const PAD   = 5
          ctx.font    = `400 10px ${MONO}`
          const tw    = ctx.measureText(bubbleValue).width
          const bw    = tw + PAD * 2
          const bh    = 16
          const bx    = xPx - bw / 2
          const by    = yPx - bh - 5

          // Pill background
          ctx.fillStyle = bubbleBg ?? lineColor
          const r = 4
          ctx.beginPath()
          ctx.roundRect(bx, by, bw, bh, r)
          ctx.fill()

          // White text
          ctx.fillStyle    = '#ffffff'
          ctx.textAlign    = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(bubbleValue, xPx, by + bh / 2)
        }
      }

      ctx.restore()
    },
  }
}

// ── Midnight separator ───────────────────────────────────
function makeMidnightPlugin(midnightIdx) {
  return {
    id: 'midnight',
    afterDatasetsDraw(chart) {
      if (midnightIdx < 0) return
      const { ctx, chartArea: { top, bottom }, scales: { x } } = chart
      const xPx = x.getPixelForValue(midnightIdx)
      ctx.save()
      ctx.strokeStyle = '#c8c4bc'
      ctx.lineWidth   = 1
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(xPx, top)
      ctx.lineTo(xPx, bottom)
      ctx.stroke()
      ctx.font         = `400 9px ${MONO}`
      ctx.fillStyle    = '#b0aba3'
      ctx.textBaseline = 'top'
      const y = top + 3
      ctx.textAlign = 'right'
      ctx.fillText('heute', xPx - 5, y)
      ctx.textAlign = 'left'
      ctx.fillText('morgen', xPx + 5, y)
      ctx.restore()
    },
  }
}

// ── UV zone bands ────────────────────────────────────────
const UV_ZONES = [
  { min: 0,  max: 3,  fill: 'rgba(61,  122, 78,  0.08)' },
  { min: 3,  max: 6,  fill: 'rgba(156, 109, 14,  0.08)' },
  { min: 6,  max: 8,  fill: 'rgba(179, 66,  20,  0.08)' },
  { min: 8,  max: 11, fill: 'rgba(155, 33,  19,  0.08)' },
  { min: 11, max: 15, fill: 'rgba(107, 42,  150, 0.08)' },
]

const uvZonesPlugin = {
  id: 'uvZones',
  beforeDatasetsDraw(chart) {
    const { ctx, chartArea: { left, right }, scales: { y } } = chart
    ctx.save()
    for (const z of UV_ZONES) {
      const yTop    = y.getPixelForValue(Math.min(z.max, 12))
      const yBottom = y.getPixelForValue(z.min)
      const h       = yBottom - yTop
      if (h <= 0) continue
      ctx.fillStyle = z.fill
      ctx.fillRect(left, yTop, right - left, h)
    }
    ctx.restore()
  },
}

// ── UV area gradient by height ───────────────────────────
// Maps Y-axis domain [0–12] to gradient stops proportionally.
// The gradient encodes risk level visually even without the zones.
const uvGradientPlugin = {
  id: 'uvGradient',
  beforeDatasetsDraw(chart) {
    const { ctx, chartArea: { top, bottom }, scales: { y } } = chart
    const g = ctx.createLinearGradient(0, top, 0, bottom)
    // Map UV values to proportional stops (yMax = 12)
    // bottom of chart = UV 0, top = UV 12
    const stop = v => 1 - (v / 12)   // 0 is bottom (stop 1.0), 12 is top (stop 0.0)
    g.addColorStop(Math.max(0, stop(11)), 'rgba(248,113,113, 0.70)')  // red  8+
    g.addColorStop(stop(8),              'rgba(251,146, 60, 0.55)')  // orange 6–8
    g.addColorStop(stop(6),              'rgba(253,224, 71, 0.40)')  // yellow 3–6
    g.addColorStop(stop(3),              'rgba(134,239,172, 0.28)')  // green 0–3
    g.addColorStop(1,                    'rgba(134,239,172, 0.04)')  // near zero
    chart.data.datasets[0].backgroundColor = g
  },
}

// ── UV risk color helper ─────────────────────────────────
function uvRiskColor(v) {
  if (v >= 8) return '#f87171'
  if (v >= 6) return '#fb923c'
  if (v >= 3) return '#eab308'
  return '#86efac'
}

// ── UV chart ─────────────────────────────────────────────
const UV_THRESHOLDS = [
  { value: 3, color: '#eab308', label: '🧴 Eincremen', tickLabel: '3' },
  { value: 6, color: '#fb923c', label: '🌂 Schatten',  tickLabel: '6' },
  { value: 8, color: '#f87171', label: '⚠️ Drinnen',   tickLabel: '8' },
]

export function renderUvChart(labels, isoTimes, data, nowIdx, midnightIdx, fullDay = false, showKindergarten = false) {
  const canvas = document.getElementById('uv-chart')
  if (!canvas) return
  if (uvChart) uvChart.destroy()

  uvChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        fill:             true,
        backgroundColor:  'transparent',       // overwritten by uvGradientPlugin each frame
        borderColor:      '#86efac',            // fallback; overridden per-segment below
        borderWidth:      2,
        tension:          0.4,
        pointRadius:      0,
        pointHoverRadius: 0,
        // Per-segment line color matching the UV risk zone of the higher endpoint
        segment: {
          borderColor: ctx => {
            const v = ctx.p1.parsed.y
            if (v >= 8) return '#f87171'   // red
            if (v >= 6) return '#fb923c'   // orange
            if (v >= 3) return '#eab308'   // yellow
            return '#86efac'               // green
          },
        },
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeInOutQuart' },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: xAxis(labels, isoTimes, fullDay),
        y: { ...thresholdYAxis(UV_THRESHOLDS), min: 0, max: 12 },
      },
    },
    plugins: [
      makeKindergartenPlugin(showKindergarten, true),
      uvZonesPlugin,
      uvGradientPlugin,
      makeThresholdPlugin(UV_THRESHOLDS),
      makeJetztPlugin(
        nowIdx,
        data,
        nowIdx >= 0 && nowIdx < data.length ? String(data[nowIdx]) : null,
        nowIdx >= 0 && nowIdx < data.length ? uvRiskColor(data[nowIdx]) : null,
      ),
      makeMidnightPlugin(midnightIdx),
    ],
  })
  attachCrosshair(canvas, uvChart, v => `UV ${v}`)
}

// ── Rain chart — precipitation in mm, bar chart ──────────
export function renderRainChart(labels, isoTimes, mmData, nowIdx, midnightIdx, fullDay = false, showKindergarten = false) {
  const canvas = document.getElementById('rain-chart')
  if (!canvas) return
  if (rainChart) rainChart.destroy()

  const dataMax = Math.max(...mmData, 0)
  const yMax    = Math.max(5, Math.ceil(dataMax + 1))

  // Threshold line at 1mm (light rain)
  const rainThreshPlugin = {
    id: 'rainThresh',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea: { left, right, top, bottom }, scales: { y } } = chart
      const yPx = y.getPixelForValue(1)
      if (yPx < top || yPx > bottom) return
      ctx.save()
      ctx.strokeStyle = '#93c5fd'
      ctx.lineWidth   = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(left, yPx)
      ctx.lineTo(right, yPx)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle    = '#93c5fd'
      ctx.font         = `400 9px ${MONO}`
      ctx.textAlign    = 'right'
      ctx.textBaseline = 'bottom'
      ctx.fillText('🌧️ Leichter Regen', right - 3, yPx - 2)
      ctx.restore()
    },
  }

  rainChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data:            mmData,
        backgroundColor: 'rgba(96, 165, 250, 0.55)',
        borderColor:     '#3b82f6',
        borderWidth:     1,
        borderRadius:    2,
        borderSkipped:   'bottom',
        barPercentage:   0.9,
        categoryPercentage: 1.0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeOutQuart' },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: xAxis(labels, isoTimes, fullDay),
        y: {
          ...thresholdYAxis([{ value: 1, color: '#93c5fd', tickLabel: '1mm' }]),
          min: 0,
          max: yMax,
        },
      },
    },
    plugins: [
      makeKindergartenPlugin(showKindergarten, false),
      rainThreshPlugin,
      makeJetztPlugin(nowIdx),
      makeMidnightPlugin(midnightIdx),
    ],
  })
  attachCrosshair(canvas, rainChart, v => `${v} mm`)
}

// ── Temperature chart ────────────────────────────────────
let tempChart = null

const TEMP_THRESHOLDS = [
  { value:  0, color: '#bfdbfe', label: 'Frost',      tickLabel: '0°'  },
  { value: 28, color: '#fb923c', label: 'Hitze',      tickLabel: '28°' },
  { value: 33, color: '#f87171', label: 'Hitzealarm', tickLabel: '33°' },
]

// Temperature zone fills
const tempZonesPlugin = {
  id: 'tempZones',
  beforeDatasetsDraw(chart) {
    const { ctx, chartArea: { left, right }, scales: { y } } = chart
    ctx.save()
    const zones = [
      { min: -10, max:  0, fill: 'rgba(147, 197, 253, 0.12)' },
      { min:  28, max: 33, fill: 'rgba(251, 146,  60, 0.08)' },
      { min:  33, max: 38, fill: 'rgba(248, 113, 113, 0.10)' },
    ]
    for (const z of zones) {
      const yTop    = y.getPixelForValue(z.max)
      const yBottom = y.getPixelForValue(z.min)
      const h = yBottom - yTop
      if (h <= 0) continue
      ctx.fillStyle = z.fill
      ctx.fillRect(left, yTop, right - left, h)
    }
    ctx.restore()
  },
}

export function renderTempChart(labels, isoTimes, data, nowIdx, midnightIdx, fullDay = false, showKindergarten = false) {
  const canvas = document.getElementById('temp-chart')
  if (!canvas) return
  if (tempChart) tempChart.destroy()

  tempChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        fill:             true,
        backgroundColor:  'rgba(249,115,22,0.06)',
        borderColor:      '#f97316',
        borderWidth:      2,
        tension:          0.4,
        pointRadius:      0,
        pointHoverRadius: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeInOutQuart' },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: xAxis(labels, isoTimes, fullDay),
        y: {
          ...thresholdYAxis(TEMP_THRESHOLDS),
          min: -10,
          max:  38,
        },
      },
    },
    plugins: [
      makeKindergartenPlugin(showKindergarten, false),
      tempZonesPlugin,
      makeThresholdPlugin(TEMP_THRESHOLDS),
      makeJetztPlugin(
        nowIdx,
        data,
        nowIdx >= 0 && nowIdx < data.length ? data[nowIdx] + '°C' : null,
        '#f97316',
      ),
      makeMidnightPlugin(midnightIdx),
    ],
  })
  attachCrosshair(canvas, tempChart, v => `${v}°C`)
}

// ── Wind chart ───────────────────────────────────────────
const BEAUFORT = [
  { value: 45,  label: 'Sturmwarnung' },
  { value: 62,  label: 'Stürmischer Wind (Bft 8)' },
  { value: 75,  label: 'Sturm (Bft 9)' },
  { value: 89,  label: 'Schwerer Sturm (Bft 10)' },
  { value: 103, label: 'Orkanartiger Sturm (Bft 11)' },
  { value: 118, label: 'Orkan (Bft 12)' },
]

export function renderWindChart(labels, isoTimes, data, nowIdx, midnightIdx, fullDay = false, showKindergarten = false) {
  const canvas = document.getElementById('wind-chart')
  if (!canvas) return
  if (windChart) windChart.destroy()

  const dataMax = Math.max(...data, 0)
  const yMax = Math.max(72, dataMax + 10)

  // Wind background zones
  const windZonesPlugin = {
    id: 'windZones',
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea: { left, right }, scales: { y } } = chart
      ctx.save()
      const zones = [
        { min: 45, max: 62,   fill: 'rgba(250, 204,  21, 0.08)' },
        { min: 62, max: yMax, fill: 'rgba(248, 113, 113, 0.10)' },
      ]
      for (const z of zones) {
        const yTop    = y.getPixelForValue(Math.min(z.max, y.max))
        const yBottom = y.getPixelForValue(z.min)
        const h = yBottom - yTop
        if (h <= 0) continue
        ctx.fillStyle = z.fill
        ctx.fillRect(left, yTop, right - left, h)
      }
      ctx.restore()
    },
  }

  const activeThresholds = BEAUFORT
    .filter((t, i) => i === 0 || dataMax >= t.value - 20)
    .map(t => ({ ...t, color: '#94a3b8', tickLabel: `${t.value}` }))

  windChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        fill:             true,
        backgroundColor:  'rgba(148,163,184,0.13)',
        borderColor:      'rgba(100,116,139,0.70)',
        borderWidth:      2,
        tension:          0.35,
        pointRadius:      0,
        pointHoverRadius: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeInOutQuart' },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: xAxis(labels, isoTimes, fullDay),
        y: { ...thresholdYAxis(activeThresholds), min: 0, max: yMax },
      },
    },
    plugins: [
      makeKindergartenPlugin(showKindergarten, false),
      windZonesPlugin,
      makeThresholdPlugin(activeThresholds),
      makeJetztPlugin(nowIdx),
      makeMidnightPlugin(midnightIdx),
    ],
  })
  attachCrosshair(canvas, windChart, v => `${v} km/h`)
}
