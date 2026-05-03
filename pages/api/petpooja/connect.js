// pages/api/petpooja/connect.js
// Phase B (Petpooja hybrid) — Validate + save Petpooja credentials.
//
// Called from the /admin/petpooja-connect onboarding wizard's
// "Test connection" + "Save & connect" flow.
//
// Auth: admin idToken (only the restaurant's own admin or staff,
// or a superadmin, can configure the integration).
// Plan gate: Pro only — enforced server-side via canUsePetpoojaIntegration.
//
// Two-step UX:
//   1. mode=test  → just validates with Petpooja, returns ok+restaurant
//                   (no Firestore write)
//   2. mode=save  → re-validates AND writes posMode + petpoojaConfig

import { adminAuth, adminDb } from '../../../lib/firebaseAdmin';
import { canUsePetpoojaIntegration } from '../../../lib/plans';
import { validateConnection, saveConnection } from '../../../lib/petpoojaSync';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { restaurantId, mode, restID, apiKey, apiSecret, accessToken } = req.body || {};
  if (!restaurantId || typeof restaurantId !== 'string') {
    return res.status(400).json({ error: 'restaurantId is required' });
  }
  if (!restID || !apiKey) {
    return res.status(400).json({ error: 'restID and apiKey are required' });
  }
  if (mode !== 'test' && mode !== 'save') {
    return res.status(400).json({ error: 'mode must be "test" or "save"' });
  }

  // ── Auth ─────────────────────────────────────────────────────────
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

  // ── Plan gate ────────────────────────────────────────────────────
  const restSnap = await adminDb.doc(`restaurants/${restaurantId}`).get();
  if (!restSnap.exists) return res.status(404).json({ error: 'Restaurant not found' });
  const restaurant = restSnap.data();
  if (!canUsePetpoojaIntegration(restaurant)) {
    return res.status(403).json({
      error: 'PLAN_NOT_ELIGIBLE',
      message: 'Petpooja integration is available on the Pro plan only. Upgrade to Pro to connect.',
    });
  }

  const candidate = {
    restID: String(restID).trim(),
    apiKey: String(apiKey).trim(),
    apiSecret: apiSecret ? String(apiSecret).trim() : null,
    accessToken: accessToken ? String(accessToken).trim() : null,
  };

  try {
    if (mode === 'test') {
      const result = await validateConnection(restaurantId, candidate);
      return res.status(200).json(result);
    }
    // mode === 'save'
    const validation = await validateConnection(restaurantId, candidate);
    if (!validation.ok) return res.status(400).json(validation);
    const saved = await saveConnection(restaurantId, candidate);
    return res.status(200).json(saved);
  } catch (err) {
    console.error('[/api/petpooja/connect] failed:', err);
    return res.status(500).json({ error: 'Internal error', detail: err?.message });
  }
}
