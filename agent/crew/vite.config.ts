import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// GitHub Pages project site: https://fxams.github.io/crew/
export default defineConfig({
  base: '/crew/',
  plugins: [react()],
  resolve: {
    alias: {
      buffer: 'buffer/',
      process: 'process/browser',
    },
  },
  optimizeDeps: {
    include: ['buffer', 'process', 'bn.js'],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022',
    cssMinify: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    chunkSizeWarningLimit: 1600,
  },
  define: {
    'process.env': {},
    global: 'globalThis',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
