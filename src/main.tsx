import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register Network-First PWA Service Worker with auto-update detection
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        console.log('[PWA] Service Worker đăng ký thành công:', registration.scope);

        // Immediate check for update
        registration.update().catch(() => {});

        // Check for updates periodically (every 60 seconds)
        setInterval(() => {
          registration.update().catch(() => {});
        }, 60000);

        // Check when user switches back to this tab
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            registration.update().catch(() => {});
          }
        });

        // Listen for new service worker being installed
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[PWA] Đã phát hiện và tải sẵn bản cập nhật mới.');
              }
            });
          }
        });
      })
      .catch((error) => {
        console.error('[PWA] Lỗi khi đăng ký Service Worker:', error);
      });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
