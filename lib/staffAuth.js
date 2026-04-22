// lib/staffAuth.js — server-side helpers for staff auth
// Only importable from API routes (never from client components)
import bcrypt from 'bcryptjs';
import { adminDb, adminAuth } from './firebaseAdmin';
import admin from 'firebase-admin';

// ═══ Rate limiting thresholds ═══
// - IP:       20 attempts per 60s across ALL staff login calls from one IP
// - USERNAME: 5 failures per 15m on one specific (rid, username) pair
//             → 15 minute lockout after 5th failure
export const RATE_LIMIT = {
  IP_WINDOW_SEC: 60,
  IP_MAX_ATTEMPTS: 20,
  USER_WINDOW_SEC: 15 * 60,
  USER_MAX_FAILURES: 5,
};

// ─── PIN hashing ───────────────────────────────────────────────
// We use bcryptjs (pure JS, works in serverless Vercel/Firebase).
// cost=10 → ~100ms per hash on typical serverless: slow enough to
// block brute force, fast enough for real logins.
export async function hashPin(plainPin) {
  return bcrypt.hash(String(plainPin), 10);
}
export async function verifyPin(plainPin, hash) {
  if (!hash) return false;
  try { return await bcrypt.compare(String(plainPin), hash); }
  catch { return false; }
}

// ─── Rate limit storage in Firestore ───────────────────────────
// We store counters in a `rateLimit` collection. Each key is a
// unique attempt bucket. Documents expire after their window passes
// (we check the oldest timestamp in the array; if outside window → reset).
// This avoids Redis and runs on the existing Firestore billing.

/**
 * Check IP rate limit. Returns { ok, waitSec } — if !ok, client must
 * wait waitSec seconds.
 * Uses a single doc per IP with a rolling array of recent attempt timestamps.
 */
export async function checkIpRateLimit(ip) {
  if (!ip) return { ok: true };
  const safeIp = ip.replace(/[^0-9a-zA-Z.:_-]/g, '_').slice(0, 100);
  const ref = adminDb.collection('rateLimit').doc(`ip_${safeIp}`);
  const now = Date.now();
  const windowStart = now - RATE_LIMIT.IP_WINDOW_SEC * 1000;
  try {
    return await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : { attempts: [] };
      const recent = (data.attempts || []).filter(t => t > windowStart);
      if (recent.length >= RATE_LIMIT.IP_MAX_ATTEMPTS) {
        const oldest = Math.min(...recent);
        const waitSec = Math.ceil((oldest + RATE_LIMIT.IP_WINDOW_SEC * 1000 - now) / 1000);
        return { ok: false, waitSec: Math.max(1, waitSec) };
      }
      recent.push(now);
      tx.set(ref, { attempts: recent, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return { ok: true };
    });
  } catch (e) {
    // On Firestore failure, fail OPEN (better to let legitimate users in than
    // to accidentally lock everyone out). This is a defence layer, not the
    // only one — per-username lockout below still applies.
    console.error('IP rate limit check error:', e);
    return { ok: true };
  }
}

/**
 * Check USERNAME-level lockout. Tracks FAILED attempts only — successful
 * logins do not count. After N failures in a window, the username is locked
 * for the rest of the window.
 */
export async function checkUsernameLockout(rid, username) {
  const key = `user_${rid}_${username}`.replace(/[^0-9a-zA-Z_-]/g, '_').slice(0, 150);
  const ref = adminDb.collection('rateLimit').doc(key);
  const now = Date.now();
  const windowStart = now - RATE_LIMIT.USER_WINDOW_SEC * 1000;
  try {
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : { failures: [] };
    const recent = (data.failures || []).filter(t => t > windowStart);
    if (recent.length >= RATE_LIMIT.USER_MAX_FAILURES) {
      const oldest = Math.min(...recent);
      const waitSec = Math.ceil((oldest + RATE_LIMIT.USER_WINDOW_SEC * 1000 - now) / 1000);
      return { ok: false, waitSec: Math.max(1, waitSec) };
    }
    return { ok: true };
  } catch (e) {
    console.error('Username lockout check error:', e);
    return { ok: true };
  }
}

/**
 * Record a failed login attempt for this username. Call ONLY after PIN mismatch.
 */
export async function recordUsernameFailure(rid, username) {
  const key = `user_${rid}_${username}`.replace(/[^0-9a-zA-Z_-]/g, '_').slice(0, 150);
  const ref = adminDb.collection('rateLimit').doc(key);
  const now = Date.now();
  const windowStart = now - RATE_LIMIT.USER_WINDOW_SEC * 1000;
  try {
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : { failures: [] };
      const recent = (data.failures || []).filter(t => t > windowStart);
      recent.push(now);
      tx.set(ref, {
        failures: recent,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  } catch (e) { console.error('recordUsernameFailure error:', e); }
}

/** Clears failure counter on successful login — gives staff a clean slate. */
export async function clearUsernameFailures(rid, username) {
  const key = `user_${rid}_${username}`.replace(/[^0-9a-zA-Z_-]/g, '_').slice(0, 150);
  const ref = adminDb.collection('rateLimit').doc(key);
  try { await ref.delete(); } catch { /* ignore */ }
}

// ─── Get client IP from request ──────────────────────────────
// Vercel / most hosts set x-forwarded-for. Falls back to req.socket.
export function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  if (Array.isArray(fwd) && fwd[0]) return fwd[0].trim();
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string') return real;
  return req.socket?.remoteAddress || null;
}

// ─── Firebase Auth UID format for staff ───────────────────────
// Format: `staff:{restaurantId}:{staffId}` — guaranteed unique across
// restaurants, easy to parse server-side, rejected by Firebase's 128-char
// UID limit check as long as rid+staffId are reasonable lengths.
export function staffUid(restaurantId, staffId) {
  return `staff:${restaurantId}:${staffId}`;
}

/**
 * Ensures a Firebase Auth user exists for this staff member and their
 * custom claims match (role, rid, staffId). Called after PIN verification.
 *
 * Custom claims are what Firestore rules read via request.auth.token.
 * Setting them here is the whole point of the new auth system.
 */
export async function ensureStaffAuthUser({ restaurantId, staffId, role, name }) {
  const uid = staffUid(restaurantId, staffId);
  try {
    // Try to get the user; create if missing
    try {
      await adminAuth.getUser(uid);
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        await adminAuth.createUser({
          uid,
          displayName: name || uid,
          disabled: false,
        });
      } else {
        throw e;
      }
    }
    // Always refresh custom claims in case role changed
    await adminAuth.setCustomUserClaims(uid, {
      role,
      rid: restaurantId,
      staffId,
      kind: 'staff',
    });
    return uid;
  } catch (e) {
    console.error('ensureStaffAuthUser error:', e);
    throw e;
  }
}

/**
 * Verify that the request is from an authenticated Firebase admin
 * (the restaurant owner) by validating their Firebase ID token.
 * Returns { uid, restaurantId } on success, or throws on failure.
 *
 * All admin-only API endpoints (create staff, rotate PIN, delete, toggle)
 * use this to gate access.
 */
export async function requireAdminAuth(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) throw new Error('Missing Bearer token');
  const idToken = authHeader.substring(7).trim();
  if (!idToken) throw new Error('Empty token');

  const decoded = await adminAuth.verifyIdToken(idToken);
  const uid = decoded.uid;

  // Look up the user doc — must have role: restaurant + restaurantId
  const userSnap = await adminDb.collection('users').doc(uid).get();
  if (!userSnap.exists) throw new Error('User doc not found');
  const userData = userSnap.data();
  if (userData.role !== 'restaurant') throw new Error('Not a restaurant admin');
  if (!userData.restaurantId) throw new Error('No restaurantId');

  return { uid, restaurantId: userData.restaurantId };
}

/**
 * Generate a cryptographically random 4-digit PIN.
 * Uses Math.random fallback + crypto where available.
 */
export function generateRandomPin() {
  try {
    const crypto = require('crypto');
    const n = crypto.randomInt(0, 10000);
    return String(n).padStart(4, '0');
  } catch {
    return String(Math.floor(1000 + Math.random() * 9000));
  }
}
