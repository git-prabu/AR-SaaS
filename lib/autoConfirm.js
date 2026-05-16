// lib/autoConfirm.js
// =====================================================================
// Auto-confirm UPI shared matcher + order-paid logic.
//
// The plan (per Prabu's product decision May 16):
//   * Restaurant keeps using their EXISTING Paytm Business / PhonePe
//     Business / Razorpay merchant account (the same one their soundbox
//     is connected to). Money still flows directly customer-bank →
//     restaurant-bank — we don't route or take a cut.
//   * That merchant account fires a webhook on every incoming UPI
//     payment. We receive it at /api/auto-confirm/[provider]?rid=X.
//   * The provider module (lib/autoConfirmProviders/*) verifies the
//     signature for that provider and parses out:
//        { amount, payerVpa, txnRef, providerTxnId }
//   * This module then matches the incoming payment to a pending order
//     and flips its paymentStatus to paid_online (same status the
//     existing gateway webhook uses, so all downstream behaviour — auto
//     close bill, release awaiting-payment, send receipt — comes for
//     free without any code changes).
//
// Matching strategy (single-payment v1, no split-pay):
//   Stage 1 — Reference match (rock-solid)
//     Look for "Order-XXXXXX" or "Bill-XXXXXX" in the txnRef. The
//     customer-facing UPI deep link sets `tn=Order-{last6}` (or
//     `tn=Bill-{last6}`) before sending the customer to their UPI
//     app, so the same reference comes back in the webhook for ANY
//     customer who used our flow. Look up an order whose docId ends
//     with those 6 chars in this restaurant; if exactly one match
//     and the amount matches → auto-confirm.
//
//   Stage 2 — Amount + time match (best-effort)
//     For customers who bypassed our deep link (typed the UPI ID into
//     their own GPay), there's no reference. Find pending orders for
//     this restaurant where:
//        paymentStatus ∈ {online_requested, pending, unpaid}
//        total === amount (exact, to the rupee)
//        createdAt within the last 15 minutes
//     If exactly one match → auto-confirm.
//     If zero matches → record an "unmatched" entry (the restaurant
//        might have received a payment that's unrelated to any order;
//        we surface it on /admin/payments so staff sees it).
//     If two+ matches → record a "needsMatch" entry, do NOT auto-
//        confirm; staff picks which order this is for from the
//        /admin/payments unmatched queue.
//
// Idempotency:
//   We stamp every successful auto-confirm with the providerTxnId on
//   the order's gatewayProviderRef field. Before processing a webhook
//   we check whether an order in this restaurant already carries this
//   providerTxnId; if so, we 200 immediately. Stops double-credit when
//   the provider retries.

import admin from 'firebase-admin';
import { adminDb } from './firebaseAdmin';

const PAID = ['paid_cash', 'paid_card', 'paid_online', 'paid'];
// Statuses that are still candidates for auto-confirm. Pending +
// online_requested cover both "customer hasn't tapped Pay yet" (rare —
// they'd have to have paid manually) and "customer tapped I've paid".
const MATCHABLE = ['unpaid', 'pending', 'online_requested'];

// 15 minute window for amount+time fallback. Tight enough that a
// random unrelated transfer doesn't get auto-confirmed; loose enough
// that a customer who paid late (slow UPI app, redirect dance) still
// gets matched.
const TIME_WINDOW_MS = 15 * 60 * 1000;

// Try to extract a short order/bill reference from a free-form txn
// note. UPI providers may URL-decode, trim, or pass through as-is —
// the regex tolerates any of these. Pulls the last group of 4-8
// hex chars after Order/Bill (case-insensitive, hyphen or space).
function extractRef(txnNote) {
  if (!txnNote || typeof txnNote !== 'string') return null;
  const m = txnNote.match(/(order|bill)[\s\-_:]*([A-F0-9]{4,12})/i);
  if (!m) return null;
  return {
    kind: m[1].toLowerCase(),   // 'order' | 'bill'
    code: m[2].toUpperCase(),    // e.g. '4F2A3B'
  };
}

// Find an order in this restaurant whose docId ENDS WITH the given
// short code. We can't do a "ends-with" query in Firestore directly,
// so we scan recent orders. This is O(N) over the last day's orders
// for one restaurant — fine for any plausible scale.
async function findByRef(restaurantId, ref) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sinceTs = admin.firestore.Timestamp.fromDate(since);

  if (ref.kind === 'bill') {
    // Bill match: look up orders sharing the billId whose id ends with
    // the code. We don't have a billId index by suffix either, so we
    // scan recent unpaid orders and filter.
    const snap = await adminDb
      .collection(`restaurants/${restaurantId}/orders`)
      .where('createdAt', '>=', sinceTs)
      .get();
    const billId = snap.docs.find(d => (d.data().billId || '').toUpperCase().endsWith(ref.code))?.data().billId;
    if (!billId) return [];
    return snap.docs.filter(d => d.data().billId === billId);
  }

  // Order match
  const snap = await adminDb
    .collection(`restaurants/${restaurantId}/orders`)
    .where('createdAt', '>=', sinceTs)
    .get();
  return snap.docs.filter(d => d.id.toUpperCase().endsWith(ref.code));
}

// Find orders by exact amount within the time window. Returns docs in
// `MATCHABLE` paymentStatus only — already-paid orders are excluded
// from matching to prevent double-credit on a redundant webhook.
async function findByAmountAndTime(restaurantId, amount) {
  const since = new Date(Date.now() - TIME_WINDOW_MS);
  const sinceTs = admin.firestore.Timestamp.fromDate(since);

  const snap = await adminDb
    .collection(`restaurants/${restaurantId}/orders`)
    .where('total', '==', amount)
    .where('createdAt', '>=', sinceTs)
    .get();

  return snap.docs.filter(d => MATCHABLE.includes(d.data().paymentStatus));
}

// Has this providerTxnId already been recorded against an order in
// this restaurant? If so, skip (idempotency guard for provider retries).
async function alreadyProcessed(restaurantId, providerTxnId) {
  if (!providerTxnId) return false;
  const snap = await adminDb
    .collection(`restaurants/${restaurantId}/orders`)
    .where('gatewayProviderRef', '==', providerTxnId)
    .limit(1)
    .get();
  return !snap.empty;
}

// Mark a batch of orders paid_online + run the side effects (auto-close
// bill, release awaiting-payment, audit-stamp). Mirrors the existing
// gateway webhook flow so the rest of the app behaves identically
// whether the payment came through the gateway or auto-confirm.
async function markOrdersPaid(restaurantId, docs, providerTxnId, payerVpa) {
  if (!docs.length) return { paidCount: 0 };

  const batch = adminDb.batch();
  for (const d of docs) {
    if (PAID.includes(d.data().paymentStatus)) continue;
    batch.update(d.ref, {
      paymentStatus: 'paid_online',
      paymentUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      gatewayWebhookEventAt: admin.firestore.FieldValue.serverTimestamp(),
      gatewayProviderRef: providerTxnId || null,
      autoConfirmPayerVpa: payerVpa || null,
      lastModifiedBy: 'auto-confirm-webhook',
      lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();

  // Side effects (mirror gateway webhook logic).
  for (const d of docs) {
    await releaseAwaitingPaymentIfNeeded(restaurantId, d.id);
  }
  await autoCloseBillIfAllPaid(restaurantId, docs[0].id);

  return { paidCount: docs.length };
}

// Write an unmatched / needs-match entry so staff can surface it on
// /admin/payments and assign the payment to the correct order manually.
// `reason` describes why we didn't auto-confirm.
async function recordUnmatched(restaurantId, parsed, reason, candidateIds = []) {
  try {
    await adminDb
      .collection(`restaurants/${restaurantId}/needsMatch`)
      .add({
        amount:          parsed.amount,
        payerVpa:        parsed.payerVpa || null,
        providerTxnId:   parsed.providerTxnId || null,
        txnRef:          parsed.txnRef || null,
        provider:        parsed.provider || null,
        reason,          // 'no_match' | 'multiple_match' | 'amount_only'
        candidateOrders: candidateIds,
        receivedAt:      admin.firestore.FieldValue.serverTimestamp(),
        resolved:        false,
      });
  } catch (e) {
    console.warn('[auto-confirm] failed to record unmatched payment:', e?.message);
  }
}

// Main entry point — called by /api/auto-confirm/[provider] after the
// provider module has verified + parsed the webhook.
//
// `parsed` shape (from any provider module):
//   { amount, payerVpa?, txnRef?, providerTxnId?, provider }
//
// Returns:
//   { ok: true,  matched: true,  paidCount: N }
//   { ok: true,  matched: false, reason: 'no_match'|'multiple_match'|'amount_only' }
//   (always 200 to the provider so it doesn't retry forever)
export async function autoConfirmPayment(restaurantId, parsed) {
  if (!restaurantId || !parsed || typeof parsed.amount !== 'number') {
    return { ok: false, reason: 'bad_input' };
  }

  // Idempotency: if we've already processed this providerTxnId, skip.
  if (await alreadyProcessed(restaurantId, parsed.providerTxnId)) {
    return { ok: true, matched: true, paidCount: 0, idempotent: true };
  }

  // Stage 1 — Reference match
  const ref = extractRef(parsed.txnRef);
  if (ref) {
    const refDocs = await findByRef(restaurantId, ref);
    const candidates = refDocs.filter(d => MATCHABLE.includes(d.data().paymentStatus));
    // For bill matches we expect MULTIPLE orders sharing the billId —
    // mark them all paid together. For order matches we expect exactly
    // one. Either way, we require the SUM of `total` to equal the
    // received amount (single-payment only, no split-pay in v1).
    if (candidates.length > 0) {
      const totalOwed = candidates.reduce((s, d) => s + (Number(d.data().total) || 0), 0);
      if (Math.abs(totalOwed - parsed.amount) < 0.5) {
        const { paidCount } = await markOrdersPaid(restaurantId, candidates, parsed.providerTxnId, parsed.payerVpa);
        return { ok: true, matched: true, paidCount, via: 'reference' };
      }
      // Reference resolved but amount didn't match — log + fall through
      // to amount-time matching so we don't lose the payment.
      console.warn('[auto-confirm] reference resolved but amount mismatch', {
        ref, totalOwed, paid: parsed.amount,
      });
    }
  }

  // Stage 2 — Amount + time match (fallback)
  const amountDocs = await findByAmountAndTime(restaurantId, parsed.amount);
  if (amountDocs.length === 1) {
    const { paidCount } = await markOrdersPaid(restaurantId, amountDocs, parsed.providerTxnId, parsed.payerVpa);
    return { ok: true, matched: true, paidCount, via: 'amount+time' };
  }

  if (amountDocs.length === 0) {
    await recordUnmatched(restaurantId, parsed, 'no_match');
    return { ok: true, matched: false, reason: 'no_match' };
  }

  // Multiple amount matches — staff has to pick.
  await recordUnmatched(restaurantId, parsed, 'multiple_match', amountDocs.map(d => d.id));
  return { ok: true, matched: false, reason: 'multiple_match', candidates: amountDocs.length };
}

// ─── Side-effect mirrors of lib/db.js (server-side, Admin SDK) ───
// (Copied from pages/api/payment/webhook.js to keep this self-contained.)

async function releaseAwaitingPaymentIfNeeded(restaurantId, orderId) {
  try {
    const ref = adminDb.doc(`restaurants/${restaurantId}/orders/${orderId}`);
    const snap = await ref.get();
    if (snap.exists && snap.data().status === 'awaiting_payment') {
      await ref.update({
        status: 'pending',
        lastModifiedBy: 'auto-confirm-webhook',
        lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  } catch (e) {
    console.warn('[auto-confirm] release-awaiting failed:', e?.message);
  }
}

async function autoCloseBillIfAllPaid(restaurantId, orderId) {
  try {
    const orderRef = adminDb.doc(`restaurants/${restaurantId}/orders/${orderId}`);
    const orderSnap = await orderRef.get();
    const billId = orderSnap.data()?.billId;
    if (!billId) return;

    const siblings = await adminDb.collection(`restaurants/${restaurantId}/orders`)
      .where('billId', '==', billId).get();
    const allPaid = siblings.docs.every(d => PAID.includes(d.data().paymentStatus));
    if (!allPaid) return;

    const billRef = adminDb.doc(`restaurants/${restaurantId}/tableBills/${billId}`);
    const billSnap = await billRef.get();
    if (!billSnap.exists || billSnap.data().status !== 'open') return;

    await billRef.update({
      status: 'closed',
      closedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastModifiedBy: 'auto-confirm-webhook',
      lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const tableNumber = billSnap.data().tableNumber;
    if (tableNumber) {
      await adminDb.doc(`restaurants/${restaurantId}/tableSessions/${tableNumber}`)
        .update({ currentBillId: admin.firestore.FieldValue.delete() })
        .catch(() => {});
    }
  } catch (e) {
    console.warn('[auto-confirm] auto-close failed:', e?.message);
  }
}
