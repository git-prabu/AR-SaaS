// hooks/useAuth.js
import { useState, useEffect, createContext, useContext } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { getDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, superAdminDb } from '../lib/firebase';
import { adminAuth, superAdminAuth } from '../lib/firebaseAuth';
import { getUserData } from '../lib/db';

// Phase 3 hardening (W2, 16 May 2026): keep users/{uid}.email in sync
// with Firebase Auth. Returns true if a write actually fired (caller
// uses this to refresh local userData). Best-effort — Firestore rule
// limits the write to `email` + `emailSyncedAt`; any failure is
// swallowed (it'll retry next auth state change). Case-insensitive
// compare because Firebase Auth lowercases emails but old user docs
// may have mixed case from earlier signup forms.
async function syncEmailIfChanged(database, firebaseUser, userData) {
  if (!firebaseUser || !userData) return false;
  const authEmail  = (firebaseUser.email || '').trim();
  const storedEmail = (userData.email   || '').trim();
  if (!authEmail) return false;
  if (authEmail.toLowerCase() === storedEmail.toLowerCase()) return false;
  try {
    await updateDoc(doc(database, 'users', firebaseUser.uid), {
      email: authEmail,
      emailSyncedAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    // Never break login over a sync miss. Log so we can see it in dev.
    console.warn('users/email sync failed:', err?.code || err?.message || err);
    return false;
  }
}

// ── Admin Auth ────────────────────────────────────────────────────
const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(adminAuth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          setUser(firebaseUser);
          const data = await getUserData(firebaseUser.uid);
          // W2: if Firebase Auth has a newer email than Firestore (e.g.
          // user finished a verifyBeforeUpdateEmail flow since last
          // login), write it back and patch the in-memory copy so the
          // current session immediately sees the right address.
          const synced = await syncEmailIfChanged(db, firebaseUser, data);
          setUserData(synced ? { ...data, email: firebaseUser.email } : data);
        } else {
          setUser(null);
          setUserData(null);
        }
      } catch (err) {
        console.error('AdminAuth: failed to load user data', err);
        setUser(null);
        setUserData(null);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  const signIn = (email, password) =>
    signInWithEmailAndPassword(adminAuth, email, password);

  const signOut = () => firebaseSignOut(adminAuth);

  return (
    <AdminAuthContext.Provider value={{ user, userData, loading, signIn, signOut }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() { return useContext(AdminAuthContext); }
// Backward-compat alias — all existing admin pages use useAuth()
export function useAuth() { return useAdminAuth(); }
// Backward-compat provider alias used in _app.js
export const AuthProvider = AdminAuthProvider;


// ── Super Admin Auth ──────────────────────────────────────────────
const SuperAdminAuthContext = createContext(null);

export function SuperAdminAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(superAdminAuth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          setUser(firebaseUser);
          // MUST use superAdminDb here — db (adminApp) has no superadmin auth token,
          // so getUserData() from lib/db would throw permission-denied.
          const snap = await getDoc(doc(superAdminDb, 'users', firebaseUser.uid));
          const data = snap.exists() ? { id: snap.id, ...snap.data() } : null;
          // W2: same email-sync as the admin provider, against
          // superAdminDb so the write rides on the superadmin token.
          const synced = await syncEmailIfChanged(superAdminDb, firebaseUser, data);
          setUserData(synced ? { ...data, email: firebaseUser.email } : data);
        } else {
          setUser(null);
          setUserData(null);
        }
      } catch (err) {
        console.error('SuperAdmin auth error:', err);
        setUser(null);
        setUserData(null);
      } finally {
        // Always resolve loading — without finally, a thrown error leaves
        // loading=true forever and the spinner never redirects to login.
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  const signIn = (email, password) =>
    signInWithEmailAndPassword(superAdminAuth, email, password);

  const signOut = () => firebaseSignOut(superAdminAuth);

  return (
    <SuperAdminAuthContext.Provider value={{ user, userData, loading, signIn, signOut }}>
      {children}
    </SuperAdminAuthContext.Provider>
  );
}

export function useSuperAdminAuth() { return useContext(SuperAdminAuthContext); }