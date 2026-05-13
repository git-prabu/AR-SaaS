// lib/dailySummary.js
//
// Server-only helpers for the daily-summary email pipeline. Used by both:
//   - /api/cron/daily-summary  → nightly Vercel cron (auth: CRON_SECRET)
//   - /api/email/trigger-daily-summary → on-demand button on /superadmin/email
//                                        (auth: superadmin Firebase ID token)
//
// Same logic, two entry points. Lets the superadmin verify the pipeline
// works without waiting for midnight IST + lets us see a per-restaurant
// breakdown of who got the email vs who was skipped (and why).

import { adminDb } from './firebaseAdmin';
import { sendEmail, dailySummaryTemplate } from './email';

const PAID_STATUSES = new Set(['paid_cash', 'paid_card', 'paid_online', 'paid']);
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Returns the IST date string for "the day that just closed" — the day the
// cron is meant to summarise. Called right around midnight IST.
//
// Bug fix (May 13): previously this subtracted only 60 min, which protected
// against cron firing a few minutes EARLY but FAILED when Vercel fired late
// (which happens routinely — Vercel cron has ~30-60min latency under load).
// A 30-min-late fire at 19:30 UTC = 01:00 IST landed in "today" because
// `now + IST_OFFSET - 1h` = 00:00 IST, whose UTC components read as today's
// calendar day. The query then targeted today's window (which has no orders
// yet at 1 AM IST) → empty email.
//
// The fix subtracts 6 hours instead. This handles BOTH directions of jitter
// (cron can fire up to a few hours before or after the scheduled time and we
// still land squarely in the previous day) — Vercel's worst-case latency is
// well under that. Verified at the 5 fire-time edge cases:
//   19:00 UTC (on-time)        → IST 00:30 next day  → -6h = 18:30 prev day ✓
//   19:30 UTC (30 min late)    → IST 01:00 next day  → -6h = 19:00 prev day ✓
//   20:30 UTC (90 min late)    → IST 02:00 next day  → -6h = 20:00 prev day ✓
//   18:30 UTC (30 min early)   → IST 00:00 next day  → -6h = 18:00 prev day ✓
//   18:00 UTC (60 min early)   → IST 23:30 same day  → -6h = 17:30 same day ✓
export function yesterdayISTKey() {
  const nowIST = new Date(Date.now() + IST_OFFSET_MS - 6 * 60 * 60 * 1000);
  const y = nowIST.getUTCFullYear();
  const m = String(nowIST.getUTCMonth() + 1).padStart(2, '0');
  const d = String(nowIST.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Convert an IST date string (YYYY-MM-DD) to {startSec, endSec} in UTC
// epoch seconds. Used to filter Firestore order timestamps for the day.
export function istDayBoundsSec(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const startUTC = Date.UTC(y, m - 1, d, 0, 0, 0)        - IST_OFFSET_MS;
  const endUTC   = Date.UTC(y, m - 1, d, 23, 59, 59, 999) - IST_OFFSET_MS;
  return { startSec: startUTC / 1000, endSec: endUTC / 1000 };
}

// Resolve where a restaurant's daily summary email should go.
// Priority: per-restaurant override > admin's signup email > null (skip).
export async function resolveRecipientEmail(restaurant) {
  const override = String(restaurant.notificationsEmail || '').trim();
  if (override) return override;

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
    console.error('[daily-summary] user lookup failed for', restaurant.id, ':', err.message);
  }
  return null;
}

// Build the per-restaurant summary numbers for a given day.
// Mirrors the analytics page's revenue/refund semantics so what the owner
// reads in the email matches what they see on /admin/reports.
export async function buildSummary(restaurant, startSec, endSec) {
  const ordersSnap = await adminDb.collection('restaurants').doc(restaurant.id)
    .collection('orders')
    .where('createdAt', '>=', new Date(startSec * 1000))
    .where('createdAt', '<=', new Date(endSec   * 1000))
    .get();

  const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Refunded orders are excluded from revenue but still counted as orders
  // (the order happened; only the money went back).
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

  // Busiest hour by order count (in IST).
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

// Run the daily-summary pipeline for one IST date. Default = yesterday.
//
// Returns:
//   {
//     dateKey:  'YYYY-MM-DD',
//     total:    <active restaurants seen>,
//     sent:     <emails delivered>,
//     skipped:  <restaurants with no resolvable recipient>,
//     failed:   <send failures (smtp / credentials)>,
//     details:  [{ rid, name, status: 'sent'|'skipped'|'failed', to?, reason?, error? }]
//   }
//
// Never throws — the caller (cron handler / API endpoint) decides what
// to log + what to surface to the user.
export async function runDailySummary(opts = {}) {
  const dateKey = opts.dateKey || yesterdayISTKey();
  const { startSec, endSec } = istDayBoundsSec(dateKey);

  const restoSnap = await adminDb.collection('restaurants')
    .where('isActive', '==', true)
    .get();

  const results = { dateKey, total: 0, sent: 0, skipped: 0, failed: 0, details: [] };

  for (const doc of restoSnap.docs) {
    const restaurant = { id: doc.id, ...doc.data() };
    results.total += 1;

    const recipient = await resolveRecipientEmail(restaurant);
    if (!recipient) {
      results.skipped += 1;
      results.details.push({ rid: restaurant.id, name: restaurant.name, status: 'skipped', reason: 'no recipient (set notificationsEmail or admin signup email)' });
      continue;
    }

    let summary;
    try {
      summary = await buildSummary(restaurant, startSec, endSec);
    } catch (err) {
      results.failed += 1;
      results.details.push({ rid: restaurant.id, name: restaurant.name, to: recipient, status: 'failed', error: 'buildSummary: ' + err.message });
      continue;
    }

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

  return results;
}
