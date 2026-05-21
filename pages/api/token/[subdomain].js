// pages/api/token/[subdomain].js
//
// Phase 2 #9 — public token/queue feed for the counter display.
//
// The /token/[subdomain] wall display is PUBLIC (no auth), but the
// orders collection is NOT publicly listable (Phase 2.5 C2 lockdown).
// So instead of letting the display query orders directly, it polls
// this endpoint, which uses the Admin SDK (bypasses rules) and returns
// ONLY non-sensitive data: order NUMBERS + their bucket. No customer
// name, phone, items, or totals ever leave the server.
//
// Buckets:
//   nowServing — orders the kitchen marked 'ready' (waiting at counter)
//   preparing  — orders still 'pending' / 'preparing'
// 'served' / 'cancelled' / takeaway-awaiting-payment are excluded.

import { adminDb } from '../../../lib/firebaseAdmin';

// IST day start in epoch seconds (orders are scoped to "today").
function istTodayStartSec() {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const nowIst = new Date(Date.now() + IST_OFFSET_MS);
  nowIst.setUTCHours(0, 0, 0, 0);
  return Math.floor((nowIst.getTime() - IST_OFFSET_MS) / 1000);
}

export default async function handler(req, res) {
  const raw = String(req.query?.subdomain || '').toLowerCase().trim();
  const subdomain = /^[a-z0-9-]{1,63}$/.test(raw) ? raw : '';
  if (!subdomain) return res.status(400).json({ error: 'Invalid subdomain' });

  try {
    const rs = await adminDb.collection('restaurants')
      .where('subdomain', '==', subdomain).limit(1).get();
    if (rs.empty) return res.status(404).json({ error: 'Restaurant not found' });
    const restaurant = rs.docs[0];
    const rid = restaurant.id;

    // Recent orders, bounded — filter to today + active buckets in JS so
    // no composite index is needed.
    const todayStart = istTodayStartSec();
    const snap = await adminDb.collection(`restaurants/${rid}/orders`)
      .orderBy('createdAt', 'desc').limit(120).get();

    const nowServing = [];
    const preparing = [];
    snap.forEach(d => {
      const o = d.data();
      const sec = o.createdAt?._seconds ?? o.createdAt?.seconds ?? 0;
      if (sec && sec < todayStart) return;
      const num = o.orderNumber || null;
      if (!num) return;
      if (o.status === 'ready')      nowServing.push(num);
      else if (o.status === 'pending' || o.status === 'preparing') preparing.push(num);
    });
    // Lowest number first = oldest = next to be collected.
    nowServing.sort((a, b) => a - b);
    preparing.sort((a, b) => a - b);

    res.setHeader('Cache-Control', 'public, max-age=3, s-maxage=3');
    return res.status(200).json({
      restaurantName: restaurant.data()?.name || '',
      nowServing,
      preparing,
      ts: Date.now(),
    });
  } catch (err) {
    console.error('[/api/token] failed:', err?.message || err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
