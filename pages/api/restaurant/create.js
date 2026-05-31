// pages/api/restaurant/create.js
//
// Phase 3 hardening (H4 + W1, 16 May 2026): server-side restaurant
// creation for the public signup flow. Replaces the previous client-
// side createRestaurant() + createUserDoc() pair in pages/signup.js.
//
// Why this exists:
//   Before this endpoint, pages/signup.js called Firestore directly
//   from the browser to write the new restaurant doc, with the
//   Firestore rule:
//     match /restaurants/{restaurantId} {
//       allow create: if isAuth();
//     }
//   That rule had no field-level validation, so any signed-in user
//   could write:
//     - plan: 'pro' with maxItems: 99999, maxStorageMB: 99999       (free Pro)
//     - paymentStatus: 'paid'                                       (skip billing)
//     - trialEndsAt: '9999-12-31T00:00:00Z'                         (lifetime trial)
//     - ownerUid: <someone else's uid>                              (account takeover)
//   The rule has now been tightened to refuse client creates entirely;
//   signups MUST come through this endpoint, which:
//     1. Validates inputs (subdomain regex, plan id whitelist, etc.)
//     2. Forces the server-side trial defaults — client-supplied
//        trialEndsAt / plan limits / paymentStatus are ignored.
//     3. Looks up plan limits from lib/plans.js (single source of truth)
//     4. Refuses reserved subdomains (www / superadmin / api)
//     5. Enforces one-restaurant-per-user (refuse if users/{uid} already
//        has restaurantId set)
//     6. Writes restaurants/{id} + users/{uid} in a single batched
//        commit — no orphaned half-state if one of them throws.
//     7. Rate-limits signups per IP (3/min) to prevent bot abuse.
//
// Auth: verifies the caller's Firebase ID token, which the client
// obtained via createUserWithEmailAndPassword / Google sign-in
// IMMEDIATELY before calling here. The Firebase Auth user already
// exists; we use it as the canonical identity for the restaurant.

import { adminDb, adminAuth } from '../../../lib/firebaseAdmin';
import admin from 'firebase-admin';
import { getPlan, normalizePlanId, PLANS, TRIAL_DAYS } from '../../../lib/plans';
import { checkRateLimit, getClientIp } from '../../../lib/rateLimit';

// ─── Validation constants ──────────────────────────────────────────
const SUBDOMAIN_REGEX = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
// Mirrors the list in middleware.js — keep both in sync. These names
// are routed away from /restaurant/[subdomain] and would break the
// system if a restaurant claimed one.
const RESERVED_SUBDOMAINS = new Set([
  'www', 'superadmin', 'api', 'admin', 'app', 'mail', 'auth', 'help',
  'support', 'status', 'docs', 'blog', 'static', 'assets',
]);
const VALID_PLAN_IDS = new Set(PLANS.map(p => p.id));

// Trim and length-cap a free-text field. Returns empty string on
// non-string input so we never write `undefined` to Firestore (which
// rejects the whole write with a cryptic error).
function clean(v, maxLen = 200) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, maxLen);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ─── Rate limit FIRST (per IP, 3/60s) ──────────────────────────
  // Runs before token verification so bot floods with garbage tokens
  // don't burn the verifyIdToken cycles. The bucket fails OPEN on
  // Firestore blips (see lib/rateLimit.js) so legitimate users are
  // never blocked by a transient outage.
  const ip = getClientIp(req);
  if (ip) {
    const limit = await checkRateLimit(`restaurant_create_ip_${ip}`, 3, 60);
    if (!limit.ok) {
      res.setHeader('Retry-After', String(limit.waitSec));
      return res.status(429).json({
        error: 'Too many signups from this network. Try again shortly.',
        retryAfterSec: limit.waitSec,
      });
    }
  }

  // ─── Auth: verify the caller's Firebase ID token ───────────────
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : (req.body?.idToken || '').trim();
  if (!idToken) return res.status(401).json({ error: 'Missing ID token' });

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch (e) {
    console.warn('[restaurant/create] verifyIdToken failed:', e?.code || e?.message);
    return res.status(401).json({ error: 'Invalid ID token' });
  }
  const uid = decoded.uid;
  const verifiedEmail = decoded.email || '';

  // ─── Validate body ─────────────────────────────────────────────
  const body = req.body || {};
  const restaurantName = clean(body.name, 80);
  const subdomain      = clean(body.subdomain, 30).toLowerCase();
  const ownerName      = clean(body.ownerName, 80);
  const email          = clean(body.email, 120).toLowerCase();
  const phone          = clean(body.phone, 20);
  const city           = clean(body.city, 80);
  const authProvider   = body.authProvider === 'google' ? 'google' : 'password';
  const requestedPlan  = normalizePlanId(body.planId || body.plan);

  if (!restaurantName) return res.status(400).json({ error: 'Restaurant name is required' });
  if (!ownerName)      return res.status(400).json({ error: 'Owner name is required' });
  if (!email)          return res.status(400).json({ error: 'Email is required' });
  if (!SUBDOMAIN_REGEX.test(subdomain)) {
    return res.status(400).json({ error: 'Subdomain must be 3–30 chars, lowercase letters/digits/hyphens, not starting or ending with a hyphen.' });
  }
  if (RESERVED_SUBDOMAINS.has(subdomain)) {
    return res.status(400).json({ error: 'This subdomain is reserved. Please choose another.' });
  }
  if (!VALID_PLAN_IDS.has(requestedPlan)) {
    return res.status(400).json({ error: 'Invalid plan id.' });
  }

  // The body email MUST match the verified Firebase Auth email — prevents
  // a signed-in user from writing a different email into the restaurant
  // doc that bypasses the admin email-change re-auth flow.
  if (verifiedEmail && email !== verifiedEmail.toLowerCase()) {
    return res.status(400).json({ error: 'Body email does not match the authenticated user.' });
  }

  // ─── Build the server-canonical restaurant doc ─────────────────
  // EVERY field below is server-decided. The client supplies user
  // text (name, address, etc.) but cannot inflate plan limits,
  // backdate trial, or pre-mark themselves paid.
  const planDef = getPlan(requestedPlan);
  const nowMs = Date.now();
  const trialEndsAt = new Date(nowMs + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const restaurantRef = adminDb.collection('restaurants').doc();
  const userRef       = adminDb.doc(`users/${uid}`);
  const subdomainQ    = adminDb.collection('restaurants')
                          .where('subdomain', '==', subdomain)
                          .limit(1);

  const restaurantDoc = {
    // User-supplied text
    name:         restaurantName,
    subdomain,
    ownerName,
    email,
    phone,
    city,
    // Server-locked identity & lifecycle
    ownerUid:        uid,
    authProvider,
    isActive:        true,
    storageUsedMB:   0,
    itemsUsed:       0,
    // Server-locked plan + billing — these MUST come from PLANS, never the body
    plan:            planDef.id,
    maxItems:        planDef.maxItems,
    maxARModels:     planDef.maxARModels,
    maxStorageMB:    planDef.maxStorageMB,
    maxStaff:        planDef.maxStaff,
    paymentStatus:   'trial',
    trialEndsAt,
    // Audit
    createdAt:       admin.firestore.FieldValue.serverTimestamp(),
    createdSource:   'public-signup',
  };

  const userDoc = {
    role:         'restaurant',
    email,
    name:         ownerName,
    restaurantId: restaurantRef.id,
    createdAt:    admin.firestore.FieldValue.serverTimestamp(),
  };

  // ─── Atomic transaction: read uniqueness, then write both docs ──
  // Pre-review caught a race: two concurrent requests with the same
  // subdomain (or the same uid double-clicking signup) could each
  // pass a non-transactional `.get()` check, then both write —
  // duplicate subdomain or duplicate restaurant per uid.
  //
  // Wrapping the reads (subdomain query + user doc) and writes
  // (restaurant set + user set) in a single transaction makes the
  // commit fail with a contention error if either read result
  // changes between read and commit. Firestore retries the
  // transaction up to 5 times automatically, so the legitimate
  // first-write wins and the second-write retry sees the dupe.
  //
  // Failure modes are mapped to specific HTTP codes so the client
  // can surface the right message; the catch-all 500 covers
  // everything else (network/admin SDK errors).
  try {
    await adminDb.runTransaction(async (tx) => {
      const [dupeSnap, userSnap] = await Promise.all([
        tx.get(subdomainQ),
        tx.get(userRef),
      ]);
      if (!dupeSnap.empty) {
        const err = new Error('SUBDOMAIN_TAKEN');
        err.code = 'SUBDOMAIN_TAKEN';
        throw err;
      }
      if (userSnap.exists && userSnap.data()?.restaurantId) {
        const err = new Error('USER_HAS_RESTAURANT');
        err.code = 'USER_HAS_RESTAURANT';
        err.restaurantId = userSnap.data().restaurantId;
        throw err;
      }
      tx.set(restaurantRef, restaurantDoc);
      tx.set(userRef, userDoc, { merge: true });
    });
  } catch (e) {
    if (e?.code === 'SUBDOMAIN_TAKEN') {
      return res.status(409).json({ error: 'This subdomain is already taken. Please choose another.' });
    }
    if (e?.code === 'USER_HAS_RESTAURANT') {
      return res.status(409).json({
        error: 'This account already has a restaurant. Sign in to your existing account instead.',
        restaurantId: e.restaurantId,
      });
    }
    console.error('[restaurant/create] transaction failed:', e);
    return res.status(500).json({ error: 'Could not create restaurant. Please try again.' });
  }

  return res.status(200).json({
    ok: true,
    restaurantId: restaurantRef.id,
    plan: planDef.id,
    trialEndsAt,
  });
}
