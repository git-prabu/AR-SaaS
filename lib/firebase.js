// lib/firebase.js
//
// Firestore + Storage Firebase module. As of May 14 this file no longer
// imports `firebase/auth` — that moved to lib/firebaseAuth.js. Reason:
// the customer menu page only needs Firestore reads (menu / orders /
// offers) and never signs anyone in. Keeping firebase/auth out of this
// module's import graph means the customer page's bundle drops the
// ~120-150KB auth SDK entirely.
//
// The three app instances are still created here (they're lightweight —
// just config) and EXPORTED so lib/firebaseAuth.js can attach getAuth()
// to them without this file having to import firebase/auth.
import { initializeApp, getApps } from 'firebase/app';
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
// Each gets its own localStorage auth key (once firebaseAuth.js attaches
// getAuth) so admin / superadmin / staff sessions never interfere with
// each other across tabs. EXPORTED so lib/firebaseAuth.js can build the
// auth instances on top of them.
export const adminApp = getApps().find(a => a.name === 'admin')
  || initializeApp(firebaseConfig, 'admin');

export const superAdminApp = getApps().find(a => a.name === 'superadmin')
  || initializeApp(firebaseConfig, 'superadmin');

export const staffApp = getApps().find(a => a.name === 'staff')
  || initializeApp(firebaseConfig, 'staff');

// Firestore (admin) — IndexedDB persistence enabled so menu/orders/offers
// keep working through short internet blips (common in Indian restaurants).
// persistentMultipleTabManager lets several tabs share one cache so the
// waiter iPad + kitchen tablet + admin laptop don't each maintain a
// separate duplicate cache on the same device. Falls back to in-memory
// cache on unsupported browsers (Safari private mode, old webviews) AND
// on the server (SSR — no IndexedDB). Without the SSR guard, Next.js's
// server-side page render for client-only pages like /staff/login would
// throw 500 trying to initialize IndexedDB.
function initPersistentFirestore(app) {
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
export const db = initPersistentFirestore(adminApp);
export const storage = getStorage(adminApp);

// Super Admin Firestore + Storage — MUST be tied to superAdminApp so
// request.auth in Firestore/Storage rules = superadmin's auth token.
// Using db (adminApp) from superadmin context → request.auth = null → DENIED.
// Kept cache-free: superadmin is a desktop back-office tool with little
// need for offline operation, and fewer persistent IndexedDB instances
// = less risk on old/locked-down browsers.
export const superAdminDb = getFirestore(superAdminApp);
export const superAdminStorage = getStorage(superAdminApp);

// Staff Firestore — scoped to staffApp so request.auth carries the staff's
// custom claims (role, rid, staffId, kind: 'staff'). Kitchen and waiter pages
// read/write via staffDb when a staff user is signed in; Firestore rules use
// these claims to gate writes (see firestore.rules).
//
// Phase 1c (20 May 2026): staffDb now uses the SAME persistent IndexedDB
// cache as the admin db. Kitchen/waiter tablets sit in the worst-signal
// corners of a restaurant (basements, back-of-house) — with the cache,
// the KDS + waiter queue keep rendering the last-known orders through a
// connection drop, and any status writes the staff make queue locally
// and flush automatically on reconnect. Each Firebase app has its own
// IndexedDB namespace so this doesn't collide with the admin cache, and
// the try/catch in initPersistentFirestore falls back to a memory cache
// on browsers that can't open IndexedDB (old webviews).
export const staffDb = initPersistentFirestore(staffApp);

export default adminApp;
