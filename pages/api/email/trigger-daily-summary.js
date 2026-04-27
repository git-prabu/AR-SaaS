// pages/api/email/trigger-daily-summary.js
//
// On-demand sibling of the nightly cron at /api/cron/daily-summary.
// Lets a superadmin re-run the daily-summary email pipeline immediately
// for testing — verify Gmail credentials, recipient resolution, Firestore
// data — without waiting for midnight IST.
//
// Body: { dateKey?: 'YYYY-MM-DD' }
//   - default: yesterday IST (same day the cron summarises)
//   - useful for re-sending today's summary, or testing against a known day
//
// Auth: Firebase ID token belonging to a `users/{uid}` doc with
// `role === 'superadmin'`. Same pattern as /api/email/send-test.

import { adminDb, adminAuth } from '../../../lib/firebaseAdmin';
import { runDailySummary } from '../../../lib/dailySummary';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  // ── Verify caller is a superadmin ──
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'Missing auth token.' });

  let decoded;
  try { decoded = await adminAuth.verifyIdToken(token); }
  catch { return res.status(401).json({ ok: false, error: 'Invalid auth token.' }); }

  const userSnap = await adminDb.doc(`users/${decoded.uid}`).get();
  if (!userSnap.exists || userSnap.data().role !== 'superadmin') {
    return res.status(403).json({ ok: false, error: 'Superadmin only.' });
  }

  // Optional override of which day to summarise. Validate the format so a
  // typo doesn't silently summarise the wrong day.
  let dateKey;
  if (req.body?.dateKey) {
    const raw = String(req.body.dateKey);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return res.status(400).json({ ok: false, error: 'dateKey must be YYYY-MM-DD' });
    }
    dateKey = raw;
  }

  try {
    const results = await runDailySummary({ dateKey });
    console.log('[trigger-daily-summary]', JSON.stringify({
      dateKey: results.dateKey,
      total:   results.total,
      sent:    results.sent,
      skipped: results.skipped,
      failed:  results.failed,
      caller:  decoded.email,
    }));
    return res.status(200).json({ ok: true, ...results });
  } catch (err) {
    console.error('[trigger-daily-summary] fatal:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
