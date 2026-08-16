import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Core Fitness',
        short_name: 'Core Fitness',
        description: 'Core Fitness gym membership, classes, and attendance for members and trainers.',
        theme_color: '#0F0F1A',
        background_color: '#0F0F1A',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Push + notificationclick handling, kept out of the generated worker.
        // See public/push-sw.js for why it is imported rather than inlined.
        importScripts: ['push-sw.js'],
        // Precache the app shell + PWA icons only. Gym/trainer photos run to
        // several MB and would bloat the install for no benefit — the app needs a
        // network connection for its data anyway, so those load normally.
        globPatterns: [
          '**/*.{js,css,html,svg,ico,woff,woff2}',
          'pwa-*.png',
          'maskable-icon-*.png',
          'apple-touch-icon-*.png',
        ],
        // SPA: serve the cached shell for any navigation so the app still opens
        // offline. Data fetches are deliberately NOT cached (see below).
        navigateFallback: 'index.html',
        // Never serve a cached response for Supabase — a stale membership status
        // or QR payload would be worse than an honest offline error.
        navigateFallbackDenylist: [/^\/api/, /supabase\.co/],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: false,
    headers: {
      'X-Frame-Options': 'SAMEORIGIN',
    },
  },
})
