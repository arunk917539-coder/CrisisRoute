import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const target = process.env.CRISISROUTE_API_TARGET || env.CRISISROUTE_API_TARGET || 'http://127.0.0.1:8000'
  const proxy = { '/api': { target, changeOrigin: true, rewrite: (path: string) => path.replace(/^\/api/, '') } }
  return {
    plugins: [react()],
    server: { host: '0.0.0.0', port: 5174, strictPort: true, proxy },
    preview: { host: '0.0.0.0', port: 5174, strictPort: true, proxy },
  }
})
