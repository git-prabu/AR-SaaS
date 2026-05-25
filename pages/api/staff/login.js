// pages/api/staff/login.js
// Replaces the old /api/staff/verify. Returns a Firebase Custom Token
// that the client uses to signInWithCustomToken() — this gives the staff
// a REAL Firebase auth session with custom claims (role + rid) enforced
// by Firestore rules. This is the actual security boundary.
import { adminDb, adminAuth } from '../../../lib/firebaseAdmin';
import admin from 'firebase-admin';
import {
  checkIpRateLimit, checkUsernameLockout, recordUsernameFailure, clearUsernameFailures,
  verifyPin, hashPin, ensureStaffAuthUser, getClientIp,
} from '../../../lib/staffAuth';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { restaurantId, username, pin } = req.body || {};

  // ─── Validate inputs ───────────────────────────────────────
  if (!restaurantId || !username || !pin) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (typeof restaurantId !== 'string' || typeof username !== 'string' || typeof pin !== 'string') {
    return res.status(400).json({ error: 'Invalid input types' });
  }
  if (restaurantId.length > 128 || username.length > 64 || pin.length > 32) {
    return res.status(400).json({ error: 'Input too long' });
  }

  const normalizedUsername = username.trim().toLowerCase();
  const normalizedPin = pin.trim();

  // ─── Rate limit: IP first (cheap) ────────────────────────
  const ip = getClientIp(req);
  const ipCheck = await checkIpRateLimit(ip);
  if (!ipCheck.ok) {
    return res.status(429).json({
      error: 'Too many attempts from this network. Try again shortly.',
      waitSec: ipCheck.waitSec,
    });
  }

  // ─── Rate limit: username lockout ────────────────────────
  const userCheck = await checkUsernameLockout(restaurantId, normalizedUsername);
  if (!userCheck.ok) {
    return res.status(429).json({
      error: `Account temporarily locked after too many failed attempts. Try again in ${Math.ceil(userCheck.waitSec / 60)} minute${userCheck.waitSec > 60 ? 's' : ''}.`,
      waitSec: userCheck.waitSec,
    });
  }

  // ─── Look up the staff member ────────────────────────────
  let staffDoc;
  try {
    const snap = await adminDb
      .collection('restaurants').doc(restaurantId)
      .collection('staff')
      .where('username', '==', normalizedUsername)
      .limit(1)
      .get();
    if (snap.empty) {
      // IMPORTANT: record failure even when user doesn't exist, otherwise
      // attackers can fingerprint valid usernames by response timing.
      await recordUsernameFailure(restaurantId, normalizedUsername);
      return res.status(401).json({ error: 'Incorrect username or PIN' });
    }
    staffDoc = snap.docs[0];
  } catch (e) {
    // Phase 4 hardening (F12, 17 May 2026): log without the error
    // object — Firestore error messages can include query details
    // (collection paths, document IDs, sometimes the matched field
    // value) which is mildly fingerprint-y. We don't need the
    // detail in the log; the alert that something failed is enough.
    console.error('[staff/login] lookup failed');
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }

  const staff = staffDoc.data();

  // ─── Verify PIN — supports both hashed (new) and plain (legacy) ───
  // Phase 3 hardening (H7, 16 May 2026): the plaintext fallback path
  // now also LAZY-MIGRATES the doc on a successful match — we hash
  // the PIN, write pinHash, and delete the plain `pin` field in a
  // single update. After every active staff member logs in once,
  // no plaintext remains in Firestore. /api/staff/migrate is still
  // the way to bulk-migrate inactive accounts.
  //
  // Why not refuse plaintext outright? Restaurants who haven't run
  // /api/staff/migrate would lock their staff out on the next deploy
  // — a regression worse than the leak it would prevent (the staff
  // doc is admin-readable anyway, so a malicious admin already sees
  // the PIN; the threat is Firestore exports / accidental backup
  // leaks, which lazy migration fixes within one login cycle).
  let pinValid = false;
  let migratedFromPlaintext = false;
  if (staff.pinHash) {
    pinValid = await verifyPin(normalizedPin, staff.pinHash);
  } else if (staff.pin) {
    pinValid = (String(staff.pin).trim() === normalizedPin);
    migratedFromPlaintext = pinValid;
  }

  if (!pinValid) {
    await recordUsernameFailure(restaurantId, normalizedUsername);
    return res.status(401).json({ error: 'Incorrect username or PIN' });
  }

  // ─── H7: lazy hash-on-success migration ─────────────────────────
  // Fire-and-forget — login succeeds regardless of whether the
  // migration write lands. Worst case: next login also lazily
  // migrates. The console.warn makes the path visible in Vercel
  // logs so we can spot when (if ever) the fallback stops being
  // hit and the plaintext branch can be deleted entirely.
  if (migratedFromPlaintext) {
    console.warn('[staff/login] H7 lazy-migrating plaintext PIN', {
      rid: restaurantId, staffId: staffDoc.id, username: normalizedUsername,
    });
    try {
      const newHash = await hashPin(normalizedPin);
      staffDoc.ref.update({
        pinHash: newHash,
        pin: admin.firestore.FieldValue.delete(),
        pinMigratedAt: admin.firestore.FieldValue.serverTimestamp(),
        pinMigrationSource: 'lazy-login',
      }).catch(e => console.warn('[staff/login] lazy migrate write failed:', e?.message));
    } catch (e) {
      console.warn('[staff/login] lazy migrate hash failed:', e?.message);
    }
  }

  // ─── Check account is active ─────────────────────────────
  if (staff.isActive === false) {
    return res.status(403).json({ error: 'This account has been disabled. Ask your manager.' });
  }

  const role = staff.role;
  if (role !== 'kitchen' && role !== 'waiter') {
    return res.status(500).json({ error: 'Invalid role on this account. Contact your manager.' });
  }

  // ─── Resolve effective permissions (Phase 8 RBAC) ───────────────
  // Base permission = the staffer's station (kitchen/waiter). If the owner
  // assigned a custom access role, that role's permission list fully
  // defines what they can reach (read from staffRoles/{roleId}). Read
  // failures fall back to the station default — never block a valid login.
  let perms = role === 'kitchen' ? ['kitchen'] : ['waiter'];
  let roleId = staff.roleId || null;
  if (roleId) {
    try {
      const roleSnap = await adminDb
        .collection('restaurants').doc(restaurantId)
        .collection('staffRoles').doc(roleId).get();
      if (roleSnap.exists) {
        const rp = roleSnap.data().permissions;
        if (Array.isArray(rp)) perms = rp.filter(k => typeof k === 'string');
      } else {
        roleId = null; // stale assignment — fall back to station default
      }
    } catch { /* keep station default */ }
  }

  // ─── Success. Create/refresh Firebase Auth user with custom claims ───
  let customToken;
  try {
    await ensureStaffAuthUser({
      restaurantId,
      staffId: staffDoc.id,
      role,
      name: staff.name || staff.username,
      perms,
      roleId,
    });
    const uid = `staff:${restaurantId}:${staffDoc.id}`;
    // Include claims inline too — they're already on the user, but
    // inline developerClaims let the client read them from the token
    // immediately without needing getIdTokenResult().
    customToken = await adminAuth.createCustomToken(uid, {
      role,
      rid: restaurantId,
      staffId: staffDoc.id,
      kind: 'staff',
      roleId: roleId || null,
      perms,
    });
  } catch (e) {
    console.error('Custom token creation error:', e);
    return res.status(500).json({ error: 'Could not establish session. Try again.' });
  }

  // ─── Clear failure counter (clean slate after success) ───
  await clearUsernameFailures(restaurantId, normalizedUsername);

  // ─── Fire-and-forget: record last login metadata ─────────
  adminDb
    .collection('restaurants').doc(restaurantId)
    .collection('staff').doc(staffDoc.id)
    .update({
      lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
      loginCount: admin.firestore.FieldValue.increment(1),
    })
    .catch(() => { /* best-effort */ });

  return res.status(200).json({
    success: true,
    token: customToken,
    staffId: staffDoc.id,
    name: staff.name || staff.username,
    role,
    restaurantId,
    perms,
    roleId,
  });
}
