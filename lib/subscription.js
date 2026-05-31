// lib/subscription.js
//
// Phase C — single source of truth for "is this restaurant's subscription
// currently active, in grace, or expired?" The owner-side AdminLayout and
// the staff-side StaffShell both consume this so the gate behaves the same
// regardless of who's signed in.
//
// States returned by getSubscriptionStatus():
//   active   — within trial or paid period; full access
//   grace    — past expiry but within GRACE_DAYS (12); full access + banner
//   expired  — past expiry + grace; lock screen, only /admin/subscription
//   unknown  — restaurant doc is missing the dates we'd need to decide;
//              treated as active (fail-OPEN for safety: better to leak
//              access than lock a paying owner out due to legacy data)

import { GRACE_DAYS } from './plans';

const MS_PER_DAY = 86_400_000;

// Pick the most-authoritative expiry date the restaurant doc carries.
// Order of preference:
//   - planExpiresAt   (written by /api/payments/verify.js on a paid renewal)
//   - subscriptionEnd (older field, kept for back-compat — date-only string)
//   - trialEndsAt     (when paymentStatus is still 'trial')
function pickExpiry(r) {
  if (!r) return null;
  // 'active' restaurants live by planExpiresAt; 'trial' by trialEndsAt.
  // We try planExpiresAt first regardless of status because some legacy
  // 'trial' docs carry an explicit planExpiresAt too.
  const candidate = r.planExpiresAt || r.subscriptionEnd || r.trialEndsAt || null;
  if (!candidate) return null;
  const d = new Date(candidate);
  return isNaN(d.getTime()) ? null : d;
}

// Returns { state, daysLeft, expiresAt, graceEndsAt } where:
//   state         — one of 'active' | 'grace' | 'expired' | 'unknown'
//   daysLeft      — days until next state transition (rounded up). For
//                   'active' it's days until expiry. For 'grace' it's days
//                   until the lock kicks in. For 'expired' it's 0.
//   expiresAt     — Date of the subscription expiry (the moment grace began
//                   or will begin).
//   graceEndsAt   — Date of when the lock starts (expiresAt + GRACE_DAYS).
//
// Pass `now` to override the clock for tests / countdown rendering.
export function getSubscriptionStatus(restaurant, now = new Date()) {
  const expiry = pickExpiry(restaurant);
  if (!expiry) {
    return { state: 'unknown', daysLeft: 0, expiresAt: null, graceEndsAt: null };
  }
  const graceEnd = new Date(expiry.getTime() + GRACE_DAYS * MS_PER_DAY);
  const msLeftActive = expiry.getTime() - now.getTime();
  const msLeftGrace  = graceEnd.getTime() - now.getTime();

  if (msLeftActive > 0) {
    return {
      state: 'active',
      daysLeft: Math.ceil(msLeftActive / MS_PER_DAY),
      expiresAt: expiry,
      graceEndsAt: graceEnd,
    };
  }
  if (msLeftGrace > 0) {
    return {
      state: 'grace',
      daysLeft: Math.ceil(msLeftGrace / MS_PER_DAY),
      expiresAt: expiry,
      graceEndsAt: graceEnd,
    };
  }
  return {
    state: 'expired',
    daysLeft: 0,
    expiresAt: expiry,
    graceEndsAt: graceEnd,
  };
}

// Convenience: are admin pages locked? (false during active/grace/unknown,
// true only when fully expired past the grace period.)
export function isAccessLocked(restaurant, now = new Date()) {
  return getSubscriptionStatus(restaurant, now).state === 'expired';
}

// Pages that REMAIN accessible even when the subscription is locked, so the
// owner can renew. Staff-facing routes are kept out — staff can't pay; if
// the restaurant is locked, staff see the locked-out notice in StaffShell.
export const LOCK_BYPASS_ROUTES = new Set([
  '/admin/subscription',
  '/admin/settings/security',
  '/admin/help',
]);

export function isBypassRoute(pathname) {
  return LOCK_BYPASS_ROUTES.has(pathname);
}
