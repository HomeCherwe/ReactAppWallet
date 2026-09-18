import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Capacitor завантажує файли локально — base ОБОВ'ЯЗКОВО має бути '/'
// GitHub Pages використовує base path від назви репозиторію
// CAPACITOR_BUILD=true встановлюється при збірці для iOS
const isCapacitorBuild = process.env.CAPACITOR_BUILD === 'true'

const base = isCapacitorBuild
  ? '/'
  : (process.env.GITHUB_REPOSITORY
      ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/`
      : process.env.VITE_BASE_PATH || '/')

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Allow access from network
    proxy: {
      '/api/parse-receipt': {
        target: process.env.VITE_API_URL || 'http://localhost:8787',
        changeOrigin: true,
      },
      '/api/scan-transactions': {
        target: process.env.VITE_API_URL || 'http://localhost:8787',
        changeOrigin: true,
      },
    },
    // HashRouter doesn't need historyApiFallback
    // historyApiFallback: true,
  },
  // For production build - ensure all routes work
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
})

