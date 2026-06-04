// functions/index.js
// =====================================================================
// HaloHelm Cloud Functions — push notifications.
//
// What this does:
//   1. onOrderCreated         — new order written → notify kitchen
//   2. onOrderUpdated         — status changed to 'ready' → notify waiter
//                               paymentStatus changed to 'cash_requested' /
//                               'card_requested' / 'online_requested' → notify waiter
//   3. onWaiterCallCreated    — new waiter call → notify waiter
//
// Why Cloud Functions (vs Vercel API route):
//   - Fires the instant the Firestore write commits — no client RTT.
//   - Can't be skipped by a buggy or offline client.
//   - Already on Firebase Blaze, so cost is negligible at our scale.
//
// Token storage model:
//   restaurants/{rid}/pushSubscribers/{subscriberId}
//     {
//       token:           string  (FCM registration token, unique-ish per device)
//       subscriberKind:  'staff' | 'admin'
//       subscriberId:    string  (staff doc id, or admin auth uid)
//       perms:           string[]  (permission keys snapshot at subscribe time)
//       device:          string  (user-agent shorthand)
//       createdAt:       timestamp
//       lastSeenAt:      timestamp
//     }
//
//   Document ID is the FCM token itself — that gives us idempotent upserts:
//   subscribing the same device twice writes the same doc, and a stale
//   token can be cleanly deleted by id when FCM returns
//   'messaging/registration-token-not-registered'.
//
// Permission gating:
//   - 'kitchen' perm: tokens whose perms include 'kitchenStation'
//   - 'orders' perm: tokens whose perms include 'orders'
//   - admin subscribers (subscriberKind === 'admin') always receive,
//     because owner is the catch-all and shouldn't have to manage perms.
//
// What we do NOT do here:
//   - We do NOT consult the client-side soundEnabled / voiceEnabled flags.
//     Those gate the IN-APP audio (Web Audio API) when the page is open.
//     Push notifications are a separate channel — the OS plays the sound,
//     the user mutes them via OS settings or the per-page "Enable
//     notifications" toggle (which adds/removes the FCM token).
//
// Required setup (one-time, see SETUP_PUSH.md in repo root):
//   1. Generate VAPID key pair in Firebase Console → Project Settings →
//      Cloud Messaging → Web configuration. Paste the *public* key into
//      lib/fcm.js (client-side reads it). The private key stays inside FCM.
//   2. `cd functions && npm install`
//   3. `firebase deploy --only functions`

const { onDocumentCreated, onDocumentUpdated } =
  require('firebase-functions/v2/firestore');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

// Region: asia-south1 is closest to our customers (India).
setGlobalOptions({ region: 'asia-south1', maxInstances: 10 });

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Fetch all push subscribers for a restaurant whose perms include the
 * given permission key. Admins (subscriberKind: 'admin') are always
 * included regardless of perms.
 *
 * Returns: [{ id, token, ...rest }]
 */
async function getSubscribersForPerm(restaurantId, permKey) {
  const col = db.collection(`restaurants/${restaurantId}/pushSubscribers`);
  const snap = await col.get();
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return all.filter(s => {
    if (s.subscriberKind === 'admin') return true;
    return Array.isArray(s.perms) && s.perms.includes(permKey);
  });
}

/**
 * Send a multicast push to a list of subscribers. Cleans up any tokens
 * that come back unregistered / invalid (so the next send doesn't waste
 * a call retrying them).
 *
 * `payload` is the FCM Message minus the `token` field; we fan it out.
 */
async function sendToSubscribers(restaurantId, subscribers, payload) {
  if (subscribers.length === 0) {
    console.log(`[push] no subscribers for ${restaurantId} payload=${JSON.stringify(payload).slice(0, 120)}`);
    return { sent: 0, failed: 0 };
  }
  const tokens = subscribers.map(s => s.token).filter(Boolean);
  if (tokens.length === 0) return { sent: 0, failed: 0 };

  // sendEachForMulticast caps at 500 tokens per call — well above any
  // realistic restaurant staff count, but split anyway for safety.
  const CHUNK = 500;
  let sent = 0, failed = 0;
  const toDelete = [];
  for (let i = 0; i < tokens.length; i += CHUNK) {
    const slice = tokens.slice(i, i + CHUNK);
    const subsSlice = subscribers.slice(i, i + CHUNK);
    const res = await messaging.sendEachForMulticast({ ...payload, tokens: slice });
    res.responses.forEach((r, idx) => {
      if (r.success) {
        sent++;
      } else {
        failed++;
        const code = r.error?.code || '';
        // Permanently bad tokens — delete the subscriber doc.
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/invalid-argument'
        ) {
          toDelete.push(subsSlice[idx].id);
        } else {
          console.warn(`[push] token ${slice[idx].slice(-8)} failed: ${code}`);
        }
      }
    });
  }
  if (toDelete.length > 0) {
    console.log(`[push] cleaning up ${toDelete.length} stale tokens`);
    const batch = db.batch();
    toDelete.forEach(id => batch.delete(
      db.doc(`restaurants/${restaurantId}/pushSubscribers/${id}`)
    ));
    await batch.commit();
  }
  return { sent, failed };
}

/**
 * Build a notification payload that triggers a sound on Android Chrome
 * + WebPushFCM. iOS gets it via Safari PWA push when installed.
 *
 * The "data" payload is what our SW reads to render the in-page
 * notification (we use SW notifications instead of bare FCM
 * notifications for finer styling control + to share the click handler).
 */
function buildPayload({ title, body, tag, url, kind }) {
  return {
    // Use data-only so our SW always handles rendering — that lets us
    // open the right page on click + control the icon/sound consistently
    // across browsers. (If FCM auto-renders, the notification text
    // duplicates and the click handler is harder to wire up.)
    data: {
      title,
      body,
      tag: tag || kind,
      url: url || '/admin/kitchen-new',
      kind,
    },
    webpush: {
      // High urgency keeps the notification from getting batched/delayed.
      headers: { Urgency: 'high', TTL: '120' },
      // Some browsers ignore data-only notifications without an
      // explicit notification field. Provide both so the OS-level
      // delivery works even if the SW is slow to wake.
      notification: {
        title,
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: tag || kind,
        renotify: true,
        requireInteraction: false,
      },
    },
  };
}

function tableLabel(order) {
  const isTakeaway = order.orderType === 'takeaway' || order.orderType === 'takeout';
  const raw = isTakeaway ? (order.customerName || 'Takeaway') : (order.tableNumber || '');
  return String(raw || '').trim() || 'unknown';
}

function orderNumberLabel(order) {
  if (typeof order.orderNumber === 'number' && order.orderNumber > 0) {
    return `#${String(order.orderNumber).padStart(4, '0')}`;
  }
  return '';
}

function itemSummary(order) {
  const count = (order.items || []).reduce((s, it) => s + (Number(it.qty) || 1), 0);
  return `${count} item${count === 1 ? '' : 's'}`;
}

// ─────────────────────────────────────────────────────────────────────
// 1. New order created → notify kitchen
// ─────────────────────────────────────────────────────────────────────
exports.onOrderCreated = onDocumentCreated(
  'restaurants/{rid}/orders/{orderId}',
  async (event) => {
    const order = event.data?.data();
    const { rid, orderId } = event.params;
    if (!order) return;

    // Only chime when the order has actually entered the kitchen queue.
    // Takeaway orders sit in 'awaiting_payment' until paid — we don't
    // want a chime for that state because the kitchen can't start it.
    if (order.status !== 'pending' && order.status !== 'preparing') return;

    const subs = await getSubscribersForPerm(rid, 'kitchenStation');
    const num = orderNumberLabel(order);
    const payload = buildPayload({
      title: num ? `New order ${num}` : 'New order',
      body: `${tableLabel(order)} · ${itemSummary(order)}`,
      tag: `order-${orderId}`,
      url: '/admin/kitchen-new',
      kind: 'order',
    });
    const res = await sendToSubscribers(rid, subs, payload);
    console.log(`[push:onOrderCreated] rid=${rid} order=${orderId} subs=${subs.length} sent=${res.sent} failed=${res.failed}`);
  }
);

// ─────────────────────────────────────────────────────────────────────
// 2. Order updated → notify waiter for 'ready' or payment requests
// ─────────────────────────────────────────────────────────────────────
//
// Two transitions we care about:
//   a. status: preparing → ready     → waiter should pick up dishes
//   b. paymentStatus: → cash_requested / card_requested / online_requested
//                                     → waiter should collect payment
//
// We deliberately do NOT notify on pending → preparing (that's the
// kitchen marking they've started cooking — no waiter action needed).
exports.onOrderUpdated = onDocumentUpdated(
  'restaurants/{rid}/orders/{orderId}',
  async (event) => {
    const before = event.data?.before?.data();
    const after  = event.data?.after?.data();
    const { rid, orderId } = event.params;
    if (!before || !after) return;

    const statusBecameReady =
      before.status !== 'ready' && after.status === 'ready';
    const paymentRequested =
      before.paymentStatus !== after.paymentStatus &&
      ['cash_requested', 'card_requested', 'online_requested'].includes(after.paymentStatus);

    if (!statusBecameReady && !paymentRequested) return;

    const subs = await getSubscribersForPerm(rid, 'orders');
    const num = orderNumberLabel(after);

    if (statusBecameReady) {
      const payload = buildPayload({
        title: num ? `Order ${num} ready` : 'Order ready',
        body: `${tableLabel(after)} — pick up from kitchen`,
        tag: `ready-${orderId}`,
        url: '/admin/orders',
        kind: 'ready',
      });
      const res = await sendToSubscribers(rid, subs, payload);
      console.log(`[push:onOrderUpdated:ready] rid=${rid} order=${orderId} subs=${subs.length} sent=${res.sent} failed=${res.failed}`);
    }

    if (paymentRequested) {
      const method = (after.paymentStatus || '').replace('_requested', '');
      const methodLabel = method.charAt(0).toUpperCase() + method.slice(1);
      const payload = buildPayload({
        title: num ? `${methodLabel} payment ${num}` : `${methodLabel} payment`,
        body: `${tableLabel(after)} — collect payment`,
        tag: `pay-${orderId}`,
        url: '/admin/orders',
        kind: 'payment',
      });
      const res = await sendToSubscribers(rid, subs, payload);
      console.log(`[push:onOrderUpdated:payment] rid=${rid} order=${orderId} method=${method} sent=${res.sent} failed=${res.failed}`);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────
// 3. New waiter call → notify waiter
// ─────────────────────────────────────────────────────────────────────
//
// Waiter calls live at /restaurants/{rid}/waiterCalls/{callId} with
// fields: { tableNumber, reason, status, createdAt }. We push on any
// new doc whose status isn't already 'resolved'.
exports.onWaiterCallCreated = onDocumentCreated(
  'restaurants/{rid}/waiterCalls/{callId}',
  async (event) => {
    const call = event.data?.data();
    const { rid, callId } = event.params;
    if (!call) return;
    if (call.status === 'resolved') return;

    const subs = await getSubscribersForPerm(rid, 'orders');
    const reasonLabel = (() => {
      const r = String(call.reason || '').toLowerCase();
      if (r.includes('water')) return 'Water';
      if (r.includes('bill')) return 'Bill';
      if (r.includes('order')) return 'Take order';
      return 'Assistance';
    })();
    const table = String(call.tableNumber || '').trim() || 'unknown';
    const payload = buildPayload({
      title: `Call from Table ${table}`,
      body: reasonLabel,
      tag: `call-${callId}`,
      url: '/admin/orders',
      kind: 'call',
    });
    const res = await sendToSubscribers(rid, subs, payload);
    console.log(`[push:onWaiterCallCreated] rid=${rid} call=${callId} subs=${subs.length} sent=${res.sent} failed=${res.failed}`);
  }
);
