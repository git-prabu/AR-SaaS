// pages/api/payments/verify.js
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { adminDb } from '../../../lib/firebaseAdmin';

const PLAN_LIMITS = {
  starter: { maxItems: 20,  maxStorageMB: 1024  },
  growth:  { maxItems: 60,  maxStorageMB: 3072  },
  pro:     { maxItems: 150, maxStorageMB: 10240 },
};

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
    const limits = PLAN_LIMITS[planId] || PLAN_LIMITS.starter;
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
