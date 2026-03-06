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
  return addDoc(collection(db, 'restaurants'), {
    ...data,
    isActive: false,
    storageUsedMB: 0,
    itemsUsed: 0,
    plan: 'basic',
    maxStorageMB: 500,
    maxItems: 10,
    paymentStatus: 'inactive',
    createdAt: serverTimestamp(),
  });
}

export async function updateRestaurant(id, data) {
  return updateDoc(doc(db, 'restaurants', id), data);
}

// ─── Menu Items ────────────────────────────────────────────────

export async function getMenuItems(restaurantId) {
  // Single where clause — no composite index needed, sort client-side
  const q = query(
    collection(db, 'restaurants', restaurantId, 'menuItems'),
    where('isActive', '==', true)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      if ((a.category || '') < (b.category || '')) return -1;
      if ((a.category || '') > (b.category || '')) return 1;
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
    .filter(o => o.endDate >= today)
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
