import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { copyFileSync, mkdirSync } from 'fs'

// Plugin to copy frontend-api.js to dist
const copyFrontendApi = {
  name: 'copy-frontend-api',
  closeBundle() {
    try {
      mkdirSync('dist', { recursive: true })
      copyFileSync('frontend-api.js', 'dist/frontend-api.js')
      console.log('✓ Copied frontend-api.js to dist/')
    } catch (err) {
      console.error('Failed to copy frontend-api.js:', err)
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), copyFrontendApi],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        login: resolve(__dirname, 'login.html')
      },
      output: {
        manualChunks: {
          vendor: ['vue'],
          chart: ['chart.js'],
        }
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  }
})
