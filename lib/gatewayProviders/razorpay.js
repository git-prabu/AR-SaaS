// lib/gatewayProviders/razorpay.js — Razorpay Checkout gateway provider
// ======================================================================
//
// Razorpay's Standard Checkout flow:
//
//   1. Server creates a Razorpay Order via `razorpay.orders.create()`
//      with the bill amount (in paise) — gets back an order_id
//   2. Server returns { razorpayOrderId, razorpayKeyId, amount } to client
//   3. Client opens Razorpay Checkout via the Razorpay JS SDK using
//      those values + a `prefill.method = 'upi'` hint so the picker
//      lands directly on UPI
//   4. After payment, Razorpay posts to our webhook with an HMAC-SHA256
//      signature header (`x-razorpay-signature`)
//   5. Webhook verifies the signature using the Webhook Secret, then
//      marks the order paid via the existing markOrderPaid path
//
// Two pieces of credentials live on the per-restaurant config:
//   - keyId       (public, e.g. `rzp_test_XXXX` or `rzp_live_XXXX`)
//   - keySecret   (private, used for order creation auth)
//   - webhookSecret (private, used for webhook signature verification)
//
// They live in `restaurants/{rid}/private/gateway` (server-only — never
// exposed to the public customer page) and are pasted by the restaurant
// admin via /admin/gateway → Razorpay tab.
//
// PLACEHOLDER MODE — When the keys aren't filled in (or look like
// obvious placeholders), we throw RAZORPAY_CREDENTIALS_MISSING so the
// customer-facing flow falls through to the manual UPI deep-link path
// (the restaurant's own UPI ID, if set) instead of dead-ending. The
// admin sees a "Add credentials to enable" notice on /admin/gateway.

import Razorpay from 'razorpay';
import crypto from 'crypto';

// What "looks like a real key" — Razorpay key IDs start with rzp_test_
// or rzp_live_ followed by 14 alphanumerics. Anything shorter or with
// the literal "PLACEHOLDER" / "REPLACE" text is treated as not yet set.
function looksLikeRealKey(key) {
  if (typeof key !== 'string') return false;
  const k = key.trim();
  if (k.length < 20) return false;
  if (/PLACEHOLDER|REPLACE|YOUR_KEY/i.test(k)) return false;
  return /^rzp_(test|live)_[A-Za-z0-9]+$/.test(k);
}

// ============================================================
// createIntent — called when customer taps a UPI app on the bill modal
// ============================================================
//
// Inputs (from lib/gateway.js):
//   { config, order, webhookUrl, returnUrl }
//
//   config: {
//     provider: 'razorpay',
//     razorpay: { keyId, keySecret, webhookSecret }
//   }
//   order: the Firestore order doc (must have id + total)
//
// Returns:
//   {
//     providerTransactionId: 'AR-{orderId}-{timestamp}',
//     paymentUrl: 'https://...checkout-host.../{orderId}',
//     // (We host a thin checkout page that loads Razorpay's JS SDK and
//     //  fires Razorpay.open() — Razorpay's flow is modal-based not
//     //  URL-based, so we wrap it in a page the customer can be sent to.)
//   }
export async function createIntent({ config, order, webhookUrl, returnUrl }) {
  const cfg = config?.razorpay || {};
  if (!looksLikeRealKey(cfg.keyId) || !cfg.keySecret || cfg.keySecret.length < 20) {
    const err = new Error('RAZORPAY_CREDENTIALS_MISSING');
    err.code = 'RAZORPAY_CREDENTIALS_MISSING';
    throw err;
  }

  // Razorpay amounts are in PAISE (1 INR = 100 paise) — convert + round.
  const amountPaise = Math.max(100, Math.round(Number(order.total || 0) * 100));
  const providerTransactionId = `AR-${order.id}-${Date.now()}`;

  const razorpay = new Razorpay({
    key_id:     cfg.keyId,
    key_secret: cfg.keySecret,
  });

  // Razorpay receipt is capped at 40 chars — trim our txn id to fit.
  const receipt = providerTransactionId.slice(0, 40);

  let rzpOrder;
  try {
    rzpOrder = await razorpay.orders.create({
      amount:   amountPaise,
      currency: 'INR',
      receipt,
      notes: {
        orderId:    order.id,
        restaurantSubdomain: order.subdomain || '',
        webhookUrl,
        returnUrl,
      },
    });
  } catch (e) {
    const description = e?.error?.description || e?.message || 'Razorpay order creation failed';
    console.error('[razorpay] order creation failed:', description);
    const err = new Error('RAZORPAY_ORDER_CREATE_FAILED: ' + description);
    err.code = 'RAZORPAY_ORDER_CREATE_FAILED';
    throw err;
  }

  // Build a payment URL that points at our hosted checkout page (the
  // page itself loads Razorpay's JS SDK and invokes the modal). Encoded
  // params let the page reconstruct the order without an extra round
  // trip to our server.
  const origin = process.env.NEXT_PUBLIC_SITE_URL
    || process.env.SITE_URL
    || '';
  const params = new URLSearchParams({
    rzpOrderId:  rzpOrder.id,
    keyId:       cfg.keyId,
    amount:      String(amountPaise),
    name:        order.subdomain || 'Restaurant',
    description: 'Order #' + (order.id || '').slice(-6).toUpperCase(),
    returnUrl,
  });
  const paymentUrl = `${origin}/pay/razorpay?${params.toString()}`;

  return {
    providerTransactionId,
    paymentUrl,
    razorpayOrderId: rzpOrder.id,
  };
}

// ============================================================
// verifyWebhook — called from /api/payment/webhook on Razorpay's POST
// ============================================================
//
// Razorpay sends `x-razorpay-signature` = HMAC-SHA256(rawBody, webhookSecret).
// We recompute and timingSafeEqual; on match, parse the body and surface
// a normalized event the rest of our system understands.
//
// Returns one of:
//   { orderId, paymentStatus: 'paid_online', providerRef }
//   { orderId, paymentStatus: 'payment_issue', providerRef }
//   null  (signature failed OR event we don't act on)
export async function verifyWebhook({ config, headers, rawBody }) {
  const cfg = config?.razorpay || {};
  if (!cfg.webhookSecret) return null;

  const sig = headers['x-razorpay-signature'] || headers['X-Razorpay-Signature'];
  if (!sig) return null;

  let body;
  try {
    const bodyStr = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
    const expected = crypto.createHmac('sha256', cfg.webhookSecret).update(bodyStr).digest('hex');
    // Constant-time compare to thwart signature-timing attacks.
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
    body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
  } catch (e) {
    console.error('[razorpay] webhook signature verify failed:', e?.message);
    return null;
  }

  // Razorpay events we care about:
  //   payment.captured  → success (auto-captured by Razorpay)
  //   payment.failed    → failure
  // Everything else (refund.*, order.paid duplicates, etc.) → ignored.
  const event = body?.event;
  const payment = body?.payload?.payment?.entity;
  if (!event || !payment) return null;

  // The order id we stamped is in payment.notes.orderId (passed via
  // razorpay.orders.create({ notes }) in createIntent).
  const orderId = payment.notes?.orderId || null;
  if (!orderId) return null;

  if (event === 'payment.captured') {
    return {
      orderId,
      paymentStatus: 'paid_online',
      providerRef: payment.id || null,
    };
  }
  if (event === 'payment.failed') {
    return {
      orderId,
      paymentStatus: 'payment_issue',
      providerRef: payment.id || null,
    };
  }
  return null;
}
