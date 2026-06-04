// lib/fcm.js
// =====================================================================
// Firebase Cloud Messaging — client-side helpers.
//
// Owner wants notification chimes even when the phone is locked and the
// app is closed. That can't happen with Web Audio (which only runs while
// the tab is open), so this module wires up FCM web push.
//
// Flow:
//   1. enablePush({ restaurantId, subscriber }) — call from the
//      "Enable notifications" button. Requests OS permission, registers
//      /firebase-messaging-sw.js, fetches an FCM token, writes the
//      token to Firestore so the Cloud Function can find it.
//   2. The Cloud Function (functions/index.js) reads
//      restaurants/{rid}/pushSubscribers/* and fans out push messages
//      via admin.messaging() when an order/call/payment event fires.
//   3. The SW receives the push, renders the notification (with the
//      OS chime), and on click focuses or opens the right admin page.
//
// What the caller needs:
//   - `restaurantId` (string)
//   - `subscriber`: { kind: 'staff' | 'admin', id: string, perms: string[] }
//
// What needs to be set up ONCE per project (see SETUP_PUSH.md):
//   - VAPID public key in NEXT_PUBLIC_FIREBASE_VAPID_KEY
//   - Cloud Functions deployed
//
// What this does NOT handle:
//   - iOS Safari requires the user to install the site as a PWA via
//     "Add to Home Screen" BEFORE notifications work. We surface that
//     condition via isPushSupported() so the UI can show install hints.

import { getMessaging, getToken, deleteToken } from 'firebase/messaging';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { adminApp, staffApp, db, staffDb } from './firebase';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

// ── Capability checks ────────────────────────────────────────────────

/**
 * Is web push usable in this browser, in this context?
 *
 * Returns an object describing the state — UI can branch on it:
 *   { supported: true }                              — go ahead
 *   { supported: false, reason: 'no-notifications' } — browser doesn't
 *       support the Notification API (rare in 2026 but possible on
 *       very old Android webviews)
 *   { supported: false, reason: 'no-service-worker' } — likewise
 *   { supported: false, reason: 'ios-not-installed' } — iOS Safari
 *       but not running as a home-screen PWA. The user needs to add
 *       the site to their home screen first.
 *   { supported: false, reason: 'insecure-context' } — page is not
 *       HTTPS (or localhost). FCM refuses to register on http://.
 */
export function isPushSupported() {
  if (typeof window === 'undefined') return { supported: false, reason: 'ssr' };
  if (!window.isSecureContext) return { supported: false, reason: 'insecure-context' };
  if (!('Notification' in window)) return { supported: false, reason: 'no-notifications' };
  if (!('serviceWorker' in navigator)) return { supported: false, reason: 'no-service-worker' };

  // iOS Safari only ships web push to installed PWAs (since iOS 16.4).
  // The `standalone` flag + UA sniff is the standard way to detect that.
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  if (isIOS && !isStandalone) {
    return { supported: false, reason: 'ios-not-installed' };
  }

  if (!VAPID_KEY) {
    // VAPID key missing in env — push will fail; surface this so the
    // setup guide is shown rather than a cryptic permission error.
    return { supported: false, reason: 'no-vapid-key' };
  }

  return { supported: true };
}

/** What state is the user's notification permission in? */
export function getPushPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

// ── Subscribe / unsubscribe ──────────────────────────────────────────

/**
 * Ask for permission and register this device to receive push
 * notifications for the given restaurant + subscriber.
 *
 * subscriber: { kind: 'staff'|'admin', id: string, perms: string[] }
 *
 * Returns the FCM token on success, or null if the user denied or
 * something else failed. The error path is intentionally non-throwing —
 * callers should display a friendly state based on the return value.
 */
export async function enablePush({ restaurantId, subscriber }) {
  const cap = isPushSupported();
  if (!cap.supported) {
    console.warn('[fcm] enablePush skipped:', cap.reason);
    return { ok: false, reason: cap.reason };
  }

  try {
    // 1. Make sure the SW is registered. We register OUR generated SW
    //    file explicitly so we control its scope.
    let swReg;
    try {
      swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/firebase-cloud-messaging-push-scope',
      });
    } catch (regErr) {
      console.warn('[fcm] SW register failed:', regErr);
      return { ok: false, reason: 'sw-register-failed' };
    }

    // 2. Ask the OS for permission. This MUST be inside a user gesture
    //    (button click handler) — the caller is responsible for that.
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, reason: 'permission-' + perm };

    // 3. Get an FCM token bound to this device + VAPID key.
    //    We use the staff Firebase app for staff sessions (separate
    //    auth scope) and admin for admin sessions so the messaging
    //    instance shares the same Firebase app as the rest of the
    //    staff/admin state.
    const app = subscriber.kind === 'staff' ? staffApp : adminApp;
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });
    if (!token) {
      console.warn('[fcm] getToken returned null — likely VAPID key mismatch');
      return { ok: false, reason: 'token-failed' };
    }

    // 4. Write the subscriber doc. Doc ID = token, which gives us
    //    idempotent upserts (subscribing the same device twice is a
    //    no-op). We use the staff DB for staff so the rule context
    //    matches their auth token.
    const fs = subscriber.kind === 'staff' ? staffDb : db;
    const ref = doc(fs, `restaurants/${restaurantId}/pushSubscribers/${token}`);
    await setDoc(ref, {
      token,
      subscriberKind: subscriber.kind,
      subscriberId: subscriber.id,
      perms: Array.isArray(subscriber.perms) ? subscriber.perms : [],
      device: shortDeviceLabel(),
      createdAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    }, { merge: true });

    return { ok: true, token };
  } catch (err) {
    console.warn('[fcm] enablePush failed:', err);
    return { ok: false, reason: 'error', error: String(err && err.message || err) };
  }
}

/**
 * Stop receiving notifications on this device. Deletes both the FCM
 * token (so Google stops trying to deliver to this browser) and the
 * subscriber doc (so the Cloud Function won't try either).
 *
 * Doesn't try to revoke browser notification permission — that's an
 * OS-level setting the user controls.
 */
export async function disablePush({ restaurantId, subscriber }) {
  try {
    const app = subscriber.kind === 'staff' ? staffApp : adminApp;
    const messaging = getMessaging(app);
    // getToken with no options returns the cached token if there is one
    let token = null;
    try {
      token = await getToken(messaging, { vapidKey: VAPID_KEY });
    } catch {}
    if (token) {
      try { await deleteToken(messaging); } catch {}
      const fs = subscriber.kind === 'staff' ? staffDb : db;
      try { await deleteDoc(doc(fs, `restaurants/${restaurantId}/pushSubscribers/${token}`)); } catch {}
    }
    return { ok: true };
  } catch (err) {
    console.warn('[fcm] disablePush failed:', err);
    return { ok: false, error: String(err && err.message || err) };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function shortDeviceLabel() {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  // Cheap parser — full UA parsing is overkill for an admin-only label.
  let device = 'Desktop';
  if (/iPhone/.test(ua)) device = 'iPhone';
  else if (/iPad/.test(ua)) device = 'iPad';
  else if (/Android/.test(ua)) device = /Mobile/.test(ua) ? 'Android phone' : 'Android tablet';
  else if (/Macintosh/.test(ua)) device = 'Mac';
  else if (/Windows/.test(ua)) device = 'Windows';
  let browser = 'browser';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  return `${device} · ${browser}`;
}

/** Human label for a capability/permission reason — used by the UI. */
export function reasonLabel(reason) {
  switch (reason) {
    case 'no-vapid-key':       return 'Push notifications aren\'t configured yet. Contact support.';
    case 'insecure-context':   return 'Push needs HTTPS. Open the site via halohelm.com.';
    case 'no-notifications':   return 'This browser doesn\'t support notifications.';
    case 'no-service-worker':  return 'This browser doesn\'t support service workers.';
    case 'ios-not-installed':  return 'On iPhone, first tap Share → Add to Home Screen, then open from the home screen.';
    case 'sw-register-failed': return 'Couldn\'t install the notification service worker. Try reloading.';
    case 'permission-denied':  return 'Notifications are blocked. Re-enable them in your browser settings.';
    case 'permission-default': return 'Notification permission wasn\'t granted.';
    case 'token-failed':       return 'Couldn\'t register for notifications. Try again.';
    default:                   return 'Couldn\'t enable notifications.';
  }
}
