// pages/r/[subdomain]/[table].js
// Phase K — Permanent QR redirect.
//
// The customer-facing QR encodes a STABLE URL like
//   https://halohelm.com/r/spot/4
// that never changes for the life of the table. When the customer
// scans it, this endpoint reads the current `sid` from the
// tableSession server-side and redirects to the canonical menu URL:
//   https://halohelm.com/restaurant/spot?table=4&sid=<current_sid>
//
// Why: previously the QR encoded `?sid=...` directly, so every time
// the admin tapped Clear & Activate (which rotates the sid for fraud
// protection) the printed QR became invalid and had to be reprinted.
// Restaurants print these once and stick them on tables — having to
// reprint isn't viable. This indirection lets the sid rotate freely
// while the printed QR keeps working.
//
// Render path:
//   - active session  → 302 redirect to /restaurant/{subdomain}?table=N&sid=...
//   - inactive table  → render a "Table not active" page directly
//                       (still encourages the customer to ask their waiter,
//                       no broken-link experience)
//   - bad subdomain   → 404
//
// We use getServerSideProps (not getStaticProps) because the sid changes
// per-request — we MUST re-read on every scan. Latency is one Firestore
// `get` (~50-150ms) which is fine since the next hop is the customer
// page (already fast post Phase A).

import Head from 'next/head';
import { adminDb } from '../../../lib/firebaseAdmin';

// Module-level cache for subdomain → { restaurantId, restaurantName }.
// Vercel keeps serverless functions "warm" for ~5-15 minutes between
// invocations, during which module-level state survives. So after the
// first scan to a given table, the next scans within ~15 minutes skip
// the restaurant lookup entirely — only the tableSession read remains.
//
// Cache is intentionally small + short-lived:
// - Keyed by subdomain (lowercased)
// - 5-minute TTL so admins who rename a restaurant or toggle isActive
//   see the change within 5 min (not stuck on a stale cached value)
// - In-memory only — a cold function start re-fetches, no problem
//
// Why not Redis / Upstash: that'd add a cross-network call to read the
// cache itself, defeating the point. The in-memory map is free + zero
// roundtrip + dies with the function (no stale data risk beyond 5 min).
const SUBDOMAIN_CACHE = new Map();
const SUBDOMAIN_CACHE_TTL_MS = 5 * 60 * 1000;

function readSubdomainCache(subdomain) {
  const entry = SUBDOMAIN_CACHE.get(subdomain);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    SUBDOMAIN_CACHE.delete(subdomain);
    return null;
  }
  return entry;
}

function writeSubdomainCache(subdomain, restaurantId, restaurantName) {
  SUBDOMAIN_CACHE.set(subdomain, {
    restaurantId,
    restaurantName,
    expiresAt: Date.now() + SUBDOMAIN_CACHE_TTL_MS,
  });
}

export async function getServerSideProps(ctx) {
  const subdomain = String(ctx.params?.subdomain || '').toLowerCase().trim();
  const table     = String(ctx.params?.table     || '').trim();
  if (!subdomain || !table) return { notFound: true };

  // Look up the restaurant by subdomain. Indexed via firestore.indexes.json
  // (subdomain ASC + isActive ASC) so this is a single keyed read — but
  // we first check the in-memory cache to skip it on warm functions.
  let restaurantId, restaurantName;
  const cached = readSubdomainCache(subdomain);
  if (cached) {
    restaurantId   = cached.restaurantId;
    restaurantName = cached.restaurantName;
  } else {
    try {
      const rs = await adminDb.collection('restaurants')
        .where('subdomain', '==', subdomain)
        .limit(1).get();
      if (rs.empty) return { notFound: true };
      restaurantId   = rs.docs[0].id;
      restaurantName = rs.docs[0].data().name || subdomain;
      writeSubdomainCache(subdomain, restaurantId, restaurantName);
    } catch (e) {
      console.error('[qr-redirect] restaurant lookup failed:', e?.message);
      return { props: { restaurantName: subdomain, table, blocked: true, reason: 'lookup_failed' } };
    }
  }

  // Read the table session.
  let session = null;
  try {
    const snap = await adminDb.doc(`restaurants/${restaurantId}/tableSessions/${table}`).get();
    if (snap.exists) session = snap.data();
  } catch (e) {
    console.error('[qr-redirect] session read failed:', e?.message);
  }

  // Validate: active + (no expiresAt OR not yet expired) + has a sid.
  const isActive = !!(session && session.isActive);
  const expiresAtMs = session?.expiresAt ? Date.parse(session.expiresAt) : Infinity;
  const notExpired = !isNaN(expiresAtMs) && expiresAtMs > Date.now();
  const hasSid = !!session?.sid;

  if (!isActive || !notExpired || !hasSid) {
    // Render the inactive page directly. We deliberately don't redirect
    // to /restaurant/{subdomain} without a sid — the public menu URL
    // exists for marketing/preview, and we want the QR scanner to see
    // a clear "ask your waiter" message instead of a generic menu.
    return {
      props: {
        restaurantName,
        table,
        blocked: true,
        reason: !isActive ? 'inactive'
              : !notExpired ? 'expired'
              : 'no_sid',
      },
    };
  }

  // Active — redirect to the live menu URL with the current sid.
  return {
    redirect: {
      destination: `/restaurant/${encodeURIComponent(subdomain)}?table=${encodeURIComponent(table)}&sid=${encodeURIComponent(session.sid)}`,
      permanent: false,
    },
  };
}

export default function QrRedirectPage({ restaurantName, table, blocked, reason }) {
  // Only rendered for the inactive case. Same dark / lock visual as the
  // sessionBlocked screen on the main customer page — keeps the
  // experience consistent regardless of which path triggered it.
  return (
    <>
      <Head>
        <title>Table {table} · {restaurantName}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
      </Head>
      <div style={{
        minHeight: '100vh', background: '#0D0B08',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        padding: 24,
      }}>
        <div style={{ textAlign: 'center', maxWidth: 380 }}>
          <div style={{ fontSize: 56, marginBottom: 20 }}>🔒</div>
          <h1 style={{ fontWeight: 700, fontSize: 22, color: '#FFF5E8', marginBottom: 10 }}>
            {restaurantName}
          </h1>
          <div style={{
            padding: '24px 28px',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 20,
            border: '1px solid rgba(255,245,220,0.1)',
          }}>
            <div style={{ fontWeight: 700, fontSize: 17, color: '#FFF5E8', marginBottom: 10 }}>
              Table {table} is not active
            </div>
            <div style={{ color: 'rgba(255,245,220,0.55)', fontSize: 14, lineHeight: 1.7 }}>
              Please ask your waiter to activate this table so you can view the menu and place orders.
            </div>
          </div>
          <div style={{ marginTop: 16, fontSize: 12, color: 'rgba(255,245,220,0.25)' }}>
            Powered by HaloHelm
          </div>
        </div>
      </div>
    </>
  );
}
