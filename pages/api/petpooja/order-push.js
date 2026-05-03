// pages/api/petpooja/order-push.js
// Phase B (Petpooja hybrid) — Push a customer order from our system
// into the restaurant's Petpooja POS.
//
// Trigger: customer page calls this fire-and-forget right after
// placeOrder() succeeds, IF the restaurant is in petpooja_hybrid mode.
// Standalone restaurants never call this endpoint.
//
// Auth: NONE (deliberate). The customer is unauthenticated. The
// operation is harmless because:
//   1. Idempotent — pushOrder() skips if the order already has a
//      petpoojaOrderId, so retries / duplicate calls are safe.
//   2. Read-only on us — only mutates the existing order doc with
//      `petpoojaOrderId` and `petpoojaPushedAt` fields after a
//      successful Petpooja API call. Never creates orders.
//   3. Recency gate — refuses to push orders older than 1 hour, so
//      an attacker who learns an old orderId can't replay-push it.
//   4. Plan + posMode gate inside pushOrder() — refuses to do work
//      for non-Pro / non-hybrid restaurants. Even if someone POSTs
//      a standalone restaurant's orderId here, nothing happens.
//
// On failure: logs to petpoojaLogs subcollection + writes
// petpoojaPushError on the order doc. The customer's flow proceeds
// regardless — Petpooja sync is a side channel, not a blocker.

import { adminDb } from '../../../lib/firebaseAdmin';
import { pushOrder } from '../../../lib/petpoojaSync';

const RECENCY_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { restaurantId, orderId } = req.body || {};
  if (!restaurantId || typeof restaurantId !== 'string') {
    return res.status(400).json({ error: 'restaurantId is required' });
  }
  if (!orderId || typeof orderId !== 'string') {
    return res.status(400).json({ error: 'orderId is required' });
  }

  // Recency gate — order must have been created within the last hour.
  // Defends against replay attacks using leaked old orderIds.
  try {
    const orderRef = adminDb.doc(`restaurants/${restaurantId}/orders/${orderId}`);
    const snap = await orderRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Order not found' });
    const order = snap.data();
    const createdAtMs = order.createdAt?.toDate
      ? order.createdAt.toDate().getTime()
      : (order.createdAt?.seconds ? order.createdAt.seconds * 1000 : 0);
    if (createdAtMs && Date.now() - createdAtMs > RECENCY_WINDOW_MS) {
      return res.status(403).json({ error: 'Order too old for push' });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to validate order recency' });
  }

  try {
    // pushOrder() handles plan + posMode gating internally — returns
    // { skipped: true, reason } when not eligible. We surface that
    // to the caller as a 200 with the skip info, not a failure.
    const result = await pushOrder(restaurantId, orderId);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[/api/petpooja/order-push] failed:', err);
    return res.status(500).json({ error: 'Internal error', detail: err?.message });
  }
}
