// lib/db.js — Firestore helper functions (client-side)
import {
  doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc,
  collection, query, where, orderBy, limit, increment,
  serverTimestamp, runTransaction,
} from 'firebase/firestore';
import { db, adminAuth, superAdminAuth, staffAuth } from './firebase';

// ───────────────────────────────────────────────────────────────
// AUDIT FIELDS — every mutation that goes through this module stamps
// `lastModifiedBy` (the actor's Firebase Auth UID) + `lastModifiedAt`
// (server timestamp) onto the document. No UI for viewing this yet —
// it's a foundation for the future audit log + lets us debug "who
// changed X" without adding the fields after the fact (which can't
// recover the lost history).
//
// `actorUid()` checks all three Firebase Auth instances we run
// (adminApp / superAdminApp / staffApp — see lib/firebase.js) and
// returns whichever has a current user. For unauthenticated writes
// (customer-side analytics increments etc.) returns 'public', which
// keeps the field present but doesn't pretend to identify a user.
// ───────────────────────────────────────────────────────────────
export function actorUid() {
  if (typeof window === 'undefined') return 'system';
  return staffAuth?.currentUser?.uid
      || superAdminAuth?.currentUser?.uid
      || adminAuth?.currentUser?.uid
      || 'public';
}

// Augment any update/set payload with audit fields. Use everywhere a
// mutation writes data we want traceable. Pure function — never throws.
export function withActor(payload = {}) {
  return {
    ...payload,
    lastModifiedBy: actorUid(),
    lastModifiedAt: serverTimestamp(),
  };
}

// ───────────────────────────────────────────────────────────────
// DATE KEYS — critical: use LOCAL time, not UTC.
// `new Date().toISOString().split('T')[0]` returns UTC date. In India (IST =
// UTC+5:30), UTC midnight is 5:30 AM IST, so analytics/orderCounter keys
// would roll over at 5:30 AM IST instead of midnight IST. Restaurants open
// past midnight would have late-night sales split into two days.
//
// Always use todayKey() for analytics docs, order counters, sold-out flags,
// and "is today?" comparisons. For historical dates, use dateKey(Date).
// ───────────────────────────────────────────────────────────────
export function todayKey() {
  return dateKey(new Date());
}
export function dateKey(d) {
  const dd = d instanceof Date ? d : new Date(d);
  const y = dd.getFullYear();
  const m = String(dd.getMonth() + 1).padStart(2, '0');
  const day = String(dd.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Restaurants ───────────────────────────────────────────────

export async function getRestaurantBySubdomain(subdomain) {
  const q = query(
    collection(db, 'restaurants'),
    where('subdomain', '==', subdomain),
    where('isActive', '==', true),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// Same as above but without isActive filter — used in getStaticProps so the
// page can load even for inactive restaurants (real-time listener handles blocking)
export async function getRestaurantBySubdomainAny(subdomain) {
  const q = query(
    collection(db, 'restaurants'),
    where('subdomain', '==', subdomain),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function getRestaurantById(id) {
  const snap = await getDoc(doc(db, 'restaurants', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function getAllRestaurants() {
  const snap = await getDocs(collection(db, 'restaurants'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createRestaurant(data) {
  // Defaults first, then spread data so caller can override
  // (e.g. signup page passes plan, maxItems, isActive, etc.)
  return addDoc(collection(db, 'restaurants'), {
    isActive: false,
    storageUsedMB: 0,
    itemsUsed: 0,
    plan: 'starter',
    maxStorageMB: 1000,
    maxItems: 20,
    paymentStatus: 'inactive',
    ...data,
    createdAt: serverTimestamp(),
  });
}

export async function updateRestaurant(id, data) {
  return updateDoc(doc(db, 'restaurants', id), withActor(data));
}

// ─── Menu Items ────────────────────────────────────────────────

export async function getMenuItems(restaurantId) {
  const q = query(
    collection(db, 'restaurants', restaurantId, 'menuItems'),
    where('isActive', '==', true)
  );
  const snap = await getDocs(q);
  return sortMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
}

export function sortMenuItems(items) {
  return [...items].sort((a, b) => {
    // Featured items first
    if (a.isFeatured && !b.isFeatured) return -1;
    if (!a.isFeatured && b.isFeatured) return 1;
    // Then by explicit sortOrder (lower number = higher priority)
    const ao = a.sortOrder ?? 9999, bo = b.sortOrder ?? 9999;
    if (ao !== bo) return ao - bo;
    // Then by category alphabetically
    if ((a.category || '') < (b.category || '')) return -1;
    if ((a.category || '') > (b.category || '')) return 1;
    // Finally by creation time
    return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
  });
}

export async function getAllMenuItems(restaurantId) {
  const snap = await getDocs(
    collection(db, 'restaurants', restaurantId, 'menuItems')
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function incrementItemView(restaurantId, itemId) {
  const today = todayKey();
  // Dual-write: per-item lifetime counter (for Top Menu Items / dish performance)
  // AND per-day analytics counter (for date-range-filtered Customer Journey).
  // Both writes are fire-and-forget independent; either succeeding is useful.
  const itemWrite = updateDoc(
    doc(db, 'restaurants', restaurantId, 'menuItems', itemId),
    { views: increment(1) }
  );
  const analyticsWrite = setDoc(
    doc(db, 'restaurants', restaurantId, 'analytics', today),
    { date: today, itemViews: increment(1) },
    { merge: true }
  );
  return Promise.all([itemWrite, analyticsWrite]);
}

export async function incrementARView(restaurantId, itemId) {
  const today = todayKey();
  const itemWrite = updateDoc(
    doc(db, 'restaurants', restaurantId, 'menuItems', itemId),
    { arViews: increment(1) }
  );
  const analyticsWrite = setDoc(
    doc(db, 'restaurants', restaurantId, 'analytics', today),
    { date: today, arViews: increment(1) },
    { merge: true }
  );
  return Promise.all([itemWrite, analyticsWrite]);
}

export async function updateMenuItem(restaurantId, itemId, data) {
  return updateDoc(
    doc(db, 'restaurants', restaurantId, 'menuItems', itemId),
    withActor({ ...data, updatedAt: serverTimestamp() })
  );
}

export async function deleteMenuItem(restaurantId, itemId) {
  return deleteDoc(doc(db, 'restaurants', restaurantId, 'menuItems', itemId));
}

// ─── Requests ─────────────────────────────────────────────────

export async function getRequests(restaurantId, status = null) {
  // Avoid composite indexes — filter/sort client-side
  const snap = await getDocs(
    collection(db, 'restaurants', restaurantId, 'requests')
  );
  let results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (status) {
    results = results.filter(r => r.status === status);
  }
  return results.sort((a, b) =>
    (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
  );
}

export async function getAllPendingRequests() {
  const restaurants = await getAllRestaurants();
  const all = [];
  await Promise.all(
    restaurants.map(async (r) => {
      const reqs = await getRequests(r.id, 'pending');
      reqs.forEach(req => all.push({ ...req, restaurantId: r.id, restaurantName: r.name }));
    })
  );
  return all.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

export async function submitRequest(restaurantId, data) {
  return addDoc(collection(db, 'restaurants', restaurantId, 'requests'), {
    ...data,
    status: 'pending',
    createdAt: serverTimestamp(),
    reviewedAt: null,
  });
}

export async function updateRequestStatus(restaurantId, requestId, status, modelURL = null) {
  const updates = { status, reviewedAt: serverTimestamp() };
  if (modelURL) updates.modelURL = modelURL;
  return updateDoc(
    doc(db, 'restaurants', restaurantId, 'requests', requestId),
    withActor(updates)
  );
}

export async function deleteRequest(restaurantId, requestId) {
  return deleteDoc(doc(db, 'restaurants', restaurantId, 'requests', requestId));
}

// New flow: publish menu item immediately (no AR), then create request for 3D upload
export async function submitRequestAndPublish(restaurantId, data, restaurant) {
  // Compute the audit stamp once so all three writes share the same author
  // and timestamp — the request, menu item, and item-counter increment are
  // logically a single user action, so they should appear as one event.
  const stamp = withActor({});

  // 1. Create request doc → get its auto-generated ID
  const reqRef = await addDoc(collection(db, 'restaurants', restaurantId, 'requests'), {
    ...data,
    status: 'pending',
    createdAt: serverTimestamp(),
    reviewedAt: null,
    ...stamp,
  });

  // 2. Use the SAME ID to create menu item — visible immediately, AR locked
  await setDoc(doc(db, 'restaurants', restaurantId, 'menuItems', reqRef.id), {
    name: data.name,
    nameTA: data.nameTA || null,
    nameHI: data.nameHI || null,
    description: data.description || '',
    descriptionTA: data.descriptionTA || null,
    descriptionHI: data.descriptionHI || null,
    category: data.category || '',
    price: data.price || 0,
    imageURL: data.imageURL || null,
    modelURL: null,
    arReady: false,
    ingredients: data.ingredients || [],
    calories: data.nutritionalData?.calories || null,
    protein: data.nutritionalData?.protein || null,
    carbs: data.nutritionalData?.carbs || null,
    fats: data.nutritionalData?.fats || null,
    prepTime: data.prepTime || null,
    spiceLevel: data.spiceLevel || null,
    isVeg: data.isVeg || false,
    badge: data.badge || null,
    isFeatured: false,
    sortOrder: 9999,
    isActive: true,
    views: 0,
    arViews: 0,
    ratingSum: 0,
    ratingCount: 0,
    ratingAvg: 0,
    createdAt: serverTimestamp(),
    ...stamp,
  });

  // 3. Increment itemsUsed on restaurant doc
  await updateDoc(doc(db, 'restaurants', restaurantId), {
    itemsUsed: increment(1),
    ...stamp,
  });

  return reqRef;
}

// ─── Analytics ────────────────────────────────────────────────

export async function trackVisit(restaurantId, sessionId) {
  const today = todayKey();
  const ref = doc(db, 'restaurants', restaurantId, 'analytics', today);
  const snap = await getDoc(ref);
  // Hour-of-day (0-23, local time) — bucketed so /admin/analytics in Today
  // mode can show a per-hour visits curve. Stored as a Firestore map field
  // `hourlyVisits` keyed by string hour ("0"…"23"). Existing docs created
  // before this field was introduced won't have it; the analytics chart
  // falls back gracefully (shows 0 for untracked hours).
  const hour = new Date().getHours();

  if (!snap.exists()) {
    await setDoc(ref, {
      date: today,
      totalVisits: 1,
      uniqueVisitors: 1,
      repeatVisitors: 0,
      sessions: [sessionId],
      hourlyVisits: { [String(hour)]: 1 },
    });
  } else {
    const data = snap.data();
    const sessions = data.sessions || [];
    const isRepeat = sessions.includes(sessionId);
    await updateDoc(ref, {
      totalVisits: increment(1),
      uniqueVisitors: isRepeat ? increment(0) : increment(1),
      repeatVisitors: isRepeat ? increment(1) : increment(0),
      sessions: isRepeat ? sessions : [...sessions, sessionId],
      // Dot-path increment auto-creates the nested map field on first write
      // for docs that didn't have hourlyVisits before this change shipped.
      [`hourlyVisits.${hour}`]: increment(1),
    });
  }
}

export async function getAnalytics(restaurantId, days = 30, startDate = null, endDate = null) {
  // Get all analytics docs and sort client-side.
  // When startDate + endDate are passed (YYYY-MM-DD), filter by that range
  // instead of slicing the last N days. Used by the Custom date picker.
  const snap = await getDocs(
    collection(db, 'restaurants', restaurantId, 'analytics')
  );
  const all = snap.docs
    .map(d => d.data())
    .sort((a, b) => (a.date > b.date ? 1 : -1));
  if (startDate && endDate) {
    return all.filter(d => d.date >= startDate && d.date <= endDate);
  }
  return all.slice(-days);
}

// ─── Offers ───────────────────────────────────────────────────

export async function getActiveOffers(restaurantId) {
  const today = todayKey();
  const snap = await getDocs(
    collection(db, 'restaurants', restaurantId, 'offers')
  );
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(o => o.endDate >= today && (!o.startDate || o.startDate <= today))
    .sort((a, b) => (a.endDate > b.endDate ? 1 : -1));
}

export async function getAllOffers(restaurantId) {
  const snap = await getDocs(
    collection(db, 'restaurants', restaurantId, 'offers')
  );
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

export async function createOffer(restaurantId, data) {
  return addDoc(collection(db, 'restaurants', restaurantId, 'offers'), withActor({
    ...data,
    createdAt: serverTimestamp(),
  }));
}

export async function updateOffer(restaurantId, offerId, data) {
  return updateDoc(doc(db, 'restaurants', restaurantId, 'offers', offerId), withActor({
    ...data,
    updatedAt: serverTimestamp(),
  }));
}

export async function deleteOffer(restaurantId, offerId) {
  return deleteDoc(doc(db, 'restaurants', restaurantId, 'offers', offerId));
}

// ─── Users ────────────────────────────────────────────────────

export async function getUserData(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function createUserDoc(uid, data) {
  return setDoc(doc(db, 'users', uid), {
    ...data,
    createdAt: serverTimestamp(),
  });
}

// ─── Menu Item Ratings ─────────────────────────────────────────

export async function rateMenuItem(restaurantId, itemId, rating) {
  const ref = doc(db, 'restaurants', restaurantId, 'menuItems', itemId);
  await updateDoc(ref, {
    ratingSum: increment(rating),
    ratingCount: increment(1),
  });
  // Read back to get the new average for the UI
  const snap = await getDoc(ref);
  const data = snap.data();
  const avg = data.ratingCount > 0 ? data.ratingSum / data.ratingCount : 0;
  await updateDoc(ref, { ratingAvg: Math.round(avg * 10) / 10 });
  return avg;
}

// ─── Waiter Calls ──────────────────────────────────────────────

export async function createWaiterCall(restaurantId, data) {
  return addDoc(collection(db, 'restaurants', restaurantId, 'waiterCalls'), {
    ...data,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
}

export async function getWaiterCalls(restaurantId) {
  const snap = await getDocs(
    collection(db, 'restaurants', restaurantId, 'waiterCalls')
  );
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

export async function resolveWaiterCall(restaurantId, callId) {
  return updateDoc(
    doc(db, 'restaurants', restaurantId, 'waiterCalls', callId),
    withActor({ status: 'resolved', resolvedAt: serverTimestamp() })
  );
}

export async function deleteWaiterCall(restaurantId, callId) {
  return deleteDoc(doc(db, 'restaurants', restaurantId, 'waiterCalls', callId));
}

// ─── Menu Item (bulk create for CSV import) ────────────────────

export async function createMenuItem(restaurantId, data) {
  return addDoc(
    collection(db, 'restaurants', restaurantId, 'menuItems'),
    withActor({
      ...data,
      isActive: true,
      views: 0,
      arViews: 0,
      ratingSum: 0,
      ratingCount: 0,
      ratingAvg: 0,
      createdAt: serverTimestamp(),
    })
  );
}

// ─── Smart Combos ──────────────────────────────────────────────

export async function getCombos(restaurantId) {
  const snap = await getDocs(
    query(collection(db, 'restaurants', restaurantId, 'combos'), orderBy('createdAt', 'desc'))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createCombo(restaurantId, data) {
  return addDoc(
    collection(db, 'restaurants', restaurantId, 'combos'),
    withActor({ ...data, isActive: true, createdAt: serverTimestamp() })
  );
}

export async function updateCombo(restaurantId, comboId, data) {
  return updateDoc(doc(db, 'restaurants', restaurantId, 'combos', comboId), withActor(data));
}

export async function deleteCombo(restaurantId, comboId) {
  return deleteDoc(doc(db, 'restaurants', restaurantId, 'combos', comboId));
}

// ─── All Menu Items Across All Restaurants (Super Admin) ───────

export async function getAllMenuItemsAllRestaurants() {
  const restaurants = await getAllRestaurants();
  const all = [];
  await Promise.all(
    restaurants.map(async (r) => {
      const snap = await getDocs(collection(db, 'restaurants', r.id, 'menuItems'));
      snap.docs.forEach(d => all.push({
        ...d.data(),
        id: d.id,
        restaurantId: r.id,
        restaurantName: r.name,
      }));
    })
  );
  return all.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}
// ─── Analytics — extended ──────────────────────────────────────

export async function getTodayAnalytics(restaurantId) {
  const today = todayKey();
  const snap = await getDoc(doc(db, 'restaurants', restaurantId, 'analytics', today));
  if (!snap.exists()) return { date: today, totalVisits: 0, uniqueVisitors: 0, repeatVisitors: 0 };
  return snap.data();
}

export async function getWaiterCallsCount(restaurantId, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const snap = await getDocs(collection(db, 'restaurants', restaurantId, 'waiterCalls'));
  const calls = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  const cutoff = since.getTime() / 1000;
  const inRange = calls.filter(c => (c.createdAt?.seconds || 0) >= cutoff);
  const resolved = inRange.filter(c => c.status === 'resolved');
  // avg response time in seconds
  const avgResponse = resolved.length
    ? Math.round(resolved.reduce((s, c) => s + ((c.resolvedAt?.seconds || c.createdAt?.seconds || 0) - (c.createdAt?.seconds || 0)), 0) / resolved.length)
    : 0;
  return { total: inRange.length, resolved: resolved.length, avgResponseSeconds: avgResponse };
}

// ─── Orders ────────────────────────────────────────────────────

// Allocates the next daily sequential orderNumber for this restaurant, using a Firestore
// transaction so concurrent orders cannot collide on the same number. The counter doc lives at
// restaurants/{rid}/orderCounters/{YYYY-MM-DD} and stores { nextOrder, updatedAt }. The counter
// resets implicitly each day because each day has its own doc.
// Legacy alias — kept in case external scripts import it. Prefer todayKey()
// (exported at the top of this file) for new code.
const todayKeyLocal = todayKey;

// Phase F — Takeaway pay-first flow.
// Takeaway orders that haven't been paid yet start in `awaiting_payment`
// instead of `pending`. The kitchen filters on `status === 'pending'`
// so it won't see them until markOrderPaid flips the status (which
// happens automatically when payment clears — see markOrderPaid).
//
// Dine-in orders are NOT affected: customer pays AFTER eating, so
// blocking the kitchen on payment would defeat the whole flow.
//
// If a takeaway order is created with paymentStatus already paid_*
// (e.g. customer hands cash at the counter and admin marks it
// immediately on /admin/new-order), it goes straight to `pending`.
const _PAID_STATUSES_AT_CREATE = ['paid_cash', 'paid_card', 'paid_online', 'paid'];
function _initialOrderStatus(data) {
  const isTakeaway = data.orderType === 'takeaway' || data.orderType === 'takeout';
  const isPrePaid = _PAID_STATUSES_AT_CREATE.includes(data.paymentStatus);
  if (isTakeaway && !isPrePaid) return 'awaiting_payment';
  return 'pending';
}

export async function createOrder(restaurantId, data) {
  const ordersCol = collection(db, 'restaurants', restaurantId, 'orders');
  const orderRef = doc(ordersCol); // pre-allocate a doc ID so we can write inside the txn
  const dayKey = todayKeyLocal();
  const counterRef = doc(db, 'restaurants', restaurantId, 'orderCounters', dayKey);
  const initialStatus = _initialOrderStatus(data);

  try {
    await runTransaction(db, async (txn) => {
      const counterSnap = await txn.get(counterRef);
      const current = counterSnap.exists() ? (counterSnap.data().nextOrder || 0) : 0;
      const next = current + 1;
      // Order counter doc has a strict hasOnly rule on its allowed fields —
      // do NOT add audit fields here, or the public-write rule will reject it.
      txn.set(counterRef, { nextOrder: next, updatedAt: serverTimestamp() }, { merge: true });
      // The order doc itself is fine to audit-stamp.
      txn.set(orderRef, withActor({
        ...data,
        status: initialStatus,
        paymentStatus: data.paymentStatus || 'unpaid',
        orderNumber: next,
        orderDay: dayKey,
        createdAt: serverTimestamp(),
      }));
    });
    return orderRef.id;
  } catch (err) {
    // The transaction failed. Most common cause: Firestore Security Rules denying access
    // to the orderCounters subcollection. Log loudly with the error code so this is visible
    // in DevTools, then create the order WITHOUT a number so the customer flow isn't blocked.
    // The backfill script can assign a number later if needed.
    const code = err && err.code ? err.code : 'unknown';
    console.error(
      '%c[createOrder] ⚠ Order numbering transaction FAILED (code: ' + code + '). ' +
      'This order will be created WITHOUT an orderNumber. Most common cause: Firestore Security ' +
      'Rules don\'t permit access to /restaurants/{rid}/orderCounters/{day}. Check firestore.rules.',
      'background:#FFE4E4;color:#8A0000;padding:4px 8px;font-weight:bold;border-radius:4px;',
      err
    );
    // Fallback: plain order create with no orderNumber. Use addDoc to get a fresh id.
    const fallbackRef = await addDoc(ordersCol, withActor({
      ...data,
      status: initialStatus,
      paymentStatus: data.paymentStatus || 'unpaid',
      createdAt: serverTimestamp(),
    }));
    return fallbackRef.id;
  }
}

export async function updatePaymentStatus(restaurantId, orderId, paymentStatus) {
  return updateDoc(
    doc(db, 'restaurants', restaurantId, 'orders', orderId),
    withActor({ paymentStatus, paymentUpdatedAt: serverTimestamp() })
  );
}

// Cancel an order. Used by:
//   - Customer-side: cancels their own awaiting-payment takeaway order
//     before the kitchen sees it. Firestore rule restricts customer
//     cancellation to status=='awaiting_payment'.
//   - Admin-side (restaurant admin): can cancel any order in
//     awaiting_payment / *_requested / pending. Preparing/ready/served
//     are NOT cancellable here — that needs a refund flow which is
//     out of scope.
//
// Stamps cancelledAt + cancelledBy for the audit log. lib/db.js's
// withActor() also fills in lastModifiedBy / lastModifiedAt.
//
// Note: takeaway customers cancelling AFTER they hit cash_requested
// (i.e., they were going to pay at the counter and changed their
// mind) are out of scope for the customer-side path because the
// firestore rule requires status=='awaiting_payment', not the
// payment_status. In practice once the customer picks a method on
// the payment page, the order doc still has status='awaiting_payment'
// — payment_status is the only field that flips to *_requested. So
// the customer can still cancel even after picking a method. This
// matches the user's expectation: "I picked cash but changed my mind"
// cancels cleanly, while "I already paid" doesn't (paymentStatus
// would be paid_*, status would be 'pending', neither rule branch
// permits cancellation).
export async function cancelOrder(restaurantId, orderId, reason = '') {
  return updateDoc(
    doc(db, 'restaurants', restaurantId, 'orders', orderId),
    withActor({
      status: 'cancelled',
      cancelledAt: serverTimestamp(),
      cancelledBy: reason || 'cancelled',
    })
  );
}

export async function getOrders(restaurantId) {
  const snap = await getDocs(
    query(
      collection(db, 'restaurants', restaurantId, 'orders'),
      orderBy('createdAt', 'desc'),
      limit(100)
    )
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function updateOrderStatus(restaurantId, orderId, status) {
  return updateDoc(
    doc(db, 'restaurants', restaurantId, 'orders', orderId),
    withActor({ status, updatedAt: serverTimestamp() })
  );
}
// ─── Staff ─────────────────────────────────────────────────────

export async function createStaffMember(restaurantId, data) {
  return addDoc(collection(db, 'restaurants', restaurantId, 'staff'), withActor({
    ...data,
    isActive: true,
    createdAt: serverTimestamp(),
  }));
}

export async function getStaffMembers(restaurantId) {
  const snap = await getDocs(collection(db, 'restaurants', restaurantId, 'staff'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
}

export async function updateStaffMember(restaurantId, staffId, data) {
  return updateDoc(doc(db, 'restaurants', restaurantId, 'staff', staffId), withActor({
    ...data,
    updatedAt: serverTimestamp(),
  }));
}

export async function deleteStaffMember(restaurantId, staffId) {
  return deleteDoc(doc(db, 'restaurants', restaurantId, 'staff', staffId));
}

export async function verifyStaffLogin(restaurantId, username, pin) {
  const snap = await getDocs(collection(db, 'restaurants', restaurantId, 'staff'));
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return all.find(s => s.username === username && s.pin === pin && s.isActive) || null;
}

// ─── Table Sessions ────────────────────────────────────────────
// Each table has one session doc. Token validated on menu load & order.
// Default expiry: 3 hours. Admin can activate/clear anytime.

export async function activateTableSession(restaurantId, tableNumber, hoursValid = 3) {
  const expiresAt = new Date(Date.now() + hoursValid * 60 * 60 * 1000);
  // sid: unguessable random ID embedded in QR URL — rotates on every activation
  const sid = Math.random().toString(36).slice(2, 9) + Math.random().toString(36).slice(2, 9);
  const ref = doc(db, 'restaurants', restaurantId, 'tableSessions', String(tableNumber));
  await setDoc(ref, {
    tableNumber: String(tableNumber),
    sid,
    isActive:    true,
    createdAt:   serverTimestamp(),
    expiresAt:   expiresAt.toISOString(),
  });
  return sid;
}

export async function clearTableSession(restaurantId, tableNumber) {
  const ref = doc(db, 'restaurants', restaurantId, 'tableSessions', String(tableNumber));
  await updateDoc(ref, { isActive: false });
}

export async function getTableSession(restaurantId, tableNumber) {
  const ref = doc(db, 'restaurants', restaurantId, 'tableSessions', String(tableNumber));
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data();
}

export async function getAllTableSessions(restaurantId) {
  const snap = await getDocs(collection(db, 'restaurants', restaurantId, 'tableSessions'));
  return snap.docs.map(d => d.data());
}

export function isSessionValid(session) {
  if (!session || !session.isActive) return false;
  if (!session.expiresAt) return false;
  return new Date(session.expiresAt) > new Date();
}

// Validates session is active AND the sid from URL matches Firestore
export function isSessionValidWithSid(session, urlSid) {
  if (!isSessionValid(session)) return false;
  if (!urlSid || !session.sid) return false;
  return session.sid === urlSid;
}

// ─── Coupons ────────────────────────────────────────────────────

export async function getCoupons(restaurantId) {
  const snap = await getDocs(collection(db, 'restaurants', restaurantId, 'coupons'));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

export async function createCoupon(restaurantId, data) {
  return addDoc(collection(db, 'restaurants', restaurantId, 'coupons'), withActor({
    ...data,
    code: data.code.toUpperCase().trim(),
    usedCount: 0,
    isActive: true,
    createdAt: serverTimestamp(),
  }));
}

export async function updateCoupon(restaurantId, couponId, data) {
  return updateDoc(doc(db, 'restaurants', restaurantId, 'coupons', couponId), withActor(data));
}

export async function deleteCoupon(restaurantId, couponId) {
  return deleteDoc(doc(db, 'restaurants', restaurantId, 'coupons', couponId));
}

export async function validateCoupon(restaurantId, code, subtotal) {
  // Single-field query only — avoids requiring a Firestore composite index.
  // isActive check is done in JS below.
  const q = query(
    collection(db, 'restaurants', restaurantId, 'coupons'),
    where('code', '==', code.toUpperCase().trim())
  );
  const snap = await getDocs(q);
  if (snap.empty) return { valid: false, error: 'Invalid coupon code' };
  const coupon = { id: snap.docs[0].id, ...snap.docs[0].data() };
  if (!coupon.isActive) return { valid: false, error: 'Invalid coupon code' };
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses)
    return { valid: false, error: 'Coupon has reached maximum uses' };
  if (coupon.validUntil && new Date(coupon.validUntil) < new Date())
    return { valid: false, error: 'Coupon has expired' };
  const discount = coupon.type === 'percent'
    ? Math.round(subtotal * coupon.value / 100)
    : Math.min(coupon.value, subtotal);
  return { valid: true, coupon, discount };
}

export async function incrementCouponUse(restaurantId, couponId) {
  // Server-side increment via /api/coupons/use — the Sprint 0 Firestore
  // rule lockdown made the coupons collection admin-only, so the previous
  // direct write here silently failed (catch in the customer page swallowed
  // the permission-denied error and usedCount never moved). The endpoint
  // uses the Admin SDK + a transaction so two near-simultaneous orders
  // can't push past maxUses.
  if (typeof window === 'undefined') return null;  // server-rendered call — no-op
  try {
    const res = await fetch('/api/coupons/use', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantId, couponId }),
    });
    return await res.json();
  } catch (err) {
    console.error('incrementCouponUse failed:', err);
    return { ok: false, error: 'Network error' };
  }
}

// ─── Customer Feedback ───────────────────────────────────────
export async function submitFeedback(restaurantId, data) {
  return addDoc(collection(db, 'restaurants', restaurantId, 'feedback'), {
    ...data,
    createdAt: serverTimestamp(),
  });
}

export async function getFeedback(restaurantId) {
  const snap = await getDocs(
    query(
      collection(db, 'restaurants', restaurantId, 'feedback'),
      orderBy('createdAt', 'desc'),
      limit(200)
    )
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ─── Staff-scoped helpers (Firestore-instance parameterized) ───────
// Kitchen and waiter pages pass staffDb (from lib/firebase.js) when a staff
// user is signed in — their Firebase session carries the custom claims
// (role/rid) that Firestore rules gate writes on. When the page is being
// used by an admin, the existing `updateOrderStatus` / `resolveWaiterCall`
// helpers above (which use the admin `db`) still apply. Kept below the
// existing surface per project convention (no restructure of the above).

export async function updateOrderStatusAs(firestore, restaurantId, orderId, status) {
  return updateDoc(
    doc(firestore, 'restaurants', restaurantId, 'orders', orderId),
    withActor({ status, updatedAt: serverTimestamp() })
  );
}

export async function resolveWaiterCallAs(firestore, restaurantId, callId) {
  return updateDoc(
    doc(firestore, 'restaurants', restaurantId, 'waiterCalls', callId),
    withActor({ status: 'resolved', resolvedAt: serverTimestamp() })
  );
}

// ─── Feedback mutations ────────────────────────────────────────
// Added at the bottom per the no-restructure rule. The feedback admin page
// previously had no way to act on reviews (the functions never existed).

export async function markFeedbackRead(restaurantId, feedbackId) {
  return updateDoc(
    doc(db, 'restaurants', restaurantId, 'feedback', feedbackId),
    withActor({ isRead: true, readAt: serverTimestamp() })
  );
}

export async function markAllFeedbackRead(restaurantId) {
  // Simple loop — fine for the current scale (feedback collections rarely
  // exceed a few hundred entries). If a restaurant hits thousands of reviews
  // a proper batched write is the upgrade path.
  const snap = await getDocs(
    query(
      collection(db, 'restaurants', restaurantId, 'feedback'),
      where('isRead', '==', false)
    )
  );
  // Compute the audit fields ONCE up-front so every doc in this batch shares
  // the exact same lastModifiedBy/lastModifiedAt — useful for grouping in a
  // future audit log ("admin marked 47 reviews read at 14:32").
  const stamp = withActor({ isRead: true, readAt: serverTimestamp() });
  await Promise.all(snap.docs.map(d => updateDoc(d.ref, stamp)));
  return snap.size;
}

export async function updateFeedbackNote(restaurantId, feedbackId, note) {
  return updateDoc(
    doc(db, 'restaurants', restaurantId, 'feedback', feedbackId),
    withActor({ adminNote: note, adminNoteUpdatedAt: serverTimestamp() })
  );
}

export async function deleteFeedback(restaurantId, feedbackId) {
  return deleteDoc(doc(db, 'restaurants', restaurantId, 'feedback', feedbackId));
}

// ─── Table Bills (running tabs for dine-in) ────────────────────────────
// One bill per table session. Multiple orders placed at the same table
// during one sitting all attach to the same bill via order.billId, so the
// customer sees a running total instead of a fresh bill per order.
//
// Schema: restaurants/{rid}/tableBills/{billId}
//   {
//     tableNumber:    string,
//     status:         'open' | 'closed' | 'archived',
//     openedAt:       ISO timestamp,
//     closedAt:       ISO timestamp | null,
//     lastActivityAt: ISO timestamp,    // updated on every order added — used by the future idle-archive cron
//     lastModifiedBy + lastModifiedAt   // standard audit trail
//   }
//
// Bill totals are NOT stored on the doc. They're computed at read time by
// summing across `orders` where billId matches. Single source of truth
// keeps reconciliation simple — no atomic-update race when adding /
// cancelling / refunding individual orders.
//
// The pointer `tableSessions/{tableNumber}.currentBillId` tracks which bill
// is open right now for that table. Set when bill opens; cleared on close.
// Bill creation itself is server-side via /api/tableBill/get-or-create —
// see that file for why.

// Customer-side: get or create the running bill for a table.
// Calls the server endpoint (which validates the QR `sid` against the
// table session) and returns the billId, or null on any failure.
// Failing soft is intentional — if the bill can't be created we fall
// back to single-order behaviour rather than blocking the order entirely.
export async function getOrCreateOpenTableBill(restaurantId, tableNumber, sid) {
  if (!restaurantId || !tableNumber || !sid) return null;
  try {
    const res = await fetch('/api/tableBill/get-or-create', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ restaurantId, tableNumber, sid }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.ok && data.billId) return data.billId;
    console.warn('[getOrCreateOpenTableBill] endpoint refused:', data?.error || `HTTP ${res.status}`);
    return null;
  } catch (err) {
    console.warn('[getOrCreateOpenTableBill] network error:', err?.message);
    return null;
  }
}

// Read a bill doc by id. Returns null when missing.
export async function getTableBill(restaurantId, billId) {
  if (!billId) return null;
  const ref = doc(db, 'restaurants', restaurantId, 'tableBills', billId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

// Mark a bill closed. Used by admin when all orders for the bill are paid
// (Phase C will add the admin-side close UI). Caller is responsible for
// clearing tableSessions/{tableNumber}.currentBillId so the next customer
// at that table opens a fresh bill — handled by the same Phase C work.
export async function closeTableBill(restaurantId, billId) {
  if (!billId) return;
  const ref = doc(db, 'restaurants', restaurantId, 'tableBills', billId);
  return updateDoc(ref, withActor({
    status:   'closed',
    closedAt: serverTimestamp(),
  }));
}

// ─── Phase C — Mark order paid + auto-close bill ───────────────────────
// Wraps updatePaymentStatus + the running-bill auto-close logic. Used by
// /admin/payments and /admin/waiter when staff confirms payment was
// actually collected. Two variants:
//   - markOrderPaid(rid, oid, status, extras)        — admin context (uses `db`)
//   - markOrderPaidAs(firestore, rid, oid, ...)      — staff context (passes staffDb)
//
// Both do exactly the same thing. The staff variant is needed so writes
// flow through the right Firestore Auth instance for Firestore rule
// checks. (Same pattern as updateOrderStatus / updateOrderStatusAs.)
//
// extras (optional, both variants):
//   { cashReceived?: number, changeGiven?: number }
//   Recorded on the order doc for cash audit. Only relevant when
//   paymentStatus === 'paid_cash'.
//
// Auto-close behaviour: when the new paymentStatus is paid_* AND the
// order has a billId AND every sibling order on that bill is also paid,
// we mark the bill closed and clear tableSessions.currentBillId so the
// next QR scan opens a fresh bill.
//
// Failure semantics: if the auto-close steps fail (bill query, bill
// close, session clear), we LOG and continue — the order paymentStatus
// is already written and is the customer-facing source of truth. A
// stale "open" bill can be cleaned up by admin / next sweep.

const _PAID_STATUSES = ['paid_cash', 'paid_card', 'paid_online', 'paid'];

async function _autoCloseBillIfAllPaid(firestore, restaurantId, orderId) {
  try {
    const orderRef = doc(firestore, 'restaurants', restaurantId, 'orders', orderId);
    const orderSnap = await getDoc(orderRef);
    const billId = orderSnap.data()?.billId;
    if (!billId) return;

    const siblings = await getDocs(query(
      collection(firestore, 'restaurants', restaurantId, 'orders'),
      where('billId', '==', billId)
    ));
    const allPaid = siblings.docs.every(d => _PAID_STATUSES.includes(d.data().paymentStatus));
    if (!allPaid) return;

    const billRef = doc(firestore, 'restaurants', restaurantId, 'tableBills', billId);
    const billSnap = await getDoc(billRef);
    if (!billSnap.exists() || billSnap.data().status !== 'open') return;

    await updateDoc(billRef, withActor({
      status:   'closed',
      closedAt: serverTimestamp(),
    }));

    // Clear the table-session pointer so the next QR scan opens a
    // FRESH bill at the same table. Staff path may lack permission
    // for the broader tableSessions write — Firestore rules now allow
    // staff to update ONLY currentBillId, but if that rule isn't yet
    // deployed we silently no-op and admin can clear it later.
    const tableNumber = billSnap.data().tableNumber;
    if (tableNumber) {
      const sessRef = doc(firestore, 'restaurants', restaurantId, 'tableSessions', String(tableNumber));
      await updateDoc(sessRef, { currentBillId: null }).catch(() => {});
    }
  } catch (err) {
    console.warn('[markOrderPaid] auto-close attempt failed (order is still marked paid):', err?.message);
  }
}

// Phase F — when a pay-first takeaway order finally clears, lift it
// from `awaiting_payment` to `pending` so the kitchen can start it.
// We only do this when the new paymentStatus is paid_*, and only when
// the order is currently in `awaiting_payment` — never demote a
// preparing/ready/served order back to pending.
async function _releaseAwaitingPaymentIfNeeded(firestore, restaurantId, orderId) {
  try {
    const orderRef = doc(firestore, 'restaurants', restaurantId, 'orders', orderId);
    const snap = await getDoc(orderRef);
    if (!snap.exists()) return;
    if (snap.data().status === 'awaiting_payment') {
      await updateDoc(orderRef, withActor({ status: 'pending' }));
    }
  } catch (err) {
    console.warn('[markOrderPaid] release-awaiting-payment failed:', err?.message);
  }
}

export async function markOrderPaid(restaurantId, orderId, paymentStatus, extras = {}) {
  const orderRef = doc(db, 'restaurants', restaurantId, 'orders', orderId);
  const payload = withActor({
    paymentStatus,
    paymentUpdatedAt: serverTimestamp(),
  });
  if (extras.cashReceived != null) payload.cashReceived = Number(extras.cashReceived) || 0;
  if (extras.changeGiven  != null) payload.changeGiven  = Number(extras.changeGiven)  || 0;
  await updateDoc(orderRef, payload);
  if (_PAID_STATUSES.includes(paymentStatus)) {
    // Run release + auto-close in parallel — they don't depend on each
    // other (release reads/writes the order's `status`; auto-close reads
    // the order's `billId` + sibling orders + the bill doc, then writes
    // the bill + tableSession). Sequential cost was 3 round-trips to
    // Firestore which made Mark Paid feel laggy; parallel cuts it to ~1
    // round-trip wall time.
    await Promise.all([
      _releaseAwaitingPaymentIfNeeded(db, restaurantId, orderId),
      _autoCloseBillIfAllPaid(db, restaurantId, orderId),
    ]);
  }
}

export async function markOrderPaidAs(firestore, restaurantId, orderId, paymentStatus, extras = {}) {
  const orderRef = doc(firestore, 'restaurants', restaurantId, 'orders', orderId);
  const payload = withActor({
    paymentStatus,
    paymentUpdatedAt: serverTimestamp(),
  });
  if (extras.cashReceived != null) payload.cashReceived = Number(extras.cashReceived) || 0;
  if (extras.changeGiven  != null) payload.changeGiven  = Number(extras.changeGiven)  || 0;
  await updateDoc(orderRef, payload);
  if (_PAID_STATUSES.includes(paymentStatus)) {
    await Promise.all([
      _releaseAwaitingPaymentIfNeeded(firestore, restaurantId, orderId),
      _autoCloseBillIfAllPaid(firestore, restaurantId, orderId),
    ]);
  }
}
