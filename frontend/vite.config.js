import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const allowedHosts = ['d043-117-4-240-202.ngrok-free.app', 'report.yumnetwork.vn']
const apiProxy = {
  '/api': {
    target: 'http://localhost:8000',
    changeOrigin: true,
  },
}

const productionCacheHeaders = () => ({
  name: 'production-cache-headers',
  configurePreviewServer(server) {
    server.middlewares.use((req, res, next) => {
      const pathname = req.url?.split('?', 1)[0] || '/'

      if (pathname.startsWith('/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      } else if (pathname === '/favicon.png') {
        res.setHeader('Cache-Control', 'public, max-age=2592000')
      } else {
        res.setHeader('Cache-Control', 'no-cache')
      }

      next()
    })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), productionCacheHeaders()],
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
