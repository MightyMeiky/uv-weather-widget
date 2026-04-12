// ── UV Index ──────────────────────────────────────
export function uvLevel(index) {
  if (index < 3)  return { level: 'low',       label: 'Niedrig',       advice: 'Kein Schutz nötig' }
  if (index < 6)  return { level: 'moderate',  label: 'Mäßig',         advice: 'Sonnencreme empfohlen' }
  if (index < 8)  return { level: 'high',      label: 'Hoch',          advice: 'Sonnencreme + Schatten suchen' }
  if (index < 11) return { level: 'very-high', label: 'Sehr hoch',     advice: '⚠️ Mittagssonne meiden' }
  return           { level: 'extreme',          label: 'Extrem',        advice: '🚨 Drinnen bleiben!' }
}

export function peakUvTime(hourlyTimes, hourlyUv) {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  let peak = 0
  let peakTime = null

  hourlyTimes.forEach((t, i) => {
    if (t.startsWith(todayStr) && hourlyUv[i] > peak) {
      peak = hourlyUv[i]
      peakTime = t
    }
  })

  if (!peakTime) return null
  const d = new Date(peakTime)
  return {
    value: Math.round(peak * 10) / 10,
    time: d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  }
}

// ── Weather Codes (WMO) ───────────────────────────
export function weatherCodeInfo(code) {
  const map = {
    0:  { icon: '☀️',  label: 'Klar' },
    1:  { icon: '🌤️', label: 'Überwiegend klar' },
    2:  { icon: '⛅',  label: 'Teilweise bewölkt' },
    3:  { icon: '☁️',  label: 'Bedeckt' },
    45: { icon: '🌫️', label: 'Nebel' },
    48: { icon: '🌫️', label: 'Gefrierender Nebel' },
    51: { icon: '🌦️', label: 'Leichter Nieselregen' },
    53: { icon: '🌦️', label: 'Nieselregen' },
    55: { icon: '🌧️', label: 'Starker Nieselregen' },
    61: { icon: '🌧️', label: 'Leichter Regen' },
    63: { icon: '🌧️', label: 'Regen' },
    65: { icon: '🌧️', label: 'Starker Regen' },
    71: { icon: '🌨️', label: 'Leichter Schnee' },
    73: { icon: '🌨️', label: 'Schnee' },
    75: { icon: '❄️',  label: 'Starker Schnee' },
    80: { icon: '🌦️', label: 'Regenschauer' },
    81: { icon: '🌧️', label: 'Starke Schauer' },
    82: { icon: '🌧️', label: 'Heftige Schauer' },
    95: { icon: '⛈️',  label: 'Gewitter' },
    96: { icon: '⛈️',  label: 'Gewitter mit Hagel' },
    99: { icon: '⛈️',  label: 'Schweres Gewitter' },
  }
  return map[code] ?? { icon: '🌡️', label: `Code ${code}` }
}

// ── Thunderstorm alert ────────────────────────────
export function thunderstormAlert(hourlyTimes, hourlyCode, hourlyCape) {
  const now = new Date()
  const next6h = new Date(now.getTime() + 6 * 3600_000)

  for (let i = 0; i < hourlyTimes.length; i++) {
    const t = new Date(hourlyTimes[i])
    if (t < now || t > next6h) continue
    const isStorm = [95, 96, 99].includes(hourlyCode[i])
    const highCape = (hourlyCape?.[i] ?? 0) > 500
    if (isStorm || highCape) {
      return `Gewitter möglich um ${t.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`
    }
  }
  return null
}

// ── Helpers ───────────────────────────────────────
export function currentHourIndex(hourlyTimes) {
  const now = new Date()
  return hourlyTimes.findIndex(t => {
    const d = new Date(t)
    return d.getHours() === now.getHours() &&
           d.toDateString() === now.toDateString()
  })
}

export function todayHourlySlice(hourlyTimes) {
  const todayStr = new Date().toISOString().slice(0, 10)
  return hourlyTimes.reduce((acc, t, i) => {
    if (t.startsWith(todayStr)) acc.push(i)
    return acc
  }, [])
}
