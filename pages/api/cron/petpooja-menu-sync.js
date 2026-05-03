// pages/api/cron/petpooja-menu-sync.js
//
// Vercel cron endpoint — runs every 6 hours and pulls the latest menu
// from Petpooja for every restaurant in petpooja_hybrid mode. Schedule
// lives in vercel.json (`0 */6 * * *`).
//
// This is a fallback safety net. The PRIMARY menu-sync path is the
// inbound /api/petpooja/pushmenu webhook, which Petpooja calls
// whenever a restaurant edits anything in their dashboard. The 6-hour
// pull catches drift if a webhook delivery is dropped or the
// restaurant's network has been flapping.
//
// Auth: protected by CRON_SECRET env var. Same pattern as
// /api/cron/daily-summary.

import { adminDb } from '../../../lib/firebaseAdmin';
import { syncMenu } from '../../../lib/petpoojaSync';

export default async function handler(req, res) {
  const auth = req.headers.authorization || '';
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return res.status(500).json({ ok: false, error: 'CRON_SECRET not configured.' });
  }
  if (auth !== `Bearer ${expected}`) {
    return res.status(401).json({ ok: false, error: 'Unauthorized.' });
  }

  try {
    // Find all hybrid restaurants. We don't filter by plan here —
    // syncMenu()'s loadAndGate() will refuse work for any restaurant
    // that's flipped off Pro. Belt-and-braces.
    const q = await adminDb.collection('restaurants')
      .where('posMode', '==', 'petpooja_hybrid')
      .get();

    const results = [];
    for (const doc of q.docs) {
      try {
        const r = await syncMenu(doc.id);
        results.push({ restaurantId: doc.id, ...r });
      } catch (err) {
        results.push({ restaurantId: doc.id, ok: false, error: err?.message });
      }
    }

    const summary = {
      total:    results.length,
      ok:       results.filter(r => r.ok).length,
      skipped:  results.filter(r => r.skipped).length,
      failed:   results.filter(r => !r.ok && !r.skipped).length,
    };
    console.log('[cron/petpooja-menu-sync]', JSON.stringify(summary));
    return res.status(200).json({ ok: true, summary, results });
  } catch (err) {
    console.error('[cron/petpooja-menu-sync] failed:', err);
    return res.status(500).json({ ok: false, error: err?.message });
  }
}
