import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // Mini Nexus PWA (plan 2026-07-11). Scope is /m so the service worker only
    // ever controls the mobile surface — the desktop console stays uncontrolled
    // and uncached. Registration is manual (MobileApp registers with scope
    // '/m'); injectRegister stays off so desktop pages never register it.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['icons/pwa-192.png', 'icons/pwa-512.png'],
      manifest: {
        name: 'Mini Nexus',
        short_name: 'Nexus',
        description: 'Pocket window into the Goose Nexus — chat, domains, status.',
        start_url: '/m',
        scope: '/m',
        display: 'standalone',
        background_color: '#090806',
        theme_color: '#090806',
        // PNG only — SVG sizes:"any" is a known WebAPK-mint breaker.
        icons: [
          { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precached app shell renders instantly even with the Mac unreachable.
        navigateFallback: '/index.html',
        navigateFallbackAllowlist: [/^\/m/],
        // Read-mostly API GETs: fresh when the Mac answers, stale copy when it
        // doesn't. Chat submit/stream/job and observe are deliberately NOT
        // cached — chat must fail honestly, and the observation outbox handles
        // its own retries with idempotency UUIDs.
        runtimeCaching: [
          {
            urlPattern: /\/api\/(domains$|file|events|chat\/history)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'nexus-api',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 300, maxAgeSeconds: 14 * 24 * 3600 },
            },
          },
        ],
      },
    }),
  ],
  // When built as a production file:// app, API calls need absolute localhost URLs
  // In dev, the proxy handles it
  define: {
    __API_BASE__: JSON.stringify('http://localhost:3001'),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // NEXUS_PORT lets a dev pair run beside the packaged app (which holds 3001)
        target: `http://localhost:${process.env.NEXUS_PORT || 3001}`,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
})
