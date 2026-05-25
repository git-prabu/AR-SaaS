// lib/staffSession.js
//
// Client-only reader for the staff session blob written by
// pages/staff/login.js: { staffId, name, role, restaurantId,
// restaurantName, perms, roleId, kind, loggedInAt }.
//
// NOTE: this localStorage copy is for STAFF UI gating only (which nav
// items / pages to show). The authoritative permission copy lives in the
// Firebase token claims and is what Firestore rules enforce — so tampering
// with this blob can't grant real data access.
export function readStaffSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('ar_staff_session');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
