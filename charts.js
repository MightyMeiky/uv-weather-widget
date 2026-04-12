import Chart from 'chart.js/auto'

let uvChart   = null
let rainChart = null
let windChart = null

// ── Shared Tufte-minimal aesthetics ─────────────────────
const MONO   = "'IBM Plex Mono', monospace"
const TICK_C = '#9c9488'

// X-axis: show 06, 12, 18, 00 only
const KEY_HOURS = new Set(['06:00', '12:00', '18:00', '00:00'])

function xAxis(labels, isoTimes) {
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
        return KEY_HOURS.has(String(h).padStart(2,'0') + ':00')
          ? String(h).padStart(2,'0') + ':00'
          : null
      },
    },
  }
}

// Theme-aware tooltip — called at chart render time so dark mode is current
function makeTooltip(labelFn) {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark'
  return {
    enabled:         true,
    backgroundColor: dark ? '#1e1c19' : '#ffffff',
    titleColor:      dark ? '#f0ece4' : '#1a1814',
    bodyColor:       dark ? '#b8b3aa' : '#57534e',
    borderColor:     dark ? 'rgba(255,255,255,0.09)' : '#e8e4dc',
    borderWidth:     1,
    titleFont:       { family: MONO, size: 10 },
    bodyFont:        { family: MONO, size: 10 },
    padding:         10,
    cornerRadius:    6,
    callbacks: {
      title: items => items[0]?.label ?? '',
      label: labelFn,
    },
  }
}

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

export function renderUvChart(labels, isoTimes, data, nowIdx, midnightIdx) {
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
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: makeTooltip(item => `UV ${item.raw}`) },
      scales: {
        x: xAxis(labels, isoTimes),
        y: { ...thresholdYAxis(UV_THRESHOLDS), min: 0, max: 12 },
      },
    },
    plugins: [
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
}

// ── Rain chart — precipitation probability area ───────────
export function renderRainChart(labels, isoTimes, probData, nowIdx, midnightIdx) {
  const canvas = document.getElementById('rain-chart')
  if (!canvas) return
  if (rainChart) rainChart.destroy()

  const RAIN_COLOR = '#3b82f6'

  // Rain background zones (0–100%)
  const rainZonesPlugin = {
    id: 'rainZones',
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea: { left, right }, scales: { y } } = chart
      ctx.save()
      const zones = [
        { min: 40, max:  70, fill: 'rgba(96, 165, 250, 0.08)' },
        { min: 70, max: 100, fill: 'rgba(96, 165, 250, 0.16)' },
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

  // 40% threshold line
  const rainThreshPlugin = {
    id: 'rainThresh',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea: { left, right, top, bottom }, scales: { y } } = chart
      const yPx = y.getPixelForValue(40)
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
      ctx.fillText('🌧️ Regenkleidung', right - 3, yPx - 2)
      ctx.restore()
    },
  }

  rainChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data:             probData,
        fill:             true,
        backgroundColor:  'rgba(96, 165, 250, 0.18)',
        borderColor:      RAIN_COLOR,
        borderWidth:      2,
        tension:          0.35,
        pointRadius:      0,
        pointHoverRadius: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: makeTooltip(item => `${item.raw}%`) },
      scales: {
        x: xAxis(labels, isoTimes),
        y: {
          ...thresholdYAxis([{ value: 40, color: '#93c5fd', tickLabel: '40%' }]),
          min: 0, max: 100,
        },
      },
    },
    plugins: [
      rainZonesPlugin,
      rainThreshPlugin,
      makeJetztPlugin(nowIdx),
      makeMidnightPlugin(midnightIdx),
    ],
  })
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

export function renderTempChart(labels, isoTimes, data, nowIdx, midnightIdx) {
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
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: makeTooltip(item => `${item.raw}°C`) },
      scales: {
        x: xAxis(labels, isoTimes),
        y: {
          ...thresholdYAxis(TEMP_THRESHOLDS),
          min: -10,
          max:  38,
        },
      },
    },
    plugins: [
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

export function renderWindChart(labels, isoTimes, data, nowIdx, midnightIdx) {
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
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: makeTooltip(item => `${item.raw} km/h`) },
      scales: {
        x: xAxis(labels, isoTimes),
        y: { ...thresholdYAxis(activeThresholds), min: 0, max: yMax },
      },
    },
    plugins: [
      windZonesPlugin,
      makeThresholdPlugin(activeThresholds),
      makeJetztPlugin(nowIdx),
      makeMidnightPlugin(midnightIdx),
    ],
  })
}
