// pages/api/petpooja/menu-sync.js
// Phase B (Petpooja hybrid) — Pull the restaurant's menu from
// Petpooja and mirror to our Firestore menuItems collection.
//
// Trigger paths:
//   1. Manual: admin clicks "Sync menu now" on /admin/petpooja-connect
//   2. Initial: called automatically by /api/petpooja/connect after a
//      successful save (so the restaurant sees their menu immediately)
//   3. Scheduled: Vercel cron job hits this endpoint every 6 hours
//      (configured in vercel.json — added in a separate change)
//
// Auth: admin idToken for manual trigger. The cron path uses a shared
// secret in the CRON_SECRET env var (similar to the existing daily-
// summary cron pattern).
// Plan gate: enforced inside lib/petpoojaSync.syncMenu via loadAndGate.

import { adminAuth, adminDb } from '../../../lib/firebaseAdmin';
import { syncMenu } from '../../../lib/petpoojaSync';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { restaurantId } = req.body || {};
  if (!restaurantId || typeof restaurantId !== 'string') {
    return res.status(400).json({ error: 'restaurantId is required' });
  }

  // Two auth paths: cron secret OR admin idToken.
  const cronSecret = req.headers['x-cron-secret'];
  const isCronCall = cronSecret && cronSecret === process.env.CRON_SECRET;

  if (!isCronCall) {
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
  }

  try {
    const result = await syncMenu(restaurantId);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[/api/petpooja/menu-sync] failed:', err);
    return res.status(500).json({ error: 'Internal error', detail: err?.message });
  }
}
