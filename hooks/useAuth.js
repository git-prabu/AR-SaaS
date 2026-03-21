// hooks/useAuth.js
import { useState, useEffect, createContext, useContext } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { adminAuth, superAdminAuth } from '../lib/firebase';
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
    signInWithEmailAndPassword(superAdminAuth, email, password);

  const signOut = () => firebaseSignOut(superAdminAuth);

  return (
    <SuperAdminAuthContext.Provider value={{ user, userData, loading, signIn, signOut }}>
      {children}
    </SuperAdminAuthContext.Provider>
  );
}

export function useSuperAdminAuth() { return useContext(SuperAdminAuthContext); }