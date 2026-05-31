// pages/api/payments/verify.js
// Verifies Razorpay signature, then writes plan + limits + expiry to the
// restaurant doc. Expiry is expiryDaysFor(period) days from now — period
// rides on order.notes from create-order.js (monthly / 3mo / 6mo / annual).
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { adminDb } from '../../../lib/firebaseAdmin';
import { getPlan, expiryDaysFor, canUsePetpoojaIntegration } from '../../../lib/plans';
import { disconnect as petpoojaDisconnect } from '../../../lib/petpoojaSync';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = req.body;

  // Verify signature
  const body      = razorpay_order_id + '|' + razorpay_payment_id;
  const expected  = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');

  if (expected !== razorpay_signature) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Fetch order from Razorpay to get trusted planId and restaurantId
  const razorpay = new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
  const order = await razorpay.orders.fetch(razorpay_order_id);
  const planId = order.notes?.planId;
  const restaurantId = order.notes?.restaurantId;
  const period = order.notes?.period; // Phase E — monthly / threeMonth / sixMonth / annual
  if (!planId || !restaurantId) {
    return res.status(400).json({ error: 'Missing order metadata' });
  }

  try {
    const plan = getPlan(planId);   // falls back to Starter if id unknown
    const now = new Date();
    // expiryDaysFor() falls back to monthly (30 days) when period is missing,
    // so legacy orders created before Phase E continue to work unchanged.
    const days = expiryDaysFor(period);

    // Pre-update read of the restaurant doc. Used for two things:
    //   (a) Pro-ration: when the customer still has remaining paid time
    //       (active subscription with subscriptionEnd in the future),
    //       we extend FROM that endpoint instead of resetting to today.
    //       This keeps mid-cycle switches and early renewals fair —
    //       e.g. Growth-Monthly user with 20 days left switching to
    //       Growth-Annual gets today+385 days, not today+365. Trial
    //       time and expired/grace time are NOT carried forward
    //       (trial was free; grace is a soft buffer, not paid time).
    //   (b) Phase B (Petpooja hybrid) — detect downgrade FROM Pro so
    //       we can auto-disconnect Petpooja. Otherwise the restaurant
    //       gets stuck in petpooja_hybrid mode without an eligible
    //       plan, which means every order push silently fails the
    //       plan-gate at runtime.
    let oldDoc = null;
    try {
      const snap = await adminDb.collection('restaurants').doc(restaurantId).get();
      if (snap.exists) oldDoc = snap.data();
    } catch { /* non-fatal — proceed without downgrade-detection */ }

    // Pro-ration: figure out the start point for the new period.
    let extendFrom = now;
    let carriedOverDays = 0;
    const oldEndIso = oldDoc?.subscriptionEnd;
    if (oldEndIso && oldDoc?.paymentStatus === 'active') {
      const oldEnd = new Date(oldEndIso);
      if (!isNaN(oldEnd.getTime()) && oldEnd > now) {
        extendFrom = oldEnd;
        carriedOverDays = Math.ceil((oldEnd - now) / (24 * 60 * 60 * 1000));
      }
    }
    const expiry = new Date(extendFrom.getTime() + days * 24 * 60 * 60 * 1000);

    await adminDb.collection('restaurants').doc(restaurantId).update({
      plan:              plan.id,
      maxItems:          plan.maxItems,
      maxARModels:       plan.maxARModels,
      maxStorageMB:      plan.maxStorageMB,
      maxStaff:          plan.maxStaff,
      subscriptionStart:  now.toISOString().split('T')[0],
      subscriptionEnd:    expiry.toISOString().split('T')[0],
      subscriptionPeriod: period || 'monthly', // Phase E — for renewal UI
      planExpiresAt:      expiry.toISOString(), // authoritative expiry timestamp
      paymentStatus:      'active',
      lastPaymentId:      razorpay_payment_id,
    });

    // After the plan write succeeds, check if the new plan is no
    // longer Petpooja-eligible AND the restaurant was in hybrid mode.
    // If so, auto-disconnect so the integration stops cleanly.
    // (Restaurant can reconnect if they upgrade back to Pro.)
    if (oldDoc?.posMode === 'petpooja_hybrid'
        && !canUsePetpoojaIntegration({ plan: plan.id })) {
      try {
        await petpoojaDisconnect(restaurantId, 'plan-downgrade');
      } catch (err) {
        console.warn('[verify] auto-disconnect Petpooja failed:', err?.message);
        // Non-fatal — plan change still succeeded, just leaves a
        // stale petpoojaConfig that the runtime gate will refuse to
        // use. Worth logging but not failing the payment verification.
      }
    }

    return res.status(200).json({
      success: true,
      newExpiry: expiry.toISOString().split('T')[0],
      carriedOverDays, // Days carried forward from a prior active subscription (0 if new/renewed-after-expiry).
    });
  } catch (err) {
    console.error('Payment verification error:', err);
    return res.status(500).json({ error: 'Failed to update subscription' });
  }
}
