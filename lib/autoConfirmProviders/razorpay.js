// lib/autoConfirmProviders/razorpay.js
// =====================================================================
// Razorpay merchant webhook parser for auto-confirm UPI.
//
// Razorpay's webhook for `payment.captured` events fires whenever a
// customer payment completes. We verify the HMAC-SHA256 signature
// (header `x-razorpay-signature`) against the webhook secret the
// restaurant pasted in /admin/gateway → Auto-Confirm UPI → Razorpay.
//
// Payload shape (relevant fields only):
//   {
//     "event": "payment.captured",
//     "payload": {
//       "payment": {
//         "entity": {
//           "id":      "pay_xxx",
//           "amount":  50500,             // in paise
//           "method":  "upi",
//           "vpa":     "customer@okicici",
//           "notes":   { ... }             // we set notes.txnRef when creating
//         }
//       }
//     }
//   }
//
// The txn reference (Order-XXXX / Bill-XXXX) is only present when the
// customer used our flow that created a Razorpay Order with `notes`.
// For raw direct-VPA payments (customer typed restaurant's VPA into
// their own GPay), there's no Razorpay payment at all — Razorpay only
// sees money it processes. This is the limitation of using Razorpay
// for auto-confirm: it only confirms payments that went through their
// platform. For purely direct UPI, Paytm/PhonePe merchant accounts
// are required (their webhook fires on every incoming UPI to the
// merchant's VPA).

import crypto from 'crypto';

export function parseWebhook({ headers, rawBody, secret }) {
  if (!secret) return null;
  const sig = headers['x-razorpay-signature'] || headers['X-Razorpay-Signature'];
  if (!sig) return null;

  // 1. Verify HMAC-SHA256(rawBody, secret) === sig (constant-time).
  let body;
  try {
    const bodyStr = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
    const expected = crypto.createHmac('sha256', secret).update(bodyStr).digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(String(sig), 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
  } catch (e) {
    console.error('[autoconfirm:razorpay] signature verify failed:', e?.message);
    return null;
  }

  // 2. We act on payment.captured. Everything else is a no-op (refund
  //    events go a different way; failed payments don't auto-confirm
  //    anything — they leave the order pending).
  if (body?.event !== 'payment.captured') return null;
  const p = body?.payload?.payment?.entity;
  if (!p || p.method !== 'upi') return null;

  // 3. Razorpay amounts are in paise → rupees for matching.
  const amount = Math.round(Number(p.amount) || 0) / 100;
  if (amount <= 0) return null;

  // 4. The txn note can live in two places depending on which Razorpay
  //    flow the order came from — `notes.txnRef` (we set this in
  //    createIntent), or `description` for direct Smart Collect.
  const txnRef = p.notes?.txnRef
    || p.notes?.orderId
    || p.description
    || p.acquirer_data?.upi_transaction_id
    || null;

  return {
    provider:      'razorpay',
    amount,                                  // rupees, float
    payerVpa:      p.vpa || null,
    txnRef,                                  // free-form note string
    providerTxnId: p.id || null,             // 'pay_xxx' — used for idempotency
  };
}
