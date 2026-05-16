// lib/autoConfirmProviders/paytm.js
// =====================================================================
// Paytm Business merchant webhook parser for auto-confirm UPI.
//
// Paytm Business sends a "Payment Status Update" webhook to the URL
// the restaurant configures in their Paytm Business dashboard. The
// body is JSON with a `head.signature` field that's a checksum over
// the body using the restaurant's Merchant Key.
//
// Payload shape (relevant fields only):
//   {
//     "head": {
//       "signature": "<base64-encoded-checksum>",
//       "version":   "v1"
//     },
//     "body": {
//       "merchantId":   "ABC123",
//       "orderId":      "order_xxx",
//       "txnId":        "20260516111212800110168627800012345",
//       "txnAmount":    "505.00",
//       "paymentMode":  "UPI",
//       "vpa":          "customer@okhdfcbank",
//       "responseCode": "01",            // 01 = success
//       "status":       "TXN_SUCCESS",
//       "txnDate":      "2026-05-16 19:14:18.0",
//       "comments":     "Order-4F2A3B",  // we set this if we initiated
//                                        // — otherwise empty
//     }
//   }
//
// Paytm signature verification uses Paytm's proprietary AES-CBC +
// SHA256 checksum format. We delegate to the official `paytmchecksum`
// npm package (added May 16, 2026) which implements exactly what
// Paytm's dashboards expect. The package's `verifySignature` returns
// a Promise<boolean> — we await it.
//
// All Paytm Business UPI receipts have responseCode === '01' AND
// status === 'TXN_SUCCESS' on success; refunds and failures use
// different codes which we don't act on here.

import PaytmChecksum from 'paytmchecksum';

async function verifySignature(body, secret) {
  const sig = body?.head?.signature;
  if (!sig || !body?.body) return false;
  try {
    // The package expects the SIGNATURE to be passed separately and
    // the remaining body (after removing `head.signature`) as the
    // payload. Paytm's spec: checksum is computed over the body
    // object's JSON-stringified form.
    const payload = JSON.stringify(body.body);
    return await PaytmChecksum.verifySignature(payload, secret, sig);
  } catch (e) {
    console.error('[autoconfirm:paytm] signature verify failed:', e?.message);
    return false;
  }
}

export async function parseWebhook({ headers, rawBody, secret }) {
  if (!secret) return null;
  let body;
  try {
    body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
  } catch {
    return null;
  }

  // verifySignature is now async (paytmchecksum returns a Promise).
  if (!(await verifySignature(body, secret))) return null;

  const b = body.body || {};
  // Only act on successful UPI receipts.
  if (b.status !== 'TXN_SUCCESS') return null;
  if (b.paymentMode && b.paymentMode !== 'UPI') return null;

  const amount = Number(b.txnAmount);
  if (!isFinite(amount) || amount <= 0) return null;

  // The txn reference lives in `comments` when we initiated the
  // transaction. For direct soundbox receipts (customer scanned the
  // QR sticker / used the merchant VPA directly), `comments` is
  // empty — fall back to `orderId` (Paytm's, not ours) or null.
  const txnRef = b.comments || b.orderId || null;

  return {
    provider:      'paytm',
    amount,                                  // rupees, float (string-parsed)
    payerVpa:      b.vpa || null,
    txnRef,
    providerTxnId: b.txnId || null,          // Paytm's internal txn id
  };
}
