// pages/api/payments/create-order.js
// Creates a Razorpay order for a subscription upgrade. Reads the canonical
// plan catalog from lib/plans.js — keep this file in sync by importing only.
import Razorpay from 'razorpay';
import { getPlan, normalizePlanId, PLANS } from '../../../lib/plans';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { planId, restaurantId } = req.body;
  const normalizedId = normalizePlanId(planId);
  const plan = PLANS.find(p => p.id === normalizedId);
  if (!plan) {
    return res.status(400).json({ error: 'Invalid plan' });
  }

  try {
    const razorpay = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const order = await razorpay.orders.create({
      amount:   plan.priceInPaise,
      currency: 'INR',
      receipt:  `rcpt_${restaurantId}_${Date.now()}`,
      notes:    { planId: plan.id, restaurantId },
    });

    return res.status(200).json({ orderId: order.id });
  } catch (err) {
    console.error('Razorpay error:', err);
    return res.status(500).json({ error: 'Failed to create order' });
  }
}
