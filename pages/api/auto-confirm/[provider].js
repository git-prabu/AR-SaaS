// pages/api/auto-confirm/[provider].js
// =====================================================================
// Auto-confirm UPI webhook receiver. Each provider's merchant dashboard
// is configured to POST here with the restaurant id as a query param:
//
//   https://halohelm.com/api/auto-confirm/razorpay?rid=<RID>
//   https://halohelm.com/api/auto-confirm/paytm?rid=<RID>
//   https://halohelm.com/api/auto-confirm/phonepe?rid=<RID>
//
// Flow:
//   1. Read raw body (we need the exact bytes for signature verification —
//      Next's body parser would mutate them, so we disable it).
//   2. Load the restaurant's autoConfirm config from
//      `restaurants/{rid}/private/gateway`.
//   3. Pick the provider module by URL slug, verify signature + parse.
//   4. Hand the parsed event to autoConfirm.autoConfirmPayment which
//      does reference-or-amount matching and flips the order paid.
//   5. Always reply 200 once we've persisted the result so the provider
//      doesn't retry forever (each provider retries 3-5 times by default).
//      We only return 4xx for bad-signature / missing-rid / bad-payload —
//      cases where retry won't help anyway.

import { adminDb } from '../../../lib/firebaseAdmin';
import { autoConfirmPayment } from '../../../lib/autoConfirm';
import * as razorpay from '../../../lib/autoConfirmProviders/razorpay';
import * as paytm    from '../../../lib/autoConfirmProviders/paytm';
import * as phonepe  from '../../../lib/autoConfirmProviders/phonepe';

export const config = { api: { bodyParser: false } };

const PROVIDERS = { razorpay, paytm, phonepe };

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end',  () => resolve(data));
    req.on('error', reject);
  });
}

async function getAutoConfirmConfig(restaurantId, providerKey) {
  const snap = await adminDb.doc(`restaurants/${restaurantId}/private/gateway`).get();
  if (!snap.exists) return null;
  const data = snap.data();
  const ac = data?.autoConfirm;
  if (!ac || !ac.isActive) return null;
  if (ac.provider !== providerKey) return null;       // sanity — provider URL must match config
  return ac[providerKey] || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const restaurantId = req.query?.rid;
  const providerKey  = String(req.query?.provider || '').toLowerCase();

  if (!restaurantId) return res.status(400).send('Missing rid');
  if (!PROVIDERS[providerKey]) return res.status(400).send('Unknown provider');

  // 1. Raw body.
  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (e) {
    console.error('[auto-confirm] body read failed:', e?.message);
    return res.status(400).send('Bad body');
  }

  // 2. Provider-specific config.
  const providerCfg = await getAutoConfirmConfig(restaurantId, providerKey);
  if (!providerCfg) {
    // Quietly 404 — restaurant hasn't enabled this provider, or the
    // webhook URL is mis-configured.
    return res.status(404).send('Auto-confirm not enabled for this provider');
  }

  // 3. Provider module — verify signature + parse.
  const secret =
    providerKey === 'razorpay' ? providerCfg.webhookSecret :
    providerKey === 'paytm'    ? providerCfg.merchantKey   :
    /* phonepe */                providerCfg.saltKey;

  const saltIndex = providerKey === 'phonepe' ? (providerCfg.saltIndex || '1') : undefined;

  // Paytm's parseWebhook is async (uses the paytmchecksum lib which
  // returns a Promise); razorpay + phonepe are sync. await handles both.
  const parsed = await PROVIDERS[providerKey].parseWebhook({
    headers: req.headers,
    rawBody,
    secret,
    saltIndex,
  });

  if (!parsed) {
    // Bad signature or non-actionable event — 400 so the provider
    // dashboard surfaces it as a config problem.
    //
    // Log enough detail to detect probing attacks (someone trying
    // arbitrary signatures to forge a "paid" event) without leaking
    // payload contents. The body could contain sensitive payment
    // data; log only the size + a short hash so legitimate failures
    // (Razorpay config drift, secret rotation) can be diagnosed but
    // attacker payloads aren't recorded verbatim.
    const bodyLen = (rawBody || '').length;
    const bodyFingerprint = bodyLen > 0
      ? require('crypto').createHash('sha256').update(rawBody).digest('hex').slice(0, 12)
      : '<empty>';
    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
    console.warn(`[auto-confirm:${providerKey}] signature verify failed rid=${restaurantId} ip=${clientIp} bytes=${bodyLen} bodyHash=${bodyFingerprint}`);
    return res.status(400).send('Invalid or non-actionable event');
  }

  // 4. Shared matcher → mark order paid (or queue for manual match).
  try {
    const result = await autoConfirmPayment(restaurantId, parsed);
    // 200 in all branches so the provider doesn't retry. Body carries
    // the outcome for debugging via provider dashboard event logs.
    return res.status(200).json(result);
  } catch (err) {
    console.error('[auto-confirm] processing failed:', err);
    // 5xx so provider retries — error is on our side, not theirs.
    return res.status(500).send('Processing failed');
  }
}
