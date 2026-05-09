// pages/api/cron/daily-summary.js
//
// Vercel cron endpoint — runs once a day shortly after midnight IST and
// emails a daily summary to every active restaurant. Schedule lives in
// vercel.json (`0 19 * * *` = 19:00 UTC = 00:30 IST).
//
// Why 00:30 IST and not 00:00? Vercel Hobby plan only allows cron
// schedules at the top of an hour (minute=0). `30 18 * * *` (the
// previous schedule) was silently rejected, which is why daily-summary
// emails stopped going out. The 30-minute delay is harmless — yesterdayISTKey()
// in lib/dailySummary.js already subtracts 60min to safely land in
// "yesterday IST" regardless of when the cron fires within the hour.
//
// Auth: protected by CRON_SECRET env var. Vercel cron requests include
// `Authorization: Bearer ${CRON_SECRET}` automatically. We reject anything
// without it so the URL can't be hammered by random callers.
//
// All actual logic lives in lib/dailySummary.js so the same flow can be
// re-run on demand from /superadmin/email via /api/email/trigger-daily-summary.

import { runDailySummary } from '../../../lib/dailySummary';

export default async function handler(req, res) {
  // Auth — only Vercel cron (or a manual call with the secret).
  const auth = req.headers.authorization || '';
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return res.status(500).json({ ok: false, error: 'CRON_SECRET not configured.' });
  }
  if (auth !== `Bearer ${expected}`) {
    return res.status(401).json({ ok: false, error: 'Unauthorized.' });
  }

  try {
    const results = await runDailySummary();
    console.log('[cron/daily-summary]', JSON.stringify({
      dateKey: results.dateKey,
      total:   results.total,
      sent:    results.sent,
      skipped: results.skipped,
      failed:  results.failed,
    }));
    return res.status(200).json({ ok: true, ...results });
  } catch (err) {
    console.error('[cron/daily-summary] fatal:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
