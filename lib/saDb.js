// lib/saDb.js — Firestore helpers for Super Admin pages only.
//
// WHY THIS FILE EXISTS:
// The shared `db` in lib/db.js is tied to adminApp (adminAuth).
// Super admin is authenticated via superAdminApp (superAdminAuth).
// Firestore's request.auth comes from the app the db instance belongs to.
// Using db (adminApp) from a superadmin session → request.auth = null → DENIED.
// All superadmin pages must use these SA functions instead of lib/db functions.

import {
  doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc,
  collection, query, where, orderBy, limit,
  serverTimestamp,
} from 'firebase/firestore';
import { superAdminDb as db } from './firebase';

// ── Restaurants ────────────────────────────────────────────────

export async function getAllRestaurants() {
  const snap = await getDocs(collection(db, 'restaurants'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getRestaurantById(id) {
  const snap = await getDoc(doc(db, 'restaurants', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
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

// ── Users ──────────────────────────────────────────────────────

export async function getUserData(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function setUserDoc(uid, data) {
  return setDoc(doc(db, 'users', uid), { ...data, createdAt: serverTimestamp() });
}

// ── Menu Items ─────────────────────────────────────────────────

export async function getAllMenuItems(restaurantId) {
  const snap = await getDocs(
    collection(db, 'restaurants', restaurantId, 'menuItems')
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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

// ── Requests ───────────────────────────────────────────────────

export async function getRequests(restaurantId, status = null) {
  const snap = await getDocs(
    collection(db, 'restaurants', restaurantId, 'requests')
  );
  let results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (status) results = results.filter(r => r.status === status);
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

export async function updateRequestStatus(restaurantId, requestId, status, modelURL = null) {
  const updates = { status, reviewedAt: serverTimestamp() };
  if (modelURL) updates.modelURL = modelURL;
  return updateDoc(
    doc(db, 'restaurants', restaurantId, 'requests', requestId),
    updates
  );
}

// ── All Menu Items Across All Restaurants ──────────────────────

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

// ── Analytics ──────────────────────────────────────────────────

export async function getAnalytics(restaurantId, days = 30) {
  const snap = await getDocs(
    collection(db, 'restaurants', restaurantId, 'analytics')
  );
  return snap.docs
    .map(d => d.data())
    .sort((a, b) => (a.date > b.date ? 1 : -1))
    .slice(-days);
}

// ── Direct Firestore ref (for inline writes in page components) ─
// Export the SA db instance so superadmin pages can use doc(saDb, ...) directly.
export { db as saDb };
