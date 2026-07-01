import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // When built as a production file:// app, API calls need absolute localhost URLs
  // In dev, the proxy handles it
  define: {
    __API_BASE__: JSON.stringify('http://localhost:3001'),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
})
