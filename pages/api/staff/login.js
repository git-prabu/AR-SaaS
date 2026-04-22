// pages/api/staff/login.js
// Replaces the old /api/staff/verify. Returns a Firebase Custom Token
// that the client uses to signInWithCustomToken() — this gives the staff
// a REAL Firebase auth session with custom claims (role + rid) enforced
// by Firestore rules. This is the actual security boundary.
import { adminDb, adminAuth } from '../../../lib/firebaseAdmin';
import admin from 'firebase-admin';
import {
  checkIpRateLimit, checkUsernameLockout, recordUsernameFailure, clearUsernameFailures,
  verifyPin, ensureStaffAuthUser, getClientIp,
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
    console.error('Staff lookup error:', e);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }

  const staff = staffDoc.data();

  // ─── Verify PIN — supports both hashed (new) and plain (legacy) ───
  // During migration, some docs will still have `pin` (plaintext) while
  // new ones have `pinHash`. We accept both but plainPINs should be
  // migrated ASAP via /api/staff/migrate.
  let pinValid = false;
  if (staff.pinHash) {
    pinValid = await verifyPin(normalizedPin, staff.pinHash);
  } else if (staff.pin) {
    // Legacy plain PIN path — still works so we don't lock out existing
    // restaurants who haven't run the migration yet.
    pinValid = (String(staff.pin).trim() === normalizedPin);
  }

  if (!pinValid) {
    await recordUsernameFailure(restaurantId, normalizedUsername);
    return res.status(401).json({ error: 'Incorrect username or PIN' });
  }

  // ─── Check account is active ─────────────────────────────
  if (staff.isActive === false) {
    return res.status(403).json({ error: 'This account has been disabled. Ask your manager.' });
  }

  const role = staff.role;
  if (role !== 'kitchen' && role !== 'waiter') {
    return res.status(500).json({ error: 'Invalid role on this account. Contact your manager.' });
  }

  // ─── Success. Create/refresh Firebase Auth user with custom claims ───
  let customToken;
  try {
    await ensureStaffAuthUser({
      restaurantId,
      staffId: staffDoc.id,
      role,
      name: staff.name || staff.username,
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
  });
}
