// lib/firebase.js
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// ── Two isolated Firebase app instances ──────────────────────────
// Each gets its own localStorage auth key so admin and superadmin
// sessions never interfere with each other across tabs.

const adminApp = getApps().find(a => a.name === 'admin')
  || initializeApp(firebaseConfig, 'admin');

const superAdminApp = getApps().find(a => a.name === 'superadmin')
  || initializeApp(firebaseConfig, 'superadmin');

// Auth — completely isolated per role
export const adminAuth = getAuth(adminApp);
export const superAdminAuth = getAuth(superAdminApp);

// Firestore + Storage — admin pages use adminApp instances
export const db = getFirestore(adminApp);
export const storage = getStorage(adminApp);

// Super Admin Firestore + Storage — MUST be tied to superAdminApp so
// request.auth in Firestore/Storage rules = superadmin's auth token.
// Using db (adminApp) from superadmin context → request.auth = null → DENIED.
export const superAdminDb = getFirestore(superAdminApp);
export const superAdminStorage = getStorage(superAdminApp);

// ── Backward-compat aliases (existing code uses `auth`) ──────────
export const auth = adminAuth;

export default adminApp;