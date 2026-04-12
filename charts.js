import Chart from 'chart.js/auto'

let uvChart = null
let rainChart = null

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { enabled: true } },
  scales: {
    x: {
      grid: { color: 'rgba(255,255,255,0.05)' },
      ticks: { color: '#8888aa', font: { size: 10, family: 'DM Mono' }, maxTicksLimit: 8 }
    },
    y: {
      grid: { color: 'rgba(255,255,255,0.05)' },
      ticks: { color: '#8888aa', font: { size: 10, family: 'DM Mono' } }
    }
  }
}

export function renderUvChart(labels, data) {
  const ctx = document.getElementById('uv-chart').getContext('2d')
  if (uvChart) uvChart.destroy()

  // Color each bar by UV level
  const colors = data.map(v => {
    if (v < 3)  return '#4ade80'
    if (v < 6)  return '#facc15'
    if (v < 8)  return '#fb923c'
    if (v < 11) return '#f87171'
    return '#c084fc'
  })

  uvChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderRadius: 4,
        borderSkipped: false,
      }]
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        ...CHART_DEFAULTS.scales,
        y: { ...CHART_DEFAULTS.scales.y, min: 0, suggestedMax: 12,
          ticks: { ...CHART_DEFAULTS.scales.y.ticks, stepSize: 3 } }
      }
    }
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
          label: 'Regenwahrsch. %',
          data: precipProb,
          backgroundColor: 'rgba(96, 165, 250, 0.5)',
          borderRadius: 4,
          yAxisID: 'y',
        },
        {
          label: 'Menge mm',
          data: precipAmount,
          type: 'line',
          borderColor: '#60a5fa',
          backgroundColor: 'transparent',
          pointRadius: 2,
          tension: 0.4,
          yAxisID: 'y1',
        }
      ]
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: true, labels: { color: '#8888aa', font: { size: 10 } } }
      },
      scales: {
        x: CHART_DEFAULTS.scales.x,
        y: { ...CHART_DEFAULTS.scales.y, min: 0, max: 100,
          ticks: { ...CHART_DEFAULTS.scales.y.ticks, callback: v => v + '%' } },
        y1: { position: 'right', min: 0,
          grid: { drawOnChartArea: false },
          ticks: { color: '#8888aa', font: { size: 10 }, callback: v => v + 'mm' } }
      }
    }
  })
}
