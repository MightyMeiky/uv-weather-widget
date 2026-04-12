import Chart from 'chart.js/auto'

let uvChart   = null
let rainChart = null
let windChart = null

// ── Shared aesthetics ────────────────────────────────────
const FONT       = { family: 'IBM Plex Mono', size: 10, weight: '400' }
const TICK_COLOR = '#9c9488'
const GRID_COLOR = 'rgba(26, 24, 20, 0.06)'

const TOOLTIP = {
  enabled:         true,
  backgroundColor: '#ffffff',
  titleColor:      '#1a1814',
  bodyColor:       '#57534e',
  borderColor:     '#e8e4dc',
  borderWidth:     1.5,
  titleFont:       { ...FONT, size: 9 },
  bodyFont:        { ...FONT, size: 9 },
  padding:         8,
  cornerRadius:    6,
}

const BASE_SCALES = {
  x: {
    grid:   { color: GRID_COLOR, drawBorder: false },
    border: { display: false },
    ticks:  { color: TICK_COLOR, font: FONT, maxRotation: 0, maxTicksLimit: 7 },
  },
  y: {
    grid:   { color: GRID_COLOR },
    border: { display: false },
    ticks:  { color: TICK_COLOR, font: FONT },
  },
}

// ── Threshold line plugin factory ────────────────────────
// lines: [{ value, color, label, dash? }]
// Draws dotted horizontal lines with right-aligned labels
// directly on the canvas — no extra npm dependency needed.
function makeThresholdPlugin(lines) {
  return {
    id: 'thresholds',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea: { left, right }, scales: { y } } = chart
      ctx.save()

      for (const line of lines) {
        const yPx = y.getPixelForValue(line.value)
        if (yPx < chart.chartArea.top || yPx > chart.chartArea.bottom) continue

        // Dashed line
        ctx.strokeStyle = line.color
        ctx.lineWidth   = 1.5
        ctx.setLineDash(line.dash ?? [4, 4])
        ctx.beginPath()
        ctx.moveTo(left, yPx)
        ctx.lineTo(right, yPx)
        ctx.stroke()

        // Right-aligned label, slightly above the line
        ctx.setLineDash([])
        ctx.fillStyle    = line.color
        ctx.font         = `400 9px 'IBM Plex Mono', monospace`
        ctx.textAlign    = 'right'
        ctx.textBaseline = 'bottom'
        ctx.fillText(line.label, right - 3, yPx - 2)
      }

      ctx.restore()
    },
  }
}

// ── UV zone bands plugin ─────────────────────────────────
const UV_ZONES = [
  { min: 0,  max: 3,  fill: 'rgba(61,  122, 78,  0.09)' },
  { min: 3,  max: 6,  fill: 'rgba(156, 109, 14,  0.09)' },
  { min: 6,  max: 8,  fill: 'rgba(179, 66,  20,  0.09)' },
  { min: 8,  max: 11, fill: 'rgba(155, 33,  19,  0.09)' },
  { min: 11, max: 15, fill: 'rgba(107, 42,  150, 0.09)' },
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

// ── Area gradient for UV ─────────────────────────────────
const uvGradientPlugin = {
  id: 'uvGradient',
  beforeDatasetsDraw(chart) {
    const { ctx, chartArea: { top, bottom } } = chart
    const g = ctx.createLinearGradient(0, top, 0, bottom)
    g.addColorStop(0,    'rgba(107, 42,  150, 0.40)')
    g.addColorStop(0.25, 'rgba(155, 33,  19,  0.30)')
    g.addColorStop(0.5,  'rgba(179, 66,  20,  0.20)')
    g.addColorStop(0.75, 'rgba(156, 109, 14,  0.12)')
    g.addColorStop(1,    'rgba(61,  122, 78,  0.03)')
    chart.data.datasets[0].backgroundColor = g
  },
}

// ── "Jetzt" vertical marker plugin ──────────────────────
function makeJetztPlugin(nowIdx, labels) {
  return {
    id: 'jetzt',
    afterDatasetsDraw(chart) {
      if (nowIdx < 0 || nowIdx >= labels.length) return
      const { ctx, chartArea: { top, bottom }, scales: { x } } = chart
      const xPx = x.getPixelForValue(nowIdx)
      ctx.save()
      ctx.strokeStyle = 'rgba(26, 24, 20, 0.35)'
      ctx.lineWidth   = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(xPx, top)
      ctx.lineTo(xPx, bottom)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle    = 'rgba(26, 24, 20, 0.45)'
      ctx.font         = `500 8px 'IBM Plex Mono', monospace`
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText('Jetzt', xPx, top + 3)
      ctx.restore()
    },
  }
}

// ── Public API ───────────────────────────────────────────

export function renderUvChart(labels, data, nowIdx) {
  const canvas = document.getElementById('uv-chart')
  if (!canvas) return
  if (uvChart) uvChart.destroy()

  const thresholds = makeThresholdPlugin([
    { value: 3,  color: '#86efac', label: '🧴 Eincremen' },
    { value: 6,  color: '#fb923c', label: '🌂 Schatten'  },
    { value: 8,  color: '#f87171', label: '⚠️ Drinnen'   },
  ])

  uvChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        fill:             true,
        backgroundColor:  'transparent',         // overwritten by gradient plugin
        borderColor:      'rgba(156, 109, 14, 0.75)',
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
        x: BASE_SCALES.x,
        y: { ...BASE_SCALES.y, min: 0, max: 12, display: false },
      },
    },
    plugins: [uvZonesPlugin, uvGradientPlugin, thresholds, makeJetztPlugin(nowIdx, labels)],
  })
}

export function renderRainChart(labels, data, nowIdx) {
  const canvas = document.getElementById('rain-chart')
  if (!canvas) return
  if (rainChart) rainChart.destroy()

  const thresholds = makeThresholdPlugin([
    { value: 40, color: '#93c5fd', label: '🌧️ Regenkleidung' },
  ])

  rainChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: 'rgba(96, 165, 250, 0.28)',
        borderColor:     'rgba(96, 165, 250, 0.70)',
        borderWidth:     0,
        borderRadius:    3,
        borderSkipped:   false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeOutQuart' },
      plugins: { legend: { display: false }, tooltip: TOOLTIP },
      scales: {
        x: BASE_SCALES.x,
        y: {
          ...BASE_SCALES.y,
          min: 0, max: 100,
          ticks: { ...BASE_SCALES.y.ticks, callback: v => v + '%', stepSize: 25 },
        },
      },
    },
    plugins: [thresholds, makeJetztPlugin(nowIdx, labels)],
  })
}

export function renderWindChart(labels, data, nowIdx) {
  const canvas = document.getElementById('wind-chart')
  if (!canvas) return
  if (windChart) windChart.destroy()

  const thresholds = makeThresholdPlugin([
    { value: 45, color: '#94a3b8', label: '💨 Sturmgrenze' },
  ])

  windChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        fill:             true,
        backgroundColor:  'rgba(148, 163, 184, 0.14)',
        borderColor:      'rgba(100, 116, 139, 0.70)',
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
        x: BASE_SCALES.x,
        y: {
          ...BASE_SCALES.y,
          min: 0,
          ticks: { ...BASE_SCALES.y.ticks, callback: v => v + '' },
        },
      },
    },
    plugins: [thresholds, makeJetztPlugin(nowIdx, labels)],
  })
}
