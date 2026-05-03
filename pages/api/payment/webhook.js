// pages/api/payment/webhook.js
// Phase H — Gateway webhook receiver. Each restaurant configures
// this URL in their Paytm dashboard with their RID as a query param:
//
//   https://advertradical.vercel.app/api/payment/webhook?rid=<RID>
//
// The webhook arrives as a server-to-server POST with a checksum.
// We verify the checksum against the merchant key for `rid`, look up
// the original order via gatewayProviderTxnId, and call markOrderPaid
// using the Admin SDK (which fires _releaseAwaitingPaymentIfNeeded
// + _autoCloseBillIfAllPaid via the equivalent server-side path).
//
// Critical security points:
//   - We refuse to process an event whose checksum doesn't verify.
//     Without this, anyone who knows a restaurant's RID can forge
//     a "paid" event by POSTing to this URL.
//   - We always reply 200 once we've persisted the result so the
//     gateway doesn't keep retrying (Paytm retries up to 5 times).
//   - We refuse to MOVE an already-paid order to a different paid
//     state. Once paid_*, no idempotent webhook reruns can change
//     it (prevents double-credit on retry).
//
// We disable Next.js body parsing so we can read the raw body for
// signature verification — checksums are computed over the exact
// bytes the gateway sent.

import { adminDb } from '../../../lib/firebaseAdmin';
import admin from 'firebase-admin';
import { verifyWebhookAndExtractEvent } from '../../../lib/gateway';
import { sendReceiptForOrder } from '../../../lib/email';

export const config = { api: { bodyParser: false } };

// Read the raw request body as a string. Needed because we hash it
// for signature verification and the body parser would mutate it.
async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const PAID = ['paid_cash', 'paid_card', 'paid_online', 'paid'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const restaurantId = req.query?.rid;
  if (!restaurantId) {
    console.warn('[webhook] missing rid query param');
    return res.status(400).send('Missing rid');
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (e) {
    console.error('[webhook] body read failed:', e?.message);
    return res.status(400).send('Bad body');
  }

  const event = await verifyWebhookAndExtractEvent(restaurantId, req.headers, rawBody);
  if (!event) {
    // Event was unverified or not actionable. We respond 400 instead
    // of silently 200 so the gateway retries — this also makes bad
    // configs / signature mismatches loud during testing.
    return res.status(400).send('Invalid or unverified event');
  }

  try {
    // Find ALL orders that share this providerTxnId. For dine-in
    // running bills the customer pays one combined total but each
    // individual order needs its own paymentStatus flipped. The
    // intent endpoint stamped every order in the bill with the
    // same providerTxnId for exactly this reason.
    const ordersCol = adminDb.collection(`restaurants/${restaurantId}/orders`);
    const matching = await ordersCol
      .where('gatewayProviderTxnId', '==', event.providerTransactionId)
      .get();

    if (matching.empty) {
      console.warn('[webhook] no orders matching providerTxnId', event.providerTransactionId);
      // 200 anyway so the gateway doesn't keep retrying.
      return res.status(200).send('No matching orders');
    }

    // Idempotency: skip orders already in a paid_* state.
    const updates = matching.docs.filter(d => !PAID.includes(d.data().paymentStatus));
    if (updates.length === 0) {
      return res.status(200).send('Already paid');
    }

    const batch = adminDb.batch();
    for (const d of updates) {
      batch.update(d.ref, {
        paymentStatus: event.paymentStatus,
        paymentUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        gatewayWebhookEventAt: admin.firestore.FieldValue.serverTimestamp(),
        gatewayProviderRef: event.providerRef || null,
        lastModifiedBy: 'gateway-webhook',
        lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();

    // For each just-paid order, release awaiting-payment if it was
    // takeaway-pay-first, and auto-close the bill if it was the last
    // unpaid sibling. Both are best-effort — if they fail the order
    // is still marked paid.
    if (PAID.includes(event.paymentStatus)) {
      for (const d of updates) {
        await releaseAwaitingPaymentIfNeeded(restaurantId, d.id);
      }
      // Auto-close runs once per unique billId since they all share
      // the same bill. Pass any one of the orders.
      await autoCloseBillIfAllPaid(restaurantId, updates[0].id);

      // Phase M — fire payment-confirmation receipt emails for each
      // just-paid order whose customer shared an email. Idempotent
      // (sendReceiptForOrder skips if already-sent / no-email), so a
      // gateway retry doesn't double-send. Best-effort: a Gmail SMTP
      // outage shouldn't fail the webhook + cause Paytm to retry.
      // Run in parallel since each is independent.
      Promise.all(updates.map(d =>
        sendReceiptForOrder(restaurantId, d.id).catch(err => {
          console.warn('[webhook] receipt email failed for', d.id, ':', err?.message);
        })
      )).catch(() => { /* swallowed — see per-order .catch above */ });
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('[webhook] processing failed:', err);
    // 5xx so the gateway retries.
    return res.status(500).send('Processing failed');
  }
}

// Server-side mirror of lib/db.js _releaseAwaitingPaymentIfNeeded.
// Lifts a takeaway order from `awaiting_payment` to `pending` so
// the kitchen can start it.
async function releaseAwaitingPaymentIfNeeded(restaurantId, orderId) {
  try {
    const ref = adminDb.doc(`restaurants/${restaurantId}/orders/${orderId}`);
    const snap = await ref.get();
    if (snap.exists && snap.data().status === 'awaiting_payment') {
      await ref.update({
        status: 'pending',
        lastModifiedBy: 'gateway-webhook',
        lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  } catch (e) {
    console.warn('[webhook] release-awaiting failed:', e?.message);
  }
}

// Server-side mirror of lib/db.js _autoCloseBillIfAllPaid.
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
      lastModifiedBy: 'gateway-webhook',
      lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const tableNumber = billSnap.data().tableNumber;
    if (tableNumber) {
      await adminDb.doc(`restaurants/${restaurantId}/tableSessions/${tableNumber}`)
        .update({ currentBillId: admin.firestore.FieldValue.delete() })
        .catch(() => {});
    }
  } catch (e) {
    console.warn('[webhook] auto-close failed:', e?.message);
  }
}
