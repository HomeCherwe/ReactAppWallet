import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages використовує base path якщо репозиторій не на root
// Якщо репозиторій називається ReactAppWallet, то base буде /ReactAppWallet/
// Для root репозиторію встановіть base: '/'
const base = process.env.GITHUB_REPOSITORY 
  ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/`
  : process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    proxy: {
      '/api/parse-receipt': {
        target: process.env.VITE_API_URL || 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})

