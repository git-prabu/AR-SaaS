// hooks/useStaffAuth.js
// Client-side auth provider for the staff Firebase instance (staffApp).
// Completely independent from the admin and superadmin providers — its own
// localStorage key, its own context, its own sign-in flow.
//
// Sign-in flow:
//   1. Staff login page (pages/staff/login.js) calls /api/staff/login with
//      { restaurantId, username, pin }.
//   2. The server verifies the PIN (bcrypt) and returns a Firebase custom
//      token with custom claims { role, rid, staffId, kind: 'staff' }.
//   3. The staff login page calls signInWithToken(token) — which delegates
//      to this hook's signInWithCustomToken — establishing a persistent
//      Firebase session on staffApp.
//   4. From then on, staffDb (lib/firebase.js) sees request.auth = the
//      staff user, and Firestore rules gate writes based on the claims.
import { useState, useEffect, createContext, useContext } from 'react';
import {
  onAuthStateChanged,
  signInWithCustomToken,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { staffAuth } from '../lib/firebase';

// Default value covers the case where a component consumes this hook but
// isn't (yet) inside a Provider — during SSR or error states. Destructuring
// the return value won't crash.
const StaffAuthContext = createContext({
  user: null,
  claims: null,
  loading: true,
  signInWithToken: async () => { throw new Error('StaffAuthProvider missing'); },
  signOut: async () => {},
});

export function StaffAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [claims, setClaims] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(staffAuth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          setUser(firebaseUser);
          // Custom claims — role, rid, staffId, kind — come from the custom
          // token that /api/staff/login returns. Reading them here is what
          // lets pages check `claims.role === 'kitchen'` etc.
          const tokenResult = await firebaseUser.getIdTokenResult();
          setClaims(tokenResult.claims || null);
        } else {
          setUser(null);
          setClaims(null);
        }
      } catch (err) {
        console.error('StaffAuth: token read error', err);
        setUser(null);
        setClaims(null);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  const signInWithToken = (token) => signInWithCustomToken(staffAuth, token);

  const signOut = async () => {
    try { localStorage.removeItem('ar_staff_session'); } catch {}
    return firebaseSignOut(staffAuth);
  };

  return (
    <StaffAuthContext.Provider value={{ user, claims, loading, signInWithToken, signOut }}>
      {children}
    </StaffAuthContext.Provider>
  );
}

export function useStaffAuth() {
  return useContext(StaffAuthContext);
}
