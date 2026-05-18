// pages/api/cron/petpooja-menu-sync.js
//
// Vercel cron endpoint — runs daily at 04:00 UTC (~09:30 IST) and
// pulls the latest menu from Petpooja for every restaurant in
// petpooja_hybrid mode. Schedule lives in vercel.json (`0 4 * * *`).
//
// This is a fallback safety net. The PRIMARY menu-sync path is the
// inbound /api/petpooja/pushmenu webhook, which Petpooja calls
// whenever a restaurant edits anything in their dashboard. The
// daily pull catches drift if a webhook delivery is dropped or the
// restaurant's network has been flapping.
//
// Daily was chosen (vs hourly / 6-hourly) because Vercel's Hobby
// plan caps crons to one-per-day. When the project upgrades to Pro,
// the schedule can be tightened to `0 */6 * * *` for faster drift
// recovery.
//
// Auth: protected by CRON_SECRET env var. Same pattern as
// /api/cron/daily-summary.

import { adminDb } from '../../../lib/firebaseAdmin';
import { syncMenu } from '../../../lib/petpoojaSync';
import { withCronStatus } from '../../../lib/cronStatus';

export default async function handler(req, res) {
  const auth = req.headers.authorization || '';
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return res.status(500).json({ ok: false, error: 'CRON_SECRET not configured.' });
  }
  if (auth !== `Bearer ${expected}`) {
    return res.status(401).json({ ok: false, error: 'Unauthorized.' });
  }

  // withCronStatus records the run outcome in systemConfig/cronStatus so
  // the superadmin can spot silent failures. `partial: true` is returned
  // when at least one restaurant's sync failed — useful signal even if
  // the cron as a whole "succeeded".
  return withCronStatus('petpooja-menu-sync', async () => {
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
    return { summary, partial: summary.failed > 0 };
  }, res);
}
