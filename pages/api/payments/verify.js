// pages/api/payments/verify.js
import crypto from 'crypto';
import { adminDb } from '../../../lib/firebaseAdmin';

const PLAN_LIMITS = {
  basic:   { maxItems: 10,  maxStorageMB: 500  },
  pro:     { maxItems: 40,  maxStorageMB: 2048 },
  premium: { maxItems: 100, maxStorageMB: 5120 },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    planId,
    restaurantId,
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

  try {
    const limits = PLAN_LIMITS[planId] || PLAN_LIMITS.basic;
    const now    = new Date();
    const sixMonthsLater = new Date(now);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);

    await adminDb.collection('restaurants').doc(restaurantId).update({
      plan:              planId,
      maxItems:          limits.maxItems,
      maxStorageMB:      limits.maxStorageMB,
      subscriptionStart: now.toISOString().split('T')[0],
      subscriptionEnd:   sixMonthsLater.toISOString().split('T')[0],
      paymentStatus:     'active',
      lastPaymentId:     razorpay_payment_id,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Payment verification error:', err);
    return res.status(500).json({ error: 'Failed to update subscription' });
  }
}
