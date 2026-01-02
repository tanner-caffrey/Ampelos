import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// Bump this to force PWA cache invalidation for all users
const PWA_CACHE_VERSION = '1.0.1';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Ampelos Chat',
        short_name: 'Ampelos',
        description: 'Chat interface for Ampelos AI agents',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // Force immediate activation of new service worker
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Version marker - changing PWA_CACHE_VERSION forces full cache refresh
        additionalManifestEntries: [
          { url: 'version.txt', revision: PWA_CACHE_VERSION }
        ],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/localhost:\d+\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 // 1 hour
              },
              networkTimeoutSeconds: 10
            }
          }
        ]
      },
      devOptions: {
        enabled: true
      }
    })
  ],
  resolve: {
    alias: {
      '@components': path.resolve(__dirname, './src/sacred/components'),
      '@common': path.resolve(__dirname, './src/sacred/common'),
      '@modules': path.resolve(__dirname, './src/sacred/modules')
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
        additionalData: `@use "sass:math";`
      }
    }
  },
  server: {
    port: 3002,
    hmr: {
      // Enable HMR for auto-reload when agents make changes
      enabled: true,
      protocol: 'ws',
      host: 'localhost'
    },
    watch: {
      // Watch for file changes to trigger reloads
      usePolling: false,
      interval: 100
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3005',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true
  }
});
