// lib/db.js — Firestore helper functions (client-side)
import {
  doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc,
  collection, query, where, orderBy, limit, increment, arrayUnion,
  serverTimestamp, runTransaction, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';

// ───────────────────────────────────────────────────────────────
// AUDIT FIELDS — every mutation that goes through this module stamps
// `lastModifiedBy` (the actor's Firebase Auth UID) + `lastModifiedAt`
// (server timestamp) onto the document. No UI for viewing this yet —
// it's a foundation for the future audit log + lets us debug "who
// changed X" without adding the fields after the fact (which can't
// recover the lost history).
//
// ACTOR RESOLVER (May 14): this module used to `import { adminAuth,
// superAdminAuth, staffAuth } from './firebase'` directly — which meant
// EVERYTHING that imports lib/db.js (including the customer menu page,
// which imports ~25 functions from here) transitively pulled in the
// firebase/auth SDK (~120-150KB). Now lib/db.js is auth-free: the auth
// instances live in lib/firebaseAuth.js, and that module calls
// registerActorProvider() on load to wire the resolver in.
//
// • Admin / staff / superadmin pages import from lib/firebaseAuth.js →
//   the resolver is registered → actorUid() returns the signed-in UID.
// • The customer menu page never imports lib/firebaseAuth.js → the
//   resolver stays null → actorUid() returns 'public', which is exactly
//   what the Firestore rules expect for anonymous customer writes.
// ───────────────────────────────────────────────────────────────
let _actorProvider = null;
export function registerActorProvider(fn) {
  if (typeof fn === 'function') _actorProvider = fn;
}
export function actorUid() {
  if (typeof window === 'undefined') return 'system';
  if (_actorProvider) {
    try { return _actorProvider() || 'public'; } catch { return 'public'; }
  }
  return 'public';
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

// ─── Areas & Tables (floor plan — Phase 0, 20 May 2026) ────────
//
// The floor-plan layer that powers the Table View POS dashboard +
// captain ordering. Two registries:
//   areas/{areaId}   — a section of the restaurant (A/C, Rooftop, Bar)
//   tables/{tableId} — a physical table, belongs to an area, carries
//                      a `code` (the QR identity that maps to the
//                      existing tableSessions/{code} + /r/{sub}/{code}
//                      QR URL, so the legacy QR flow keeps working).
//
// Table STATUS (blank/running/printed/paid) is NOT stored here — it's
// derived live from tableBills + orders at render time. These docs are
// pure config. Admin-managed; staff read-only (enforced in rules).

export async function getAreas(restaurantId) {
  const snap = await getDocs(
    query(collection(db, 'restaurants', restaurantId, 'areas'), orderBy('sortOrder', 'asc'))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createArea(restaurantId, data) {
  return addDoc(collection(db, 'restaurants', restaurantId, 'areas'), withActor({
    name:      String(data.name || '').trim().slice(0, 60),
    sortOrder: Number(data.sortOrder) || 0,
    createdAt: serverTimestamp(),
  }));
}

export async function updateArea(restaurantId, areaId, data) {
  return updateDoc(doc(db, 'restaurants', restaurantId, 'areas', areaId), withActor(data));
}

export async function deleteArea(restaurantId, areaId) {
  return deleteDoc(doc(db, 'restaurants', restaurantId, 'areas', areaId));
}

export async function getTables(restaurantId) {
  const snap = await getDocs(
    query(collection(db, 'restaurants', restaurantId, 'tables'), orderBy('sortOrder', 'asc'))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createTable(restaurantId, data) {
  return addDoc(collection(db, 'restaurants', restaurantId, 'tables'), withActor({
    label:     String(data.label || '').trim().slice(0, 40),
    code:      String(data.code  || '').trim().slice(0, 12),  // QR identity → tableSessions/{code}
    areaId:    data.areaId || null,
    capacity:  Number(data.capacity) || 4,
    sortOrder: Number(data.sortOrder) || 0,
    createdAt: serverTimestamp(),
  }));
}

export async function updateTable(restaurantId, tableId, data) {
  return updateDoc(doc(db, 'restaurants', restaurantId, 'tables', tableId), withActor(data));
}

export async function deleteTable(restaurantId, tableId) {
  return deleteDoc(doc(db, 'restaurants', restaurantId, 'tables', tableId));
}

// Phase 0 step 5 — area-wise access control. Assign a (waiter) staff
// member to specific areas. Empty array = all areas (the default, so
// existing staff are unaffected). Admin-only write (rules allow
// isRestaurantAdmin to write the staff doc). The waiter dashboard
// reads this off its existing staff-self snapshot and filters the
// queue to these areas; admins always see everything.
export async function setStaffAreas(restaurantId, staffId, areaIds) {
  return updateDoc(
    doc(db, 'restaurants', restaurantId, 'staff', staffId),
    withActor({ assignedAreas: Array.isArray(areaIds) ? areaIds : [] })
  );
}

// Phase 2 (captain app) — get-or-create an OPEN bill for a table when a
// waiter/admin takes the order from the Table View (no QR session/sid
// involved, unlike /api/tableBill/get-or-create). Points the table's
// session at the bill so the order joins the running tab and the Table
// View shows the full KOT/Printed/Paid lifecycle. Admin-write path
// (the Table View is admin-authed); creates the session doc if absent.
export async function getOrCreateCaptainBill(restaurantId, tableCode) {
  const code = String(tableCode || '').trim();
  if (!code) throw new Error('table code required');
  const sessionRef = doc(db, 'restaurants', restaurantId, 'tableSessions', code);
  const sessionSnap = await getDoc(sessionRef);
  const currentBillId = sessionSnap.exists() ? sessionSnap.data()?.currentBillId : null;
  if (currentBillId) {
    const billSnap = await getDoc(doc(db, 'restaurants', restaurantId, 'tableBills', currentBillId));
    if (billSnap.exists() && billSnap.data()?.status === 'open') return currentBillId;
  }
  const nowISO = new Date().toISOString();
  const billRef = await addDoc(collection(db, 'restaurants', restaurantId, 'tableBills'), withActor({
    tableNumber: code,
    status: 'open',
    openedAt: nowISO,
    closedAt: null,
    lastActivityAt: nowISO,
    orderIds: [],
    source: 'captain',
  }));
  await setDoc(sessionRef, withActor({ currentBillId: billRef.id }), { merge: true });
  return billRef.id;
}

// Phase 1a — stamp a bill as KOT-printed so the Table View flips that
// table to the gold "Running KOT" status. No-op for takeaway / single
// orders that have no billId. Best-effort: a print should never be
// blocked by the status write failing.
export async function markKotPrinted(restaurantId, billId) {
  if (!billId) return;
  return updateDoc(
    doc(db, 'restaurants', restaurantId, 'tableBills', billId),
    withActor({ kotPrintedAt: serverTimestamp() })
  );
}

// Phase 1b — stamp a bill as bill-printed → Table View green "Printed".
export async function markBillPrinted(restaurantId, billId) {
  if (!billId) return;
  return updateDoc(
    doc(db, 'restaurants', restaurantId, 'tableBills', billId),
    withActor({ billPrintedAt: serverTimestamp() })
  );
}

// Phase 2 captain fix (22 May 2026) — link an order to its bill by
// writing `billId` onto the ORDER doc. The captain flow creates the bill
// AFTER the order exists (getOrCreateCaptainBill), so unlike the customer
// QR flow the order never carried a billId. Without it, markOrderPaid's
// auto-close — which finds the bill via order.billId — can't fire, so the
// Table View leaves a settled table stuck on "Paid". Admin-context write.
export async function linkOrderToBill(restaurantId, orderId, billId) {
  if (!orderId || !billId) return;
  return updateDoc(
    doc(db, 'restaurants', restaurantId, 'orders', orderId),
    withActor({ billId })
  );
}

// Phase 2 captain fix (22 May 2026) — free a table after it's settled or
// manually cleared: close its open bill + null out the tableSessions
// pointer so the Table View derivation returns it to Blank. This is the
// EXPLICIT path used by the Table View (settle + "Free table"), covering
// captain/legacy orders whose missing billId means markOrderPaid's
// auto-close can't do it for them. Best-effort per write — a stuck
// pointer is recoverable, so one failing write shouldn't abort the rest.
export async function freeTableSession(restaurantId, tableCode, billId) {
  const tasks = [];
  if (billId) tasks.push(
    updateDoc(
      doc(db, 'restaurants', restaurantId, 'tableBills', billId),
      withActor({ status: 'closed', closedAt: serverTimestamp() })
    ).catch(() => {})
  );
  const code = String(tableCode || '').trim();
  if (code) tasks.push(
    setDoc(
      doc(db, 'restaurants', restaurantId, 'tableSessions', code),
      // Also clear the waitlist "seated" hold (Phase 7) so a freed table
      // returns fully to Blank, not stuck on the Seated state.
      withActor({ currentBillId: null, seatedAt: null, seatedName: null, seatedPartySize: null }),
      { merge: true }
    ).catch(() => {})
  );
  await Promise.all(tasks);
}

// Phase 7 — mark a table as physically occupied ("Seated") when a host
// seats a waitlist party onto it, BEFORE any order exists. Writes a soft
// hold onto the table's session; the Table View shows STATUS.seated when
// a session carries seatedAt but has no live orders yet. Cleared by
// freeTableSession() when the table is settled / freed. No bill or order
// is created here — the host takes the order from the Table View as usual.
export async function markTableSeated(restaurantId, tableCode, info = {}) {
  const code = String(tableCode || '').trim();
  if (!code) return;
  return setDoc(
    doc(db, 'restaurants', restaurantId, 'tableSessions', code),
    withActor({
      seatedAt: serverTimestamp(),
      seatedName: String(info.name || '').slice(0, 60),
      seatedPartySize: Math.max(0, Math.floor(Number(info.partySize) || 0)),
    }),
    { merge: true }
  );
}

// ─── Day Close / Z-report snapshots (Phase 1b) ─────────────────
// Persist a frozen end-of-day reconciliation at dayCloses/{YYYY-MM-DD}.
// Once saved the day is "locked" — the figures are a permanent record
// (cash float, sales by mode, tax, variance). Reopen deletes the
// snapshot so the day can be recounted. Admin-only (financial data).
export async function saveDayClose(restaurantId, dateKey, data) {
  return setDoc(
    doc(db, 'restaurants', restaurantId, 'dayCloses', dateKey),
    withActor({ ...data, dateKey, locked: true, closedAt: serverTimestamp() }),
    { merge: true }
  );
}

export async function getDayClose(restaurantId, dateKey) {
  const snap = await getDoc(doc(db, 'restaurants', restaurantId, 'dayCloses', dateKey));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getDayCloses(restaurantId, max = 30) {
  const snap = await getDocs(
    query(collection(db, 'restaurants', restaurantId, 'dayCloses'), orderBy('dateKey', 'desc'), limit(max))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function reopenDay(restaurantId, dateKey) {
  return deleteDoc(doc(db, 'restaurants', restaurantId, 'dayCloses', dateKey));
}

// ─── Reservations (table booking — Phase 2 #8) ─────────────────
// Customer creates go through /api/reservation/create (Admin SDK).
// These helpers are the admin-side management (read/update/delete).
export async function getReservations(restaurantId, opts = {}) {
  const fs = opts.db || db;
  const snap = await getDocs(
    query(collection(fs, 'restaurants', restaurantId, 'reservations'), orderBy('date', 'asc'))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function updateReservation(restaurantId, resId, data, opts = {}) {
  const fs = opts.db || db;
  return updateDoc(doc(fs, 'restaurants', restaurantId, 'reservations', resId), withActor(data));
}

export async function deleteReservation(restaurantId, resId, opts = {}) {
  const fs = opts.db || db;
  return deleteDoc(doc(fs, 'restaurants', restaurantId, 'reservations', resId));
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

// Phase 2.5 — Append an orderId to a bill's orderIds array.
//
// Called right after createOrder() succeeds for a dine-in order with a
// billId. The bill listener on the customer page reads bill.orderIds and
// sets up per-doc listeners for each — replaces the old
// `where('billId', '==', X)` query which required public list permission
// on the orders collection (CRITICAL audit C2 — a PII leak: anyone could
// dump every order for every restaurant via that list query).
//
// Best-effort: customer's own placedOrder listener (per-doc, by orderId)
// continues to work even if this arrayUnion fails — they see their order.
// Other customers at the same table need this to succeed to discover the
// new order via the bill listener. If it fails, those split-bill viewers
// would miss the new order until the bill is read fresh (e.g. page reload).
// Tradeoff is acceptable: the alternative is wrapping the order create +
// bill update in a transaction across two collections, which introduces a
// risk of order-creation rollback if the bill update fails — worse UX.
//
// The Firestore rule on tableBills (added 2026-05-16) permits this exact
// write shape: customer can update IF only `orderIds` field is changing
// AND the new array is a superset of the old (arrayUnion semantics).
export async function attachOrderToBill(restaurantId, billId, orderId) {
  if (!restaurantId || !billId || !orderId) return;
  try {
    await updateDoc(
      doc(db, 'restaurants', restaurantId, 'tableBills', billId),
      { orderIds: arrayUnion(orderId) }
    );
  } catch (err) {
    // Don't throw — see top-of-fn rationale. Log so we can see how often
    // this fails (probably never in practice).
    console.warn('[attachOrderToBill] failed:', err?.message);
  }
}

export async function updatePaymentStatus(restaurantId, orderId, paymentStatus) {
  return updateDoc(
    doc(db, 'restaurants', restaurantId, 'orders', orderId),
    withActor({ paymentStatus, paymentUpdatedAt: serverTimestamp() })
  );
}

// Phase A.2 — Atomic multi-order payment status update.
//
// When a dine-in customer settles their bill (which can have several
// orders on it), every order on that bill needs the same paymentStatus
// flip. We used to do this as `Promise.all(orderIds.map(updateOne))` —
// parallel independent writes. That had two problems:
//   1. Race condition. If the SDK's auth-refresh fires between dispatch
//      and acknowledgement, one of the parallel writes could silently
//      end up against a stale ID token while the other lands cleanly —
//      manifesting as "the customer-side UI says both are 'Cash
//      Requested' but admin only sees one of them updated".
//   2. Non-atomic. If the rule rejects one write (or it just fails for
//      any reason), the others still commit — leaving a mixed-state
//      bill that confuses both the cashier and the customer.
//
// Firestore writeBatch fixes both: all writes hit the server in a
// single commit message; the server either applies every one or none.
// One round-trip, no parallel-race risk, atomic outcome. Throws if
// any write was rejected, with the rejection in the error — letting
// the caller surface a real error instead of silently completing.
export async function updatePaymentStatusBatch(restaurantId, orderIds, paymentStatus) {
  if (!Array.isArray(orderIds) || orderIds.length === 0) return;
  const batch = writeBatch(db);
  for (const oid of orderIds) {
    if (!oid) continue;
    batch.update(
      doc(db, 'restaurants', restaurantId, 'orders', oid),
      withActor({ paymentStatus, paymentUpdatedAt: serverTimestamp() })
    );
  }
  return batch.commit();
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
      // Also reset paymentStatus to 'unpaid' so the admin payments
      // page doesn't show a cancelled order as "still waiting on
      // payment" — important when the customer had clicked Cash /
      // Card / UPI before cancelling, which left a *_requested
      // signal on the order. The customer-side Firestore rule
      // explicitly permits this transition when cancel is in flight.
      paymentStatus: 'unpaid',
      paymentUpdatedAt: serverTimestamp(),
    })
  );
}

// `opts.db` lets a caller read through a different Firestore connection
// (e.g. the staff app's `staffDb` for an RBAC staff session). Defaults to
// the admin `db` so every existing caller is unaffected.
export async function getOrders(restaurantId, opts = {}) {
  const fs = opts.db || db;
  const snap = await getDocs(
    query(
      collection(fs, 'restaurants', restaurantId, 'orders'),
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

// ─── Per-item ready/served (kitchen page, May 8) ────────────────────
// Items in an order can take very different times to prepare and arrive.
// These helpers let the kitchen mark each item ready/served independently.
// Runs in a transaction because Firestore can't atomically update one
// element of an array — we read the doc, mutate the items array in JS,
// and write the whole array back. The transaction guards against two
// staff members tapping different items at the exact same instant.
//
// Order's overall `status` is auto-derived from the aggregate:
//   - All items have servedAt → status = 'served'
//   - All items have readyAt + status was 'preparing' → status = 'ready'
// We don't downgrade status (e.g. ready → preparing) from this path —
// that's an admin recall action handled elsewhere.
//
// We use `new Date()` (a JS Date) inside the items array because
// serverTimestamp() sentinels can't be placed inside arrays in
// Firestore. The Date is converted to a Timestamp on write, which is
// indistinguishable from serverTimestamp at read time. The order-level
// updatedAt still uses serverTimestamp for canonical ordering.
async function markOrderItemTimestampAs(firestore, restaurantId, orderId, itemIdx, field) {
  if (!['readyAt', 'servedAt'].includes(field)) {
    throw new Error(`Invalid field: ${field}`);
  }
  const ref = doc(firestore, 'restaurants', restaurantId, 'orders', orderId);
  return runTransaction(firestore, async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists()) throw new Error('Order not found');
    const data = snap.data();
    const items = Array.isArray(data.items) ? data.items.slice() : [];
    if (itemIdx < 0 || itemIdx >= items.length) {
      throw new Error(`Item index ${itemIdx} out of range`);
    }
    // Idempotent — if already stamped, do nothing.
    if (items[itemIdx]?.[field]) return;
    items[itemIdx] = { ...items[itemIdx], [field]: new Date() };

    const allServed = items.length > 0 && items.every(it => it.servedAt);
    const allReady  = items.length > 0 && items.every(it => it.readyAt);
    const updates = withActor({ items, updatedAt: serverTimestamp() });
    if (allServed && data.status !== 'served') {
      updates.status = 'served';
    } else if (allReady && data.status === 'preparing') {
      updates.status = 'ready';
    }
    txn.update(ref, updates);
  });
}

export function markOrderItemReadyAs(firestore, restaurantId, orderId, itemIdx) {
  return markOrderItemTimestampAs(firestore, restaurantId, orderId, itemIdx, 'readyAt');
}

export function markOrderItemServedAs(firestore, restaurantId, orderId, itemIdx) {
  return markOrderItemTimestampAs(firestore, restaurantId, orderId, itemIdx, 'servedAt');
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

// ─── Vendors / Purchase Orders / Expenses (Phase 3, 22 May 2026) ──────
// Back-of-house finance: who you buy from (vendors), the formal orders
// you place with them (purchaseOrders), and money going out the door
// (expenses). All three are FINANCIAL data — admin + superadmin only in
// firestore.rules (NEVER staff, NEVER public), the same trust tier as
// dayCloses. Pages subscribe live via onSnapshot for the lists; these
// helpers cover the audited mutations + a couple of one-shot reads
// (vendor dropdowns). Derived totals — a vendor's payable, this month's
// spend, a PO's grand total — are computed at READ time in the pages and
// on the PO doc at WRITE time; we never keep a separate running counter
// that could drift out of sync with the source rows.
//
// NOTE: amounts are stored in rupees (number), rounded to 2 dp on write.

// Round a money value to 2 decimal places (paise). Guards NaN → 0.
function _money(n) {
  const v = Number(n);
  if (!isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

// ── Vendors ───────────────────────────────────────────────────
export async function getVendors(restaurantId, opts = {}) {
  const fs = opts.db || db;
  const snap = await getDocs(collection(fs, 'restaurants', restaurantId, 'vendors'));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

// Sanitize a vendor payload — shared by create + update so an edit can
// never write a field the create path wouldn't have allowed.
function _cleanVendor(data = {}) {
  const out = {};
  if (data.name        !== undefined) out.name        = String(data.name || '').trim().slice(0, 80);
  if (data.phone       !== undefined) out.phone       = String(data.phone || '').replace(/\D/g, '').slice(0, 15);
  if (data.category    !== undefined) out.category    = String(data.category || '').trim().slice(0, 40);
  if (data.gstin       !== undefined) out.gstin       = String(data.gstin || '').trim().toUpperCase().slice(0, 15);
  if (data.openingBalance !== undefined) out.openingBalance = _money(data.openingBalance);
  if (data.notes       !== undefined) out.notes       = String(data.notes || '').trim().slice(0, 300);
  if (data.isActive    !== undefined) out.isActive    = data.isActive !== false;
  return out;
}

export async function createVendor(restaurantId, data, opts = {}) {
  const fs = opts.db || db;
  return addDoc(collection(fs, 'restaurants', restaurantId, 'vendors'), withActor({
    name: '', phone: '', category: '', gstin: '', openingBalance: 0, notes: '',
    isActive: true,
    ..._cleanVendor(data),
    createdAt: serverTimestamp(),
  }));
}

export async function updateVendor(restaurantId, vendorId, data, opts = {}) {
  const fs = opts.db || db;
  return updateDoc(
    doc(fs, 'restaurants', restaurantId, 'vendors', vendorId),
    withActor({ ..._cleanVendor(data), updatedAt: serverTimestamp() })
  );
}

export async function deleteVendor(restaurantId, vendorId, opts = {}) {
  const fs = opts.db || db;
  return deleteDoc(doc(fs, 'restaurants', restaurantId, 'vendors', vendorId));
}

// ── Expenses ──────────────────────────────────────────────────
const _EXPENSE_MODES = ['cash', 'card', 'upi', 'credit'];

export async function getExpenses(restaurantId, max = 500, opts = {}) {
  const fs = opts.db || db;
  const snap = await getDocs(query(
    collection(fs, 'restaurants', restaurantId, 'expenses'),
    orderBy('date', 'desc'), limit(max)
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function _cleanExpense(data = {}) {
  const out = {};
  if (data.date        !== undefined) out.date        = String(data.date || '').slice(0, 10);
  if (data.category    !== undefined) out.category    = String(data.category || '').trim().slice(0, 40);
  if (data.amount      !== undefined) out.amount      = Math.max(0, _money(data.amount));
  if (data.paymentMode !== undefined) out.paymentMode = _EXPENSE_MODES.includes(data.paymentMode) ? data.paymentMode : 'cash';
  if (data.vendorId    !== undefined) out.vendorId    = data.vendorId || null;
  if (data.vendorName  !== undefined) out.vendorName  = data.vendorName ? String(data.vendorName).slice(0, 80) : null;
  if (data.note        !== undefined) out.note        = String(data.note || '').trim().slice(0, 200);
  if (data.poId        !== undefined) out.poId        = data.poId || null;
  return out;
}

export async function createExpense(restaurantId, data, opts = {}) {
  const fs = opts.db || db;
  return addDoc(collection(fs, 'restaurants', restaurantId, 'expenses'), withActor({
    date: todayKey(), category: '', amount: 0, paymentMode: 'cash',
    vendorId: null, vendorName: null, note: '', poId: null,
    ..._cleanExpense(data),
    createdAt: serverTimestamp(),
  }));
}

export async function updateExpense(restaurantId, expenseId, data, opts = {}) {
  const fs = opts.db || db;
  return updateDoc(
    doc(fs, 'restaurants', restaurantId, 'expenses', expenseId),
    withActor({ ..._cleanExpense(data), updatedAt: serverTimestamp() })
  );
}

export async function deleteExpense(restaurantId, expenseId, opts = {}) {
  const fs = opts.db || db;
  return deleteDoc(doc(fs, 'restaurants', restaurantId, 'expenses', expenseId));
}

// ── Purchase Orders ───────────────────────────────────────────
// Line items: [{ name, qty, unit, rate, amount }]. amount is derived
// (qty × rate) on write so the row can't lie about its own subtotal.
// Doc totals (subtotal, taxAmount, total) are likewise recomputed from
// the cleaned items on every write — the client never gets to set them.
const _PO_STATUSES = ['draft', 'sent', 'received', 'cancelled'];

function _cleanPoItems(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 100).map(it => {
    const qty  = Math.max(0, _money(it?.qty));
    const rate = Math.max(0, _money(it?.rate));
    return {
      name:   String(it?.name || '').trim().slice(0, 80),
      qty,
      unit:   String(it?.unit || '').trim().slice(0, 16),
      rate,
      amount: _money(qty * rate),
    };
  }).filter(it => it.name);
}

// Compute { items, subtotal, taxPercent, taxAmount, total } from a raw
// payload. Pure — used by both create and update.
function _poTotals(data) {
  const items = _cleanPoItems(data.items);
  const subtotal = _money(items.reduce((s, it) => s + it.amount, 0));
  const taxPercent = Math.max(0, _money(data.taxPercent));
  const taxAmount = _money(subtotal * taxPercent / 100);
  const total = _money(subtotal + taxAmount);
  return { items, subtotal, taxPercent, taxAmount, total };
}

export async function getPurchaseOrders(restaurantId, max = 200, opts = {}) {
  const fs = opts.db || db;
  const snap = await getDocs(query(
    collection(fs, 'restaurants', restaurantId, 'purchaseOrders'),
    orderBy('date', 'desc'), limit(max)
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createPurchaseOrder(restaurantId, data, opts = {}) {
  const fs = opts.db || db;
  const totals = _poTotals(data);
  return addDoc(collection(fs, 'restaurants', restaurantId, 'purchaseOrders'), withActor({
    vendorId:   data.vendorId || null,
    vendorName: data.vendorName ? String(data.vendorName).slice(0, 80) : null,
    date:       String(data.date || '').slice(0, 10) || todayKey(),
    ...totals,
    status:     _PO_STATUSES.includes(data.status) ? data.status : 'draft',
    receivedAt: null,
    expenseRecorded: false,
    note:       String(data.note || '').trim().slice(0, 200),
    createdAt:  serverTimestamp(),
  }));
}

export async function updatePurchaseOrder(restaurantId, poId, data, opts = {}) {
  const fs = opts.db || db;
  // Recompute totals whenever items/tax are part of the edit so a
  // hand-tampered total can never be persisted.
  let payload = { updatedAt: serverTimestamp() };
  if (data.vendorId   !== undefined) payload.vendorId   = data.vendorId || null;
  if (data.vendorName !== undefined) payload.vendorName = data.vendorName ? String(data.vendorName).slice(0, 80) : null;
  if (data.date       !== undefined) payload.date       = String(data.date || '').slice(0, 10);
  if (data.note       !== undefined) payload.note       = String(data.note || '').trim().slice(0, 200);
  if (data.items !== undefined || data.taxPercent !== undefined) {
    Object.assign(payload, _poTotals(data));
  }
  return updateDoc(doc(fs, 'restaurants', restaurantId, 'purchaseOrders', poId), withActor(payload));
}

export async function deletePurchaseOrder(restaurantId, poId, opts = {}) {
  const fs = opts.db || db;
  return deleteDoc(doc(fs, 'restaurants', restaurantId, 'purchaseOrders', poId));
}

// Move a PO along its lifecycle. 'received' also stamps receivedAt so the
// list can show when stock actually landed.
export async function setPurchaseOrderStatus(restaurantId, poId, status, opts = {}) {
  const fs = opts.db || db;
  if (!_PO_STATUSES.includes(status)) throw new Error('invalid PO status');
  const patch = { status };
  if (status === 'received') patch.receivedAt = serverTimestamp();
  return updateDoc(doc(fs, 'restaurants', restaurantId, 'purchaseOrders', poId), withActor(patch));
}

// Record a PO as an expense (so it flows into the P&L) without double
// entry: writes one expense row linked back via poId + flips the PO's
// expenseRecorded flag so the UI can hide the button afterwards. The two
// writes are independent best-effort — if the flag write fails the
// expense still lands (the source of truth for spend) and the worst case
// is the button reappears. paymentMode defaults to 'credit' (you owe the
// vendor) but the caller can pass cash/card/upi if paid on delivery.
export async function recordPurchaseOrderExpense(restaurantId, po, paymentMode = 'credit', opts = {}) {
  const fs = opts.db || db;
  if (!po || !po.id) throw new Error('purchase order required');
  const ref = await createExpense(restaurantId, {
    date: todayKey(),
    category: 'Purchase / stock',
    amount: po.total || 0,
    paymentMode,
    vendorId: po.vendorId || null,
    vendorName: po.vendorName || null,
    note: `Purchase order${po.vendorName ? ' — ' + po.vendorName : ''}`,
    poId: po.id,
  }, opts);
  try {
    await updateDoc(
      doc(fs, 'restaurants', restaurantId, 'purchaseOrders', po.id),
      withActor({ expenseRecorded: true })
    );
  } catch (err) {
    console.warn('[recordPurchaseOrderExpense] flag write failed (expense still recorded):', err?.message);
  }
  return ref;
}

// ─── Customers / CRM + Loyalty (Phase 4, 22 May 2026) ──────────
// A customer is keyed by their 10-digit phone (doc id) so repeat
// visits dedupe naturally and we can look one up at the counter. The
// objective fields — visits, totalSpent, first/lastSeenAt — are
// recomputed server-side by /api/crm/sync from existing orders +
// reservations (it never touches the live order-create path). The
// subjective fields — pointsAdjust, tags, notes, marketingOptOut —
// are admin-owned and PRESERVED across syncs (the endpoint merges).
//
// Loyalty points are DERIVED, never stored as one mutable balance that
// could drift: earned = floor(totalSpent / 100) * pointsPer100;
// balance = earned + pointsAdjust. A redemption or manual bonus is just
// a signed delta on pointsAdjust (adjustCustomerPoints) — so a re-sync
// recomputes spend freely without ever clobbering a redemption.
//
// PII (name/phone/email) → admin + superadmin only in firestore.rules.

// Normalise any phone string to its last 10 digits (India). Returns ''
// when fewer than 10 digits — callers treat that as "no key".
export function normalizePhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
}

// Loyalty maths — pure. cfg: { pointsPer100, pointValue }. Returns
// { earned, balance, worth } where worth is the rupee value of the
// balance at pointValue ₹/point.
export function loyaltyFor(customer, cfg = {}) {
  const per100 = Math.max(0, Number(cfg.pointsPer100) || 0);
  const pointValue = Math.max(0, Number(cfg.pointValue) || 0);
  const earned = Math.floor((Number(customer?.totalSpent) || 0) / 100) * per100;
  const balance = Math.max(0, earned + (Number(customer?.pointsAdjust) || 0));
  return { earned, balance, worth: Math.round(balance * pointValue) };
}

export async function getCustomers(restaurantId, max = 2000) {
  const snap = await getDocs(query(
    collection(db, 'restaurants', restaurantId, 'customers'),
    orderBy('lastSeenAt', 'desc'), limit(max)
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Manual add (admin types a customer in). Keyed by phone so it merges
// with any future synced data for the same number. Refuses a bad phone.
export async function createCustomer(restaurantId, data) {
  const phone = normalizePhone(data.phone);
  if (!phone) throw new Error('A valid 10-digit phone is required');
  const nowISO = new Date().toISOString();
  await setDoc(doc(db, 'restaurants', restaurantId, 'customers', phone), withActor({
    name: String(data.name || '').trim().slice(0, 80),
    phone,
    email: data.email ? String(data.email).trim().slice(0, 120) : null,
    visits: 0, totalSpent: 0,
    pointsAdjust: Math.round(Number(data.pointsAdjust) || 0),
    tags: Array.isArray(data.tags) ? data.tags.slice(0, 20) : [],
    notes: String(data.notes || '').trim().slice(0, 300),
    marketingOptOut: !!data.marketingOptOut,
    firstSeenAt: nowISO, lastSeenAt: nowISO,
    source: 'manual',
    createdAt: serverTimestamp(),
  }), { merge: true });
  return phone;
}

export async function updateCustomer(restaurantId, phone, data) {
  const out = { updatedAt: serverTimestamp() };
  if (data.name            !== undefined) out.name = String(data.name || '').trim().slice(0, 80);
  if (data.email           !== undefined) out.email = data.email ? String(data.email).trim().slice(0, 120) : null;
  if (data.tags            !== undefined) out.tags = Array.isArray(data.tags) ? data.tags.slice(0, 20) : [];
  if (data.notes           !== undefined) out.notes = String(data.notes || '').trim().slice(0, 300);
  if (data.marketingOptOut !== undefined) out.marketingOptOut = !!data.marketingOptOut;
  return updateDoc(doc(db, 'restaurants', restaurantId, 'customers', phone), withActor(out));
}

// Adjust loyalty points by a signed delta (bonus + / redemption −).
// Uses increment() so concurrent taps are safe.
export async function adjustCustomerPoints(restaurantId, phone, delta) {
  const d = Math.round(Number(delta) || 0);
  if (!d) return;
  return updateDoc(
    doc(db, 'restaurants', restaurantId, 'customers', phone),
    withActor({ pointsAdjust: increment(d), pointsAdjustedAt: serverTimestamp() })
  );
}

export async function deleteCustomer(restaurantId, phone) {
  return deleteDoc(doc(db, 'restaurants', restaurantId, 'customers', phone));
}

// ─── Campaigns (marketing history — Phase 5, 22 May 2026) ──────
// A saved record of a marketing send: name, channel, message, the
// audience it targeted, and how many it reached. WhatsApp sends are
// click-to-send (the admin opens each wa.me link), so for that channel
// "sentCount" is the number of links generated. Email sends go through
// /api/crm/campaign-email (capped + rate-limited) and sentCount is the
// number Gmail actually accepted. No customer PII is stored on the
// campaign doc — just the aggregate.
export async function getCampaigns(restaurantId, max = 100) {
  const snap = await getDocs(query(
    collection(db, 'restaurants', restaurantId, 'campaigns'),
    orderBy('createdAt', 'desc'), limit(max)
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createCampaign(restaurantId, data) {
  return addDoc(collection(db, 'restaurants', restaurantId, 'campaigns'), withActor({
    name:          String(data.name || '').trim().slice(0, 120),
    channel:       ['whatsapp', 'email'].includes(data.channel) ? data.channel : 'whatsapp',
    subject:       String(data.subject || '').trim().slice(0, 140),
    message:       String(data.message || '').trim().slice(0, 2000),
    audienceLabel: String(data.audienceLabel || '').slice(0, 80),
    recipientCount: Math.max(0, Math.floor(Number(data.recipientCount) || 0)),
    sentCount:      Math.max(0, Math.floor(Number(data.sentCount) || 0)),
    createdAt:     serverTimestamp(),
  }));
}

export async function deleteCampaign(restaurantId, campaignId) {
  return deleteDoc(doc(db, 'restaurants', restaurantId, 'campaigns', campaignId));
}

// ─── Waitlist / host stand (Phase 7, 22 May 2026) ──────────────
// The walk-in queue for when the floor is full: the host adds a party
// (name, party size, phone) and works them off as tables clear. Status
// flow: waiting → notified → seated (or cancelled / noshow). Wait times
// are DERIVED at read time from createdAt → seatedAt — nothing stored
// that could drift. Distinct from reservations (future bookings); this
// is right-now walk-ins. PII (name/phone) → admin + staff read, admin
// write in firestore.rules; never public.
const _WAITLIST_STATUSES = ['waiting', 'notified', 'seated', 'cancelled', 'noshow'];

export async function getWaitlist(restaurantId, max = 200) {
  const snap = await getDocs(query(
    collection(db, 'restaurants', restaurantId, 'waitlist'),
    orderBy('createdAt', 'asc'), limit(max)
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function _cleanWaitlist(data = {}) {
  const out = {};
  if (data.name          !== undefined) out.name          = String(data.name || '').trim().slice(0, 60);
  if (data.phone         !== undefined) out.phone         = String(data.phone || '').replace(/\D/g, '').slice(0, 15);
  if (data.partySize     !== undefined) out.partySize     = Math.max(1, Math.min(99, Math.floor(Number(data.partySize) || 1)));
  if (data.note          !== undefined) out.note          = String(data.note || '').trim().slice(0, 200);
  if (data.quotedMinutes !== undefined) out.quotedMinutes = Math.max(0, Math.min(600, Math.floor(Number(data.quotedMinutes) || 0)));
  return out;
}

export async function createWaitlistEntry(restaurantId, data) {
  return addDoc(collection(db, 'restaurants', restaurantId, 'waitlist'), withActor({
    name: '', phone: '', partySize: 1, note: '', quotedMinutes: 0,
    ..._cleanWaitlist(data),
    status: 'waiting',
    notifiedAt: null, seatedAt: null, tableCode: null,
    createdAt: serverTimestamp(),
  }));
}

export async function updateWaitlistEntry(restaurantId, entryId, data) {
  return updateDoc(
    doc(db, 'restaurants', restaurantId, 'waitlist', entryId),
    withActor({ ..._cleanWaitlist(data), updatedAt: serverTimestamp() })
  );
}

// Move an entry along its lifecycle, stamping the relevant time. Seating
// can optionally record which table they were sat at (informational).
export async function setWaitlistStatus(restaurantId, entryId, status, extra = {}) {
  if (!_WAITLIST_STATUSES.includes(status)) throw new Error('invalid waitlist status');
  const patch = { status };
  if (status === 'notified') patch.notifiedAt = serverTimestamp();
  if (status === 'seated') {
    patch.seatedAt = serverTimestamp();
    if (extra.tableCode !== undefined) patch.tableCode = extra.tableCode || null;
  }
  return updateDoc(doc(db, 'restaurants', restaurantId, 'waitlist', entryId), withActor(patch));
}

export async function deleteWaitlistEntry(restaurantId, entryId) {
  return deleteDoc(doc(db, 'restaurants', restaurantId, 'waitlist', entryId));
}

// ─── Staff roles / RBAC (Phase 8, 22 May 2026) ─────────────────
// Custom access roles the owner defines: a name + a list of permission
// keys (from lib/permissions.js). Staff are assigned a role via
// setStaffRole. STAGE A is management-only — enforcement (permissions
// minted into the login token + Firestore-rule checks + page access)
// lands in a later stage, so assigning a role here changes nothing about
// what a staffer can reach yet. Admin + superadmin only (firestore.rules).
function _cleanPerms(list) {
  return Array.isArray(list)
    ? [...new Set(list.filter(k => typeof k === 'string'))].slice(0, 60)
    : [];
}

export async function getStaffRoles(restaurantId) {
  const snap = await getDocs(query(
    collection(db, 'restaurants', restaurantId, 'staffRoles'),
    orderBy('createdAt', 'asc')
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createStaffRole(restaurantId, data) {
  return addDoc(collection(db, 'restaurants', restaurantId, 'staffRoles'), withActor({
    name: String(data.name || '').trim().slice(0, 40) || 'New role',
    permissions: _cleanPerms(data.permissions),
    createdAt: serverTimestamp(),
  }));
}

export async function updateStaffRole(restaurantId, roleId, data) {
  const out = { updatedAt: serverTimestamp() };
  if (data.name        !== undefined) out.name = String(data.name || '').trim().slice(0, 40) || 'Role';
  if (data.permissions !== undefined) out.permissions = _cleanPerms(data.permissions);
  return updateDoc(doc(db, 'restaurants', restaurantId, 'staffRoles', roleId), withActor(out));
}

export async function deleteStaffRole(restaurantId, roleId) {
  return deleteDoc(doc(db, 'restaurants', restaurantId, 'staffRoles', roleId));
}

// Assign (or clear) a custom access role on a staff member. roleId = null
// falls the staffer back to their legacy job role (kitchen / waiter).
export async function setStaffRole(restaurantId, staffId, roleId) {
  return updateDoc(
    doc(db, 'restaurants', restaurantId, 'staff', staffId),
    withActor({ roleId: roleId || null })
  );
}
