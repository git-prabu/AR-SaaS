// lib/db.js — Firestore helper functions (client-side)
import {
  doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc,
  collection, query, where, orderBy, limit, increment,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

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
  return updateDoc(doc(db, 'restaurants', id), data);
}

// ─── Menu Items ────────────────────────────────────────────────

export async function getMenuItems(restaurantId) {
  const q = query(
    collection(db, 'restaurants', restaurantId, 'menuItems'),
    where('isActive', '==', true)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
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
  return updateDoc(
    doc(db, 'restaurants', restaurantId, 'menuItems', itemId),
    { views: increment(1) }
  );
}

export async function incrementARView(restaurantId, itemId) {
  return updateDoc(
    doc(db, 'restaurants', restaurantId, 'menuItems', itemId),
    { arViews: increment(1) }
  );
}

export async function updateMenuItem(restaurantId, itemId, data) {
  return updateDoc(
    doc(db, 'restaurants', restaurantId, 'menuItems', itemId),
    { ...data, updatedAt: serverTimestamp() }
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
    updates
  );
}

export async function deleteRequest(restaurantId, requestId) {
  return deleteDoc(doc(db, 'restaurants', restaurantId, 'requests', requestId));
}

// New flow: publish menu item immediately (no AR), then create request for 3D upload
export async function submitRequestAndPublish(restaurantId, data, restaurant) {
  // 1. Create request doc → get its auto-generated ID
  const reqRef = await addDoc(collection(db, 'restaurants', restaurantId, 'requests'), {
    ...data,
    status: 'pending',
    createdAt: serverTimestamp(),
    reviewedAt: null,
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
  });

  // 3. Increment itemsUsed on restaurant doc
  await updateDoc(doc(db, 'restaurants', restaurantId), {
    itemsUsed: (restaurant?.itemsUsed || 0) + 1,
  });

  return reqRef;
}

// ─── Analytics ────────────────────────────────────────────────

export async function trackVisit(restaurantId, sessionId) {
  const today = new Date().toISOString().split('T')[0];
  const ref = doc(db, 'restaurants', restaurantId, 'analytics', today);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      date: today,
      totalVisits: 1,
      uniqueVisitors: 1,
      repeatVisitors: 0,
      sessions: [sessionId],
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
    });
  }
}

export async function getAnalytics(restaurantId, days = 30) {
  // Get all analytics docs and sort client-side
  const snap = await getDocs(
    collection(db, 'restaurants', restaurantId, 'analytics')
  );
  return snap.docs
    .map(d => d.data())
    .sort((a, b) => (a.date > b.date ? 1 : -1))
    .slice(-days);
}

// ─── Offers ───────────────────────────────────────────────────

export async function getActiveOffers(restaurantId) {
  const today = new Date().toISOString().split('T')[0];
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
  return addDoc(collection(db, 'restaurants', restaurantId, 'offers'), {
    ...data,
    createdAt: serverTimestamp(),
  });
}

export async function updateOffer(restaurantId, offerId, data) {
  return updateDoc(doc(db, 'restaurants', restaurantId, 'offers', offerId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
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
  // Each device/session can rate once — we store by itemId only (simple avg)
  const ref = doc(db, 'restaurants', restaurantId, 'menuItems', itemId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const currentSum = data.ratingSum || 0;
  const currentCount = data.ratingCount || 0;
  await updateDoc(ref, {
    ratingSum: currentSum + rating,
    ratingCount: currentCount + 1,
    ratingAvg: parseFloat(((currentSum + rating) / (currentCount + 1)).toFixed(1)),
  });
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
    { status: 'resolved', resolvedAt: serverTimestamp() }
  );
}

export async function deleteWaiterCall(restaurantId, callId) {
  return deleteDoc(doc(db, 'restaurants', restaurantId, 'waiterCalls', callId));
}

// ─── Menu Item (bulk create for CSV import) ────────────────────

export async function createMenuItem(restaurantId, data) {
  return addDoc(
    collection(db, 'restaurants', restaurantId, 'menuItems'),
    {
      ...data,
      isActive: true,
      views: 0,
      arViews: 0,
      ratingSum: 0,
      ratingCount: 0,
      ratingAvg: 0,
      createdAt: serverTimestamp(),
    }
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
    { ...data, isActive: true, createdAt: serverTimestamp() }
  );
}

export async function updateCombo(restaurantId, comboId, data) {
  return updateDoc(doc(db, 'restaurants', restaurantId, 'combos', comboId), data);
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
  const today = new Date().toISOString().split('T')[0];
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

export async function createOrder(restaurantId, data) {
  const ref = await addDoc(collection(db, 'restaurants', restaurantId, 'orders'), {
    ...data,
    status: 'pending',
    paymentStatus: data.paymentStatus || 'unpaid',
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updatePaymentStatus(restaurantId, orderId, paymentStatus) {
  return updateDoc(
    doc(db, 'restaurants', restaurantId, 'orders', orderId),
    { paymentStatus, paymentUpdatedAt: serverTimestamp() }
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
    { status, updatedAt: serverTimestamp() }
  );
}
// ─── Staff ─────────────────────────────────────────────────────

export async function createStaffMember(restaurantId, data) {
  return addDoc(collection(db, 'restaurants', restaurantId, 'staff'), {
    ...data,
    isActive: true,
    createdAt: serverTimestamp(),
  });
}

export async function getStaffMembers(restaurantId) {
  const snap = await getDocs(collection(db, 'restaurants', restaurantId, 'staff'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
}

export async function updateStaffMember(restaurantId, staffId, data) {
  return updateDoc(doc(db, 'restaurants', restaurantId, 'staff', staffId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
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
  return addDoc(collection(db, 'restaurants', restaurantId, 'coupons'), {
    ...data,
    code: data.code.toUpperCase().trim(),
    usedCount: 0,
    isActive: true,
    createdAt: serverTimestamp(),
  });
}

export async function updateCoupon(restaurantId, couponId, data) {
  return updateDoc(doc(db, 'restaurants', restaurantId, 'coupons', couponId), data);
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
  return updateDoc(doc(db, 'restaurants', restaurantId, 'coupons', couponId), {
    usedCount: increment(1),
  });
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