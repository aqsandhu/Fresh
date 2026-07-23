import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Fail fast at build time: never ship a production bundle that silently
  // points at localhost (src/config/env.ts also throws at runtime as a
  // second line of defense).
  if (mode === 'production' && !env.VITE_API_URL) {
    throw new Error(
      '[admin-panel] VITE_API_URL is required for production builds. ' +
        'Set it to the deployed API base URL and rebuild.'
    )
  }
  const apiUrl = env.VITE_API_URL || 'http://localhost:3000/api'

  return {
    plugins: [react()],
    // Strip console/debugger from production bundles — dev keeps full
    // console.error diagnostics, but none of it ships to operators.
    esbuild: mode === 'production' ? { drop: ['console', 'debugger'] } : undefined,
    define: {
      'process.env.VITE_API_URL': JSON.stringify(apiUrl),
      'process.env.VITE_AUTH_COOKIES': JSON.stringify(env.VITE_AUTH_COOKIES || 'false'),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      // Chunks above this are a bundle-budget signal — keep it honest.
      chunkSizeWarningLimit: 500,
      rollupOptions: {
        output: {
          // Stable vendor chunks: framework code changes rarely, so returning
          // admins keep it cached while page chunks change per deploy.
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined
            if (id.includes('socket.io') || id.includes('engine.io')) return 'realtime'
            if (id.includes('lucide-react')) return 'icons'
            if (id.includes('react')) return 'react-vendor'
            return 'vendor'
          },
        },
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
