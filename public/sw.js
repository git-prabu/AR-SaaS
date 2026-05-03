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
// ar-v11 (May 3, evening) — Phase N feedback prompt: a slide-up sheet
// asks the customer for a 1-5 star rating + optional comment when their
// order transitions to 'served'. One prompt per order, persisted via
// sessionStorage so reload doesn't re-prompt.
// ar-v12 (May 3, late) — Auto-open bill in a new tab on payment
// confirmation: the customer always gets a saved copy regardless of
// whether they shared an email. Optional email field added to the
// order form (persisted to localStorage + the order doc); future
// Phase M email triggers will pick it up. Bill HTML generation
// extracted into a single source of truth (buildBillHtml) shared by
// the print-bill iframe flow and the new auto-open flow.
// ar-v13 (May 3, evening 2) — pastOrders TTL prune (24h) so dead
// orderIds don't accumulate in sessionStorage with attached Firestore
// listeners; Open Bill CTA inside the Payment Confirmed state so the
// gateway-UPI flow has a one-tap path to save the receipt; Phase M
// customer payment-receipt emails now ship — sent automatically when
// an order goes paid_* IFF the customer shared an email.
// ar-v14 (May 3, night) — bill auto-delivery hardened: popup-blocker
// failures now silently fall back to a Blob-URL download instead of
// throwing a "Popup blocked" toast. Customer always ends up with a
// saved bill (either as a new tab when popups are allowed, or as a
// downloaded HTML file). Bill HTML is now generated synchronously
// upfront so the gesture context never expires before the popup opens.
// ar-v15 (May 3, late night) — bill auto-delivery now triggers ONLY
// when paymentStatus actually flips to paid_* (admin marks paid /
// gateway webhook fires), NOT when the customer first taps "Confirm
// Cash/Card/UPI" (which is just a request, money hasn't changed
// hands yet). Listener-driven; dedup'd per bill/order key so a
// double-firing snapshot doesn't double-deliver.
// ar-v16 (May 3, even later) — TDZ fix: the auto-deliver useEffect
// was placed BEFORE the bill / buildBillHtml / deliverBill
// declarations, which surfaced as "Cannot access 'dg' before
// initialization" only at minified-prerender time on Vercel. Moved
// the effect to live AFTER all three so the const TDZ no longer
// trips during prerender.
// ar-v17 (May 3, latest) — Print Bill button now gated on
// billPaymentState === 'paid'. Customer reported the button was
// visible on the payment-method picker AND on the "Cash Payment
// Requested" state, which let them print a receipt for an unpaid
// order. Now only renders once payment is actually confirmed —
// same bar as the auto-deliver flow.
// ar-v18 (May 3, end-of-day) — first-visit welcome sheet. Slide-up
// onboarding for new customers showing 4 quick tips for the order
// flow (browse → add → place/pay → track). Per-device per-restaurant
// localStorage flag so returning customers never see it twice. Two
// flavours of copy: dine-in (QR scan with table param, "we bring it
// to your table") vs takeaway ("pay first then pick up").
// ar-v19 (May 3, after-hours) — the welcome sheet became a real coach-
// mark tour: dark backdrop with an SVG-mask cutout that spotlights
// real DOM elements (item card, waiter button) plus a tooltip card
// at each step. Replaces the text-only sheet — customer requested
// "actual application images" guidance and this points at the live UI
// rather than describing it. Same per-device per-restaurant flag so
// returning customers never see it twice.
// ar-v20 (May 3, even later) — coach-mark tour now also spotlights
// the View Order / Order Status / My Bill FABs by rendering DEMO
// versions while the tour is active (welcomeOpen=true), even though
// the customer has no live order or items yet. Demo FABs disappear
// the moment the tour ends, so the customer sees real placeholder
// guidance for buttons that wouldn't normally be on screen yet.
// Tooltip placement also hardened for mobile: viewport clamps on
// every edge, real measured tooltip height, and horizontal centering
// over the target (not just the screen).
// ar-v21 (May 3, debugging) — tour tooltip was rendering off-screen-
// left on narrow phones because the cmFade entrance animation still
// had translate(-50%, -50%) left over from the previous centering
// approach. With the new numeric top/left placement, that translate
// shifted the tooltip half its width to the left and clipped it.
// Animation now scales + fades around transform-origin: center, no
// translate.
const CACHE_VERSION  = 'ar-v21';
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
