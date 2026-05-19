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
// in lib/dailySummary.js shifts -6 hours from IST-now to safely land in
// the previous day regardless of whether Vercel fires the cron exactly
// on time or up to a few hours late (which it routinely does under load).
//
// May 13 — verified that the previous "-60min" safety margin was the
// reason summaries showed 0 orders/0 revenue: a 30-min-late cron landed
// in "today" instead of "yesterday" and queried a window that hadn't
// happened yet. Now -6h: always lands in the day that just closed.
//
// Auth: protected by CRON_SECRET env var. Vercel cron requests include
// `Authorization: Bearer ${CRON_SECRET}` automatically. We reject anything
// without it so the URL can't be hammered by random callers.
//
// All actual logic lives in lib/dailySummary.js so the same flow can be
// re-run on demand from /superadmin/email via /api/email/trigger-daily-summary.

import { runDailySummary } from '../../../lib/dailySummary';
import { withCronStatus } from '../../../lib/cronStatus';

// 18 May 2026 — DIAGNOSED ROOT CAUSE of "no daily summary email" report.
// Default Vercel function timeout is 10s. runDailySummary loops every
// active restaurant SERIALLY: for each, it reads orders, builds the
// summary HTML, and sends via Gmail SMTP. SMTP send alone is ~1-3s per
// recipient. With even 4-5 restaurants the function timed out, the
// withCronStatus catch block never ran, no entry landed in
// systemConfig/cronStatus, and no emails went out. Petpooja menu-sync
// works because each restaurant takes ~100ms and 5 restaurants finish
// well under 10s.
//
// Hobby plan allows up to 60s on configured routes. 60s comfortably
// covers ~20 restaurants at 3s each — beyond that we'll need to either
// parallelise the per-restaurant work (Promise.allSettled with a small
// concurrency cap) or upgrade to Pro for the 300s ceiling.
export const config = {
  maxDuration: 60,
};

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

  // withCronStatus wraps the work + records outcome to systemConfig/cronStatus
  // so the superadmin can see if the cron is healthy. `partial` is true when
  // some restaurants got their email but others failed — useful signal that
  // SMTP is flaky or a specific restaurant has a bad config.
  return withCronStatus('daily-summary', async () => {
    const results = await runDailySummary();
    console.log('[cron/daily-summary]', JSON.stringify({
      dateKey: results.dateKey,
      total:   results.total,
      sent:    results.sent,
      skipped: results.skipped,
      failed:  results.failed,
    }));
    return {
      summary: {
        dateKey: results.dateKey,
        total:   results.total,
        sent:    results.sent,
        skipped: results.skipped,
        failed:  results.failed,
      },
      partial: results.failed > 0,
    };
  }, res);
}
