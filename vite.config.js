import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Frischlingswetter',
        short_name: 'Frischlinge',
        description: 'UV index and weather for Landsberied',
        theme_color: '#f7f4ee',
        background_color: '#f7f4ee',
        display: 'standalone',
        icons: [
          { src: '/icon.svg',     sizes: 'any',     type: 'image/svg+xml', purpose: 'any maskable' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}']
      }
    })
  ]
})
