// pages/api/petpooja/_authPetpoojaInbound.js
// Phase B (Petpooja hybrid) — shared auth helper for inbound endpoints.
//
// Petpooja's spec doesn't include a signature on inbound webhooks.
// Defence-in-depth: we authenticate by:
//   1. Body must include `restID`.
//   2. We look up the restaurant by petpoojaConfig.restID.
//   3. Restaurant must be in posMode === 'petpooja_hybrid'.
//   4. (Optional) If body includes app_key, must match
//      process.env.PETPOOJA_APP_KEY (Petpooja sometimes echoes the
//      partner credential).
//
// Returns { ok: true, restaurant } or { ok: false, status, error }.
// Caller should: if !ok, return res.status(status).json({ error }).

import { adminDb } from '../../../lib/firebaseAdmin';

export async function authenticatePetpoojaInbound(body) {
  const restID = body?.restID;
  if (!restID) {
    return { ok: false, status: 400, error: 'restID is required' };
  }
  // Optional app_key check — only enforced if body includes it AND
  // we have the env var set. Matches Petpooja's pattern of including
  // partner creds redundantly on some calls.
  if (body?.app_key && process.env.PETPOOJA_APP_KEY) {
    if (body.app_key !== process.env.PETPOOJA_APP_KEY) {
      return { ok: false, status: 401, error: 'Invalid app_key' };
    }
  }
  // Find the restaurant by restID. Each restID is per-restaurant so
  // a single match is expected.
  const q = await adminDb.collection('restaurants')
    .where('petpoojaConfig.restID', '==', String(restID))
    .where('posMode', '==', 'petpooja_hybrid')
    .limit(1)
    .get();
  if (q.empty) {
    return { ok: false, status: 404, error: 'Restaurant not found or not in hybrid mode' };
  }
  const snap = q.docs[0];
  return { ok: true, restaurant: { id: snap.id, ...snap.data() } };
}
