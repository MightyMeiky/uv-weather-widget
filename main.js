import './main.css'
import './animations.js'
import { fetchWeatherData } from './api.js'
import { renderDayChart } from './charts.js'
import {
  uvLevel,
  peakUvTime,
  thunderstormAlert,
  currentHourIndex,
  todayHourlySlice,
} from './utils.js'

// ── DOM refs ──────────────────────────────────────────────
const $ = id => document.getElementById(id)

// ── Action cards ──────────────────────────────────────────
// Derives 2–3 actionable conclusions from today's forecast.
// Replaces the raw weather-value grid.
function renderActionCards(hourly, todayIdx) {
  const section = $('action-cards')
  const now     = new Date()
  const cards   = []

  // 🧴 First hour UV ≥ 3 today → sunscreen reminder
  for (const i of todayIdx) {
    if ((hourly.uv_index[i] ?? 0) >= 3) {
      const time = new Date(hourly.time[i])
        .toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
      cards.push({ icon: '🧴', text: `Eincremen ab ${time} Uhr` })
      break
    }
  }

  // 🌧️ Rain probability window > 40% — show start–end range
  const wetIdx = todayIdx.filter(i => (hourly.precipitation_probability[i] ?? 0) > 40)
  if (wetIdx.length) {
    const fmt = i => new Date(hourly.time[i])
      .toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    cards.push({
      icon: '🌧️',
      text: `Regen möglich ${fmt(wetIdx[0])}–${fmt(wetIdx[wetIdx.length - 1])} Uhr`,
    })
  }

  // ⚠️ Thunderstorm: CAPE > 500 or WMO code 95 / 96 / 99
  // Only look at future hours so the card stays relevant
  for (const i of todayIdx) {
    const t = new Date(hourly.time[i])
    if (t <= now) continue
    const isStorm  = [95, 96, 99].includes(hourly.weather_code[i])
    const highCape = (hourly.cape?.[i] ?? 0) > 500
    if (isStorm || highCape) {
      const time = t.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
      cards.push({ icon: '⚠️', text: `Gewitter möglich um ${time} Uhr` })
      break
    }
  }

  // ☀️ All-clear fallback
  if (!cards.length) {
    cards.push({
      icon:  '☀️',
      text:  'Entspannter Tag — kein besonderer Schutz nötig',
      calm:  true,
    })
  }

  section.innerHTML = cards
    .map((c, i) => `<div class="action-card${c.calm ? ' action-card--calm' : ''}" style="animation-delay:${i * 80}ms">
      <span class="action-icon">${c.icon}</span>
      <span class="action-text">${c.text}</span>
    </div>`)
    .join('')
}

// ── Main update ───────────────────────────────────────────
async function update() {
  $('app').classList.add('loading')

  try {
    const data = await fetchWeatherData()
    const { current, hourly } = data
    const todayIdx = todayHourlySlice(hourly.time)
    const nowIdx   = currentHourIndex(hourly.time)

    // ── UV card ───────────────────────────────────────────
    const uvNow = current.uv_index ?? (nowIdx >= 0 ? hourly.uv_index[nowIdx] : 0)
    const { level, label, advice } = uvLevel(uvNow)

    $('uv-value').textContent  = Math.round(uvNow * 10) / 10
    $('uv-level').textContent  = label
    $('uv-advice').textContent = advice
    $('uv-card').dataset.level = level

    const peak = peakUvTime(hourly.time, hourly.uv_index)
    $('uv-peak').textContent = peak
      ? `Peak heute: ${peak.value} um ${peak.time} Uhr`
      : ''

    // ── Action cards ──────────────────────────────────────
    renderActionCards(hourly, todayIdx)

    // ── Thunderstorm alert banner ─────────────────────────
    const stormMsg = thunderstormAlert(hourly.time, hourly.weather_code, hourly.cape)
    const banner   = $('alert-banner')
    if (stormMsg) {
      $('alert-text').textContent = stormMsg
      banner.classList.remove('hidden')
    } else {
      banner.classList.add('hidden')
    }

    // ── Combined day chart ────────────────────────────────
    const labels = todayIdx.map(i =>
      new Date(hourly.time[i]).toLocaleTimeString('de-DE', {
        hour: '2-digit', minute: '2-digit',
      })
    )

    renderDayChart(
      labels,
      todayIdx.map(i => Math.round(hourly.uv_index[i] * 10) / 10),
      todayIdx.map(i => hourly.precipitation_probability[i] ?? 0),
      todayIdx.indexOf(nowIdx),
    )

    // ── Timestamp ─────────────────────────────────────────
    $('last-updated').textContent = `Stand: ${new Date().toLocaleTimeString('de-DE', {
      hour: '2-digit', minute: '2-digit',
    })}`

  } catch (err) {
    console.error('Fetch failed:', err)
    $('uv-level').textContent  = 'Fehler beim Laden'
    $('uv-advice').textContent = 'Bitte aktualisieren'
  } finally {
    $('app').classList.remove('loading')
  }
}

// ── Refresh button + auto-refresh ─────────────────────────
$('refresh-btn').addEventListener('click', update)
setInterval(update, 30 * 60 * 1000)
update()
