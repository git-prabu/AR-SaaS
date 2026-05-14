// lib/firebaseAuth.js
//
// Auth-only Firebase module. Split out of lib/firebase.js (May 14) so the
// `firebase/auth` SDK (~120-150KB) is ONLY bundled into pages that actually
// sign a user in — admin, staff, superadmin. The customer menu page imports
// `db` from lib/firebase.js and never touches this file, so its bundle stays
// completely auth-free.
//
// Importing this module has a side-effect: it registers an actor-resolver
// with lib/db.js so withActor()'s audit stamping picks up the signed-in
// user's UID. The customer page never loads this module, so actorUid() there
// falls back to 'public' — exactly what the Firestore rules expect for
// anonymous customer writes.

import { getAuth } from 'firebase/auth';
import { adminApp, superAdminApp, staffApp } from './firebase';
import { registerActorProvider } from './db';

// Auth — completely isolated per role. Each app has its own localStorage
// auth key so admin / superadmin / staff sessions never collide across tabs.
export const adminAuth = getAuth(adminApp);
export const superAdminAuth = getAuth(superAdminApp);
export const staffAuth = getAuth(staffApp);

// Backward-compat alias — existing code uses `auth` for the admin auth.
export const auth = adminAuth;

// Wire the actor resolver into lib/db.js. Once this module has loaded — i.e.
// an admin/staff/superadmin page is active — every db.js mutation audit-
// stamps the real signed-in UID instead of 'public'. Order of preference
// matches the old inline actorUid(): staff → superadmin → admin → public.
registerActorProvider(() =>
  staffAuth?.currentUser?.uid
  || superAdminAuth?.currentUser?.uid
  || adminAuth?.currentUser?.uid
  || 'public'
);
