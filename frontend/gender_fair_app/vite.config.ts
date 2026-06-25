import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path,
      }
    },
    fs: {
      // Allow serving files from node_modules for Apryse WebViewer
      allow: ['..', 'node_modules/@pdftron/webviewer/public']
    }
  },
  optimizeDeps: {
    include: ['@pdftron/webviewer']
  }
})
