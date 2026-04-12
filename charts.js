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

const TOOLTIP = {
  enabled:         true,
  backgroundColor: '#ffffff',
  titleColor:      '#1a1814',
  bodyColor:       '#57534e',
  borderColor:     '#e8e4dc',
  borderWidth:     1.5,
  titleFont:       { family: MONO, size: 9 },
  bodyFont:        { family: MONO, size: 9 },
  padding:         8,
  cornerRadius:    6,
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
function makeJetztPlugin(nowIdx) {
  return {
    id: 'jetzt',
    afterDatasetsDraw(chart) {
      if (nowIdx < 0) return
      const { ctx, chartArea: { top, bottom }, scales: { x } } = chart
      const xPx = x.getPixelForValue(nowIdx)
      ctx.save()
      ctx.strokeStyle = 'rgba(26,24,20,0.28)'
      ctx.lineWidth   = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(xPx, top)
      ctx.lineTo(xPx, bottom)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle    = 'rgba(26,24,20,0.38)'
      ctx.font         = `500 8px ${MONO}`
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText('Jetzt', xPx, top + 3)
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
        borderColor:      '#fb923c',            // solid orange line on top
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
      plugins: { legend: { display: false }, tooltip: TOOLTIP },
      scales: {
        x: xAxis(labels, isoTimes),
        y: { ...thresholdYAxis(UV_THRESHOLDS), min: 0, max: 12 },
      },
    },
    plugins: [
      uvZonesPlugin,
      uvGradientPlugin,
      makeThresholdPlugin(UV_THRESHOLDS),
      makeJetztPlugin(nowIdx),
      makeMidnightPlugin(midnightIdx),
    ],
  })
}

// ── Rain chart — bars (mm) + dashed line (%) ─────────────
export function renderRainChart(labels, isoTimes, probData, mmData, nowIdx, midnightIdx) {
  const canvas = document.getElementById('rain-chart')
  if (!canvas) return
  if (rainChart) rainChart.destroy()

  // Inline end-of-series labels
  const rainLabelPlugin = {
    id: 'rainLabels',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea: { right, top }, scales } = chart
      ctx.save()
      ctx.font = `400 9px ${MONO}`
      ctx.textBaseline = 'middle'

      const lastProb = probData.reduceRight((a, v, i) => a === -1 && v != null ? i : a, -1)
      if (lastProb >= 0 && scales.yRight) {
        const yPx = scales.yRight.getPixelForValue(probData[lastProb])
        ctx.fillStyle = 'rgba(59,130,246,0.8)'
        ctx.textAlign = 'left'
        ctx.fillText('%', right + 4, yPx)
      }

      const lastMm = mmData.reduceRight((a, v, i) => a === -1 && v != null ? i : a, -1)
      if (lastMm >= 0 && scales.yLeft) {
        const yPx = scales.yLeft.getPixelForValue(mmData[lastMm])
        ctx.fillStyle = 'rgba(96,165,250,0.9)'
        ctx.textAlign = 'left'
        ctx.fillText('mm', right + 4, yPx + 12)
      }
      ctx.restore()
    },
  }

  // Rain threshold drawn against yRight
  const rainThreshPlugin = {
    id: 'rainThresh',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea: { left, right, top, bottom }, scales: { yRight } } = chart
      if (!yRight) return
      const yPx = yRight.getPixelForValue(40)
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
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type:            'bar',
          label:           'mm',
          data:            mmData,
          backgroundColor: 'rgba(96,165,250,0.45)',
          borderColor:     'transparent',
          borderRadius:    3,
          borderSkipped:   false,
          yAxisID:         'yLeft',
          order:           2,
        },
        {
          type:             'line',
          label:            '%',
          data:             probData,
          borderColor:      '#3b82f6',
          borderDash:       [4, 3],
          borderWidth:      1.5,
          fill:             false,
          tension:          0.35,
          pointRadius:      0,
          pointHoverRadius: 0,
          yAxisID:          'yRight',
          order:            1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeOutQuart' },
      plugins: { legend: { display: false }, tooltip: TOOLTIP },
      scales: {
        x: xAxis(labels, isoTimes),
        yLeft: {
          type: 'linear', position: 'left',
          grid: { display: false }, border: { display: false },
          min: 0,
          ticks: {
            color: TICK_C, font: { family: MONO, size: 9 },
            callback: v => v === 0 ? '0' : null, maxTicksLimit: 1,
          },
        },
        yRight: {
          type: 'linear', position: 'right',
          grid: { display: false }, border: { display: false },
          min: 0, max: 100,
          afterBuildTicks(axis) { axis.ticks = [{ value: 40 }] },
          ticks: {
            color: TICK_C, font: { family: MONO, size: 9 },
            callback: v => v === 40 ? '40%' : null,
          },
        },
      },
    },
    plugins: [
      rainLabelPlugin,
      rainThreshPlugin,
      makeJetztPlugin(nowIdx),
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
  const activeThresholds = BEAUFORT
    .filter((t, i) => i === 0 || dataMax >= t.value - 20)
    .map(t => ({ ...t, color: '#94a3b8', tickLabel: `${t.value}` }))

  const yMax = Math.max(72, dataMax + 10)

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
      plugins: { legend: { display: false }, tooltip: TOOLTIP },
      scales: {
        x: xAxis(labels, isoTimes),
        y: { ...thresholdYAxis(activeThresholds), min: 0, max: yMax },
      },
    },
    plugins: [
      makeThresholdPlugin(activeThresholds),
      makeJetztPlugin(nowIdx),
      makeMidnightPlugin(midnightIdx),
    ],
  })
}
