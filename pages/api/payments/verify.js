// pages/api/payments/verify.js
// Verifies Razorpay signature, then writes plan + limits + expiry to the
// restaurant doc. Expiry is BILLING_PERIOD_DAYS from now (monthly by default).
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { adminDb } from '../../../lib/firebaseAdmin';
import { getPlan, BILLING_PERIOD_DAYS } from '../../../lib/plans';

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
  if (!planId || !restaurantId) {
    return res.status(400).json({ error: 'Missing order metadata' });
  }

  try {
    const plan = getPlan(planId);   // falls back to Starter if id unknown
    const now = new Date();
    const expiry = new Date(now.getTime() + BILLING_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    await adminDb.collection('restaurants').doc(restaurantId).update({
      plan:              plan.id,
      maxItems:          plan.maxItems,
      maxStorageMB:      plan.maxStorageMB,
      subscriptionStart: now.toISOString().split('T')[0],
      subscriptionEnd:   expiry.toISOString().split('T')[0],
      planExpiresAt:     expiry.toISOString(),  // authoritative expiry timestamp
      paymentStatus:     'active',
      lastPaymentId:     razorpay_payment_id,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Payment verification error:', err);
    return res.status(500).json({ error: 'Failed to update subscription' });
  }
}
