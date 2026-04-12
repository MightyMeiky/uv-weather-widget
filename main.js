import './main.css'
import './animations.js'
import { fetchWeatherData } from './api.js'
import { renderUvChart, renderRainChart } from './charts.js'
import {
  uvLevel,
  peakUvTime,
  weatherCodeInfo,
  thunderstormAlert,
  currentHourIndex,
  todayHourlySlice,
} from './utils.js'

// ── DOM refs ──────────────────────────────────────
const $ = id => document.getElementById(id)

// ── Main update ───────────────────────────────────
async function update() {
  document.getElementById('app').classList.add('loading')

  try {
    const data = await fetchWeatherData()
    const { current, hourly } = data
    const todayIdx = todayHourlySlice(hourly.time)
    const nowIdx   = currentHourIndex(hourly.time)

    // ── Current UV ────────────────────────────────
    const uvNow = current.uv_index ?? (nowIdx >= 0 ? hourly.uv_index[nowIdx] : 0)
    const { level, label, advice } = uvLevel(uvNow)

    $('uv-value').textContent = Math.round(uvNow * 10) / 10
    $('uv-level').textContent = label
    $('uv-advice').textContent = advice
    $('uv-card').dataset.level = level

    const peak = peakUvTime(hourly.time, hourly.uv_index)
    $('uv-peak').textContent = peak
      ? `Peak heute: ${peak.value} um ${peak.time} Uhr`
      : ''

    // ── Current Weather ───────────────────────────
    const wInfo = weatherCodeInfo(current.weather_code)
    $('weather-icon').textContent = wInfo.icon
    $('temp').textContent = `${Math.round(current.temperature_2m)}°C`
    $('wind').textContent = `${Math.round(current.wind_speed_10m)} km/h`

    const precipNow = nowIdx >= 0 ? hourly.precipitation_probability[nowIdx] : 0
    $('precip-prob').textContent = `${Math.round(precipNow)}%`

    // ── Thunderstorm alert ────────────────────────
    const stormMsg = thunderstormAlert(
      hourly.time,
      hourly.weather_code,
      hourly.cape
    )
    const banner = $('alert-banner')
    if (stormMsg) {
      $('alert-text').textContent = stormMsg
      banner.classList.remove('hidden')
    } else {
      banner.classList.add('hidden')
    }

    // ── Charts — today's hours only ───────────────
    const labels = todayIdx.map(i => {
      const d = new Date(hourly.time[i])
      return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    })

    renderUvChart(
      labels,
      todayIdx.map(i => Math.round(hourly.uv_index[i] * 10) / 10)
    )

    renderRainChart(
      labels,
      todayIdx.map(i => hourly.precipitation_probability[i] ?? 0),
      todayIdx.map(i => hourly.precipitation[i] ?? 0)
    )

    // ── Timestamp ─────────────────────────────────
    $('last-updated').textContent = `Stand: ${new Date().toLocaleTimeString('de-DE', {
      hour: '2-digit', minute: '2-digit'
    })}`

  } catch (err) {
    console.error('Fetch failed:', err)
    $('uv-level').textContent = 'Fehler beim Laden'
    $('uv-advice').textContent = 'Bitte aktualisieren'
  } finally {
    document.getElementById('app').classList.remove('loading')
  }
}

// ── Refresh button ────────────────────────────────
$('refresh-btn').addEventListener('click', update)

// ── Auto-refresh every 30 min ─────────────────────
setInterval(update, 30 * 60 * 1000)

// ── Initial load ──────────────────────────────────
update()
