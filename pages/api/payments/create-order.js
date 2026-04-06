// pages/api/payments/create-order.js
import Razorpay from 'razorpay';

const PLAN_AMOUNTS = {
  starter: 99900,   // ₹999 in paise
  growth:  249900,  // ₹2499
  pro:     499900,  // ₹4999
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { planId, restaurantId } = req.body;
  if (!planId || !PLAN_AMOUNTS[planId]) {
    return res.status(400).json({ error: 'Invalid plan' });
  }

  try {
    const razorpay = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const order = await razorpay.orders.create({
      amount:   PLAN_AMOUNTS[planId],
      currency: 'INR',
      receipt:  `rcpt_${restaurantId}_${Date.now()}`,
      notes:    { planId, restaurantId },
    });

    return res.status(200).json({ orderId: order.id });
  } catch (err) {
    console.error('Razorpay error:', err);
    return res.status(500).json({ error: 'Failed to create order' });
  }
}
