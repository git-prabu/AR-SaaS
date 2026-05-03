// pages/api/orders/add-items.js
// May 1 — Append items to a takeaway order that's still parked in
// awaiting_payment. The customer was on the payment screen, realised
// they wanted to add another dish, went back to the menu, and tapped
// the "Add to order" button on the cart. Without this endpoint the
// existing placeOrder() path would have CREATED a new order and
// orphaned the original one.
//
// Why server-side instead of a Firestore client write:
//   1. The customer-update Firestore rule only allows changes to
//      paymentStatus / paymentUpdatedAt / lastModifiedBy / lastModifiedAt
//      (+ the cancel branch added in May 1). Letting customers freely
//      mutate items + totals from the client SDK would let them
//      undercharge themselves. Server-side, we recalculate totals
//      from menuItem prices the SAME way placeOrder does — customer
//      can't pass an inflated `total` and have it stick.
//   2. Tax / service charge rates live on the restaurant doc and need
//      to be recalculated against the new subtotal. Cleaner to do
//      that here in one place than dance around the client.
//
// Restrictions:
//   - Only works on status === 'awaiting_payment'. Once payment has
//     cleared the order is in pending+ and the kitchen has it; adding
//     items at that point would be a separate order, not an edit.
//   - Resets paymentStatus to 'unpaid' (if it was *_requested). The
//     customer presumably needs to re-review the new total before
//     re-confirming payment method. Cleaner than letting the cashier
//     collect money at the old total and discovering items were added.

import { adminDb } from '../../../lib/firebaseAdmin';
import admin from 'firebase-admin';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { restaurantId, orderId, newItems } = req.body || {};
  if (!restaurantId || typeof restaurantId !== 'string') {
    return res.status(400).json({ error: 'restaurantId is required' });
  }
  if (!orderId || typeof orderId !== 'string') {
    return res.status(400).json({ error: 'orderId is required' });
  }
  if (!Array.isArray(newItems) || newItems.length === 0) {
    return res.status(400).json({ error: 'newItems must be a non-empty array' });
  }

  try {
    const orderRef = adminDb.doc(`restaurants/${restaurantId}/orders/${orderId}`);
    const snap = await orderRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Order not found' });
    const order = snap.data();

    if (order.status !== 'awaiting_payment') {
      return res.status(409).json({
        error: 'ORDER_NOT_EDITABLE',
        message: `Order is in '${order.status}' state and can no longer be edited.`,
      });
    }

    // Re-validate prices against the live menu so a tampered cart
    // payload can't undercharge the customer. We trust id + qty from
    // the client; we DO NOT trust price.
    const menuSnap = await adminDb.collection(`restaurants/${restaurantId}/menuItems`).get();
    const menuById = new Map();
    for (const d of menuSnap.docs) {
      const m = d.data();
      menuById.set(d.id, m);
    }

    const validatedNewItems = [];
    for (const it of newItems) {
      if (!it || typeof it !== 'object') continue;
      const id = String(it.id || '').trim();
      const qty = Math.max(1, Math.min(99, Number(it.qty) || 1));
      if (!id) continue;
      // Combos pass through with their client-supplied price (combo
      // pricing isn't on menuItems). We trust them only because the
      // customer-page flow validates combos against /restaurants/{rid}
      // /combos before adding to cart. Future hardening: validate
      // combos here too.
      const isCombo = id.startsWith('combo_');
      const live = isCombo ? null : menuById.get(id);
      const basePrice = isCombo
        ? Math.max(0, Number(it.price) || 0)
        : Math.max(0, Number(live?.offerPrice ?? live?.price ?? 0));
      if (basePrice <= 0 && !isCombo) continue;  // skip unknown ids
      // Modifier deltas are passed through from the client (variant +
      // addOns). Same trust model as placeOrder — they're stored on
      // the cart entry from the item modal which already validated.
      const modDelta = Number(it.modDelta || 0);
      const finalPrice = Math.round(basePrice + modDelta);
      validatedNewItems.push({
        id,
        name: String(it.name || live?.name || 'Item'),
        price: finalPrice,
        qty,
        note: String(it.note || '').slice(0, 200),
        modNote: String(it.modNote || '').slice(0, 200),
        variant: it.variant || null,
        addOns: Array.isArray(it.addOns) ? it.addOns : [],
        isCombo: !!isCombo,
      });
    }

    if (validatedNewItems.length === 0) {
      return res.status(400).json({ error: 'No valid items to add' });
    }

    // Append (don't dedupe) — same item ordered twice is the customer's
    // choice. The cart UI already increments qty when the customer
    // taps + on an already-in-cart item, so duplicates would only
    // arrive here as a deliberate second order line.
    const mergedItems = [...(order.items || []), ...validatedNewItems];

    // Recalculate totals using the order's own tax/SC rates +
    // existing discount. Same formula as placeOrder so totals stay
    // consistent.
    const subtotal = mergedItems.reduce(
      (s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 1),
      0
    );
    const gstPct = Number(order.gstPercent) || 0;
    const scPct  = Number(order.serviceChargePercent) || 0;
    const cgst = Math.round((subtotal * (gstPct / 2)) / 100 * 100) / 100;
    const sgst = Math.round((subtotal * (gstPct / 2)) / 100 * 100) / 100;
    const serviceCharge = Math.round((subtotal * scPct) / 100 * 100) / 100;
    const discount = Number(order.discount) || 0;
    const preRound = subtotal + cgst + sgst + serviceCharge - discount;
    const grandTotal = Math.round(preRound);
    const roundOff = Math.round((grandTotal - preRound) * 100) / 100;

    // Reset paymentStatus to 'unpaid' if it was in *_requested. The
    // customer needs to re-pick a method now that the total has
    // changed. Paid orders can't reach this code path (status guard
    // above). Cancelled likewise.
    const wasRequested = ['cash_requested', 'card_requested', 'online_requested']
      .includes(order.paymentStatus);

    const updates = {
      items: mergedItems,
      subtotal, cgst, sgst, serviceCharge, discount, roundOff, total: grandTotal,
      lastModifiedBy: 'customer-add-items',
      lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (wasRequested) {
      updates.paymentStatus = 'unpaid';
      updates.paymentUpdatedAt = admin.firestore.FieldValue.serverTimestamp();
    }
    await orderRef.update(updates);

    return res.status(200).json({
      ok: true,
      items: mergedItems,
      subtotal, cgst, sgst, serviceCharge, discount, roundOff, total: grandTotal,
      paymentStatusReset: wasRequested,
    });
  } catch (err) {
    console.error('[/api/orders/add-items] failed:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
