import Chart from 'chart.js/auto'

let uvChart   = null
let rainChart = null
let windChart = null

// ── Shared Tufte-minimal aesthetics ─────────────────────
// No grid, no borders, no decorative ink — only data + thresholds
const MONO   = "'IBM Plex Mono', monospace"
const TICK_C = '#9c9488'

// Only these six hours appear on the X-axis
const KEY_HOURS = new Set(['06:00', '09:00', '12:00', '15:00', '18:00', '21:00'])

const xAxis = (labels) => ({
  grid:   { display: false },
  border: { display: false },
  ticks: {
    color:       TICK_C,
    font:        { family: MONO, size: 10 },
    maxRotation: 0,
    autoSkip:    false,
    callback:    (_, i) => KEY_HOURS.has(labels[i]) ? labels[i] : null,
  },
})

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

// ── Threshold line + Y-label plugin ─────────────────────
// Draws horizontal dashed lines. For each line, also injects a
// custom Y-axis tick label at exactly that value — replacing all
// other Y labels so only threshold values remain.
// lines: [{ value, color, label }]
function makeThresholdPlugin(lines) {
  return {
    id: 'thresholds',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea: { left, right, top, bottom }, scales } = chart
      const y = scales.y ?? scales.yLeft
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

        // Right-aligned label just above the line
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

// Y-axis that only shows ticks at the given threshold values
function thresholdYAxis(thresholds, opts = {}) {
  const values = thresholds.map(t => t.value)
  return {
    grid:   { display: false },
    border: { display: false },
    ticks: {
      color: TICK_C,
      font:  { family: MONO, size: 9 },
      // Return label only for threshold values, null for everything else
      callback(v) {
        const hit = thresholds.find(t => Math.abs(t.value - v) < 0.01)
        return hit ? (hit.tickLabel ?? String(hit.value)) : null
      },
      // Force Chart.js to generate ticks at exactly threshold positions
      values,
    },
    afterBuildTicks(axis) {
      axis.ticks = values.map(v => ({ value: v }))
    },
    ...opts,
  }
}

// ── "Jetzt" vertical marker ──────────────────────────────
function makeJetztPlugin(nowIdx, labels) {
  return {
    id: 'jetzt',
    afterDatasetsDraw(chart) {
      if (nowIdx < 0 || nowIdx >= labels.length) return
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

// ── UV zone band plugin ──────────────────────────────────
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

// UV area gradient (recomputed on each draw)
const uvGradientPlugin = {
  id: 'uvGradient',
  beforeDatasetsDraw(chart) {
    const { ctx, chartArea: { top, bottom } } = chart
    const g = ctx.createLinearGradient(0, top, 0, bottom)
    g.addColorStop(0,    'rgba(107,42,150,0.38)')
    g.addColorStop(0.25, 'rgba(155,33,19,0.28)')
    g.addColorStop(0.5,  'rgba(179,66,20,0.18)')
    g.addColorStop(0.75, 'rgba(156,109,14,0.10)')
    g.addColorStop(1,    'rgba(61,122,78,0.03)')
    chart.data.datasets[0].backgroundColor = g
  },
}

// ── UV chart ─────────────────────────────────────────────
const UV_THRESHOLDS = [
  { value: 3, color: '#86efac', label: '🧴 Eincremen', tickLabel: '3' },
  { value: 6, color: '#fb923c', label: '🌂 Schatten',  tickLabel: '6' },
  { value: 8, color: '#f87171', label: '⚠️ Drinnen',   tickLabel: '8' },
]

export function renderUvChart(labels, data, nowIdx) {
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
        backgroundColor:  'transparent',
        borderColor:      'rgba(156,109,14,0.75)',
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
        x: xAxis(labels),
        y: {
          ...thresholdYAxis(UV_THRESHOLDS),
          min: 0,
          max: 12,
        },
      },
    },
    plugins: [
      uvZonesPlugin,
      uvGradientPlugin,
      makeThresholdPlugin(UV_THRESHOLDS),
      makeJetztPlugin(nowIdx, labels),
    ],
  })
}

// ── Rain chart — bars (mm) + dashed line (%) ─────────────
const RAIN_THRESHOLDS = [
  { value: 40, color: '#93c5fd', label: '🌧️ Regenkleidung', tickLabel: '40%' },
]

// Inline end-of-series label plugin for rain
function makeRainLabelPlugin(probData, mmData) {
  return {
    id: 'rainLabels',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea: { right, top }, scales } = chart
      ctx.save()
      ctx.font         = `400 9px ${MONO}`
      ctx.textBaseline = 'middle'

      // "%" label near last non-null prob point, right Y axis
      const lastProb = probData.reduceRight((acc, v, i) => acc === -1 && v != null ? i : acc, -1)
      if (lastProb >= 0 && scales.yRight) {
        const yPx = scales.yRight.getPixelForValue(probData[lastProb])
        ctx.fillStyle = 'rgba(90,118,170,0.7)'
        ctx.textAlign = 'left'
        ctx.fillText('%', right + 4, yPx)
      }

      // "mm" label near last non-null mm point, left Y axis
      const lastMm = mmData.reduceRight((acc, v, i) => acc === -1 && v != null ? i : acc, -1)
      if (lastMm >= 0 && scales.yLeft) {
        const yPx = scales.yLeft.getPixelForValue(mmData[lastMm])
        ctx.fillStyle = 'rgba(96,165,250,0.8)'
        ctx.textAlign = 'left'
        ctx.fillText('mm', right + 4, yPx + 12)
      }

      ctx.restore()
    },
  }
}

export function renderRainChart(labels, probData, mmData, nowIdx) {
  const canvas = document.getElementById('rain-chart')
  if (!canvas) return
  if (rainChart) rainChart.destroy()

  rainChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        // Bars — mm amount, left axis
        {
          type:            'bar',
          label:           'mm',
          data:            mmData,
          backgroundColor: 'rgba(96,165,250,0.50)',
          borderColor:     'transparent',
          borderRadius:    3,
          borderSkipped:   false,
          yAxisID:         'yLeft',
          order:           2,
        },
        // Dashed line — probability %, right axis
        {
          type:             'line',
          label:            '%',
          data:             probData,
          borderColor:      'rgba(90,118,170,0.70)',
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
        x: xAxis(labels),
        yLeft: {
          type:     'linear',
          position: 'left',
          grid:     { display: false },
          border:   { display: false },
          min:      0,
          ticks: {
            color: TICK_C,
            font:  { family: MONO, size: 9 },
            // Only label 0 mm so the axis doesn't clutter — threshold is on yRight
            callback: v => v === 0 ? '0' : null,
            maxTicksLimit: 1,
          },
        },
        yRight: {
          type:     'linear',
          position: 'right',
          grid:     { display: false },
          border:   { display: false },
          min:      0,
          max:      100,
          // Only label at the 40% threshold
          afterBuildTicks(axis) { axis.ticks = [{ value: 40 }] },
          ticks: {
            color:    TICK_C,
            font:     { family: MONO, size: 9 },
            callback: v => v === 40 ? '40%' : null,
          },
        },
      },
    },
    plugins: [
      makeThresholdPlugin([{ ...RAIN_THRESHOLDS[0], yAxisID: 'yRight' }].map(t => ({
        ...t,
        // We'll draw it against the right axis — override plugin to use yRight
        _useRight: true,
      }))),
      makeRainLabelPlugin(probData, mmData),
      makeJetztPlugin(nowIdx, labels),
      // Custom plugin to draw rain threshold against yRight specifically
      {
        id: 'rainThreshold',
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
      },
    ],
  })
}

// ── Wind chart — Beaufort thresholds ────────────────────
const BEAUFORT = [
  { value: 45,  label: 'Sturmwarnung' },
  { value: 62,  label: 'Stürmischer Wind (Bft 8)' },
  { value: 75,  label: 'Sturm (Bft 9)' },
  { value: 89,  label: 'Schwerer Sturm (Bft 10)' },
  { value: 103, label: 'Orkanartiger Sturm (Bft 11)' },
  { value: 118, label: 'Orkan (Bft 12)' },
]

export function renderWindChart(labels, data, nowIdx) {
  const canvas = document.getElementById('wind-chart')
  if (!canvas) return
  if (windChart) windChart.destroy()

  const dataMax = Math.max(...data, 0)

  // Always include 45 km/h threshold. Add higher ones only if data
  // comes within 20 km/h of them.
  const activeThresholds = BEAUFORT
    .filter((t, i) => i === 0 || dataMax >= t.value - 20)
    .map(t => ({ ...t, color: '#94a3b8', tickLabel: `${t.value}` }))

  // Y-max: at least 62 + 10, or data max + 10, whichever is larger
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
        x: xAxis(labels),
        y: {
          ...thresholdYAxis(activeThresholds),
          min: 0,
          max: yMax,
        },
      },
    },
    plugins: [
      makeThresholdPlugin(activeThresholds),
      makeJetztPlugin(nowIdx, labels),
    ],
  })
}
