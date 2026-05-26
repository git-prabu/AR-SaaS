// hooks/useFeatureAccess.js
//
// Phase 8 (RBAC) Stage B — shared access gate for every admin feature page
// that supports both the owner AND permission-scoped staff. Each converted
// page calls useFeatureAccess('<permKey>') and gets back everything it needs:
//   - isAdmin / isStaff   — which kind of user is viewing
//   - rid                 — the restaurant id (from admin session or staff session)
//   - scopedDb            — the Firestore connection to read/write through
//                           (admin `db` for the owner, `staffDb` for staff —
//                           so the right token rides on every request)
//   - canView             — admin always true; staff only if their role grants permKey
//   - ready               — auth + session resolved (don't query before this)
//
// It also performs the redirect for anyone who shouldn't be here: a logged-out
// visitor → admin login; a staffer lacking the permission → staff login.
// The owner experience is untouched (admin path identical to pre-RBAC).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from './useAuth';
import { db, staffDb } from '../lib/firebase';
import { readStaffSession } from '../lib/staffSession';

export function useFeatureAccess(permKey) {
  const router = useRouter();
  // `user` is the admin Firebase auth user (null for a staff viewer, who is
  // signed into the staff app instead). Pages that mint an admin ID token —
  // e.g. payments.js fireReceiptEmail — use it; for staff it's null and those
  // owner-only side-effects gracefully no-op.
  const { user, userData, loading: authLoading } = useAuth();

  const [staffSession, setStaffSession] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  useEffect(() => { setStaffSession(readStaffSession()); setSessionChecked(true); }, []);

  const adminRid = userData?.restaurantId;
  const isAdmin = !!adminRid;
  const staffPerms = Array.isArray(staffSession?.perms) ? staffSession.perms : [];
  const isStaff = !isAdmin && !!staffSession?.restaurantId;
  const hasPerm = isStaff && staffPerms.includes(permKey);
  const canView = isAdmin || hasPerm;
  const rid = adminRid || staffSession?.restaurantId || null;
  const scopedDb = isAdmin ? db : staffDb;
  // Resolved only once auth has finished AND the staff session has been
  // read — so by the time `ready` is true we KNOW whether the viewer is the
  // owner (isAdmin true) or staff. Using `isAdmin || sessionChecked` was the
  // bug: sessionChecked flips instantly, so for a beat isAdmin was false and
  // the owner saw a flash of the staff shell.
  const ready = !authLoading && sessionChecked;

  useEffect(() => {
    if (authLoading || isAdmin || !sessionChecked) return;
    if (!staffSession) { router.replace('/admin/login'); return; }
    // Logged-in staff who lack THIS feature go to their staff home hub
    // (which shows what they CAN access) — not a login loop.
    if (!staffPerms.includes(permKey)) { router.replace('/staff/home'); return; }
  }, [authLoading, isAdmin, sessionChecked, staffSession, permKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ready, isAdmin, isStaff, canView, rid, scopedDb, staffPerms, staffSession, userData, user };
}
