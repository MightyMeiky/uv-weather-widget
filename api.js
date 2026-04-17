// Open-Meteo API — no key required
// Coordinates: Landsberied, Bavaria
const LAT = 48.1623
const LON = 11.1686

const BASE = 'https://api.open-meteo.com/v1/forecast'

export async function fetchWeatherData() {
  const params = new URLSearchParams({
    latitude: LAT,
    longitude: LON,
    hourly: [
      'uv_index',
      'precipitation_probability',
      'precipitation',
      'weather_code',
      'temperature_2m',
      'wind_speed_10m',
      'cape',           // convective energy → thunderstorm indicator
    ].join(','),
    current: [
      'temperature_2m',
      'weather_code',
      'wind_speed_10m',
      'precipitation',
      'uv_index',
    ].join(','),
    timezone: 'Europe/Berlin',
    forecast_days: 2,
  })

  const res = await fetch(`${BASE}?${params}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}
