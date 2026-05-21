// pages/api/crm/sync.js
//
// Phase 4 — Rebuild the customer CRM from EXISTING data (orders +
// reservations). Admin-triggered from /admin/customers; there is NO
// automatic hook into order creation, so the live (security-sensitive)
// ordering path is never touched by this feature.
//
// Aggregation, keyed by 10-digit phone:
//   visits     = number of non-cancelled orders carrying that phone
//   totalSpent = sum of `total` over PAID orders carrying that phone
//   name/email = most-recent non-empty values seen on an order
//   first/last = earliest / latest activity timestamp
// Reservations contribute the contact (name + phone) and a lastSeen so
// booking-only guests exist for marketing, but they add no spend.
//
// Admin-owned fields (pointsAdjust, tags, notes, marketingOptOut, and a
// manually-edited name/email) are PRESERVED — we read existing docs and
// merge, so a re-sync never wipes a redemption, an opt-out, or a
// hand-typed name.
import { adminDb } from '../../../lib/firebaseAdmin';
import admin from 'firebase-admin';
import { requireAdminAuth } from '../../../lib/staffAuth';

const PAID = ['paid_cash', 'paid_card', 'paid_online', 'paid'];

function norm(p) {
  const d = String(p || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
}
function tsToMs(t) {
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (t.seconds) return t.seconds * 1000;
  const n = Date.parse(t);
  return isNaN(n) ? 0 : n;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let ctx;
  try { ctx = await requireAdminAuth(req); }
  catch (e) { return res.status(401).json({ error: 'Unauthorized', detail: e.message }); }
  const rid = ctx.restaurantId;

  try {
    // phone -> { name, email, visits, totalSpent, firstMs, lastMs }
    const agg = new Map();
    const bump = (phone, patch) => {
      const cur = agg.get(phone) || { name: '', email: '', visits: 0, totalSpent: 0, firstMs: 0, lastMs: 0 };
      // Most-recent non-empty wins for name/email.
      if (patch.name && (patch.ms >= cur.lastMs || !cur.name)) cur.name = patch.name;
      if (patch.email && (patch.ms >= cur.lastMs || !cur.email)) cur.email = patch.email;
      if (patch.visits) cur.visits += patch.visits;
      if (patch.spent) cur.totalSpent += patch.spent;
      if (patch.ms) {
        cur.lastMs = Math.max(cur.lastMs, patch.ms);
        cur.firstMs = cur.firstMs ? Math.min(cur.firstMs, patch.ms) : patch.ms;
      }
      agg.set(phone, cur);
    };

    // Orders.
    const ordersSnap = await adminDb.collection(`restaurants/${rid}/orders`).get();
    ordersSnap.forEach(d => {
      const o = d.data();
      const phone = norm(o.customerPhone);
      if (!phone || o.status === 'cancelled') return;
      bump(phone, {
        name: String(o.customerName || '').trim().slice(0, 80),
        email: String(o.customerEmail || '').trim().slice(0, 120),
        visits: 1,
        spent: PAID.includes(o.paymentStatus) ? (Number(o.total) || 0) : 0,
        ms: tsToMs(o.createdAt),
      });
    });

    // Reservations (contact + recency only — no spend).
    const resSnap = await adminDb.collection(`restaurants/${rid}/reservations`).get();
    resSnap.forEach(d => {
      const r = d.data();
      const phone = norm(r.phone);
      if (!phone) return;
      const dateMs = r.date ? Date.parse(`${r.date}T12:00:00`) : 0;
      bump(phone, {
        name: String(r.name || '').trim().slice(0, 80),
        ms: (dateMs && !isNaN(dateMs)) ? dateMs : tsToMs(r.createdAt),
      });
    });

    if (agg.size === 0) return res.status(200).json({ ok: true, count: 0 });

    // Preserve admin-owned fields by reading what's already there.
    const existingSnap = await adminDb.collection(`restaurants/${rid}/customers`).get();
    const existing = new Map();
    existingSnap.forEach(d => existing.set(d.id, d.data()));

    const entries = [...agg.entries()];
    let written = 0;
    for (let i = 0; i < entries.length; i += 450) {
      const chunk = entries.slice(i, i + 450);
      const batch = adminDb.batch();
      for (const [phone, a] of chunk) {
        const prev = existing.get(phone) || {};
        const compFirst = a.firstMs ? new Date(a.firstMs).toISOString() : null;
        const compLast = a.lastMs ? new Date(a.lastMs).toISOString() : null;
        const firstSeenAt = [prev.firstSeenAt, compFirst].filter(Boolean).sort()[0] || new Date().toISOString();
        const lastSeenAt = [prev.lastSeenAt, compLast].filter(Boolean).sort().slice(-1)[0] || firstSeenAt;
        batch.set(adminDb.doc(`restaurants/${rid}/customers/${phone}`), {
          phone,
          name: prev.name || a.name || '',
          email: prev.email || a.email || null,
          visits: a.visits,
          totalSpent: Math.round(a.totalSpent * 100) / 100,
          // Admin-owned — keep prev when present, sensible defaults otherwise.
          pointsAdjust: prev.pointsAdjust != null ? prev.pointsAdjust : 0,
          tags: Array.isArray(prev.tags) ? prev.tags : [],
          notes: prev.notes || '',
          marketingOptOut: !!prev.marketingOptOut,
          firstSeenAt, lastSeenAt,
          source: prev.source || 'sync',
          syncedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastModifiedBy: `crm-sync:${ctx.uid || 'admin'}`,
          lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        written++;
      }
      await batch.commit();
    }

    return res.status(200).json({ ok: true, count: written });
  } catch (err) {
    console.error('[/api/crm/sync] failed:', err?.message || err);
    return res.status(500).json({ error: 'Sync failed. Please try again.' });
  }
}
