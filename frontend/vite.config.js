import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const allowedHosts = ['d043-117-4-240-202.ngrok-free.app', 'report.yumnetwork.vn']
const apiProxy = {
  '/api': {
    target: 'http://localhost:8000',
    changeOrigin: true,
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    minify: 'oxc',
    sourcemap: false,
  },
  server: {
    port: 3005,
    allowedHosts,
    proxy: apiProxy,
  },
  preview: {
    host: '127.0.0.1',
    port: 3005,
    strictPort: true,
    allowedHosts,
    proxy: apiProxy,
  },
})
