import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/route-optimizer/',
  server: {
    port: 5174,
    host: '0.0.0.0',
    allowedHosts: true,
    hmr: {
      host: '0.0.0.0'
    }
  }
})
