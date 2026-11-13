// Service Worker: Network-First for UI assets, zero Firestore caching + Web Push
// Version: v2.28.0 - 13/11/2026 18:15 (UTC+7)
const CACHE_NAME = 'kt-csvc-v2.28.0-20261113-1815';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/icon.svg',
  '/fonts/BeVietnamPro_400Regular.ttf',
  '/fonts/BeVietnamPro_700Bold.ttf',
];


// 1. Install Event: Skip waiting immediately to prepare new SW
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Precache optional asset issue (non-fatal):', err);
      });
    })
  );
});

// 2. Activate Event: Wipe all old caches and take control of all clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Xóa cache cũ:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Message Event: allow client to trigger immediate activation
self.addEventListener('message', (event) => {
  if (event.data && (event.data.type === 'SKIP_WAITING' || event.data === 'skipWaiting')) {
    self.skipWaiting();
  }
});

// 4. Fetch Event:
// CRITICAL RULES:
// - ZERO Firestore / Auth / API caching
// - Network-First for HTML, JS, CSS, and UI assets (always get latest from server when online)
// - Fallback to cache ONLY when offline
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignore non-GET requests
  if (req.method !== 'GET') {
    return;
  }

  // Bypass Firestore, Auth, Firebase APIs, Google APIs, and backend endpoints
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('google.com') ||
    url.protocol.startsWith('chrome-extension') ||
    url.pathname.startsWith('/api/')
  ) {
    return; // Pass through to browser / Firebase SDK
  }

  // Never cache version.json (always check network directly)
  if (url.pathname === '/version.json') {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).catch(() => {
        return new Response(JSON.stringify({ version: 'offline' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );
    return;
  }

  // Network-First strategy for all UI files (HTML, JS, CSS, images)
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          // If valid response, update cache in background
          if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        })
        .catch(async () => {
          // Network failed (offline): fallback to cache
          const cachedRes = await caches.match(req);
          if (cachedRes) {
            return cachedRes;
          }
          // If navigation request failed offline, serve cached index.html
          if (req.mode === 'navigate') {
            const fallback = await caches.match('/index.html') || await caches.match('/');
            if (fallback) return fallback;
          }
          return new Response('Mất kết nối mạng và chưa có bản lưu ngoại tuyến.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        })
    );
  }
});

// 5. Push Event: Show push notifications on lock-screen and device trays
self.addEventListener('push', (event) => {
  let data = {
    title: 'Hệ thống Quản lý KT & CSVC',
    body: 'Bạn có thông báo mới về công việc',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    url: '/',
    workOrderId: '',
    code: '',
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      data = { ...data, ...payload };
    } catch {
      data.body = event.data.text() || data.body;
    }
  }

  const notificationOptions = {
    body: data.body,
    icon: data.icon || '/pwa-192x192.png',
    badge: data.badge || '/pwa-192x192.png',
    tag: data.tag || (data.workOrderId ? `wo-${data.workOrderId}` : `push-${Date.now()}`),
    renotify: true,
    data: {
      url: data.url || '/',
      workOrderId: data.workOrderId,
      code: data.code,
    },
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, notificationOptions)
  );
});

// 6. Notification Click Event: Focus or open window to the deep-linked work order
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notificationData = event.notification.data || {};
  let targetUrl = notificationData.url || '/';

  if (notificationData.code && (!targetUrl || targetUrl === '/')) {
    targetUrl = `/?cv=${encodeURIComponent(notificationData.code)}`;
  } else if (notificationData.workOrderId && (!targetUrl || targetUrl === '/')) {
    targetUrl = `/?orderId=${encodeURIComponent(notificationData.workOrderId)}`;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          if ('navigate' in client && targetUrl !== '/') {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

