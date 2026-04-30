// lib/gatewayProviders/paytm.js — Paytm Business gateway provider
// =================================================================
//
// Paytm Business "All-in-one SDK" integration. The flow is:
//
//   1. Server generates a checksum from the order params + Merchant Key
//   2. Server calls Paytm `/theia/api/v1/initiateTransaction` with that checksum
//   3. Paytm returns a `txnToken`
//   4. Customer is redirected to Paytm's payment page (or shown a UPI QR)
//   5. After payment, Paytm posts a server-to-server callback to our webhook
//   6. Webhook verifies the checksum on the callback body, then we
//      mark the order paid via markOrderPaid
//
// This file is a STUB scaffold — the actual paytmchecksum + HTTP calls
// require the user to:
//   - Create a Paytm Business merchant account
//   - Paste their Merchant ID + Merchant Key into /admin/gateway
//   - npm install paytmchecksum (Paytm's official Node helper)
//   - Replace the [STUB] sections below with real fetch + checksum calls
//
// The shape of the returned objects is what the rest of the app
// consumes, so flipping the stubs to real calls is a localised change
// — no customer / admin / webhook code needs to know.

const PAYTM_HOST = {
  staging:    'https://securegw-stage.paytm.in',
  production: 'https://securegw.paytm.in',
};

// ============================================================
// createIntent — called when the customer chooses UPI on the bill modal
// ============================================================
//
// Inputs (from lib/gateway.js):
//   { config, order, webhookUrl, returnUrl }
//
//   config: {
//     provider: 'paytm',
//     paytm: { merchantId, merchantKey, env: 'staging'|'production',
//              websiteName?, industryType? }
//   }
//   order:  the Firestore order doc (must have id + total)
//
// Returns:
//   {
//     providerTransactionId: 'AR-{orderId}-{timestamp}',
//     paymentUrl: 'https://...',     // open in new tab OR iframe
//     // OR
//     qrPayload: 'upi://pay?...',    // for "show QR" flow
//   }
//
// Either paymentUrl OR qrPayload must be set (or both). The customer
// page picks the right UI based on which is present.
export async function createIntent({ config, order, webhookUrl, returnUrl }) {
  const paytmCfg = config.paytm || {};
  if (!paytmCfg.merchantId || !paytmCfg.merchantKey) {
    const err = new Error('PAYTM_CREDENTIALS_MISSING');
    err.code = 'PAYTM_CREDENTIALS_MISSING';
    throw err;
  }

  // Build the deterministic order id — Paytm requires unique txn ids.
  const providerTransactionId = `AR-${(order.id || '').slice(-8)}-${Date.now().toString(36)}`;

  // [STUB] Real impl:
  //
  //   const PaytmChecksum = require('paytmchecksum');
  //   const params = {
  //     MID: paytmCfg.merchantId,
  //     WEBSITE: paytmCfg.websiteName || 'WEBSTAGING',
  //     INDUSTRY_TYPE_ID: paytmCfg.industryType || 'Retail',
  //     CHANNEL_ID: 'WEB',
  //     ORDER_ID: providerTransactionId,
  //     CUST_ID: `cust-${order.customerPhone || 'guest'}`,
  //     TXN_AMOUNT: String(Math.round(Number(order.total) || 0)),
  //     CALLBACK_URL: webhookUrl,
  //   };
  //   const checksum = await PaytmChecksum.generateSignature(JSON.stringify(params), paytmCfg.merchantKey);
  //   const body = JSON.stringify({ body: params, head: { signature: checksum } });
  //   const r = await fetch(`${PAYTM_HOST[paytmCfg.env || 'staging']}/theia/api/v1/initiateTransaction?mid=${paytmCfg.merchantId}&orderId=${providerTransactionId}`, {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body,
  //   });
  //   const j = await r.json();
  //   if (j.body?.resultInfo?.resultStatus !== 'S') throw new Error(j.body?.resultInfo?.resultMsg || 'Paytm initiate failed');
  //   const txnToken = j.body.txnToken;
  //
  //   const paymentUrl = `${PAYTM_HOST[paytmCfg.env || 'staging']}/theia/api/v1/showPaymentPage?mid=${paytmCfg.merchantId}&orderId=${providerTransactionId}`;
  //   // For the UPI Intent / QR variant, call /theia/api/v1/upi/transaction
  //   // and return its qrPayload instead of paymentUrl.

  // ───────────────────── Stub mode (current) ──────────────────────
  // Returns a fake URL so dev can wire the customer flow without real
  // credentials. Replace with the real impl above before going live.
  const stubPaymentUrl = `${PAYTM_HOST[paytmCfg.env || 'staging']}/theia/processTransaction?ORDER_ID=${encodeURIComponent(providerTransactionId)}&MID=${encodeURIComponent(paytmCfg.merchantId)}&__stub=1`;

  return {
    providerTransactionId,
    paymentUrl: stubPaymentUrl,
    // No qrPayload in stub mode; real impl can populate either.
  };
}

// ============================================================
// verifyWebhook — called by /api/payment/webhook
// ============================================================
//
// Paytm posts a form-urlencoded or JSON body containing:
//   ORDERID, TXNID, STATUS ('TXN_SUCCESS'|'TXN_FAILURE'|'PENDING'),
//   TXNAMOUNT, CHECKSUMHASH, etc.
//
// We verify CHECKSUMHASH using the merchant key. If valid + status
// is success/failure, return { orderId, paymentStatus, providerRef }.
// Otherwise return null and the API route will 4xx.
//
// The orderId returned here is OUR Firestore order id, NOT the
// providerTransactionId. We extract it from the providerTransactionId
// (which was built as `AR-{orderIdSuffix}-...`) by querying Firestore
// for the order whose gatewayProviderTxnId matches.
export async function verifyWebhook({ config, headers, rawBody }) {
  const paytmCfg = config.paytm || {};
  if (!paytmCfg.merchantKey) return null;

  // Body comes either as form-urlencoded (Paytm default) or JSON.
  // We accept both.
  let payload = {};
  const ct = (headers['content-type'] || '').toLowerCase();
  if (ct.includes('application/json')) {
    try { payload = JSON.parse(rawBody); } catch { return null; }
  } else {
    const params = new URLSearchParams(rawBody);
    for (const [k, v] of params.entries()) payload[k] = v;
  }

  const providerTxnId = payload.ORDERID;
  const status = payload.STATUS;
  const checksumHash = payload.CHECKSUMHASH;
  if (!providerTxnId || !status || !checksumHash) return null;

  // [STUB] Real signature verification:
  //
  //   const PaytmChecksum = require('paytmchecksum');
  //   delete payload.CHECKSUMHASH;
  //   const ok = PaytmChecksum.verifySignature(payload, paytmCfg.merchantKey, checksumHash);
  //   if (!ok) return null;
  //
  // ────────────────────── Stub mode (current) ──────────────────────
  // We accept any non-empty checksum so dev can curl the webhook.
  // BEFORE GOING LIVE replace this with the real verifySignature
  // call — without it any attacker can forge a "paid" event by
  // POSTing crafted body to the webhook URL.
  const verified = checksumHash.length > 0;
  if (!verified) return null;

  // Map Paytm status → our paymentStatus enum.
  const ourStatus = status === 'TXN_SUCCESS' ? 'paid_online'
                  : status === 'TXN_FAILURE' ? 'payment_issue'
                  : null; // PENDING etc — wait for next callback
  if (!ourStatus) return null;

  return {
    providerTransactionId: providerTxnId,
    paymentStatus: ourStatus,
    providerRef: payload.TXNID || providerTxnId,
    rawAmount: Number(payload.TXNAMOUNT) || null,
  };
}
