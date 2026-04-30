// pages/api/payment/config.js
// Phase H — Get/save the per-restaurant gateway config.
// POST { idToken, config } — persists config (admin-only via idToken)
// GET  ?rid=...            — returns the config (admin-only)
//
// We could read/write directly from the client via the Firestore SDK,
// but routing through this endpoint lets us:
//   1. Verify the caller is the restaurant admin (via Firebase ID token)
//   2. Avoid exposing the merchantKey field via Firestore rules — we
//      keep it server-side-only by NOT mirroring it in any other doc
//   3. Validate the config shape before write
//
// In production you'd encrypt the merchantKey at rest. For this
// scaffold we store it plaintext in Firestore — it's still better
// than client-side localStorage, but plan to add encryption before
// going live.

import { adminDb, adminAuth } from '../../../lib/firebaseAdmin';
import { getGatewayConfig, setGatewayConfig } from '../../../lib/gateway';

async function getCallerRestaurantId(req) {
  const idToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
                || req.body?.idToken
                || req.query?.idToken;
  if (!idToken) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    const userDoc = await adminDb.doc(`users/${decoded.uid}`).get();
    if (!userDoc.exists) return null;
    return userDoc.data().restaurantId || null;
  } catch {
    return null;
  }
}

const ALLOWED_PROVIDERS = ['paytm', 'none'];

function sanitizeConfig(input) {
  if (!input || typeof input !== 'object') return null;
  const provider = ALLOWED_PROVIDERS.includes(input.provider) ? input.provider : 'none';
  const config = {
    provider,
    isActive: !!input.isActive,
  };
  if (provider === 'paytm') {
    const p = input.paytm || {};
    config.paytm = {
      merchantId:   String(p.merchantId   || '').trim(),
      merchantKey:  String(p.merchantKey  || '').trim(),
      env:          p.env === 'production' ? 'production' : 'staging',
      websiteName:  String(p.websiteName  || 'WEBSTAGING').trim(),
      industryType: String(p.industryType || 'Retail').trim(),
    };
  }
  return config;
}

export default async function handler(req, res) {
  const callerRid = await getCallerRestaurantId(req);
  if (!callerRid) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const cfg = await getGatewayConfig(callerRid);
    // Mask the merchantKey before returning — admin doesn't need to
    // see it again, just confirm it's set.
    if (cfg?.paytm?.merchantKey) {
      cfg.paytm.merchantKey = `••••${cfg.paytm.merchantKey.slice(-4)}`;
      cfg.paytm.merchantKeyMasked = true;
    }
    return res.status(200).json({ config: cfg || null });
  }

  if (req.method === 'POST') {
    const incoming = sanitizeConfig(req.body?.config);
    if (!incoming) return res.status(400).json({ error: 'Invalid config' });
    // If admin is updating but didn't repaste the merchantKey (because
    // we masked it on GET), keep the existing key.
    if (incoming.provider === 'paytm' && (!incoming.paytm.merchantKey || incoming.paytm.merchantKey.startsWith('••••'))) {
      const existing = await getGatewayConfig(callerRid);
      if (existing?.paytm?.merchantKey) {
        incoming.paytm.merchantKey = existing.paytm.merchantKey;
      } else {
        return res.status(400).json({ error: 'Merchant Key is required on first save.' });
      }
    }
    await setGatewayConfig(callerRid, incoming);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
