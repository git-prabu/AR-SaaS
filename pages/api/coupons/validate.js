// pages/api/coupons/validate.js
// Server-side coupon validation. Before this endpoint existed, the customer
// client read the coupons collection directly via a permissive Firestore
// rule — anyone with DevTools could dump every code. Reads are now admin-only
// at the rule layer and customers go through this endpoint.
//
// The endpoint does validation only. Use count increments happen separately
// at order-placement time (TODO: move that write to the server too — today
// it's a fire-and-forget client update that already silently fails under
// the tightened rule).
import { adminDb } from '../../../lib/firebaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ valid: false, error: 'Method not allowed' });
  }

  const { restaurantId, code, subtotal } = req.body || {};
  if (!restaurantId || !code) {
    return res.status(400).json({ valid: false, error: 'Missing required fields' });
  }
  if (typeof restaurantId !== 'string' || typeof code !== 'string') {
    return res.status(400).json({ valid: false, error: 'Invalid input types' });
  }
  if (restaurantId.length > 128 || code.length > 64) {
    return res.status(400).json({ valid: false, error: 'Input too long' });
  }

  const normalizedCode = code.toUpperCase().trim();
  const cartSubtotal = Math.max(0, Number(subtotal) || 0);

  try {
    const snap = await adminDb
      .collection('restaurants').doc(restaurantId)
      .collection('coupons')
      .where('code', '==', normalizedCode)
      .limit(1)
      .get();

    if (snap.empty) {
      return res.status(200).json({ valid: false, error: 'Invalid coupon code' });
    }
    const doc = snap.docs[0];
    const coupon = { id: doc.id, ...doc.data() };

    if (!coupon.isActive) {
      return res.status(200).json({ valid: false, error: 'Invalid coupon code' });
    }
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      return res.status(200).json({ valid: false, error: 'Coupon has reached maximum uses' });
    }
    if (coupon.validUntil && new Date(coupon.validUntil) < new Date()) {
      return res.status(200).json({ valid: false, error: 'Coupon has expired' });
    }

    const discount = coupon.type === 'percent'
      ? Math.round(cartSubtotal * coupon.value / 100)
      : Math.min(coupon.value, cartSubtotal);

    // Return only the fields the client needs — don't leak usedCount, notes, etc.
    return res.status(200).json({
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
      },
      discount,
    });
  } catch (e) {
    console.error('Coupon validate error:', e);
    return res.status(500).json({ valid: false, error: 'Server error. Please try again.' });
  }
}
