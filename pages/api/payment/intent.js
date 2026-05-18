// pages/api/payment/intent.js
// Phase H/I/J — Create a payment intent at the restaurant's gateway.
//
// Customer flow:
//   1. Customer taps UPI/Card on the bill modal
//   2. Frontend POSTs { restaurantId, orderIds: [...] }
//      - takeaway = single-order bill, orderIds has one entry
//      - dine-in running bill = multiple orders sharing one billId
//   3. We sum the orders' totals server-side (so the customer can't
//      inflate or deflate the amount), build the gateway request,
//      stamp gatewayProviderTxnId on EVERY listed order, and return
//      { paymentUrl } or { qrPayload }
//   4. Frontend opens the URL or renders the QR; customer pays
//   5. Gateway calls /api/payment/webhook, which finds ALL orders
//      with the same providerTxnId and marks them all paid_online
//   6. Frontend's Firestore listener flips bill modal to "Payment Confirmed"
//
// Falls back gracefully to the manual flow when gateway isn't
// configured: returns 409 with code GATEWAY_NOT_CONFIGURED so the
// frontend can use its existing manual `online_requested` path.
//
// Phase 3 hardening (H5, 16 May 2026): this endpoint is necessarily
// anonymous (customer page has no Firebase Auth), so abuse prevention
// is done via three layers:
//   1. IP rate limit  (20 req / 60s / IP)  — catches single-host spam
//   2. RID rate limit (120 req / 60s / restaurant) — catches distributed spam
//   3. Order eligibility — only orders that are recent (<6h old),
//      not cancelled, and in a pre-payment status can be intent'd.
// Pre-hardening, an attacker who guessed restaurantId+orderId could
// repeatedly stamp gatewayProviderTxnId, exhaust the restaurant's
// Razorpay rate quota, or spam intent creation on cancelled orders.

import crypto from 'crypto';
import { adminDb } from '../../../lib/firebaseAdmin';
import admin from 'firebase-admin';
import { createPaymentIntent, getGatewayConfig, isGatewayActive } from '../../../lib/gateway';
import { checkRateLimit, getClientIp } from '../../../lib/rateLimit';

const PAID = ['paid_cash', 'paid_card', 'paid_online', 'paid'];
// H8 (16 May 2026): idempotency cache window. If the same set of
// orderIds (+ optional vpa/preferredApp) is requested again within
// this many ms, we return the previously-created intent instead of
// asking the gateway for a new one. Covers double-click, browser
// retry, and accidental re-submits without blocking the user if the
// first intent genuinely failed (they can try again after the window).
const INTENT_DEDUP_WINDOW_MS = 60 * 1000;

// Build a deterministic dedup key from the request inputs. Sorting
// the ids first makes [a,b] and [b,a] hash identically, which matches
// the gateway semantics — the same bill should yield the same intent.
function buildIntentDedupKey({ restaurantId, ids, vpa, preferredApp }) {
  const payload = JSON.stringify({
    rid: restaurantId,
    ids: [...ids].sort(),
    vpa: vpa ? String(vpa).trim().toLowerCase() : '',
    preferredApp: preferredApp || '',
  });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32);
}
// Orders must be in one of these payment states to be eligible for a
// new gateway intent. Excludes paid_* (would double-charge), refunded,
// or any unknown future state. Mirrors the customer page's request
// states (see lib/db.js cancelOrder + markCashRequested etc.).
const INTENT_ELIGIBLE_PAYMENT_STATES = ['unpaid', 'online_requested', 'cash_requested', 'card_requested'];
const MAX_ORDER_AGE_MS = 6 * 60 * 60 * 1000; // 6h — gateway flows close within minutes; >6h is almost certainly an attacker

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { restaurantId, orderId, orderIds, vpa, preferredApp } = req.body || {};
  if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });

  // Accept either { orderId } (legacy / takeaway) or { orderIds } (bill).
  const ids = Array.isArray(orderIds) && orderIds.length > 0
    ? orderIds
    : (orderId ? [orderId] : []);
  if (ids.length === 0) return res.status(400).json({ error: 'orderId(s) is required' });

  // ── H5: rate limit per IP and per restaurantId ─────────────────────
  // Both buckets fire so a distributed attack against one restaurant
  // still trips the RID bucket once aggregate volume exceeds 120/min.
  // Both fail-open if Firestore is down (see lib/rateLimit.js).
  const ip = getClientIp(req);
  if (ip) {
    const ipLimit = await checkRateLimit(`payment_intent_ip_${ip}`, 20, 60);
    if (!ipLimit.ok) {
      res.setHeader('Retry-After', String(ipLimit.waitSec));
      return res.status(429).json({
        error: 'Too many payment requests. Try again in a moment.',
        retryAfterSec: ipLimit.waitSec,
      });
    }
  }
  const ridLimit = await checkRateLimit(`payment_intent_rid_${restaurantId}`, 120, 60);
  if (!ridLimit.ok) {
    res.setHeader('Retry-After', String(ridLimit.waitSec));
    return res.status(429).json({
      error: 'Restaurant payment rate limit reached. Try again shortly.',
      retryAfterSec: ridLimit.waitSec,
    });
  }

  try {
    // Read every order. We trust nothing from the body except the ids.
    const orderDocs = await Promise.all(
      ids.map(id => adminDb.doc(`restaurants/${restaurantId}/orders/${id}`).get())
    );
    const missing = orderDocs.filter(d => !d.exists);
    if (missing.length) return res.status(404).json({ error: 'One or more orders not found' });

    const orders = orderDocs.map(d => ({ id: d.id, ...d.data() }));

    // Refuse if any of the orders is already in a paid state — would
    // be a double-charge.
    if (orders.some(o => PAID.includes(o.paymentStatus))) {
      return res.status(409).json({ error: 'One of the orders is already paid' });
    }

    // ── H5: order eligibility checks ────────────────────────────────
    // (a) Reject orders that have been cancelled — their paymentStatus
    //     was reset to 'unpaid' by cancelOrder() but they should not
    //     accept new payments.
    const cancelled = orders.filter(o => o.status === 'cancelled');
    if (cancelled.length) {
      return res.status(409).json({ error: 'One or more orders are cancelled.' });
    }
    // (b) Only allow payment-request states (excludes refunded /
    //     unknown future states). The PAID check above already
    //     covered paid_*; this is the positive allowlist counterpart.
    const ineligible = orders.filter(o => !INTENT_ELIGIBLE_PAYMENT_STATES.includes(o.paymentStatus));
    if (ineligible.length) {
      return res.status(409).json({ error: 'One or more orders are not eligible for online payment.' });
    }
    // (c) Reject orders older than MAX_ORDER_AGE_MS. Real customer
    //     flows complete within minutes; anything > 6h is almost
    //     certainly an attacker enumerating old IDs. We use the
    //     Firestore Timestamp's toMillis() when available; skip the
    //     check if no createdAt (defensive — won't false-positive
    //     legacy orders without timestamps).
    const now = Date.now();
    const tooOld = orders.filter(o => {
      const createdMs = o.createdAt?.toMillis?.() ??
        (o.createdAt?._seconds ? o.createdAt._seconds * 1000 : null);
      if (!createdMs) return false;
      return (now - createdMs) > MAX_ORDER_AGE_MS;
    });
    if (tooOld.length) {
      return res.status(409).json({ error: 'Order is too old for online payment. Please place a fresh order.' });
    }

    // Sum the totals server-side.
    const totalAmount = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    if (totalAmount <= 0) return res.status(400).json({ error: 'Order total is zero or invalid' });

    // ── H8: idempotency cache lookup ────────────────────────────────
    // If this exact request (same rid + sorted ids + vpa + preferredApp)
    // was served < INTENT_DEDUP_WINDOW_MS ago, return the cached
    // intent. Avoids burning a fresh gateway intent on double-click /
    // browser retry / network blip retries.
    const dedupKey = buildIntentDedupKey({ restaurantId, ids, vpa, preferredApp });
    const cacheRef = adminDb.doc(`restaurants/${restaurantId}/paymentIntents/${dedupKey}`);
    try {
      const cacheSnap = await cacheRef.get();
      if (cacheSnap.exists) {
        const cached = cacheSnap.data();
        const cachedAtMs = cached?.createdAt?.toMillis?.() ?? 0;
        if (cachedAtMs && (now - cachedAtMs) < INTENT_DEDUP_WINDOW_MS) {
          return res.status(200).json({
            ok: true,
            providerTransactionId: cached.providerTransactionId,
            paymentUrl: cached.paymentUrl || null,
            qrPayload:  cached.qrPayload  || null,
            totalAmount: cached.totalAmount,
            cached: true,
          });
        }
      }
    } catch (e) {
      // Cache miss / Firestore blip — fall through and create a fresh
      // intent. Idempotency is a "nice to have", not a correctness
      // requirement (the gateway tolerates duplicate intents on
      // distinct merchantOrderIds).
      console.warn('[intent] dedup cache read failed:', e?.message || e);
    }

    // Look up the restaurant's subdomain so we can build a return URL.
    const restSnap = await adminDb.doc(`restaurants/${restaurantId}`).get();
    const subdomain = restSnap.exists ? restSnap.data()?.subdomain : '';

    // Synthesize a "bill order" for the gateway — total comes from
    // the sum, items come from the union, id is the first order so
    // single-order callers (takeaway) get the same provider txn id
    // shape they always have. The optional `vpa` (VPA-collect input)
    // and `preferredApp` (UPI app picker hint) ride along so providers
    // that support them can use them; ones that don't, ignore.
    const billOrder = {
      ...orders[0],
      id: orders[0].id,
      total: totalAmount,
      items: orders.flatMap(o => o.items || []),
      subdomain,
      vpa: vpa ? String(vpa).trim().toLowerCase() : null,
      preferredApp: preferredApp || null,
    };

    const intent = await createPaymentIntent(restaurantId, billOrder);

    // Stamp providerTxnId on EVERY order so the webhook can find
    // them all when payment lands. We do this AFTER createPaymentIntent
    // (which already stamped the first order); we extend the stamp to
    // the rest using a single batched write.
    if (intent?.providerTransactionId && ids.length > 1) {
      const batch = adminDb.batch();
      for (const id of ids) {
        if (id === orders[0].id) continue; // already stamped by createPaymentIntent
        batch.update(adminDb.doc(`restaurants/${restaurantId}/orders/${id}`), {
          gatewayProviderTxnId: intent.providerTransactionId,
          gatewayCreatedAt: new Date().toISOString(),
        });
      }
      await batch.commit().catch(e => console.warn('[intent] batch stamp failed:', e?.message));
    }

    // ── H8: write to dedup cache so the next identical request within
    // INTENT_DEDUP_WINDOW_MS short-circuits. Best-effort; if it fails
    // we still return success — caller already got the intent.
    if (intent?.providerTransactionId) {
      cacheRef.set({
        providerTransactionId: intent.providerTransactionId,
        paymentUrl: intent.paymentUrl || null,
        qrPayload:  intent.qrPayload  || null,
        totalAmount,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        orderIds: [...ids].sort(),
      }).catch(e => console.warn('[intent] dedup cache write failed:', e?.message || e));
    }

    return res.status(200).json({
      ok: true,
      providerTransactionId: intent.providerTransactionId,
      paymentUrl: intent.paymentUrl || null,
      qrPayload:  intent.qrPayload  || null,
      totalAmount,
    });
  } catch (err) {
    if (err?.code === 'GATEWAY_NOT_CONFIGURED') {
      return res.status(409).json({ error: 'GATEWAY_NOT_CONFIGURED' });
    }
    if (err?.code === 'PAYTM_CREDENTIALS_MISSING') {
      return res.status(409).json({ error: 'PAYTM_CREDENTIALS_MISSING' });
    }
    if (err?.code === 'RAZORPAY_CREDENTIALS_MISSING') {
      return res.status(409).json({ error: 'RAZORPAY_CREDENTIALS_MISSING' });
    }
    if (err?.code === 'RAZORPAY_ORDER_CREATE_FAILED') {
      return res.status(502).json({ error: err.message || 'RAZORPAY_ORDER_CREATE_FAILED' });
    }
    console.error('[/api/payment/intent] failed:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
