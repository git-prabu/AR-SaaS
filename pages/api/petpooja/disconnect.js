// pages/api/petpooja/disconnect.js
// Phase B (Petpooja hybrid) — Disconnect Petpooja, revert to standalone.
//
// Auth: admin idToken (or superadmin), restaurant admin/staff can
// only disconnect their own restaurant.
// Plan gate: NOT enforced here — disconnect must work even if the
// restaurant has been downgraded from Pro (otherwise they'd be stuck
// in hybrid mode forever). Auto-disconnect on plan downgrade also
// calls disconnect() directly server-side via lib/petpoojaSync.

import { adminAuth, adminDb } from '../../../lib/firebaseAdmin';
import { disconnect } from '../../../lib/petpoojaSync';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { restaurantId, reason } = req.body || {};
  if (!restaurantId || typeof restaurantId !== 'string') {
    return res.status(400).json({ error: 'restaurantId is required' });
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
    const result = await disconnect(restaurantId, reason || 'user-requested');
    return res.status(200).json(result);
  } catch (err) {
    console.error('[/api/petpooja/disconnect] failed:', err);
    return res.status(500).json({ error: 'Internal error', detail: err?.message });
  }
}
