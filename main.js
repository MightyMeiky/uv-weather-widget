import './main.css'
import './animations.js'
import { fetchWeatherData } from './api.js'
import { renderUvChart, renderRainChart, renderWindChart, renderTempChart } from './charts.js'
import {
  thunderstormAlert,
  currentHourIndex,
} from './utils.js'

const $ = id => document.getElementById(id)

// ── Tab state ─────────────────────────────────────────────
// Declared early so applyTheme can reference cachedData without TDZ error
let activeTab = 'heute'
let cachedData = null   // last successful API response

// ── Dark mode ─────────────────────────────────────────────
const themeToggle = $('theme-toggle')

function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  if (!dark) document.documentElement.removeAttribute('data-theme')
  localStorage.setItem('theme', dark ? 'dark' : 'light')
  if (cachedData) renderForTab(activeTab, cachedData.hourly)
}

themeToggle.addEventListener('click', () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  applyTheme(!isDark)
})

// Sync button icon with whatever the no-flash script already applied
applyTheme(document.documentElement.getAttribute('data-theme') === 'dark')

// ── Day helpers ───────────────────────────────────────────
function isWeekend(d = new Date()) {
  return d.getDay() === 0 || d.getDay() === 6
}

function dateStr(d) {
  return d.toISOString().slice(0, 10)
}

function tomorrowDate() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d
}

function getWindowIndices(times, targetDate, startH, endH) {
  return times.reduce((acc, t, i) => {
    if (!t.startsWith(targetDate)) return acc
    const h = new Date(t).getHours()
    if (h >= startH && h <= endH) acc.push(i)
    return acc
  }, [])
}

function get24hIndices(times, targetDate) {
  return times.reduce((acc, t, i) => {
    if (t.startsWith(targetDate)) acc.push(i)
    return acc
  }, [])
}

function defaultTab() {
  const now = new Date()
  // Weekend always Heute; weekday after 14:00 → Morgen
  if (isWeekend(now)) return 'heute'
  return now.getHours() < 14 ? 'heute' : 'morgen'
}

// ── HEUTE box rendering ───────────────────────────────────

function boxLabel(tab) {
  const d = tab === 'morgen' ? tomorrowDate() : new Date()
  const dayName = d.toLocaleDateString('de-DE', { weekday: 'long' })
  return isWeekend(d) ? dayName : `${dayName} · 8–14 Uhr`
}

function renderDecisionCard(hourly, windowIdx, tab) {
  // ── Metrics ──────────────────────────────────────────────
  const maxUv   = Math.max(...windowIdx.map(i => hourly.uv_index[i]                   ?? 0), 0)
  const maxProb = Math.max(...windowIdx.map(i => hourly.precipitation_probability?.[i] ?? 0), 0)
  const maxRain = Math.max(...windowIdx.map(i => hourly.precipitation?.[i]             ?? 0), 0)
  const maxWind = Math.max(...windowIdx.map(i => hourly.wind_speed_10m?.[i]            ?? 0), 0)
  const temps   = windowIdx.map(i => hourly.temperature_2m?.[i]).filter(v => v != null)
  const minT    = temps.length ? Math.round(Math.min(...temps)) : '–'
  const maxT    = temps.length ? Math.round(Math.max(...temps)) : '–'

  // ── Line 1 — Temperature ─────────────────────────────────
  $('dc-temp').textContent = `🌡️ ${minT}°–${maxT}°C`

  // ── Triggers ─────────────────────────────────────────────
  const uvTriggered   = maxUv >= 3
  const rainTriggered = maxProb > 40
  const windTriggered = Math.round(maxWind) >= 45

  const now = new Date()
  let stormTime = null
  for (const i of windowIdx) {
    const t = new Date(hourly.time[i])
    if (tab === 'heute' && t <= now) continue
    if ([95, 96, 99].includes(hourly.weather_code[i]) || (hourly.cape?.[i] ?? 0) > 500) {
      stormTime = t.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
      break
    }
  }

  // ── Line 2 — Action items ─────────────────────────────────
  const actions = []
  if (uvTriggered) {
    actions.push({ icon: '🧴', text: 'Sonnencreme', value: `UV ${Math.round(maxUv * 10) / 10}` })
  }
  if (rainTriggered) {
    const wetIdx = windowIdx.filter(i => (hourly.precipitation_probability?.[i] ?? 0) > 40)
    const fmt    = i => new Date(hourly.time[i]).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    actions.push({ icon: '🌧️', text: 'Regenkleidung', value: `${maxProb}% ab ${fmt(wetIdx[0])}` })
  }
  if (windTriggered) {
    actions.push({ icon: '💨', text: 'Sturmwarnung', value: `${Math.round(maxWind)} km/h` })
  }
  if (stormTime) {
    actions.push({ icon: '⚠️', text: 'Gewitter möglich', value: `um ${stormTime}` })
  }

  $('dc-actions').innerHTML = actions.length
    ? actions.map((a, idx) => `
        <div class="dc-action-item" style="animation-delay:${idx * 60}ms">
          ${a.icon} ${a.text} · <span class="dc-action-value">${a.value}</span>
        </div>`).join('')
    : `<div class="dc-calm">🐗 Alles gut heute</div>`

  // ── Line 3 — Passive values (metrics that didn't trigger) ─
  const passive = []
  if (!uvTriggered)   passive.push(`☀️ UV ${Math.round(maxUv * 10) / 10}`)
  if (!rainTriggered) passive.push(`🌧️ ${maxProb}%`)
  if (!windTriggered) passive.push(`💨 ${Math.round(maxWind)} km/h`)
  $('dc-passive').textContent = passive.join(' · ')

  // ── Accent border — escalates with highest warning ────────
  let accent = '#3d7a4e'                              // calm  → green
  if (uvTriggered)                     accent = '#eab308' // UV    → amber
  if (rainTriggered)                   accent = '#3b82f6' // rain  → blue
  if (windTriggered || stormTime)      accent = '#f87171' // danger → red
  $('heute-box').style.setProperty('--dc-accent', accent)

}

// ── Render all charts for a given tab/day ─────────────────
function renderForTab(tab, hourly) {
  const now       = new Date()
  const todayS    = dateStr(now)
  const tomorrowS = dateStr(tomorrowDate())

  // Which date the tab refers to
  const targetDate = tab === 'morgen' ? tomorrowS : todayS

  // Action box window: weekend = 6–20, weekday = 8–14
  const [startH, endH] = (isWeekend(now) && tab === 'heute') ? [6, 20] : [8, 14]
  const windowIdx = getWindowIndices(hourly.time, targetDate, startH, endH)

  // Decision Card
  $('heute-label').textContent = boxLabel(tab)
  renderDecisionCard(hourly, windowIdx, tab)

  // Charts: full 24h of the selected day
  const chartIdx   = get24hIndices(hourly.time, targetDate)
  const labels     = chartIdx.map(i =>
    new Date(hourly.time[i]).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  )
  const isoTimes   = chartIdx.map(i => hourly.time[i])
  const nowIdx     = tab === 'heute' ? chartIdx.indexOf(currentHourIndex(hourly.time)) : -1
  const midnightIdx = -1   // single-day view, no midnight separator needed

  renderUvChart(labels, isoTimes,
    chartIdx.map(i => Math.round((hourly.uv_index[i] ?? 0) * 10) / 10),
    nowIdx, midnightIdx)

  renderRainChart(labels, isoTimes,
    chartIdx.map(i => hourly.precipitation_probability[i] ?? 0),
    nowIdx, midnightIdx)

  renderWindChart(labels, isoTimes,
    chartIdx.map(i => Math.round(hourly.wind_speed_10m?.[i] ?? 0)),
    nowIdx, midnightIdx)

  renderTempChart(labels, isoTimes,
    chartIdx.map(i => Math.round((hourly.temperature_2m?.[i] ?? 0) * 10) / 10),
    nowIdx, midnightIdx)
}

// ── Tab switching ─────────────────────────────────────────
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    activeTab = btn.dataset.day
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn))
    if (cachedData) renderForTab(activeTab, cachedData.hourly)
  })
})

// ── Main update ───────────────────────────────────────────
async function update() {
  $('app').classList.add('loading')
  try {
    cachedData = await fetchWeatherData()
    const { hourly } = cachedData

    // Alert banner (always scans next 6h from now)
    const stormMsg = thunderstormAlert(hourly.time, hourly.weather_code, hourly.cape)
    const banner   = $('alert-banner')
    if (stormMsg) { $('alert-text').textContent = stormMsg; banner.classList.remove('hidden') }
    else banner.classList.add('hidden')

    renderForTab(activeTab, hourly)

    const now2 = new Date()
    const datePart = now2.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })
    const hh = String(now2.getHours()).padStart(2, '0')
    const mm = String(now2.getMinutes()).padStart(2, '0')
    $('last-updated').textContent = `${datePart}, ${hh}:${mm}`
  } catch (err) {
    console.error('Fetch failed:', err)
  } finally {
    $('app').classList.remove('loading')
  }
}

// ── Init ──────────────────────────────────────────────────
activeTab = defaultTab()
document.querySelectorAll('.tab').forEach(b =>
  b.classList.toggle('active', b.dataset.day === activeTab)
)

$('refresh-btn').addEventListener('click', update)
setInterval(update, 30 * 60 * 1000)
update()

// ── PWA install toggle ─────────────────────────────────────
$('pwa-toggle').addEventListener('click', () => {
  const content = $('pwa-content')
  const chevron = document.querySelector('.pwa-install__chevron')
  const isOpen  = !content.hidden
  content.hidden = isOpen
  chevron.textContent = isOpen ? '▾' : '▴'
})
