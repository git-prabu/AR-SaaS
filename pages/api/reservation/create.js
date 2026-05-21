// pages/api/reservation/create.js
//
// Phase 2 #8 — public table-booking endpoint. Customers submit from
// /book/[subdomain]; we write a reservation (status 'requested') for
// the restaurant to confirm. Server-side (Admin SDK) rather than a
// direct client write so we can:
//   1. validate inputs (phone, party size, date/time),
//   2. rate-limit per IP (reservation spam → fake bookings that block
//      real ones),
//   3. keep the reservations collection non-public-writable.
import { adminDb } from '../../../lib/firebaseAdmin';
import admin from 'firebase-admin';
import { checkRateLimit, getClientIp } from '../../../lib/rateLimit';

function clean(v, max = 120) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit first (cheap, pre-validation) — 5 bookings / 10 min / IP.
  const ip = getClientIp(req);
  if (ip) {
    const lim = await checkRateLimit(`reservation_ip_${ip}`, 5, 600);
    if (!lim.ok) {
      res.setHeader('Retry-After', String(lim.waitSec));
      return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
    }
  }

  const b = req.body || {};
  const rawSub = clean(b.subdomain, 63).toLowerCase();
  const subdomain = /^[a-z0-9-]{1,63}$/.test(rawSub) ? rawSub : '';
  const name  = clean(b.name, 60);
  const phone = clean(b.phone, 15).replace(/\D/g, '');
  const date  = clean(b.date, 10);   // YYYY-MM-DD
  const time  = clean(b.time, 5);    // HH:MM
  const note  = clean(b.note, 200);
  const partySize = Math.max(1, Math.min(50, Math.floor(Number(b.partySize) || 0)));

  if (!subdomain) return res.status(400).json({ error: 'Missing restaurant' });
  if (!name)      return res.status(400).json({ error: 'Name is required' });
  if (phone.length < 10) return res.status(400).json({ error: 'A valid phone number is required' });
  if (!partySize) return res.status(400).json({ error: 'Party size is required' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Pick a valid date' });
  if (!/^\d{2}:\d{2}$/.test(time))       return res.status(400).json({ error: 'Pick a valid time' });
  // Don't allow booking in the past (compare date only, generous).
  const todayKey = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  if (date < todayKey) return res.status(400).json({ error: 'Pick a future date' });

  try {
    const rs = await adminDb.collection('restaurants')
      .where('subdomain', '==', subdomain).limit(1).get();
    if (rs.empty) return res.status(404).json({ error: 'Restaurant not found' });
    const rid = rs.docs[0].id;

    await adminDb.collection(`restaurants/${rid}/reservations`).add({
      name, phone, partySize, date, time, note,
      status: 'requested',
      source: 'web',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[/api/reservation/create] failed:', err?.message || err);
    return res.status(500).json({ error: 'Could not submit booking. Please try again.' });
  }
}
