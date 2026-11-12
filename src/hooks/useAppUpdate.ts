import { useState, useEffect, useCallback } from 'react';
import { APP_VERSION, BUILD_TIMESTAMP } from '../config/version';

interface RemoteVersionInfo {
  version: string;
  buildTime: string;
  buildTimestamp: number;
}

export function useAppUpdate() {
  const [hasNewVersion, setHasNewVersion] = useState(false);
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Check version.json on server
  const checkForRemoteUpdate = useCallback(async () => {
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
      });
      if (res.ok) {
        const data: RemoteVersionInfo = await res.json();
        if (data.buildTimestamp && data.buildTimestamp > BUILD_TIMESTAMP) {
          console.log('[UpdateCheck] Phát hiện bản mới từ server:', data.version, data.buildTime);
          setHasNewVersion(true);
          setRemoteVersion(data.version);
          return true;
        }
      }
    } catch (err) {
      console.warn('[UpdateCheck] Không thể kiểm tra version.json:', err);
    }
    return false;
  }, []);

  useEffect(() => {
    // 1. Initial check after 3 seconds
    const timer = setTimeout(() => {
      checkForRemoteUpdate();
    }, 3000);

    // 2. Poll every 60 seconds
    const interval = setInterval(() => {
      checkForRemoteUpdate();
    }, 60000);

    // 3. Check when window regains focus (e.g. user re-opens browser/PWA)
    const handleFocus = () => {
      checkForRemoteUpdate();
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then((reg) => {
          if (reg) {
            reg.update().catch(() => {});
          }
        });
      }
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        handleFocus();
      }
    });

    // 4. Service Worker updatefound listener
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        // If there's already a waiting worker
        if (registration.waiting) {
          setWaitingWorker(registration.waiting);
          setHasNewVersion(true);
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[SW] Service worker mới đã sẵn sàng');
                setWaitingWorker(newWorker);
                setHasNewVersion(true);
              }
            });
          }
        });
      });

      // Reload when controller changes
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [checkForRemoteUpdate]);

  // Apply update immediately
  const applyUpdate = useCallback(async () => {
    setIsUpdating(true);
    try {
      if (waitingWorker) {
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      }

      // Clear any UI caches to ensure clean slate
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }

      // Add timestamp to query string to bypass browser cache
      const cleanUrl = window.location.pathname + '?v=' + Date.now();
      window.location.href = cleanUrl;
    } catch (err) {
      console.error('Lỗi khi áp dụng bản mới:', err);
      window.location.reload();
    }
  }, [waitingWorker]);

  return {
    hasNewVersion,
    remoteVersion,
    currentVersion: APP_VERSION,
    isUpdating,
    applyUpdate,
    dismissUpdate: () => setHasNewVersion(false),
  };
}
