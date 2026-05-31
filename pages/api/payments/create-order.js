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
import { normalizePlanId, PLANS, getEffectivePriceInPaise, getPeriod } from '../../../lib/plans';
import { adminDb } from '../../../lib/firebaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { planId, restaurantId, idempotencyKey, period } = req.body || {};
  const normalizedId = normalizePlanId(planId);
  const plan = PLANS.find(p => p.id === normalizedId);
  if (!plan) {
    return res.status(400).json({ error: 'Invalid plan' });
  }
  if (!restaurantId || typeof restaurantId !== 'string') {
    return res.status(400).json({ error: 'restaurantId is required' });
  }
  // Phase E — period defaults to monthly for legacy callers that don't pass one.
  // getPeriod() falls back to monthly on an unknown id, so this is safe.
  const billingPeriod = getPeriod(period).id;

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

    // Phase F — honor founding-partner pricing if the restaurant doc has
    // a `foundingPricing` override for this (plan × period). Falls back to
    // the standard plan price when absent or partial. Server-side read so
    // the price can't be tampered with from the client.
    let restaurantDoc = null;
    try {
      const snap = await adminDb.collection('restaurants').doc(restaurantId).get();
      if (snap.exists) restaurantDoc = snap.data();
    } catch { /* non-fatal — proceed with standard pricing */ }

    const order = await razorpay.orders.create({
      amount:   getEffectivePriceInPaise(plan.id, billingPeriod, restaurantDoc),
      currency: 'INR',
      receipt,
      // `period` rides along in notes so /api/payments/verify can use it
      // to set planExpiresAt to the right number of days (30/90/180/365).
      notes:    { planId: plan.id, restaurantId, period: billingPeriod },
    });

    return res.status(200).json({ orderId: order.id });
  } catch (err) {
    // Surface the underlying Razorpay error so /admin/subscription can
    // show a useful toast instead of an opaque "Failed to create order".
    // Razorpay SDK errors expose `error.error.description` (e.g. "key
    // does not exist", "Authentication failed") — that's what we want
    // to bubble up. The HTTP status from Razorpay (401/400) goes into
    // razorpayStatus so we can hint at env-var problems vs request bugs.
    const description = err?.error?.description || err?.description || err?.message || 'Unknown';
    const status = err?.statusCode || err?.status || null;
    console.error('[create-order] Razorpay error:', { status, description, raw: err });
    const hint = !process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET
      ? ' (RAZORPAY env vars missing on the server — check Vercel project settings)'
      : status === 401
      ? ' (Razorpay rejected credentials — check RAZORPAY_KEY_ID/SECRET in Vercel env vars)'
      : '';
    return res.status(500).json({
      error: 'Failed to create order',
      detail: description + hint,
      razorpayStatus: status,
    });
  }
}
