// lib/firebase.js
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// ── Three isolated Firebase app instances ──────────────────────
// Each gets its own localStorage auth key so admin / superadmin / staff
// sessions never interfere with each other across tabs.

const adminApp = getApps().find(a => a.name === 'admin')
  || initializeApp(firebaseConfig, 'admin');

const superAdminApp = getApps().find(a => a.name === 'superadmin')
  || initializeApp(firebaseConfig, 'superadmin');

const staffApp = getApps().find(a => a.name === 'staff')
  || initializeApp(firebaseConfig, 'staff');

// Auth — completely isolated per role
export const adminAuth = getAuth(adminApp);
export const superAdminAuth = getAuth(superAdminApp);
export const staffAuth = getAuth(staffApp);

// Firestore (admin) — IndexedDB persistence enabled so menu/orders/offers
// keep working through short internet blips (common in Indian restaurants).
// persistentMultipleTabManager lets several tabs share one cache so the
// waiter iPad + kitchen tablet + admin laptop don't each maintain a
// separate duplicate cache on the same device. Falls back to in-memory
// cache on unsupported browsers (Safari private mode, old webviews) AND
// on the server (SSR — no IndexedDB). Without the SSR guard, Next.js's
// server-side page render for client-only pages like /staff/login would
// throw 500 trying to initialize IndexedDB.
function initAdminDb(app) {
  // Server-side (Next.js SSR / Node): skip persistent cache entirely.
  if (typeof window === 'undefined') {
    return getFirestore(app);
  }
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    // Already initialized (e.g. hot-reload during dev) → use the existing one
    return getFirestore(app);
  }
}
export const db = initAdminDb(adminApp);
export const storage = getStorage(adminApp);

// Super Admin Firestore + Storage — MUST be tied to superAdminApp so
// request.auth in Firestore/Storage rules = superadmin's auth token.
// Using db (adminApp) from superadmin context → request.auth = null → DENIED.
export const superAdminDb = getFirestore(superAdminApp);
export const superAdminStorage = getStorage(superAdminApp);

// Staff Firestore — scoped to staffApp so request.auth carries the staff's
// custom claims (role, rid, staffId, kind: 'staff'). Kitchen and waiter pages
// read/write via staffDb when a staff user is signed in; Firestore rules use
// these claims to gate writes (see firestore.rules).
export const staffDb = getFirestore(staffApp);

// ── Backward-compat aliases (existing code uses `auth`) ──────────
export const auth = adminAuth;

export default adminApp;
