import Chart from 'chart.js/auto'

let dayChart = null

// ── Shared chart aesthetics ──────────────────────────────
const FONT       = { family: 'IBM Plex Mono', size: 9, weight: '400' }
const TICK_COLOR = '#a8a29e'

// Only these hours get X-axis labels
const KEY_HOURS = new Set(['06:00', '09:00', '12:00', '15:00', '18:00', '21:00'])

// ── UV risk zone bands ───────────────────────────────────
// Drawn as background rectangles behind the datasets.
// Colors match the CSS design-token palette at low opacity.
const UV_ZONES = [
  { min: 0,  max: 3,  fill: 'rgba(61,  122, 78,  0.10)' },  // low — sage
  { min: 3,  max: 6,  fill: 'rgba(156, 109, 14,  0.09)' },  // moderate — amber
  { min: 6,  max: 8,  fill: 'rgba(179, 66,  20,  0.09)' },  // high — sienna
  { min: 8,  max: 11, fill: 'rgba(155, 33,  19,  0.09)' },  // very high — red
  { min: 11, max: 15, fill: 'rgba(107, 42,  150, 0.09)' },  // extreme — violet
]

// ── Area gradient ────────────────────────────────────────
// Vertical gradient from extreme-violet at top → sage at bottom.
// Recomputed on every draw so it adapts to chart resize.
function makeUvGradient(ctx, top, bottom) {
  const g = ctx.createLinearGradient(0, top, 0, bottom)
  g.addColorStop(0,    'rgba(107, 42,  150, 0.45)')
  g.addColorStop(0.22, 'rgba(155, 33,  19,  0.34)')
  g.addColorStop(0.45, 'rgba(179, 66,  20,  0.23)')
  g.addColorStop(0.68, 'rgba(156, 109, 14,  0.14)')
  g.addColorStop(1,    'rgba(61,  122, 78,  0.04)')
  return g
}

// ── Plugin: UV risk zone bands ───────────────────────────
const zonesPlugin = {
  id: 'uvZones',
  beforeDatasetsDraw(chart) {
    const { ctx, chartArea: { left, right }, scales: { y } } = chart
    ctx.save()
    for (const zone of UV_ZONES) {
      const yTop    = y.getPixelForValue(Math.min(zone.max, 12))
      const yBottom = y.getPixelForValue(zone.min)
      const h       = yBottom - yTop
      if (h <= 0) continue
      ctx.fillStyle = zone.fill
      ctx.fillRect(left, yTop, right - left, h)
    }
    ctx.restore()
  },
}

// ── Plugin: live canvas gradient for the UV area fill ────
const gradientPlugin = {
  id: 'uvGradient',
  beforeDatasetsDraw(chart) {
    const { ctx, chartArea: { top, bottom } } = chart
    chart.data.datasets[0].backgroundColor = makeUvGradient(ctx, top, bottom)
  },
}

// ── Plugin: "Jetzt" vertical marker + "Regen %" label ───
// Closes over nowLabelPos so it knows which x-tick to mark.
function makeAnnotationPlugin(nowLabelPos, labels) {
  return {
    id: 'annotations',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea: { top, bottom, right }, scales: { x } } = chart

      ctx.save()

      // "Regen %" — right-aligned, top of chart area
      ctx.fillStyle  = 'rgba(90, 118, 170, 0.72)'
      ctx.font       = `400 8px 'IBM Plex Mono', monospace`
      ctx.textAlign  = 'right'
      ctx.textBaseline = 'top'
      ctx.fillText('Regen %', right - 2, top + 2)

      // Vertical dashed "Jetzt" line
      if (nowLabelPos >= 0 && nowLabelPos < labels.length) {
        const xPos = x.getPixelForValue(nowLabelPos)

        ctx.strokeStyle = 'rgba(26, 24, 20, 0.38)'
        ctx.lineWidth   = 1
        ctx.setLineDash([3, 3])
        ctx.beginPath()
        ctx.moveTo(xPos, top)
        ctx.lineTo(xPos, bottom)
        ctx.stroke()

        // "Jetzt" label — sits just inside the top of the chart
        ctx.setLineDash([])
        ctx.fillStyle    = 'rgba(26, 24, 20, 0.48)'
        ctx.font         = `500 8px 'IBM Plex Mono', monospace`
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText('Jetzt', xPos, top + 3)
      }

      ctx.restore()
    },
  }
}

// ── Public API ───────────────────────────────────────────
export function renderDayChart(labels, uvData, rainData, nowLabelPos) {
  const canvas = document.getElementById('day-chart')
  if (!canvas) return
  const ctx = canvas.getContext('2d')

  if (dayChart) dayChart.destroy()

  // Normalize rain (0–100 %) onto the UV y-scale (0–12)
  // so both series share one axis without a double Y-axis.
  const rainNorm = rainData.map(v => (v / 100) * 12)

  dayChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        // ① UV area (gradient fill set by gradientPlugin)
        {
          label:           'UV-Index',
          data:            uvData,
          fill:            true,
          backgroundColor: 'transparent',        // overwritten each frame
          borderColor:     'rgba(156, 109, 14, 0.75)',  // warm amber line
          borderWidth:     2,
          tension:         0.4,
          pointRadius:     0,
          pointHoverRadius: 0,
          order:           2,
        },
        // ② Rain probability — dashed overlay, normalized
        {
          label:           'Regen %',
          data:            rainNorm,
          fill:            false,
          borderColor:     'rgba(90, 118, 170, 0.60)',
          borderDash:      [5, 3],
          borderWidth:     1.5,
          tension:         0.35,
          pointRadius:     0,
          pointHoverRadius: 0,
          order:           1,
        },
      ],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      // Left-to-right draw animation (Chart.js default for line charts)
      animation: {
        duration: 600,
        easing:   'easeInOutQuart',
      },
      plugins: {
        legend:  { display: false },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          grid:   { display: false },
          border: { display: false },
          ticks: {
            autoSkip:    false,
            maxRotation: 0,
            color:       TICK_COLOR,
            font:        FONT,
            // Only label the six canonical hours
            callback: (_, idx) => KEY_HOURS.has(labels[idx]) ? labels[idx] : null,
          },
        },
        y: {
          min:     0,
          max:     12,
          display: false,   // zone bands provide visual context; no numeric axis
        },
      },
    },
    plugins: [
      zonesPlugin,
      gradientPlugin,
      makeAnnotationPlugin(nowLabelPos, labels),
    ],
  })
}
