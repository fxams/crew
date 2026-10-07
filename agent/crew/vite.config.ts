import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

/** GitHub Pages uses `/crew/`; Render + crewpay.dev uses `/`. */
export default defineConfig(() => {
  const siteUrl = (process.env.VITE_SITE_URL || 'https://crewpay.dev').replace(/\/$/, '')
  const base = process.env.VITE_BASE_PATH?.trim() || '/crew/'

  return {
  base,
  plugins: [
    {
      name: 'crew-html-meta',
      transformIndexHtml(html) {
        const baseNorm = base.endsWith('/') ? base : `${base}/`
        return html
          .replaceAll('%VITE_SITE_URL%', siteUrl)
          .replaceAll('%VITE_BASE_URL%', baseNorm)
      },
    },
    nodePolyfills({
      include: ['buffer', 'process', 'crypto', 'stream', 'util', 'events'],
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
    include: ['buffer', 'process', 'bn.js', 'crypto', 'stream'],
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
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'solana',
              test: /node_modules[\\/](?:@solana|@pump-fun|bn\.js|bs58)/,
            },
            {
              name: 'irys',
              test: /node_modules[\\/]@irys/,
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
  server: {
    proxy: {
      // Local/dev: avoid Pump CORS by proxying user lookups
      '/pump-api': {
        target: 'https://frontend-api-v3.pump.fun',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/pump-api/, ''),
        headers: {
          Origin: 'https://pump.fun',
          Referer: 'https://pump.fun/',
        },
      },
      // Local/dev: Pump metadata IPFS has no CORS for GH Pages origins
      '/pump-ipfs': {
        target: 'https://pump.fun',
        changeOrigin: true,
        rewrite: () => '/api/ipfs',
        headers: {
          Origin: 'https://pump.fun',
          Referer: 'https://pump.fun/create',
        },
      },
    },
  },
  preview: {
    proxy: {
      '/pump-api': {
        target: 'https://frontend-api-v3.pump.fun',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/pump-api/, ''),
        headers: {
          Origin: 'https://pump.fun',
          Referer: 'https://pump.fun/',
        },
      },
      '/pump-ipfs': {
        target: 'https://pump.fun',
        changeOrigin: true,
        rewrite: () => '/api/ipfs',
        headers: {
          Origin: 'https://pump.fun',
          Referer: 'https://pump.fun/create',
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}
})
