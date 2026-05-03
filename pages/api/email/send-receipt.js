// pages/api/email/send-receipt.js
// Phase M — Sends a payment-confirmation receipt to the customer.
// Called from two places:
//   1. The admin /admin/payments page after marking an order paid.
//      Auth: admin's Firebase idToken; we verify the admin owns the
//      restaurantId in the request body.
//   2. The gateway webhook /api/payment/webhook after the bank/UPI
//      provider confirms payment server-side. That path imports
//      sendReceiptForOrder() directly and skips this endpoint.
//
// Idempotency lives in lib/email.sendReceiptForOrder — calling this
// endpoint twice for the same orderId is harmless (returns
// `skipped: 'already-sent'` on the second call).

import { adminAuth, adminDb } from '../../../lib/firebaseAdmin';
import { sendReceiptForOrder } from '../../../lib/email';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { restaurantId, orderId } = req.body || {};
  if (!restaurantId || typeof restaurantId !== 'string') {
    return res.status(400).json({ error: 'restaurantId is required' });
  }
  if (!orderId || typeof orderId !== 'string') {
    return res.status(400).json({ error: 'orderId is required' });
  }

  // Auth: only an admin who owns this restaurant (or staff under it)
  // can trigger a receipt send. This blocks an attacker who knows an
  // orderId from spamming receipts to that customer's email — they'd
  // also need a valid admin token for the same restaurant.
  const idToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
                || req.body?.idToken;
  if (!idToken) return res.status(401).json({ error: 'Missing idToken' });

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch {
    return res.status(401).json({ error: 'Invalid idToken' });
  }

  // Verify the caller's user doc maps to this restaurantId. Allow
  // role=restaurant (admin) and role=staff. Superadmin bypasses the
  // restaurantId check (they can trigger any tenant).
  const userSnap = await adminDb.doc(`users/${decoded.uid}`).get();
  if (!userSnap.exists) return res.status(403).json({ error: 'No user doc' });
  const user = userSnap.data();
  const role = user.role;
  if (role !== 'superadmin') {
    if (!['restaurant', 'staff'].includes(role)) {
      return res.status(403).json({ error: 'Forbidden role' });
    }
    if (user.restaurantId !== restaurantId) {
      return res.status(403).json({ error: 'Not owner of this restaurant' });
    }
  }

  try {
    const result = await sendReceiptForOrder(restaurantId, orderId);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[/api/email/send-receipt] failed:', err);
    return res.status(500).json({ error: 'Internal error', detail: err?.message });
  }
}
