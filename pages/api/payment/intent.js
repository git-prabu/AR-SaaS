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

import { adminDb } from '../../../lib/firebaseAdmin';
import admin from 'firebase-admin';
import { createPaymentIntent, getGatewayConfig, isGatewayActive } from '../../../lib/gateway';

const PAID = ['paid_cash', 'paid_card', 'paid_online', 'paid'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { restaurantId, orderId, orderIds } = req.body || {};
  if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });

  // Accept either { orderId } (legacy / takeaway) or { orderIds } (bill).
  const ids = Array.isArray(orderIds) && orderIds.length > 0
    ? orderIds
    : (orderId ? [orderId] : []);
  if (ids.length === 0) return res.status(400).json({ error: 'orderId(s) is required' });

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

    // Sum the totals server-side.
    const totalAmount = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    if (totalAmount <= 0) return res.status(400).json({ error: 'Order total is zero or invalid' });

    // Look up the restaurant's subdomain so we can build a return URL.
    const restSnap = await adminDb.doc(`restaurants/${restaurantId}`).get();
    const subdomain = restSnap.exists ? restSnap.data()?.subdomain : '';

    // Synthesize a "bill order" for the gateway — total comes from
    // the sum, items come from the union, id is the first order so
    // single-order callers (takeaway) get the same provider txn id
    // shape they always have.
    const billOrder = {
      ...orders[0],
      id: orders[0].id,
      total: totalAmount,
      items: orders.flatMap(o => o.items || []),
      subdomain,
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
    console.error('[/api/payment/intent] failed:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
