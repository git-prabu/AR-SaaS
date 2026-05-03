// pages/api/petpooja/payment-sync.js
// Phase B (Petpooja hybrid) — Best-effort payment status sync.
//
// Trigger: /admin/payments page calls this fire-and-forget after
// markOrderPaid() succeeds, IF the restaurant is in petpooja_hybrid
// mode. Standalone restaurants never call this endpoint.
//
// IMPORTANT: Petpooja V2.1.0 has no official "update payment after
// the fact" API. lib/petpooja.updatePaymentStatus uses a partner-
// defined extension that may be silently ignored. Callers should
// treat success as bonus, failure as expected.
//
// Auth: admin idToken — only the restaurant's own admin/staff (or
// superadmin) can trigger.
// Plan gate: enforced inside lib/petpoojaSync.syncPayment.

import { adminAuth, adminDb } from '../../../lib/firebaseAdmin';
import { syncPayment } from '../../../lib/petpoojaSync';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { restaurantId, orderId } = req.body || {};
  if (!restaurantId || typeof restaurantId !== 'string') {
    return res.status(400).json({ error: 'restaurantId is required' });
  }
  if (!orderId || typeof orderId !== 'string') {
    return res.status(400).json({ error: 'orderId is required' });
  }

  const idToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
                || req.body?.idToken;
  if (!idToken) return res.status(401).json({ error: 'Missing idToken' });
  let decoded;
  try { decoded = await adminAuth.verifyIdToken(idToken); }
  catch { return res.status(401).json({ error: 'Invalid idToken' }); }

  const userSnap = await adminDb.doc(`users/${decoded.uid}`).get();
  if (!userSnap.exists) return res.status(403).json({ error: 'No user doc' });
  const user = userSnap.data();
  if (user.role !== 'superadmin') {
    if (!['restaurant', 'staff'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden role' });
    }
    if (user.restaurantId !== restaurantId) {
      return res.status(403).json({ error: 'Not owner of this restaurant' });
    }
  }

  try {
    const result = await syncPayment(restaurantId, orderId);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[/api/petpooja/payment-sync] failed:', err);
    return res.status(500).json({ error: 'Internal error', detail: err?.message });
  }
}
