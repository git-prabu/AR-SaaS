// pages/api/cron/daily-summary.js
//
// Vercel cron endpoint — runs once a day at midnight IST and emails a
// daily summary to every active restaurant. Schedule lives in vercel.json
// (`30 18 * * *` = 18:30 UTC = 00:00 IST).
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
