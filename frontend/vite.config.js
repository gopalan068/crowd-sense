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
      },
      '/socket.io': {
        target: 'http://127.0.0.1:4000',
        ws: true,
        changeOrigin: true,
      },
      '/stream': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
    },
  },
})
