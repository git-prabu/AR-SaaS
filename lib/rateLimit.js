// lib/rateLimit.js
//
// Generic Firestore-backed sliding-window rate limiter for server-side
// (API route) use. Same pattern as the IP/username buckets in
// lib/staffAuth.js, extracted here so customer-facing endpoints (e.g.
// /api/payment/intent) can share the implementation without coupling
// their buckets to the staff-login limiter's thresholds.
//
// Storage: `rateLimit/{bucketKey}` — caller controls the bucketKey so
// different endpoints get independent buckets (e.g.
// `payment_intent_ip_1.2.3.4` vs `staff_login_ip_1.2.3.4`).
//
// Fail-OPEN: on Firestore errors the check returns ok:true. Better
// to let legitimate traffic through during a Firestore blip than to
// lock paying customers out. This is one layer of defense — gateway
// rate limits + per-merchant quotas catch what slips past here.
//
// NOTE: keep this file Admin-SDK-only — never import from the client
// bundle. firestore.rules denies all access to /rateLimit, so client
// reads/writes would fail anyway, but importing firebase-admin
// client-side would bloat the bundle.

import { adminDb } from './firebaseAdmin';
import admin from 'firebase-admin';

const KEY_SANITIZE = /[^0-9a-zA-Z.:_-]/g;

/**
 * Check + atomically record an attempt on a named bucket. Sliding
 * window: keeps a rolling array of recent timestamps; expires entries
 * older than windowSec on each check.
 *
 * @param {string} bucketKey - logical bucket name. Sanitized internally,
 *   but callers should still avoid passing untrusted data without prefix
 *   (e.g. `payment_intent_ip_${ip}` not just `${ip}`).
 * @param {number} maxAttempts - cap before returning {ok:false, waitSec}
 * @param {number} windowSec - rolling window in seconds
 * @returns {Promise<{ok: boolean, waitSec?: number}>}
 */
export async function checkRateLimit(bucketKey, maxAttempts, windowSec) {
  const key = String(bucketKey).replace(KEY_SANITIZE, '_').slice(0, 200);
  const ref = adminDb.collection('rateLimit').doc(key);
  const now = Date.now();
  const windowStart = now - windowSec * 1000;
  try {
    return await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : { attempts: [] };
      const recent = (data.attempts || []).filter(t => t > windowStart);
      if (recent.length >= maxAttempts) {
        const oldest = Math.min(...recent);
        const waitSec = Math.ceil((oldest + windowSec * 1000 - now) / 1000);
        return { ok: false, waitSec: Math.max(1, waitSec) };
      }
      recent.push(now);
      tx.set(ref, {
        attempts: recent,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { ok: true };
    });
  } catch (e) {
    console.error(`rateLimit check error (${key}):`, e?.message || e);
    return { ok: true };
  }
}

/**
 * Best-effort client IP extractor. Prefers x-forwarded-for (Vercel
 * sets this on every request), falls back to socket remoteAddress for
 * local dev. Returns '' when nothing is available so callers can
 * decide whether to skip the limit (recommended: only skip if explicitly
 * '' — never trust headers blindly).
 */
export function getClientIp(req) {
  const xff = req.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.connection?.remoteAddress || '';
}
