import './main.css'
import './animations.js'
import { fetchWeatherData } from './api.js'
import { renderUvChart, renderRainChart, renderWindChart } from './charts.js'
import {
  thunderstormAlert,
  currentHourIndex,
} from './utils.js'

const $ = id => document.getElementById(id)

// ── Day mode ──────────────────────────────────────────────
// Returns: 'heute' | 'morgen' | 'wochenende'
function getDayMode(now = new Date()) {
  const dow = now.getDay()  // 0=Sun, 6=Sat
  if (dow === 0 || dow === 6) return 'wochenende'
  return now.getHours() < 14 ? 'heute' : 'morgen'
}

// ── Get indices for a given dateStr + hour window ─────────
function getWindowIndices(hourlyTimes, dateStr, startH, endH) {
  return hourlyTimes.reduce((acc, t, i) => {
    if (!t.startsWith(dateStr)) return acc
    const h = new Date(t).getHours()
    if (h >= startH && h <= endH) acc.push(i)
    return acc
  }, [])
}

function dateStr(d) {
  return d.toISOString().slice(0, 10)
}

function tomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d
}

// ── 48-hour indices (today + tomorrow, 0–23h each) ────────
function get48hIndices(hourlyTimes) {
  const todayS    = dateStr(new Date())
  const tomorrowS = dateStr(tomorrow())
  return hourlyTimes.reduce((acc, t, i) => {
    if (t.startsWith(todayS) || t.startsWith(tomorrowS)) acc.push(i)
    return acc
  }, [])
}

// ── HEUTE label ───────────────────────────────────────────
function boxLabel(mode, hourly, windowIdx) {
  if (mode === 'wochenende') return 'WOCHENENDE · ganzer Tag'
  if (mode === 'morgen')     return 'MORGEN · 8–14 Uhr'

  // Weekday today before 14:00 — show UV exposure window
  const uvHours = windowIdx.filter(i => (hourly.uv_index[i] ?? 0) >= 3)
  if (!uvHours.length) return 'HEUTE · 8–14 Uhr'
  const fmt = i => new Date(hourly.time[i])
    .toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  return `HEUTE · ${fmt(uvHours[0])}–${fmt(uvHours[uvHours.length - 1])} Uhr`
}

// ── Summary line — max values for the window ──────────────
function renderHeuteSummary(hourly, windowIdx) {
  const maxUv   = Math.max(...windowIdx.map(i => hourly.uv_index[i]        ?? 0))
  const maxRain = Math.max(...windowIdx.map(i => hourly.precipitation?.[i]  ?? 0))
  const maxWind = Math.max(...windowIdx.map(i => hourly.wind_speed_10m?.[i] ?? 0))

  const parts = []
  if (maxUv   > 0) parts.push(`UV max ${Math.round(maxUv * 10) / 10}`)
  if (maxRain > 0) parts.push(`Regen max ${Math.round(maxRain * 10) / 10} mm`)
  if (maxWind > 0) parts.push(`Wind max ${Math.round(maxWind)} km/h`)

  $('heute-summary').textContent = parts.join(' · ')
}

// ── Action items ──────────────────────────────────────────
function renderActionItems(hourly, windowIdx, mode) {
  const now   = new Date()
  const items = []

  // 🧴 First hour UV ≥ 3 in window
  for (const i of windowIdx) {
    if ((hourly.uv_index[i] ?? 0) >= 3) {
      const t = new Date(hourly.time[i])
        .toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
      items.push({ icon: '🧴', text: 'Sonnencreme', value: `UV ${Math.round((hourly.uv_index[i] ?? 0) * 10) / 10}` })
      break
    }
  }

  // 🌧️ Rain > 40% — window start/end
  const wetIdx = windowIdx.filter(i => (hourly.precipitation_probability[i] ?? 0) > 40)
  if (wetIdx.length) {
    const fmt  = i  => new Date(hourly.time[i])
      .toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    const maxP = Math.max(...wetIdx.map(i => hourly.precipitation_probability[i]))
    items.push({
      icon:  '🌧️',
      text:  'Regenkleidung',
      value: `${maxP}% ab ${fmt(wetIdx[0])}`,
    })
  }

  // ⚠️ Storm: CAPE > 500 or WMO 95/96/99 — future only for heute, all for morgen/weekend
  for (const i of windowIdx) {
    const t = new Date(hourly.time[i])
    if (mode === 'heute' && t <= now) continue
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
    .map((item, idx) => `
      <div class="action-item${item.calm ? ' action-item--calm' : ''}"
           style="animation-delay:${idx * 80}ms">
        <span class="action-item__icon">${item.icon}</span>
        <span class="action-item__text">${item.text}</span>
        ${item.value ? `<span class="action-item__value">${item.value}</span>` : ''}
      </div>`)
    .join('')

  // Weekend greeting
  const greeting = $('heute-weekend-greeting')
  if (greeting) greeting.remove()
  if (mode === 'wochenende') {
    const div = document.createElement('div')
    div.id        = 'heute-weekend-greeting'
    div.className = 'heute-weekend-greeting'
    div.textContent = '🐗 Schönes Wochenende!'
    $('heute-box').appendChild(div)
  }
}

// ── Main update ───────────────────────────────────────────
async function update() {
  $('app').classList.add('loading')

  try {
    const data = await fetchWeatherData()
    const { hourly } = data
    const times    = hourly.time
    const now      = new Date()
    const mode     = getDayMode(now)

    // Which date and hour window to use for the HEUTE box
    const targetDate = mode === 'morgen' ? dateStr(tomorrow()) : dateStr(now)
    const [startH, endH] = mode === 'wochenende' ? [6, 20] : [8, 14]
    const windowIdx = getWindowIndices(times, targetDate, startH, endH)

    // HEUTE box
    $('heute-label').textContent = boxLabel(mode, hourly, windowIdx)
    renderActionItems(hourly, windowIdx, mode)
    renderHeuteSummary(hourly, windowIdx)

    // Alert banner (always scans next 6h from now)
    const stormMsg = thunderstormAlert(times, hourly.weather_code, hourly.cape)
    const banner   = $('alert-banner')
    if (stormMsg) {
      $('alert-text').textContent = stormMsg
      banner.classList.remove('hidden')
    } else {
      banner.classList.add('hidden')
    }

    // 48-hour chart data (today + tomorrow)
    const chartIdx = get48hIndices(times)
    const labels   = chartIdx.map(i => {
      const d = new Date(times[i])
      return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    })
    const isoTimes  = chartIdx.map(i => times[i])
    const nowIdx    = chartIdx.indexOf(currentHourIndex(times))
    // midnight index: first entry that starts the second day
    const tomorrowS = dateStr(tomorrow())
    const midnightIdx = chartIdx.findIndex(i => times[i].startsWith(tomorrowS))

    renderUvChart(
      labels, isoTimes,
      chartIdx.map(i => Math.round((hourly.uv_index[i] ?? 0) * 10) / 10),
      nowIdx, midnightIdx,
    )

    renderRainChart(
      labels, isoTimes,
      chartIdx.map(i => hourly.precipitation_probability[i] ?? 0),
      chartIdx.map(i => Math.round((hourly.precipitation?.[i] ?? 0) * 10) / 10),
      nowIdx, midnightIdx,
    )

    renderWindChart(
      labels, isoTimes,
      chartIdx.map(i => Math.round(hourly.wind_speed_10m?.[i] ?? 0)),
      nowIdx, midnightIdx,
    )

    $('last-updated').textContent = `Stand: ${now.toLocaleTimeString('de-DE', {
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
