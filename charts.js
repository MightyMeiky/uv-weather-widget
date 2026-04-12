import Chart from 'chart.js/auto'

let uvChart = null
let rainChart = null

// Light-mode UV palette — matches CSS design tokens
const UV_COLORS = {
  low:      '#3d7a4e',
  moderate: '#9c6d0e',
  high:     '#b34214',
  veryHigh: '#9b2113',
  extreme:  '#6b2a96',
}

function uvColor(v) {
  if (v < 3)  return UV_COLORS.low
  if (v < 6)  return UV_COLORS.moderate
  if (v < 8)  return UV_COLORS.high
  if (v < 11) return UV_COLORS.veryHigh
  return UV_COLORS.extreme
}

const FONT = { family: 'IBM Plex Mono', size: 9, weight: '400' }
const TICK_COLOR = '#a8a29e'
const GRID_COLOR = 'rgba(28, 25, 23, 0.055)'

const BASE_SCALES = {
  x: {
    grid:   { color: GRID_COLOR },
    border: { display: false },
    ticks:  { color: TICK_COLOR, font: FONT, maxTicksLimit: 7, maxRotation: 0 },
  },
  y: {
    grid:   { color: GRID_COLOR },
    border: { display: false },
    ticks:  { color: TICK_COLOR, font: FONT },
  },
}

const BASE_OPTIONS = {
  responsive:          true,
  maintainAspectRatio: false,
  plugins: {
    legend:  { display: false },
    tooltip: {
      enabled: true,
      backgroundColor: '#fdfcf8',
      titleColor:      '#1c1917',
      bodyColor:       '#57534e',
      borderColor:     '#e2ddd6',
      borderWidth:     1,
      titleFont:       { ...FONT, size: 9 },
      bodyFont:        { ...FONT, size: 9 },
      padding:         8,
      cornerRadius:    2,
    },
  },
}

// Stagger delay: each bar enters 20ms after the previous
const staggerDelay = (ctx) => ctx.dataIndex * 20

export function renderUvChart(labels, data) {
  const ctx = document.getElementById('uv-chart').getContext('2d')
  if (uvChart) uvChart.destroy()

  const colors = data.map(uvColor)

  uvChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.map(c => c + 'cc'),  // ~80% opacity
        borderColor:     colors,
        borderWidth:     0,
        borderRadius:    3,
        borderSkipped:   false,
      }],
    },
    options: {
      ...BASE_OPTIONS,
      animation: {
        delay:    staggerDelay,
        duration: 480,
        easing:   'easeOutQuart',
      },
      scales: {
        x: BASE_SCALES.x,
        y: {
          ...BASE_SCALES.y,
          min: 0,
          suggestedMax: 12,
          ticks: { ...BASE_SCALES.y.ticks, stepSize: 3 },
        },
      },
    },
  })
}

export function renderRainChart(labels, precipProb, precipAmount) {
  const ctx = document.getElementById('rain-chart').getContext('2d')
  if (rainChart) rainChart.destroy()

  rainChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label:           'Regenwahrsch. %',
          data:            precipProb,
          backgroundColor: 'rgba(90, 118, 170, 0.22)',
          borderColor:     'rgba(90, 118, 170, 0.55)',
          borderWidth:     0,
          borderRadius:    3,
          yAxisID:         'y',
        },
        {
          label:           'Menge mm',
          data:            precipAmount,
          type:            'line',
          borderColor:     '#5a76aa',
          backgroundColor: 'transparent',
          pointRadius:     2,
          pointBackgroundColor: '#5a76aa',
          tension:         0.4,
          yAxisID:         'y1',
          borderWidth:     1.5,
        },
      ],
    },
    options: {
      ...BASE_OPTIONS,
      animation: {
        delay:    staggerDelay,
        duration: 480,
        easing:   'easeOutQuart',
      },
      plugins: {
        ...BASE_OPTIONS.plugins,
        legend: {
          display: true,
          labels:  { color: TICK_COLOR, font: FONT, boxWidth: 8, padding: 10 },
        },
      },
      scales: {
        x: BASE_SCALES.x,
        y: {
          ...BASE_SCALES.y,
          min: 0,
          max: 100,
          ticks: { ...BASE_SCALES.y.ticks, callback: v => v + '%' },
        },
        y1: {
          position: 'right',
          min:      0,
          grid:     { drawOnChartArea: false },
          border:   { display: false },
          ticks:    { color: TICK_COLOR, font: FONT, callback: v => v + 'mm' },
        },
      },
    },
  })
}
