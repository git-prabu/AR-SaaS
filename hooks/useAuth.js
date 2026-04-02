// hooks/useAuth.js
import { useState, useEffect, createContext, useContext } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { getDoc, doc } from 'firebase/firestore';
import { adminAuth, superAdminAuth, superAdminDb } from '../lib/firebase';
import { getUserData } from '../lib/db';

// ── Admin Auth ────────────────────────────────────────────────────
const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(adminAuth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const data = await getUserData(firebaseUser.uid);
        setUserData(data);
      } else {
        setUser(null);
        setUserData(null);
      }
      setLoading(false);
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
          setUserData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
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