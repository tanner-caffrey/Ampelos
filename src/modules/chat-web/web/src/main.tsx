import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles/globals.css';

// Register service worker with automatic updates
// Check for updates every 60 seconds and reload automatically when found
const updateSW = registerSW({
  onNeedRefresh() {
    // New content available - reload the page
    console.log('[PWA] New content available, reloading...');
    updateSW(true);
  },
  onOfflineReady() {
    console.log('[PWA] App ready to work offline');
  },
  onRegisteredSW(swUrl, registration) {
    console.log('[PWA] Service worker registered:', swUrl);
    // Check for updates every 60 seconds
    if (registration) {
      setInterval(() => {
        registration.update();
      }, 60 * 1000);
    }
  },
  onRegisterError(error) {
    console.error('[PWA] Service worker registration error:', error);
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
