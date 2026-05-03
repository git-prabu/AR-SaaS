// public/sw.js — service worker for PWA shell + customer-side offline menu.
//
// Strategy:
//   - /restaurant/* (customer pages)             → network-first, cache fallback
//       Always reflects the latest deploy + the latest table-session
//       state when the customer is online. Cache is the offline-only
//       fallback (e.g. customer's WiFi drops mid-meal). v2 used
//       stale-while-revalidate, but that served stale HTML even when
//       online — bypassing the table-session expiry check baked into
//       the JS, and serving menus from before the latest deploy on
//       no-table preview URLs. Network-first fixes both.
//   - firebasestorage.googleapis.com images      → cache-first, soft cap
//       Menu photos cached on first download, served instantly forever
//       after. Bounded to ~150 entries so a popular menu can't fill disk.
//   - /_next/*, /icon*, /notification.mp3,
//     /ar-viewer.html (content-hashed assets)   → cache-first
//       Hashed by Next.js, never go stale per URL.
//   - Other page navigations (admin, signup,
//     landing, staff)                            → network-first, cache fallback
//       Admin chrome should always reflect latest deploy when online;
//       cache only used as offline shell.
//   - /api/*, mutations, other cross-origin     → pass-through (no caching)
//
// Cache versioning: bump CACHE_VERSION whenever this strategy changes so the
// activate handler purges old entries from previous worker versions.

// Bumped ar-v4 → ar-v5 (Phase F follow-up): user reported the admin
// Cancel button on /admin/payments not firing for cash_requested
// orders. Comprehensive Admin SDK audit of every state transition
// (27/27 passed) confirmed the data layer is fine — the rule writes
// succeed when called server-side. Most likely cause is the user's
// browser holding an older cached JS bundle from before the cancel
// helper was added. Bumping the version forces a clean SW activate
// + purge so every client re-fetches latest JS. Also catches the
// orderSnapshot.orderType + liveOrderStatus init fixes in this
// commit and the new "Change payment method" button.
// ar-v8 (May 1, late) — bundles in: pastOrders multi-order tracking
// (earlier orders stay visible after a new one is placed instead of
// being replaced), parallelized markOrderPaid post-payment helpers
// (Mark Paid feels half as slow), better add-items error logging.
// ar-v9 (May 3) — multi-order tabbed bill view: customer can now switch
// between current and past orders inside the bill modal via a tab strip
// at the top, sees the live status of the selected order, and the
// itemised breakdown reflects whichever bill they tapped instead of
// always showing the latest.
// ar-v10 (May 3, late) — multi-order tabbed STATUS view + aggregate FAB.
// The success view now has the same kind of tab strip the bill modal
// got, so the kitchen progress timeline is per-order and switchable.
// The FAB surfaces the most actionable status across all session
// orders (so an earlier order going Ready can't hide behind a newer
// "Preparing…" label) and shows a +N badge when more than one is in
// flight. My Bill FAB now also shows when past orders are paid even
// while the latest is still in awaiting_payment.
const CACHE_VERSION  = 'ar-v10';
const RUNTIME_CACHE  = `${CACHE_VERSION}-runtime`;
const IMG_CACHE      = `${CACHE_VERSION}-img`;
const IMG_CACHE_CAP  = 150;   // soft entry cap for menu photos

self.addEventListener('install', () => {
  // Take control on next reload — don't wait for tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Purge any caches not from this worker version.
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

  // Mutations are never cached — only GET goes through the cache logic.
  if (request.method !== 'GET') return;

  // ─── Cross-origin: Firebase Storage menu photos ──────────────────────
  // Cached aggressively because URLs include a stable token + path so
  // they don't change once an image is uploaded. Returning customer hits
  // these from disk, no network at all.
  //
  // CORS exception: when admin code does `fetch(url, { mode: 'cors' })`
  // to read image bytes back into a Blob (e.g. the bulk-optimize tool),
  // the cache may hold an opaque response from a prior <img> tag fetch.
  // Returning an opaque response to a cors request throws "an 'opaque'
  // response was used for a request whose type is not no-cors". So we
  // bypass the SW for cors requests — they go straight to network and
  // never touch the cache. The <img>-tag path keeps using the cache.
  if (url.hostname === 'firebasestorage.googleapis.com') {
    if (request.mode === 'cors') return;
    event.respondWith(cacheFirstCapped(IMG_CACHE, request, IMG_CACHE_CAP));
    return;
  }

  // Any other cross-origin (Razorpay, Google Fonts, Firestore APIs) → let
  // it pass through to network unmodified. Firestore SDK has its own
  // IndexedDB cache.
  if (url.origin !== self.location.origin) return;

  // /api/* must always hit network — these are server endpoints.
  if (url.pathname.startsWith('/api/')) return;

  // ─── Static, content-hashed assets ───────────────────────────────────
  if (
    url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/icon')   ||
    url.pathname === '/notification.mp3' ||
    url.pathname === '/ar-viewer.html'
  ) {
    event.respondWith(cacheFirst(RUNTIME_CACHE, request));
    return;
  }

  // ─── Customer pages → network-first, cache fallback ──────────────────
  // /restaurant/{subdomain} and any nested page under it.
  // The previous SWR strategy served the cached HTML even when the
  // network was reachable, which (a) let table sessions appear valid
  // long after expiry/sid-rotation because the cached JS bundle was
  // referenced by the cached HTML, and (b) hid menu/JS updates from
  // anyone hitting the no-?table preview URL until they manually
  // refreshed twice. Network-first keeps the offline fallback while
  // making the online path always-fresh.
  if (url.pathname.startsWith('/restaurant/')) {
    event.respondWith(networkFirst(RUNTIME_CACHE, request));
    return;
  }

  // ─── Other navigations (admin / signup / landing / staff) ────────────
  if (
    request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html')
  ) {
    event.respondWith(networkFirst(RUNTIME_CACHE, request));
    return;
  }
});

// Strategy implementations ──────────────────────────────────────────────

async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh && fresh.ok) cache.put(request, fresh.clone()).catch(() => { /* 206 partial / opaque-redirect / quota — best-effort */ });
  return fresh;
}

// Same as cacheFirst, but trims the cache to `cap` entries after each
// insert (oldest entry first — Cache API preserves insertion order).
// Bounded so a 100-image menu doesn't grow unboundedly across visits.
async function cacheFirstCapped(cacheName, request, cap) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh && (fresh.ok || fresh.type === 'opaque')) {
      cache.put(request, fresh.clone()).then(async () => {
        const keys = await cache.keys();
        const overflow = keys.length - cap;
        if (overflow > 0) {
          // Evict the oldest `overflow` entries.
          await Promise.all(keys.slice(0, overflow).map(k => cache.delete(k)));
        }
      }).catch(() => { /* eviction is best-effort */ });
    }
    return fresh;
  } catch (e) {
    // No cache hit, network failed — surface the error.
    throw e;
  }
}

async function networkFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone()).catch(() => { /* 206 partial / opaque-redirect / quota — best-effort */ });
    return fresh;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw e;
  }
}

// Stale-while-revalidate: return cache immediately if present, kick off a
// background refresh to update the cache for next time. If nothing is
// cached, wait for the network. If both fail, return a minimal offline
// response so the browser doesn't hang on a network error screen.
async function staleWhileRevalidate(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then(fresh => {
      if (fresh && fresh.ok) cache.put(request, fresh.clone()).catch(() => { /* 206 partial / opaque-redirect / quota — best-effort */ });
      return fresh;
    })
    .catch(() => null);
  if (cached) {
    // Don't block the response on the refresh — let it complete in
    // background. The next visit will see the updated cache.
    return cached;
  }
  const fresh = await refresh;
  if (fresh) return fresh;
  return new Response(
    'You appear to be offline. Reconnect and reload this page.',
    { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  );
}
