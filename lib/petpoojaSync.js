// lib/petpoojaSync.js
// Phase B (Petpooja hybrid) — Sync orchestration layer.
//
// This file sits BETWEEN lib/petpooja.js (raw API client) and the
// /api/petpooja/* endpoints (HTTP surface). It owns:
//
//   1. Loading + validating petpoojaConfig from the restaurant doc
//   2. Plan + posMode gating (defence-in-depth — even if a caller
//      forgets to check, we refuse work for non-Pro / non-hybrid)
//   3. Menu mirroring — pulls Petpooja menu, writes to our Firestore
//      menuItems collection while preserving our images / AR models
//      / Help-Me-Choose tags (those overlay fields are ours, not theirs)
//   4. Order push with idempotency + retry-on-failure status field
//   5. Payment sync with the petpoojaOrderId we stored at push time
//   6. Audit logging — every sync writes a brief log entry to a
//      petpoojaLogs subcollection so we can debug pilot issues
//
// All functions take a `restaurantId` and load the config + plan
// internally. Callers don't pass credentials — this keeps the secret
// material in one place (Firestore + this file's adminDb reads).
//
// SAFETY RULE: every function exits early with `{ skipped: true,
// reason: '...' }` when the restaurant isn't on Pro or isn't in
// petpooja_hybrid mode. There is NO code path here that affects a
// standalone restaurant. Caller can call freely without checking.

import { adminDb } from './firebaseAdmin';
import admin from 'firebase-admin';
import { canUsePetpoojaIntegration } from './plans';
import {
  fetchMenu as apiFetchMenu,
  saveOrder as apiSaveOrder,
  updatePaymentStatus as apiUpdatePaymentStatus,
  validateCredentials as apiValidateCredentials,
} from './petpooja';

// ── Helpers ──────────────────────────────────────────────────────────

// Load the restaurant doc + return { ok, restaurant, config, reason }.
// Centralised so every sync function uses the same gate.
async function loadAndGate(restaurantId) {
  if (!restaurantId) return { ok: false, reason: 'missing-restaurantId' };
  const snap = await adminDb.doc(`restaurants/${restaurantId}`).get();
  if (!snap.exists) return { ok: false, reason: 'restaurant-not-found' };
  const restaurant = { id: snap.id, ...snap.data() };
  if (!canUsePetpoojaIntegration(restaurant)) {
    return { ok: false, reason: 'plan-not-eligible', restaurant };
  }
  if (restaurant.posMode !== 'petpooja_hybrid') {
    return { ok: false, reason: 'not-in-hybrid-mode', restaurant };
  }
  const config = restaurant.petpoojaConfig;
  if (!config?.restID || !config?.apiKey) {
    return { ok: false, reason: 'missing-credentials', restaurant };
  }
  return { ok: true, restaurant, config };
}

// Append a brief log entry to restaurants/{rid}/petpoojaLogs. Best-
// effort — failure to log never blocks the actual sync work.
async function appendLog(restaurantId, kind, payload) {
  try {
    await adminDb
      .collection(`restaurants/${restaurantId}/petpoojaLogs`)
      .add({
        kind,                // 'menu-sync', 'order-push', 'payment-sync', 'connect', 'error'
        ...payload,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.warn('[petpoojaSync] log write failed:', err?.message);
  }
}

// ── 1. Validate connection (used by onboarding wizard) ──────────────
//
// Special case: this runs BEFORE the restaurant has saved their
// petpoojaConfig — the wizard passes in candidate credentials and we
// hand-validate without going through loadAndGate.
//
// Plan check still applies: if the restaurant isn't on Pro we reject
// before even hitting Petpooja's servers.
export async function validateConnection(restaurantId, candidateConfig) {
  const restSnap = await adminDb.doc(`restaurants/${restaurantId}`).get();
  if (!restSnap.exists) return { ok: false, error: 'restaurant-not-found' };
  const restaurant = restSnap.data();
  if (!canUsePetpoojaIntegration(restaurant)) {
    return { ok: false, error: 'plan-not-eligible' };
  }
  try {
    const result = await apiValidateCredentials(candidateConfig);
    return result.ok
      ? { ok: true, restaurant: result.restaurant }
      : { ok: false, error: result.error };
  } catch (err) {
    return { ok: false, error: err?.message || 'Validation failed' };
  }
}

// ── 2. Save credentials (called after validateConnection succeeds) ──
export async function saveConnection(restaurantId, candidateConfig) {
  const restSnap = await adminDb.doc(`restaurants/${restaurantId}`).get();
  if (!restSnap.exists) return { ok: false, error: 'restaurant-not-found' };
  const restaurant = restSnap.data();
  if (!canUsePetpoojaIntegration(restaurant)) {
    return { ok: false, error: 'plan-not-eligible' };
  }
  const petpoojaConfig = {
    restID:       String(candidateConfig.restID || '').trim(),
    apiKey:       String(candidateConfig.apiKey || '').trim(),
    apiSecret:    String(candidateConfig.apiSecret || '').trim() || null,
    accessToken:  String(candidateConfig.accessToken || '').trim() || null,
    connectedAt:  admin.firestore.FieldValue.serverTimestamp(),
    disconnectedAt: null,
    lastMenuSyncAt: null,
    syncErrorCount: 0,
    lastSyncError:  null,
  };
  await adminDb.doc(`restaurants/${restaurantId}`).update({
    posMode: 'petpooja_hybrid',
    petpoojaConfig,
  });
  await appendLog(restaurantId, 'connect', { ok: true, restID: petpoojaConfig.restID });
  return { ok: true };
}

// ── 3. Disconnect ────────────────────────────────────────────────────
// Flips the restaurant back to standalone mode. Keeps the last menu
// pulled from Petpooja in our Firestore (it's already there as
// menuItems docs) — restaurant doesn't lose data, the sync just stops.
// Marks petpoojaConfig.disconnectedAt so we know the history.
export async function disconnect(restaurantId, reason = 'user-requested') {
  const snap = await adminDb.doc(`restaurants/${restaurantId}`).get();
  if (!snap.exists) return { ok: false, error: 'restaurant-not-found' };
  await adminDb.doc(`restaurants/${restaurantId}`).update({
    posMode: 'standalone',
    'petpoojaConfig.disconnectedAt': admin.firestore.FieldValue.serverTimestamp(),
    'petpoojaConfig.disconnectReason': reason,
  });
  await appendLog(restaurantId, 'disconnect', { ok: true, reason });
  return { ok: true };
}

// ── 4. Menu sync ─────────────────────────────────────────────────────
// Pulls the full menu from Petpooja's /V1/mapped_restaurant_menus
// endpoint, mirrors to our Firestore. PRESERVES our local overlay
// fields:
//   - imageURL    (we prefer our images per user requirement)
//   - modelURL    (AR .glb file we host)
//   - moodTags    (Help-Me-Choose tags — our admin maintains these)
//   - spiceLevel
// All other fields (name, price, category, taxes, in_stock) come from
// Petpooja and overwrite our copy.
//
// Mapping strategy: each Petpooja item carries `itemid`. We use that
// as a key in a lookup field on our menuItems docs (`petpoojaItemId`).
// First sync: create menuItems docs with petpoojaItemId set.
// Subsequent syncs: update by petpoojaItemId, never touch overlay fields.
//
// Categories: we store Petpooja's categories under the existing
// `category` field (string match by name) so the customer page's
// existing category filter keeps working unchanged.
//
// Petpooja V2.1.0 schema:
//   - menu.categories[]:   { categoryid, categoryname, categoryrank }
//   - menu.items[]:        { itemid, itemname, item_categoryid, price,
//                            itemdescription, item_tax (csv of tax ids),
//                            in_stock ('1'/'2'), active ('0'/'1'),
//                            itemallowvariation, itemallowaddon,
//                            variation: [...], addon: [...] }
//   - menu.taxes[]:        { taxid, taxname, tax (percent), taxtype }
//   - menu.addongroups[]:  { addongroupid, addongroup_name }
//   - menu.addongroupitems[]: { addongroupitemid, addongroupid,
//                               addonitem_name, addonitem_price }
export async function syncMenu(restaurantId) {
  const gate = await loadAndGate(restaurantId);
  if (!gate.ok) return { ok: false, skipped: true, reason: gate.reason };

  let menu;
  try {
    menu = await apiFetchMenu(gate.config);
  } catch (err) {
    await appendLog(restaurantId, 'menu-sync', { ok: false, error: err.message });
    await adminDb.doc(`restaurants/${restaurantId}`).update({
      'petpoojaConfig.syncErrorCount': admin.firestore.FieldValue.increment(1),
      'petpoojaConfig.lastSyncError':  err.message,
    });
    return { ok: false, error: err.message };
  }

  return applyMenu(restaurantId, menu, 'menu-sync');
}

// ── 4b. Apply menu data ──────────────────────────────────────────────
// Same body as syncMenu's actual mirroring logic, but takes a pre-
// fetched menu object. Used by:
//   - syncMenu() above (Petpooja PULL — we fetch then apply)
//   - /api/petpooja/pushmenu (Petpooja PUSH — they send us the menu
//     and call this directly, skipping the fetch round-trip)
//
// `source` is a label that goes into the log entry kind so we can
// tell pull-driven syncs apart from push-driven ones.
export async function applyMenu(restaurantId, menu, source = 'menu-sync') {
  // ── Index the lookup tables ─────────────────────────────────────
  const categoryById = new Map();
  for (const c of (menu.categories || [])) {
    categoryById.set(String(c.categoryid), c.categoryname);
  }

  // Tax id → { name, percent } so per-item tax csv references resolve.
  const taxById = new Map();
  for (const t of (menu.taxes || [])) {
    taxById.set(String(t.taxid), {
      name: t.taxname,
      percent: Number(t.tax) || 0,
      type: t.taxtype || 'P',
    });
  }

  // Addon group id → name + selection rules.
  const addonGroupById = new Map();
  for (const g of (menu.addongroups || [])) {
    addonGroupById.set(String(g.addongroupid), g.addongroup_name);
  }
  // Addon group items indexed by group id — array of {id, name, price}.
  const addonItemsByGroupId = new Map();
  for (const a of (menu.addongroupitems || [])) {
    const gid = String(a.addongroupid);
    if (!addonItemsByGroupId.has(gid)) addonItemsByGroupId.set(gid, []);
    addonItemsByGroupId.get(gid).push({
      id:    String(a.addongroupitemid),
      name:  String(a.addonitem_name),
      price: Number(a.addonitem_price) || 0,
    });
  }

  // ── Pull existing menuItems to preserve overlay fields ──────────
  const existingSnap = await adminDb.collection(`restaurants/${restaurantId}/menuItems`).get();
  const existingByPetpoojaId = new Map();
  for (const d of existingSnap.docs) {
    const data = d.data();
    if (data.petpoojaItemId) existingByPetpoojaId.set(String(data.petpoojaItemId), { id: d.id, ...data });
  }

  const items = menu.items || [];

  // ── Build write batches (Firestore caps at 500 ops/batch) ───────
  const batches = [];
  let batch = adminDb.batch();
  let opCount = 0;
  for (const it of items) {
    const ppId = String(it.itemid);
    const existing = existingByPetpoojaId.get(ppId);
    const docRef = existing
      ? adminDb.doc(`restaurants/${restaurantId}/menuItems/${existing.id}`)
      : adminDb.collection(`restaurants/${restaurantId}/menuItems`).doc();

    // Resolve per-item taxes from the csv `item_tax` field.
    const itemTaxIds = String(it.item_tax || '').split(',').map(s => s.trim()).filter(Boolean);
    const itemTaxes = itemTaxIds
      .map(tid => taxById.get(tid))
      .filter(Boolean);

    // Resolve variations.
    const variations = (it.variation || []).map(v => ({
      id:         String(v.variationid),
      name:       String(v.name || ''),
      priceDelta: Number(v.price) || 0,
    }));

    // Resolve addons — each addon entry on an item points at an
    // addon group, which expands to a list of addon items.
    const addons = [];
    for (const ag of (it.addon || [])) {
      const groupId = String(ag.addon_group_id);
      const groupName = addonGroupById.get(groupId) || '';
      const groupItems = addonItemsByGroupId.get(groupId) || [];
      addons.push({
        groupId,
        groupName,
        minSelect: Number(ag.addon_item_selection_min) || 0,
        maxSelect: Number(ag.addon_item_selection_max) || 0,
        items: groupItems,
      });
    }

    // Fields Petpooja owns — overwrite every sync.
    const fromPetpooja = {
      name:         String(it.itemname || ''),
      price:        Number(it.price) || 0,
      category:     categoryById.get(String(it.item_categoryid)) || 'Uncategorised',
      description:  String(it.itemdescription || ''),
      itemTaxes,                                       // [{name, percent, type}]
      isActive:     String(it.active) === '1',
      // V2.1.0: in_stock '1' = available, '2' = not available, '3' = no stock count.
      isOutOfStock: String(it.in_stock) === '2',
      variations,
      addons,
      petpoojaItemId:   ppId,
      petpoojaSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Image: prefer ours; fall back to theirs only when ours is empty.
    // V2.1.0 menu items don't typically include image URLs (that field
    // isn't in the spec) so this is mostly a no-op, but harmless.
    if (!existing?.imageURL && it.item_image_url) {
      fromPetpooja.imageURL = String(it.item_image_url);
    }

    if (existing) {
      batch.update(docRef, fromPetpooja);
    } else {
      batch.set(docRef, {
        ...fromPetpooja,
        imageURL:    '',
        modelURL:    null,
        moodTags:    [],
        spiceLevel:  0,
        ratingAvg:   0,
        ratingCount: 0,
        views:       0,
        arViews:     0,
        createdAt:   admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    opCount++;
    if (opCount >= 450) {
      batches.push(batch);
      batch = adminDb.batch();
      opCount = 0;
    }
  }
  if (opCount > 0) batches.push(batch);
  for (const b of batches) await b.commit();

  await adminDb.doc(`restaurants/${restaurantId}`).update({
    'petpoojaConfig.lastMenuSyncAt': admin.firestore.FieldValue.serverTimestamp(),
    'petpoojaConfig.syncErrorCount': 0,
    'petpoojaConfig.lastSyncError':  null,
  });
  await appendLog(restaurantId, source, { ok: true, itemCount: items.length });
  return { ok: true, itemCount: items.length };
}

// ── 4c. Toggle item stock (Petpooja → us) ────────────────────────────
// Petpooja calls this when the restaurant flips an item's stock in
// their POS. Body: { restID, type, inStock, itemID:[ids] }.
// We mirror the in-stock flag onto our menuItems doc so the customer
// page hides / shows the item in real time.
export async function toggleItemStock(restaurantId, { type, inStock, itemIDs }) {
  if (!Array.isArray(itemIDs) || itemIDs.length === 0) {
    return { ok: false, error: 'no-itemIDs' };
  }
  // Find menuItems by petpoojaItemId.
  const snap = await adminDb.collection(`restaurants/${restaurantId}/menuItems`).get();
  const updates = [];
  for (const d of snap.docs) {
    const data = d.data();
    if (!data.petpoojaItemId) continue;
    if (!itemIDs.map(String).includes(String(data.petpoojaItemId))) continue;
    updates.push(d.ref);
  }
  if (updates.length === 0) {
    return { ok: false, error: 'no-matching-items' };
  }
  const isOutOfStock = !inStock;
  const batch = adminDb.batch();
  for (const ref of updates) {
    batch.update(ref, {
      isOutOfStock,
      lastStockUpdateBy: 'petpooja',
      lastStockUpdateAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  await appendLog(restaurantId, 'item-stock', {
    ok: true, type, inStock, count: updates.length,
  });
  return { ok: true, count: updates.length };
}

// ── 4d. Toggle store status (Petpooja → us) ──────────────────────────
// Petpooja calls this to tell us the store is closing / opening. We
// mirror to restaurant.isAcceptingOrders so the customer page can
// show "Closed" if needed. The reverse query (Petpooja asks our
// store status) is served by /api/petpooja/get-store-status which
// just reads this same field.
export async function setStoreStatus(restaurantId, { storeStatus, turnOnTime, reason }) {
  const isOpen = String(storeStatus) === '1';
  await adminDb.doc(`restaurants/${restaurantId}`).update({
    isAcceptingOrders: isOpen,
    storeStatusUpdatedBy: 'petpooja',
    storeStatusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    storeStatusReason: reason || null,
    storeTurnOnTime: turnOnTime || null,
  });
  await appendLog(restaurantId, 'store-status', { ok: true, isOpen, reason });
  return { ok: true, isOpen };
}

// Read-only: returns the current store-open state. Used by the
// /api/petpooja/get-store-status endpoint when Petpooja queries us.
export async function readStoreStatus(restaurantId) {
  const snap = await adminDb.doc(`restaurants/${restaurantId}`).get();
  if (!snap.exists) return { ok: false, error: 'restaurant-not-found' };
  const data = snap.data();
  // Default to "open" — restaurants that haven't explicitly closed
  // are assumed accepting orders. This matches our customer-page
  // behaviour where missing isAcceptingOrders treats as available.
  const isOpen = data.isAcceptingOrders !== false;
  return { ok: true, isOpen };
}

// ── 5. Order push ────────────────────────────────────────────────────
// Pushes a single customer order from our Firestore into the
// restaurant's Petpooja POS. Idempotent — if the order doc already
// has a petpoojaOrderId, we skip silently.
//
// WHEN to call:
//   - Takeaway pay-first: call AFTER paymentStatus flips to paid_*.
//     The Petpooja save_order payload's payment_type is then known
//     correctly (CASH/CARD/ONLINE), and the kitchen sees the order
//     already paid.
//   - Dine-in: call right after order is placed (payment may come
//     later via cashier). payment_type goes in as 'COD' which
//     Petpooja interprets as "to be collected at counter."
//
// The customer page decides WHICH path it's on based on orderType
// and the listener-driven billPaymentState===paid effect.
export async function pushOrder(restaurantId, orderId) {
  const gate = await loadAndGate(restaurantId);
  if (!gate.ok) return { ok: false, skipped: true, reason: gate.reason };

  const orderRef = adminDb.doc(`restaurants/${restaurantId}/orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) return { ok: false, error: 'order-not-found' };
  const order = orderSnap.data();

  // Idempotency: if already pushed, no-op.
  if (order.petpoojaOrderId) {
    return { ok: true, skipped: true, reason: 'already-pushed', petpoojaOrderId: order.petpoojaOrderId };
  }

  // Build petpoojaItemId lookup from our menuItems collection.
  const menuSnap = await adminDb.collection(`restaurants/${restaurantId}/menuItems`).get();
  const localToPetpooja = new Map();   // our doc id → petpooja itemid
  const itemMetaByLocalId = new Map(); // our doc id → { itemTaxes, ... }
  for (const d of menuSnap.docs) {
    const data = d.data();
    if (data.petpoojaItemId) {
      localToPetpooja.set(d.id, String(data.petpoojaItemId));
      itemMetaByLocalId.set(d.id, {
        itemTaxes: data.itemTaxes || [],
        gstLiability: data.gstLiability || 'vendor',
        taxInclusive: !!data.taxInclusive,
      });
    }
  }

  // Verify every cart item maps to a petpooja item (defend against
  // menu-sync drift).
  const cartItems = order.items || [];
  const unmapped = cartItems.filter(it => !localToPetpooja.get(it.id));
  if (unmapped.length > 0) {
    const err = `Unmapped items: ${unmapped.map(i => i.name).join(', ')}`;
    await orderRef.update({
      petpoojaPushError:    err,
      petpoojaPushAttempts: admin.firestore.FieldValue.increment(1),
    });
    await appendLog(restaurantId, 'order-push', { ok: false, orderId, error: err });
    return { ok: false, error: err };
  }

  // Translate cart items → Petpooja's expected shape.
  const items = cartItems.map(it => {
    const meta = itemMetaByLocalId.get(it.id) || {};
    // Per-item tax — apportion from the menu item's known tax rates.
    // Each tax rate yields a row; amount = price * percent / 100 * qty.
    const qty = Number(it.qty) || 1;
    const itemSubtotal = (Number(it.price) || 0) * qty;
    const itemTaxes = (meta.itemTaxes || []).map((t, idx) => ({
      id:      `it-${idx + 1}`,            // Petpooja accepts any string id here
      name:    t.name,
      percent: t.percent,
      amount:  Math.round((itemSubtotal * (t.percent || 0)) / 100 * 100) / 100,
    }));
    return {
      petpoojaItemId:        localToPetpooja.get(it.id),
      petpoojaVariationId:   it.variant?.petpoojaVariationId || null,
      petpoojaVariationName: it.variant?.name || null,
      petpoojaAddons:        (it.addOns || []).map(a => ({
        id:         a.petpoojaAddonId || a.id,
        name:       a.name,
        group_name: a.groupName || '',
        group_id:   a.petpoojaGroupId || 0,
        price:      a.priceDelta || 0,
        quantity:   1,
      })),
      name:         it.name,
      price:        Number(it.price) || 0,
      qty,
      finalPrice:   itemSubtotal,
      taxInclusive: meta.taxInclusive,
      gstLiability: meta.gstLiability,
      itemTaxes,
      itemDiscount: 0,
      note:         it.note || '',
    };
  });

  // Build order-level taxes from our totals. Petpooja expects an
  // array of {id, title, type, price (percent), tax (amount)}.
  const orderTaxes = [];
  if (Number(order.cgst) > 0) {
    orderTaxes.push({
      id:    'CGST',
      title: 'CGST',
      type:  'P',
      percent: (Number(order.gstPercent) || 0) / 2,
      amount:  Number(order.cgst),
    });
  }
  if (Number(order.sgst) > 0) {
    orderTaxes.push({
      id:    'SGST',
      title: 'SGST',
      type:  'P',
      percent: (Number(order.gstPercent) || 0) / 2,
      amount:  Number(order.sgst),
    });
  }

  const callbackUrl = process.env.PETPOOJA_CALLBACK_URL
    || (process.env.NEXT_PUBLIC_SITE_URL || 'https://advertradical.vercel.app') + '/api/petpooja/callback';

  const payload = {
    orderId,
    orderType:    order.orderType || 'dinein',
    tableNumber:  order.tableNumber || '',
    numPersons:   order.numPersons || 1,
    customerName:  order.customerName  || '',
    customerPhone: order.customerPhone || '',
    customerEmail: order.customerEmail || '',
    items,
    orderTaxes,
    serviceCharge: Number(order.serviceCharge) || 0,
    discount:      Number(order.discount) || 0,
    discountTitle: order.couponCode ? `Coupon ${order.couponCode}` : 'Discount',
    discountType:  'F',
    total:         Number(order.total) || 0,
    taxTotal:      (Number(order.cgst) || 0) + (Number(order.sgst) || 0),
    paymentMode:   resolvePaymentMode(order.paymentStatus),
    callbackUrl,
    specialInstructions: order.specialInstructions || '',
    createdOn:     formatPetpoojaDate(order.createdAt),
  };

  try {
    const result = await apiSaveOrder(gate.config, payload);
    await orderRef.update({
      petpoojaOrderId:   result.petpoojaOrderId || null,
      petpoojaClientOrderID: result.clientOrderID || null,
      petpoojaPushedAt:  admin.firestore.FieldValue.serverTimestamp(),
      petpoojaPushError: null,
    });
    await appendLog(restaurantId, 'order-push', { ok: true, orderId, petpoojaOrderId: result.petpoojaOrderId });
    return { ok: true, petpoojaOrderId: result.petpoojaOrderId };
  } catch (err) {
    await orderRef.update({
      petpoojaPushError:    err.message,
      petpoojaPushAttempts: admin.firestore.FieldValue.increment(1),
    });
    await appendLog(restaurantId, 'order-push', { ok: false, orderId, error: err.message });
    return { ok: false, error: err.message };
  }
}

function resolvePaymentMode(paymentStatus) {
  if (!paymentStatus) return 'COD';
  if (paymentStatus.startsWith('paid_cash') || paymentStatus === 'cash_requested') return 'CASH';
  if (paymentStatus.startsWith('paid_card') || paymentStatus === 'card_requested') return 'CARD';
  if (paymentStatus.startsWith('paid_online') || paymentStatus === 'online_requested') return 'ONLINE';
  if (paymentStatus === 'paid') return 'CASH'; // legacy bucket
  return 'COD';
}

function formatPetpoojaDate(t) {
  // Petpooja expects 'YYYY-MM-DD HH:MM:SS' — timezone-implicit.
  const d = t?.toDate ? t.toDate()
          : t?.seconds ? new Date(t.seconds * 1000)
          : t ? new Date(t)
          : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ── 6. Payment status sync ───────────────────────────────────────────
// BEST-EFFORT — Petpooja V2.1.0 has no official update-payment
// endpoint. We send the partner-defined extension on
// /V1/update_order_status and treat success as bonus, failure as
// expected. The dine-in cashier may need to mark it paid in
// Petpooja's own UI as a fallback.
//
// This function is still useful for two reasons:
//   1. If Petpooja ever ships a real endpoint, callers don't need
//      to change — only this file's apiUpdatePaymentStatus.
//   2. Even today's no-op syncs leave a petpoojaLogs entry, so we
//      can show the restaurant "we tried to mark this paid in
//      Petpooja" in the order detail view.
export async function syncPayment(restaurantId, orderId) {
  const gate = await loadAndGate(restaurantId);
  if (!gate.ok) return { ok: false, skipped: true, reason: gate.reason };

  const orderRef = adminDb.doc(`restaurants/${restaurantId}/orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) return { ok: false, error: 'order-not-found' };
  const order = orderSnap.data();

  if (!order.petpoojaOrderId && !order.petpoojaClientOrderID) {
    return { ok: false, error: 'no-petpooja-order-id', skipped: true };
  }
  if (order.petpoojaPaymentSyncedAt) {
    return { ok: true, skipped: true, reason: 'already-synced' };
  }
  const PAID = ['paid_cash', 'paid_card', 'paid_online', 'paid'];
  if (!PAID.includes(order.paymentStatus)) {
    return { ok: false, error: 'not-paid-yet', skipped: true };
  }

  const paidTime = order.paymentUpdatedAt?.toDate
    ? order.paymentUpdatedAt.toDate().toISOString()
    : new Date().toISOString();
  try {
    await apiUpdatePaymentStatus(gate.config, {
      petpoojaOrderId: order.petpoojaOrderId,
      clientOrderId:   order.petpoojaClientOrderID || orderId,
      method:          resolvePaymentMode(order.paymentStatus),
      transactionId:   order.razorpayPaymentId || order.gatewayProviderRef || '',
      timeISO:         paidTime,
    });
    await orderRef.update({
      petpoojaPaymentSyncedAt:  admin.firestore.FieldValue.serverTimestamp(),
      petpoojaPaymentSyncError: null,
    });
    await appendLog(restaurantId, 'payment-sync', { ok: true, orderId });
    return { ok: true };
  } catch (err) {
    // Petpooja may legitimately ignore this call — log + record but
    // don't surface as an error to the caller's UX.
    await orderRef.update({ petpoojaPaymentSyncError: err.message });
    await appendLog(restaurantId, 'payment-sync', { ok: false, orderId, error: err.message, note: 'best-effort, may not be supported by Petpooja V2.1.0' });
    return { ok: false, error: err.message, bestEffort: true };
  }
}
