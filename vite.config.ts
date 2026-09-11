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
        globPatterns: ['**/*.{js,css,html,json,png,svg}'],
        // Die Modul-Daten liegen mit im JS-Bundle. Mit jedem neuen Modul
        // wächst es; die Workbox-Voreinstellung von 2 MiB reicht seit
        // ewb001 nicht mehr aus und ließ den Build fehlschlagen.
        // 12 MiB geben Luft für weitere Module.
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        // Zwischenspeicher ALTER Versionen aufräumen. Ohne das bleibt bei
        // jedem Deploy eine weitere Kopie des Bundles liegen (inzwischen rund
        // 4 MB pro Version). In Safari führte das dazu, dass die App nach
        // einem Update nur noch eine weiße Seite zeigte.
        cleanupOutdatedCaches: true,
        // Unbekannte Pfade auf die App-Hülle zurückfallen lassen, statt den
        // Ladevorgang scheitern zu lassen.
        navigateFallback: 'index.html'
      }
    })
  ]
});
