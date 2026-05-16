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
// IMPORTANT — Paytm signature verification:
//   Paytm uses a proprietary AES-CBC + SHA256 checksum format that
//   needs their `paytmchecksum` npm package (or a manual port). To
//   keep this codebase free of extra deps we use a SIMPLIFIED check:
//   HMAC-SHA256(JSON.stringify(body.body), merchantKey) ===
//   head.signature. This works ONLY if the restaurant is using a
//   custom Paytm setup that's configured to send HMAC signatures
//   (which Paytm Business supports as an alternative). For the
//   default Paytm checksum format, install `paytmchecksum` and
//   replace the body of verifySignature() below — the rest of the
//   parser stays the same.
//
// All Paytm Business UPI receipts have responseCode === '01' AND
// status === 'TXN_SUCCESS' on success; refunds and failures use
// different codes which we don't act on here.

import crypto from 'crypto';

function verifySignature(body, secret) {
  const sig = body?.head?.signature;
  if (!sig || !body?.body) return false;
  try {
    // [SIMPLIFIED] HMAC-SHA256 of the JSON-stringified body.body.
    // Replace with PaytmChecksum.verifySignature() if using Paytm's
    // default checksum format. See header comment above.
    const expected = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(body.body))
      .digest('base64');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(String(sig), 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (e) {
    console.error('[autoconfirm:paytm] signature verify failed:', e?.message);
    return false;
  }
}

export function parseWebhook({ headers, rawBody, secret }) {
  if (!secret) return null;
  let body;
  try {
    body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
  } catch {
    return null;
  }

  if (!verifySignature(body, secret)) return null;

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
