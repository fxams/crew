import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// GitHub Pages project site: https://fxams.github.io/crew/
export default defineConfig({
  base: '/crew/',
  plugins: [
    nodePolyfills({
      include: ['buffer', 'process'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
    react(),
  ],
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
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'solana',
              test: /node_modules[\\/](?:@solana|@pump-fun|bn\.js|bs58)/,
            },
          ],
        },
      },
    },
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
