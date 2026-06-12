import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiUrl = env.VITE_API_URL || 'http://localhost:3000/api'

  return {
    plugins: [react()],
    define: {
      'process.env.VITE_API_URL': JSON.stringify(apiUrl),
      'process.env.VITE_AUTH_COOKIES': JSON.stringify(env.VITE_AUTH_COOKIES || 'false'),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  }
})
