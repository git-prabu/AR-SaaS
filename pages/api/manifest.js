// pages/api/manifest.js
// Phase L — Dynamic per-restaurant Web App Manifest.
//
// The static /manifest.json is admin-focused (start_url: /admin) — when
// an admin installs the app to their phone, it boots straight into
// /admin. That's wrong for diners who install from the customer menu
// page — they want the app to boot into THEIR menu, branded with the
// restaurant's name + theme color.
//
// This endpoint takes ?subdomain=<sub>[&table=N] and returns a manifest
// JSON tailored to that restaurant. The customer page injects a
// `<link rel="manifest" href="/api/manifest?subdomain=...">` in its
// `<Head>`, which overrides the global manifest for that page only.
//
// Cache strategy: this endpoint is read once when the browser detects
// installability + once on each install. We add an aggressive
// Cache-Control because the underlying data (restaurant name, theme
// color, branding) only changes when the admin updates settings —
// the manifest doesn't need to be fresh-from-Firestore on every
// install attempt.

import { adminDb } from '../../lib/firebaseAdmin';

const FALLBACK = {
  name: 'Restaurant Menu',
  short_name: 'Menu',
  theme_color: '#1A1A1A',
  background_color: '#0D0B08',
};

export default async function handler(req, res) {
  const subdomain = String(req.query?.subdomain || '').toLowerCase().trim();
  const table     = req.query?.table ? String(req.query.table).trim() : '';

  let restaurant = null;
  if (subdomain) {
    try {
      const rs = await adminDb.collection('restaurants')
        .where('subdomain', '==', subdomain)
        .limit(1).get();
      if (!rs.empty) restaurant = rs.docs[0].data();
    } catch (err) {
      console.error('[manifest] restaurant lookup failed:', err?.message);
    }
  }

  const restName  = (restaurant?.name || FALLBACK.name).slice(0, 45);
  const shortName = restName.length > 12 ? restName.slice(0, 12) : restName;
  const themeColor = restaurant?.themeColor || FALLBACK.theme_color;
  const bgColor    = restaurant?.bgColor    || FALLBACK.background_color;

  // start_url:
  //   - If table is set, prefer the QR redirect so re-launch from home
  //     screen always lands on the latest sid (the QR endpoint resolves
  //     the current session sid server-side per Phase K).
  //   - Otherwise just the menu URL.
  const startUrl = subdomain
    ? (table
        ? `/r/${encodeURIComponent(subdomain)}/${encodeURIComponent(table)}`
        : `/restaurant/${encodeURIComponent(subdomain)}`)
    : '/';
  const scope = subdomain ? `/restaurant/${encodeURIComponent(subdomain)}/` : '/';
  // Browsers REQUIRE start_url to be inside scope. /r/ isn't, so when
  // we use the QR redirect for start_url we widen scope to root — the
  // Service Worker's network-first /restaurant/* logic still applies.
  const widenScopeForQrStart = !!table;

  const manifest = {
    name: restName,
    short_name: shortName,
    description: `${restName} — order from your table`,
    start_url: startUrl,
    scope: widenScopeForQrStart ? '/' : scope,
    display: 'standalone',
    orientation: 'portrait',
    background_color: bgColor,
    theme_color: themeColor,
    lang: 'en-IN',
    icons: [
      // Restaurant logos are restaurant-specific but we don't have a
      // standardised PWA icon size pipeline yet. For now we fall back
      // to the platform icons. A future improvement: have the admin
      // upload a 512×512 PWA icon and we serve it here.
      { src: '/icon-192.png',          sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png',          sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };

  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  // 5-minute browser cache + 1-hour CDN — restaurant name/colours
  // rarely change and the install path is read-light.
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(JSON.stringify(manifest));
}
