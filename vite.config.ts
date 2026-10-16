import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, '.', '')
  const target = env.VITE_API_BASE_URL || 'http://localhost:5080'
  // Same-origin requests preserve the public intake's HttpOnly idempotency cookie,
  // including when the development API uses HTTPS and Vite uses HTTP.
  const proxy = Object.fromEntries(['/api', '/current', '/tenants', '/invitations', '/health'].map(path => [path, { target, changeOrigin: true, secure: false }]))
  return {
    plugins: [react()],
    ...(command === 'serve' ? { define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('') } } : {}),
    server: { port: 5173, proxy },
  }
})
