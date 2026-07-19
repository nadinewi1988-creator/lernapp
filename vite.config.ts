import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      filename: 'sw.js',
      manifest: {
        name: 'Klausur-Lern-App',
        short_name: 'Lern-App',
        description: 'Karteikarten, Quiz & Probeprüfung für Uni-Module',
        theme_color: '#3f6b5e',
        background_color: '#f4f6f8',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        // App-Hülle offline verfügbar; Daten sind ohnehin im Bundle.
        globPatterns: ['**/*.{js,css,html,json,png,svg}']
      }
    })
  ]
});
