// pages/api/cron/daily-summary.js
//
// Vercel cron endpoint — runs once a day at midnight IST and emails a
// daily summary to every active restaurant. Schedule lives in vercel.json.
//
// Recipient resolution per restaurant:
//   1. restaurants/{rid}.notificationsEmail (set in /admin/settings)  ← preferred
//   2. fallback: the auth email of the user with role==='restaurant' + matching restaurantId
//   3. if neither exists, log + skip (no crash)
//
// Auth: protected by CRON_SECRET env var (Vercel auto-generates, or set
// manually). Vercel's cron requests include `Authorization: Bearer ${CRON_SECRET}`
// so we reject anything without it — otherwise anyone could hit this URL
// and trigger spam.

import { adminDb } from '../../../lib/firebaseAdmin';
import { sendEmail, dailySummaryTemplate } from '../../../lib/email';

const PAID_STATUSES = new Set(['paid_cash', 'paid_card', 'paid_online', 'paid']);

// ── IST date math ─────────────────────────────────────────────────────────
// Vercel's runtime is UTC. We compute "the IST date that just ended" so
// the email matches what the restaurant owner saw on the dashboard
// throughout the day (admin pages use IST local-time todayKey()).

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// At cron-fire time (~00:00 IST), return the date string for "yesterday IST"
// — i.e. the day that just closed. We subtract an extra 60 min to safely
// land in yesterday even if the cron fires a few minutes early.
function yesterdayISTKey() {
  const now = Date.now();
  const safelyYesterday = new Date(now + IST_OFFSET_MS - 60 * 60 * 1000);
  const y = safelyYesterday.getUTCFullYear();
  const m = String(safelyYesterday.getUTCMonth() + 1).padStart(2, '0');
  const d = String(safelyYesterday.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Convert an IST date string (YYYY-MM-DD) to {startSec, endSec} in UTC
// epoch seconds. Used to filter Firestore order timestamps for the day.
function istDayBoundsSec(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const startUTC = Date.UTC(y, m - 1, d, 0, 0, 0)        - IST_OFFSET_MS;
  const endUTC   = Date.UTC(y, m - 1, d, 23, 59, 59, 999) - IST_OFFSET_MS;
  return { startSec: startUTC / 1000, endSec: endUTC / 1000 };
}

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

  const dateKey = yesterdayISTKey();
  const { startSec, endSec } = istDayBoundsSec(dateKey);

  try {
    // Fetch all active restaurants. We email even zero-order restaurants —
    // the template has a friendly "no orders today" line and the owner
    // appreciates knowing the system is alive.
    const restoSnap = await adminDb.collection('restaurants')
      .where('isActive', '==', true)
      .get();

    const results = { dateKey, total: 0, sent: 0, skipped: 0, failed: 0, details: [] };

    for (const doc of restoSnap.docs) {
      const restaurant = { id: doc.id, ...doc.data() };
      results.total += 1;

      // Resolve recipient.
      const recipient = await resolveRecipientEmail(restaurant);
      if (!recipient) {
        results.skipped += 1;
        results.details.push({ rid: restaurant.id, name: restaurant.name, status: 'skipped', reason: 'no recipient' });
        continue;
      }

      // Build per-restaurant summary data from yesterday's orders.
      const summary = await buildSummary(restaurant, startSec, endSec);

      const html = dailySummaryTemplate({
        restaurantName: restaurant.name || 'Your Restaurant',
        dateISO: dateKey,
        ...summary,
      });

      const send = await sendEmail({
        to: recipient,
        subject: `Daily summary — ${restaurant.name || 'Your Restaurant'} · ${dateKey}`,
        html,
      });

      if (send.ok) {
        results.sent += 1;
        results.details.push({ rid: restaurant.id, name: restaurant.name, to: recipient, status: 'sent' });
      } else {
        results.failed += 1;
        results.details.push({ rid: restaurant.id, name: restaurant.name, to: recipient, status: 'failed', error: send.error });
      }
    }

    console.log('[cron/daily-summary]', JSON.stringify({ dateKey, total: results.total, sent: results.sent, skipped: results.skipped, failed: results.failed }));
    return res.status(200).json({ ok: true, ...results });
  } catch (err) {
    console.error('[cron/daily-summary] fatal:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function resolveRecipientEmail(restaurant) {
  // 1. Per-restaurant override (set in /admin/settings).
  const override = String(restaurant.notificationsEmail || '').trim();
  if (override) return override;

  // 2. Fallback to the restaurant admin's signup email. Query users where
  //    restaurantId matches and role==='restaurant'. Take the first match.
  try {
    const userSnap = await adminDb.collection('users')
      .where('restaurantId', '==', restaurant.id)
      .where('role', '==', 'restaurant')
      .limit(1)
      .get();
    if (!userSnap.empty) {
      const email = userSnap.docs[0].data().email;
      if (email) return email;
    }
  } catch (err) {
    console.error('[cron] resolveRecipientEmail user lookup failed for', restaurant.id, ':', err.message);
  }
  return null;
}

async function buildSummary(restaurant, startSec, endSec) {
  // Fetch the day's orders for this restaurant. Inequality on createdAt.seconds
  // requires Firestore to expose seconds field; we use the Timestamp directly.
  const ordersSnap = await adminDb.collection('restaurants').doc(restaurant.id)
    .collection('orders')
    .where('createdAt', '>=', new Date(startSec * 1000))
    .where('createdAt', '<=', new Date(endSec   * 1000))
    .get();

  const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Refunded orders are excluded from revenue but still counted as orders
  // (the order happened; only the money went back). Matches /admin/analytics
  // and /admin/reports semantics.
  const paid     = orders.filter(o => PAID_STATUSES.has(o.paymentStatus));
  const refunded = orders.filter(o => o.paymentStatus === 'refunded');
  const revenue  = paid.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const avgOrderValue = paid.length > 0 ? revenue / paid.length : 0;

  // Top dishes by qty across all orders (paid + unpaid — what the kitchen made).
  const itemFreq = {};
  orders.forEach(o => {
    (o.items || []).forEach(item => {
      if (!item.name) return;
      if (!itemFreq[item.name]) itemFreq[item.name] = { name: item.name, qty: 0, revenue: 0 };
      itemFreq[item.name].qty     += Number(item.qty) || 1;
      itemFreq[item.name].revenue += (Number(item.price) || 0) * (Number(item.qty) || 1);
    });
  });
  const topDishes = Object.values(itemFreq).sort((a, b) => b.qty - a.qty).slice(0, 5);

  // Payment-method breakdown (rupees per method, only paid orders).
  const methodBreakdown = { cash: 0, card: 0, online: 0 };
  paid.forEach(o => {
    if (o.paymentStatus === 'paid_cash')   methodBreakdown.cash   += Number(o.total) || 0;
    if (o.paymentStatus === 'paid_card')   methodBreakdown.card   += Number(o.total) || 0;
    if (o.paymentStatus === 'paid_online') methodBreakdown.online += Number(o.total) || 0;
    if (o.paymentStatus === 'paid')        methodBreakdown.cash   += Number(o.total) || 0; // legacy bucket
  });

  // Busiest hour by order count (in IST). Translates each order's UTC
  // timestamp to IST and bins by hour.
  const hourCounts = Array(24).fill(0);
  orders.forEach(o => {
    const sec = o.createdAt?._seconds ?? o.createdAt?.seconds;
    if (!sec) return;
    const istHour = new Date((sec * 1000) + IST_OFFSET_MS).getUTCHours();
    hourCounts[istHour] += 1;
  });
  let busiestHour = null;
  let max = 0;
  for (let h = 0; h < 24; h++) {
    if (hourCounts[h] > max) { max = hourCounts[h]; busiestHour = h; }
  }
  const busiestHourLabel = busiestHour == null ? null : {
    label: formatHour(busiestHour), orders: hourCounts[busiestHour],
  };

  return {
    totals: {
      orders: orders.length,
      revenue,
      avgOrderValue,
      paidCount: paid.length,
      refundedCount: refunded.length,
    },
    topDishes,
    methodBreakdown,
    busiestHour: busiestHourLabel,
  };
}

function formatHour(h) {
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}
