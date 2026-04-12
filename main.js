import './main.css'
import './animations.js'
import { fetchWeatherData } from './api.js'
import { renderUvChart, renderRainChart, renderWindChart } from './charts.js'
import {
  uvLevel,
  thunderstormAlert,
  currentHourIndex,
  todayHourlySlice,
} from './utils.js'

const $ = id => document.getElementById(id)

// ── HEUTE label — dynamic UV window ──────────────────────
function heuteLabelText(hourly, todayIdx) {
  const uvHours = todayIdx.filter(i => (hourly.uv_index[i] ?? 0) >= 3)
  if (!uvHours.length) return 'HEUTE'
  const fmt = i => new Date(hourly.time[i])
    .toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  return `HEUTE · ${fmt(uvHours[0])}–${fmt(uvHours[uvHours.length - 1])} Uhr`
}

// ── HEUTE summary — max values for 08:00–14:00 ───────────
function renderHeuteSummary(hourly, todayIdx) {
  const window = todayIdx.filter(i => {
    const h = new Date(hourly.time[i]).getHours()
    return h >= 8 && h <= 14
  })

  if (!window.length) { $('heute-summary').textContent = ''; return }

  const maxUv   = Math.max(...window.map(i => hourly.uv_index[i] ?? 0))
  const maxRain = Math.max(...window.map(i => hourly.precipitation?.[i] ?? 0))
  const maxWind = Math.max(...window.map(i => hourly.wind_speed_10m?.[i] ?? 0))

  const parts = []
  if (maxUv   > 0) parts.push(`UV max ${Math.round(maxUv * 10) / 10}`)
  if (maxRain > 0) parts.push(`Regen max ${Math.round(maxRain * 10) / 10} mm`)
  if (maxWind > 0) parts.push(`Wind max ${Math.round(maxWind)} km/h`)

  $('heute-summary').textContent = parts.join(' · ')
}

// ── Action items ──────────────────────────────────────────
function renderActionItems(hourly, todayIdx) {
  const now   = new Date()
  const items = []

  // 🧴 First hour UV ≥ 3
  for (const i of todayIdx) {
    if ((hourly.uv_index[i] ?? 0) >= 3) {
      const t = new Date(hourly.time[i])
        .toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
      items.push({ icon: '🧴', text: 'Eincremen', value: `ab ${t}` })
      break
    }
  }

  // 🌧️ Rain window > 40%
  const wetIdx = todayIdx.filter(i => (hourly.precipitation_probability[i] ?? 0) > 40)
  if (wetIdx.length) {
    const fmt = i => new Date(hourly.time[i])
      .toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    items.push({
      icon:  '🌧️',
      text:  'Regen möglich',
      value: `${fmt(wetIdx[0])}–${fmt(wetIdx[wetIdx.length - 1])}`,
    })
  }

  // ⚠️ Storm: CAPE > 500 or WMO 95/96/99, future hours only
  for (const i of todayIdx) {
    const t = new Date(hourly.time[i])
    if (t <= now) continue
    const isStorm  = [95, 96, 99].includes(hourly.weather_code[i])
    const highCape = (hourly.cape?.[i] ?? 0) > 500
    if (isStorm || highCape) {
      items.push({
        icon:  '⚠️',
        text:  'Gewitter möglich',
        value: `um ${t.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`,
      })
      break
    }
  }

  // ☀️ All-clear
  if (!items.length) {
    items.push({ icon: '☀️', text: 'Entspannter Tag', value: 'kein Schutz nötig', calm: true })
  }

  $('action-items').innerHTML = items
    .map((item, i) => `
      <div class="action-item${item.calm ? ' action-item--calm' : ''}"
           style="animation-delay:${i * 80}ms">
        <span class="action-item__icon">${item.icon}</span>
        <span class="action-item__text">${item.text}</span>
        ${item.value ? `<span class="action-item__value">${item.value}</span>` : ''}
      </div>`)
    .join('')
}

// ── Main update ───────────────────────────────────────────
async function update() {
  $('app').classList.add('loading')

  try {
    const data = await fetchWeatherData()
    const { hourly } = data
    const todayIdx = todayHourlySlice(hourly.time)
    const nowIdx   = currentHourIndex(hourly.time)

    // HEUTE label + action items + summary
    $('heute-label').textContent = heuteLabelText(hourly, todayIdx)
    renderActionItems(hourly, todayIdx)
    renderHeuteSummary(hourly, todayIdx)

    // Alert banner
    const stormMsg = thunderstormAlert(hourly.time, hourly.weather_code, hourly.cape)
    const banner   = $('alert-banner')
    if (stormMsg) {
      $('alert-text').textContent = stormMsg
      banner.classList.remove('hidden')
    } else {
      banner.classList.add('hidden')
    }

    // Shared x-axis labels + nowIdx position in today's slice
    const labels = todayIdx.map(i =>
      new Date(hourly.time[i]).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    )
    const nowLabelPos = todayIdx.indexOf(nowIdx)

    renderUvChart(
      labels,
      todayIdx.map(i => Math.round(hourly.uv_index[i] * 10) / 10),
      nowLabelPos,
    )

    renderRainChart(
      labels,
      todayIdx.map(i => hourly.precipitation_probability[i] ?? 0),
      todayIdx.map(i => Math.round((hourly.precipitation?.[i] ?? 0) * 10) / 10),
      nowLabelPos,
    )

    renderWindChart(
      labels,
      todayIdx.map(i => Math.round(hourly.wind_speed_10m?.[i] ?? 0)),
      nowLabelPos,
    )

    // Timestamp
    $('last-updated').textContent = `Stand: ${new Date().toLocaleTimeString('de-DE', {
      hour: '2-digit', minute: '2-digit',
    })}`

  } catch (err) {
    console.error('Fetch failed:', err)
  } finally {
    $('app').classList.remove('loading')
  }
}

$('refresh-btn').addEventListener('click', update)
setInterval(update, 30 * 60 * 1000)
update()
