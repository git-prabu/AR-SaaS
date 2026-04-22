// public/sw.js — minimal service worker for PWA installability + offline shell.
//
// Strategy:
//   - "Network first, cache fallback" for page navigations. When online, always
//     get fresh HTML. When offline, serve the last-cached version so the app
//     still boots.
//   - "Cache first, network fallback" for static assets (Next.js /_next/ chunks,
//     fonts, icons). They're content-hashed by Next so cache never goes stale.
//   - Never caches Firestore/Firebase API calls or /api/* — those must hit
//     network (Firestore SDK handles its own offline caching in IndexedDB).
//
// This is the MVP service worker. More advanced behavior (background sync,
// push notifications, proper update-on-reload) is Phase 2.
const CACHE_VERSION = 'ar-v1';
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Activate immediately, don't wait for all tabs to close.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Clean up old caches from previous versions.
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET — don't touch POST/PUT/DELETE (mutations).
  if (request.method !== 'GET') return;

  // Skip cross-origin (Firebase, Razorpay, fonts from Google, etc.) — let
  // them go straight to network. Firebase SDK has its own offline cache.
  if (url.origin !== self.location.origin) return;

  // Skip /api/* — these are server routes that should never be cached.
  if (url.pathname.startsWith('/api/')) return;

  // Static assets (content-hashed) → cache-first. These never change per URL.
  if (url.pathname.startsWith('/_next/') || url.pathname.startsWith('/icon') || url.pathname === '/notification.mp3' || url.pathname === '/ar-viewer.html') {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Page navigations → network-first, fall back to cache (offline shell).
  if (request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(networkFirst(request));
    return;
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    // Nothing to fall back to — let it fail.
    throw e;
  }
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Last resort — return the admin landing if anything is cached.
    const fallback = await cache.match('/admin');
    if (fallback) return fallback;
    throw e;
  }
}
