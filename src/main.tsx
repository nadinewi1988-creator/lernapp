import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Neuaufbau (Herbst 2026). Die bisherige App liegt unverändert unter src/App.tsx.
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import App from './neu/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Service Worker registrieren (PWA) – wird von vite-plugin-pwa erzeugt.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
