// pages/api/coupons/use.js
//
// Server-side coupon usage. Customer places an order with a coupon applied;
// the customer page POSTs here so usedCount goes up by 1.
//
// Why this exists: the Sprint 0 Firestore rule lockdown made the coupons
// collection admin-only at the rule layer. Before this endpoint, the
// customer page tried `incrementCouponUse()` as a direct Firestore write,
// which silently failed under the new rule (the .catch() swallowed the
// permission denied error). Result: usedCount never went up, maxUses
// never enforced. This endpoint uses the Admin SDK (rules don't apply)
// so the increment actually lands.
//
// Authorization: open to public — same trust boundary as the customer
// menu itself. The risk is a malicious user spamming this endpoint to
// exhaust a coupon's maxUses; we mitigate by re-validating the coupon
// here (no increment for invalid/expired/exhausted coupons), so the only
// thing a spammer can do is increment a real, currently-valid coupon —
// the same outcome as a real customer placing a real order would have.
// Not a meaningful regression vs. the pre-lockdown state.
//
// We also re-check maxUses here so a race between two near-simultaneous
// orders doesn't push usedCount past maxUses.

import { adminDb } from '../../../lib/firebaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { restaurantId, couponId } = req.body || {};
  if (!restaurantId || !couponId) {
    return res.status(400).json({ ok: false, error: 'Missing required fields' });
  }
  if (typeof restaurantId !== 'string' || typeof couponId !== 'string') {
    return res.status(400).json({ ok: false, error: 'Invalid input types' });
  }
  if (restaurantId.length > 128 || couponId.length > 128) {
    return res.status(400).json({ ok: false, error: 'Input too long' });
  }

  try {
    const ref = adminDb
      .collection('restaurants').doc(restaurantId)
      .collection('coupons').doc(couponId);

    // Run the validation + increment as a single transaction so a race
    // between two orders can't push usedCount above maxUses.
    const result = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { ok: false, error: 'Coupon not found' };
      const c = snap.data();
      if (c.isActive === false) return { ok: false, error: 'Coupon is inactive' };
      if (c.validUntil && new Date(c.validUntil) < new Date()) {
        return { ok: false, error: 'Coupon has expired' };
      }
      const currentUsed = Number(c.usedCount) || 0;
      if (c.maxUses && currentUsed >= c.maxUses) {
        return { ok: false, error: 'Coupon has reached maximum uses' };
      }
      tx.update(ref, { usedCount: currentUsed + 1 });
      return { ok: true, usedCount: currentUsed + 1 };
    });

    return res.status(result.ok ? 200 : 200).json(result);
  } catch (e) {
    console.error('Coupon use error:', e);
    return res.status(500).json({ ok: false, error: 'Server error. Please try again.' });
  }
}
