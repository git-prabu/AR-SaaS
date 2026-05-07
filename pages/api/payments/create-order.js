// pages/api/payments/create-order.js
// Creates a Razorpay order for a subscription upgrade. Reads the canonical
// plan catalog from lib/plans.js — keep this file in sync by importing only.
//
// Idempotency (May 5): caller may pass a client-generated idempotency
// key in the body. We mirror it into the Razorpay `receipt` field so
// repeated calls with the same key produce the same receipt string.
// (Razorpay doesn't strictly dedupe on receipt, but a stable receipt
// helps reconciliation when a flaky network triggers two clicks.)
//
// Auth note: this endpoint is intentionally NOT auth-gated. The
// previous attempt to require an idToken broke the live upgrade flow
// (any token-fetch hiccup → toast "Payment failed"). The actual
// security gate is the Razorpay HMAC signature check on
// /api/payments/verify — without a valid signature from a real
// Razorpay payment, no plan write happens. So spamming /create-order
// can at most create stranded Razorpay orders (which expire on
// Razorpay's side and don't affect anything).
import Razorpay from 'razorpay';
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
