// pages/api/petpooja/callback.js
// Phase B (Petpooja hybrid) — INBOUND callback from Petpooja.
//
// Petpooja calls this URL with order status updates from the kitchen
// (Accepted → Food Ready → Dispatched → Delivered, plus Cancelled).
// We pass this URL to them in every save_order via the `callback_url`
// field on Order.details.
//
// Status codes (per V2.1.0):
//   "-1" → Cancelled
//    "1"/"2"/"3" → Accepted (different sub-states)
//    "4" → Dispatched
//    "5" → Food Ready
//   "10" → Delivered
//
// We mirror these to our order doc's `status` field so the customer
// page's existing live-status listener picks them up automatically.
// No code change needed in the customer page — the existing listener
// just sees the status flip.
//
// SECURITY: There's no signature on Petpooja callbacks per the public
// spec, so we authenticate by:
//   1. Looking up the restaurant by `restID` from the body
//   2. Confirming the restaurant is in petpooja_hybrid mode
//   3. Confirming the order exists and was pushed by us (has
//      petpoojaClientOrderID matching `orderID` in body)
// This isn't perfect — an attacker who learns a restID + orderID
// could forge status updates — but it's defence-in-depth, and the
// blast radius is "wrong status shown briefly" which is recoverable.

import { adminDb } from '../../../lib/firebaseAdmin';
import admin from 'firebase-admin';

const STATUS_MAP = {
  '-1': 'cancelled',
  '1':  'pending',     // Accepted — but in our state machine that's "pending"
  '2':  'preparing',
  '3':  'preparing',
  '4':  'ready',       // Dispatched (for delivery) → ready (for our customer-facing state machine)
  '5':  'ready',       // Food Ready
  '10': 'served',      // Delivered
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { restID, orderID, status, cancel_reason, minimum_prep_time, rider_name, rider_phone_number, is_modified } = req.body || {};
  if (!restID || !orderID || !status) {
    return res.status(400).json({ error: 'Missing required fields (restID, orderID, status)' });
  }

  // Find the restaurant by restID. Petpooja's restID is per-restaurant,
  // so we need a Firestore query. We only need a single match.
  let restaurant;
  try {
    const q = await adminDb.collection('restaurants')
      .where('petpoojaConfig.restID', '==', String(restID))
      .where('posMode', '==', 'petpooja_hybrid')
      .limit(1)
      .get();
    if (q.empty) return res.status(404).json({ error: 'Restaurant not found or not in hybrid mode' });
    restaurant = { id: q.docs[0].id, ...q.docs[0].data() };
  } catch (err) {
    return res.status(500).json({ error: 'Restaurant lookup failed', detail: err?.message });
  }

  // The orderID in the callback is OUR client order id (we set it as
  // the orderID field on save_order). Look it up by petpoojaClientOrderID.
  let orderDocId;
  try {
    const q = await adminDb
      .collection(`restaurants/${restaurant.id}/orders`)
      .where('petpoojaClientOrderID', '==', String(orderID))
      .limit(1)
      .get();
    if (!q.empty) {
      orderDocId = q.docs[0].id;
    } else {
      // Fallback: orderID might match our doc id directly (since we send
      // our doc id as the orderID).
      const direct = await adminDb.doc(`restaurants/${restaurant.id}/orders/${orderID}`).get();
      if (direct.exists) orderDocId = direct.id;
    }
  } catch (err) {
    return res.status(500).json({ error: 'Order lookup failed', detail: err?.message });
  }
  if (!orderDocId) return res.status(404).json({ error: 'Order not found' });

  // Mirror the status into our order doc.
  const ourStatus = STATUS_MAP[String(status)] || null;
  const updates = {
    petpoojaCallbackStatus:    String(status),
    petpoojaCallbackAt:        admin.firestore.FieldValue.serverTimestamp(),
    petpoojaCallbackRaw: {
      status: String(status),
      cancel_reason: cancel_reason || '',
      minimum_prep_time: minimum_prep_time || null,
      rider_name: rider_name || '',
      rider_phone_number: rider_phone_number || '',
      is_modified: is_modified || '',
    },
  };
  if (ourStatus) {
    updates.status = ourStatus;
    updates.lastModifiedBy = 'petpooja-callback';
    updates.lastModifiedAt = admin.firestore.FieldValue.serverTimestamp();
  }
  if (ourStatus === 'cancelled' && cancel_reason) {
    updates.cancelReason = String(cancel_reason);
    updates.cancelledAt  = admin.firestore.FieldValue.serverTimestamp();
    updates.cancelledBy  = 'petpooja-kitchen';
  }

  try {
    await adminDb.doc(`restaurants/${restaurant.id}/orders/${orderDocId}`).update(updates);
    // Log for debug.
    await adminDb.collection(`restaurants/${restaurant.id}/petpoojaLogs`).add({
      kind: 'callback',
      orderId: orderDocId,
      petpoojaStatus: String(status),
      ourStatus: ourStatus || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => { /* best-effort */ });
    return res.status(200).json({ http_code: 200, status: 'success', message: 'Status updated' });
  } catch (err) {
    console.error('[/api/petpooja/callback] failed:', err);
    return res.status(500).json({ http_code: 500, status: 'error', message: err?.message });
  }
}
