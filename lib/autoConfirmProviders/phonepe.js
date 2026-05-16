// lib/autoConfirmProviders/phonepe.js
// =====================================================================
// PhonePe Business merchant webhook parser for auto-confirm UPI.
//
// PhonePe Business sends a webhook to the URL configured in their
// merchant dashboard whenever a customer payment completes. The body
// is a single JSON object with a base64-encoded `response` field; the
// `X-VERIFY` header carries the SHA256 signature.
//
// X-VERIFY format:
//   sha256(base64Response + saltKey) + "###" + saltIndex
//
// We recompute that on our side and compare constant-time.
//
// Payload shape (after base64-decoding `response`):
//   {
//     "success":           true,
//     "code":              "PAYMENT_SUCCESS",
//     "message":           "Your payment is successful.",
//     "data": {
//       "merchantId":           "MERCHANTUAT",
//       "merchantTransactionId":"M1234567890",
//       "transactionId":        "T2026051619141800012345",
//       "amount":               50500,            // in paise
//       "state":                "COMPLETED",
//       "responseCode":         "SUCCESS",
//       "paymentInstrument": {
//         "type":               "UPI",
//         "utr":                "200120342134",   // bank reference
//         "upiTransactionId":   "UPI-XXX",
//         "vpa":                "customer@okhdfcbank"
//       }
//     }
//   }
//
// The txn reference (Order-XXXX) for PhonePe goes into the
// `merchantTransactionId` field when we initiate. For direct receipts
// to the merchant VPA, merchantTransactionId is auto-generated and
// doesn't contain our reference — we fall back to amount+time matching.

import crypto from 'crypto';

export function parseWebhook({ headers, rawBody, secret, saltIndex = '1' }) {
  if (!secret) return null;
  const verifyHeader = headers['x-verify'] || headers['X-VERIFY'];
  if (!verifyHeader) return null;

  let outerBody;
  try {
    outerBody = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
  } catch {
    return null;
  }

  const b64 = outerBody?.response;
  if (!b64 || typeof b64 !== 'string') return null;

  // 1. Verify signature. PhonePe's spec: sha256(base64 + saltKey) + "###" + saltIndex.
  try {
    const expected = crypto.createHash('sha256').update(b64 + secret).digest('hex') + '###' + saltIndex;
    const a = Buffer.from(expected, 'utf8');
    const c = Buffer.from(String(verifyHeader), 'utf8');
    if (a.length !== c.length || !crypto.timingSafeEqual(a, c)) return null;
  } catch (e) {
    console.error('[autoconfirm:phonepe] signature verify failed:', e?.message);
    return null;
  }

  // 2. Decode the inner payload.
  let inner;
  try {
    inner = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch {
    return null;
  }

  if (!inner?.success) return null;
  if (inner.code !== 'PAYMENT_SUCCESS') return null;

  const d = inner.data || {};
  if (d.state !== 'COMPLETED') return null;
  const pi = d.paymentInstrument || {};
  if (pi.type && pi.type !== 'UPI') return null;

  // 3. PhonePe amounts in paise → rupees.
  const amount = Math.round(Number(d.amount) || 0) / 100;
  if (amount <= 0) return null;

  // 4. Reference — merchantTransactionId carries our Order-XXXX when
  //    we initiated; for unsolicited receipts it's auto-generated.
  const txnRef = d.merchantTransactionId || null;

  return {
    provider:      'phonepe',
    amount,
    payerVpa:      pi.vpa || null,
    txnRef,
    providerTxnId: d.transactionId || pi.upiTransactionId || pi.utr || null,
  };
}
