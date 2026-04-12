# Frischlingswetter — Landsberied

PWA showing UV index, rain probability and thunderstorm alerts for Landsberied, Bavaria.

Built with Vite + Chart.js + Open-Meteo API (no key required).

## Setup

```bash
npm install
npm run dev
```

## Build & Deploy

```bash
npm run build
# Vercel auto-deploys on push to main
```

## Features

- Current UV index with color-coded risk level
- Today's UV curve (hourly bar chart)
- Current weather: temperature, wind, rain probability
- Rain & precipitation chart
- Thunderstorm alert (next 6 hours)
- PWA: installable on Android/iOS homescreen
- Auto-refresh every 30 minutes

## Stack

- [Vite](https://vitejs.dev/) + Vanilla JS
- [Chart.js](https://www.chartjs.org/)
- [Open-Meteo](https://open-meteo.com/) — free, no API key
- [Vite PWA Plugin](https://vite-pwa-org.netlify.app/)
- Hosted on [Vercel](https://vercel.com/)
