// pages/api/tableBill/get-or-create.js
//
// Customer-facing endpoint to get-or-create the running bill ("tab") for a
// dine-in table. Multiple orders at the same table during one sitting all
// attach to the same bill, so the customer sees ONE running total instead
// of separate bills per order.
//
// Why this is a server endpoint and not a direct Firestore write:
//   The atomic flow (read tableSessions → check currentBillId → read bill
//   doc → create new bill if needed → update tableSessions) needs a
//   transaction across two collections. Doing this from the customer
//   without auth would require very loose Firestore rules. Using the
//   Admin SDK server-side bypasses rules and lets us validate the QR
//   session token (sid) before creating bills — preventing arbitrary
//   spoofed bills for tables the customer isn't actually at.
//
// Lifecycle:
//   - First call for a table → creates a new open bill, points
//     `tableSessions/{tableNumber}.currentBillId` at it
//   - Subsequent calls → returns the same open bill
//   - Bill closed (admin marks all paid in a later phase) → currentBillId
//     cleared, next call here creates a fresh bill
//
// Public endpoint — same trust boundary as the customer menu itself. The
// QR sid validation + isActive/expiresAt check stops random callers from
// opening bills on tables they aren't seated at.
//
// Body: { restaurantId, tableNumber, sid }
// Response: { ok: true, billId } or { ok: false, error }

import { adminDb } from '../../../lib/firebaseAdmin';
import { checkRateLimit, getClientIp } from '../../../lib/rateLimit';

// Phase 4 hardening (F5, 17 May 2026): tableNumber regex. The
// previous code did `String(tableNumber)` and used the result as
// a Firestore document ID (tableSessions/{tNum}). Without
// validation, an attacker could pass `tableNumber: "__proto__"`
// (rejected by Firestore but generates noise), or excessively
// long strings (up to 1500 bytes per Firestore doc-id limits).
// Real table numbers in restaurant QR codes are short integers.
const TABLE_NUMBER_REGEX = /^\d{1,5}$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Phase 4 hardening (F5, 17 May 2026): per-IP rate limit. The
  // endpoint creates new tableBill documents — without a limit,
  // an attacker who scans (or guesses) a table session sid can
  // spam bill creation by repeatedly cycling currentBillId. 30/min
  // is generous for a real customer (they might re-open the menu
  // tab a few times during a meal).
  const ip = getClientIp(req);
  if (ip) {
    const lim = await checkRateLimit(`tablebill_ip_${ip}`, 30, 60);
    if (!lim.ok) {
      res.setHeader('Retry-After', String(lim.waitSec));
      return res.status(429).json({ ok: false, error: 'Too many requests. Try again shortly.' });
    }
  }

  const { restaurantId, tableNumber, sid } = req.body || {};
  if (!restaurantId || !tableNumber || !sid) {
    return res.status(400).json({ ok: false, error: 'restaurantId, tableNumber, sid required' });
  }
  if (typeof restaurantId !== 'string' || typeof sid !== 'string') {
    return res.status(400).json({ ok: false, error: 'Invalid input types' });
  }
  if (restaurantId.length > 128 || sid.length > 64) {
    return res.status(400).json({ ok: false, error: 'Input too long' });
  }

  const tNum = String(tableNumber);
  if (!TABLE_NUMBER_REGEX.test(tNum)) {
    return res.status(400).json({ ok: false, error: 'Invalid table number.' });
  }
  const sessionRef = adminDb.doc(`restaurants/${restaurantId}/tableSessions/${tNum}`);
  const billsCol   = adminDb.collection(`restaurants/${restaurantId}/tableBills`);

  try {
    const billId = await adminDb.runTransaction(async (txn) => {
      // 1) Validate the table session token
      const sessionSnap = await txn.get(sessionRef);
      if (!sessionSnap.exists) {
        throw new Error('Table session not found.');
      }
      const session = sessionSnap.data();
      if (!session.isActive) {
        throw new Error('Table is not active.');
      }
      if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
        throw new Error('Table session expired.');
      }
      if (session.sid !== sid) {
        throw new Error('Session token mismatch.');
      }

      // 2) If session points at an existing open bill, reuse it
      const existingBillId = session.currentBillId || null;
      if (existingBillId) {
        const billRef  = adminDb.doc(`restaurants/${restaurantId}/tableBills/${existingBillId}`);
        const billSnap = await txn.get(billRef);
        if (billSnap.exists && billSnap.data().status === 'open') {
          // Touch lastActivityAt so the future idle-archive cron knows the
          // tab is still live.
          txn.update(billRef, { lastActivityAt: new Date().toISOString() });
          return existingBillId;
        }
      }

      // 3) Otherwise create a new open bill + point the session at it
      const newBillRef = billsCol.doc();
      const nowISO = new Date().toISOString();
      txn.set(newBillRef, {
        tableNumber:    tNum,
        status:         'open',
        openedAt:       nowISO,
        closedAt:       null,
        lastActivityAt: nowISO,
        // orderIds: the source of truth for which orders are on this
        // bill. Customer page's placeOrder() arrayUnions each new
        // orderId here right after createOrder() succeeds. The bill
        // listener (Phase 2.5 refactor) reads this array and sets up
        // per-doc onSnapshot listeners — replaces the old
        // where('billId', '==', X) query which required public list
        // permission on the orders collection (CRITICAL audit C2).
        orderIds:       [],
        // Audit fields — same shape as withActor() writes from client code,
        // so future readers can treat this consistently.
        lastModifiedBy: 'public',
        lastModifiedAt: nowISO,
      });
      txn.set(sessionRef, { currentBillId: newBillRef.id }, { merge: true });
      return newBillRef.id;
    });

    return res.status(200).json({ ok: true, billId });
  } catch (err) {
    console.error('[tableBill/get-or-create]', err.message);
    return res.status(500).json({ ok: false, error: err.message || 'Server error' });
  }
}
