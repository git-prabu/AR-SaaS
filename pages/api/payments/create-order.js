// pages/api/payments/create-order.js
// Creates a Razorpay order for a subscription upgrade. Reads the canonical
// plan catalog from lib/plans.js — keep this file in sync by importing only.
//
// Auth (May 5): caller must present the restaurant admin's Firebase
// idToken. Previously this endpoint was unauthenticated, which let an
// attacker spam Razorpay order creation for any restaurantId. Now we
// verify the idToken maps to the admin (or staff) who owns the
// restaurantId in the body, or to a superadmin.
//
// Idempotency (May 5): caller may pass a client-generated idempotency
// key in the body. We mirror it into the Razorpay `receipt` field so
// repeated calls with the same key produce the same receipt string.
// (Razorpay doesn't strictly dedupe on receipt, but a stable receipt
// helps reconciliation when a flaky network triggers two clicks.)
import Razorpay from 'razorpay';
import { adminAuth } from '../../../lib/firebaseAdmin';
import { getPlan, normalizePlanId, PLANS } from '../../../lib/plans';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { planId, restaurantId, idempotencyKey } = req.body || {};
  const normalizedId = normalizePlanId(planId);
  const plan = PLANS.find(p => p.id === normalizedId);
  if (!plan) {
    return res.status(400).json({ error: 'Invalid plan' });
  }
  if (!restaurantId || typeof restaurantId !== 'string') {
    return res.status(400).json({ error: 'restaurantId is required' });
  }

  // Auth: idToken in header or body.
  const idToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
                || req.body?.idToken;
  if (!idToken) return res.status(401).json({ error: 'Missing idToken' });

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch {
    return res.status(401).json({ error: 'Invalid idToken' });
  }

  // Allow superadmin (can upgrade any tenant) and the restaurant's own
  // admin (custom claim `restaurantId` is set by /api/admin/login).
  // Lazy-import the user doc only when claim isn't present, to avoid
  // an extra Firestore read on the hot path.
  const tokenRestaurantId = decoded?.restaurantId;
  const tokenRole = decoded?.role;
  let allowed = tokenRole === 'superadmin' || tokenRestaurantId === restaurantId;
  if (!allowed) {
    const { adminDb } = await import('../../../lib/firebaseAdmin');
    const userSnap = await adminDb.doc(`users/${decoded.uid}`).get();
    if (userSnap.exists) {
      const u = userSnap.data();
      if (u.role === 'superadmin') allowed = true;
      else if (u.role === 'restaurant' && u.restaurantId === restaurantId) allowed = true;
    }
  }
  if (!allowed) return res.status(403).json({ error: 'Not owner of this restaurant' });

  try {
    const razorpay = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    // Receipt: stable when caller passes idempotencyKey, otherwise time-based.
    // Trim/sanitize to Razorpay's 40-char receipt limit.
    const safeIdem = String(idempotencyKey || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30);
    const receipt = safeIdem
      ? `rcpt_${restaurantId.slice(0, 8)}_${safeIdem}`.slice(0, 40)
      : `rcpt_${restaurantId.slice(0, 8)}_${Date.now()}`.slice(0, 40);

    const order = await razorpay.orders.create({
      amount:   plan.priceInPaise,
      currency: 'INR',
      receipt,
      notes:    { planId: plan.id, restaurantId },
    });

    return res.status(200).json({ orderId: order.id });
  } catch (err) {
    console.error('Razorpay error:', err);
    return res.status(500).json({ error: 'Failed to create order' });
  }
}
