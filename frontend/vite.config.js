import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // bind to all interfaces so Docker port-mapping works
    port: 5173,
    allowedHosts: true, // Allow all localtunnel / external tunnel hosts dynamically
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            if (['ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'EPIPE'].includes(err?.code)) {
              if (res && !res.headersSent && typeof res.writeHead === 'function') {
                res.writeHead(503, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'Service temporarily unavailable' }))
              }
            }
          })
        },
      },
      '/socket.io': {
        target: 'http://127.0.0.1:4000',
        ws: true,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            if (['ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'EPIPE'].includes(err?.code)) return
          })
        },
      },
      '/stream': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            if (['ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'EPIPE'].includes(err?.code)) {
              if (res && !res.headersSent && typeof res.writeHead === 'function') {
                res.writeHead(503, { 'Content-Type': 'text/plain' })
                res.end('CV stream service unavailable')
              }
            }
          })
        },
      },
    },
  },
})
