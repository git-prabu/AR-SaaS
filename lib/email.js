// lib/email.js
//
// Gmail SMTP wrapper used by the daily-summary cron job and the superadmin
// "send test email" button. The sender credentials live in Firestore at
// `systemConfig/email` so the superadmin can rotate them anytime without
// a redeploy. (Strict Firestore rule: only superadmin reads/writes that doc.)
//
// Server-only — imports `nodemailer`, which is a Node-side package that
// won't bundle for the browser. Always invoke from an API route or a server
// utility, never from a React component.
//
// Sender doc shape (systemConfig/email):
//   {
//     senderEmail:   string,  // e.g. "radical.notifications@gmail.com"
//     senderName:    string,  // e.g. "Advert Radical"
//     appPassword:   string,  // 16-char Gmail App Password (see lib comment below)
//     enabled:       boolean, // master kill-switch — when false, sendEmail() is a no-op
//   }
//
// HOW TO GET A GMAIL APP PASSWORD (one-time setup):
//   1. Sign in to the sender Gmail account.
//   2. Go to https://myaccount.google.com/security
//   3. Turn on 2-Step Verification if it isn't already (required for App Passwords).
//   4. Search for "App passwords" → create one named "Advert Radical".
//   5. Google shows a 16-character password ONCE. Paste it into the
//      superadmin /superadmin/email page (the "App password" field).

import nodemailer from 'nodemailer';
import { adminDb } from './firebaseAdmin';

const SENDER_DOC = 'systemConfig/email';

// Read the sender config from Firestore. Returns null when the doc is
// missing OR when `enabled === false`. Cron + test-send call this and bail
// out gracefully if it returns null — they never crash the deploy on
// "credentials not set yet."
export async function getSenderConfig() {
  try {
    const snap = await adminDb.doc(SENDER_DOC).get();
    if (!snap.exists) return null;
    const cfg = snap.data();
    if (!cfg?.senderEmail || !cfg?.appPassword) return null;
    if (cfg.enabled === false) return null;
    return {
      senderEmail: cfg.senderEmail,
      senderName:  cfg.senderName || 'Advert Radical',
      appPassword: cfg.appPassword,
    };
  } catch (err) {
    console.error('[email] getSenderConfig failed:', err);
    return null;
  }
}

// Save sender config — called from the superadmin email page.
// Does NOT validate the credentials by itself (use sendTestEmail() for that).
export async function setSenderConfig(cfg) {
  await adminDb.doc(SENDER_DOC).set({
    senderEmail: String(cfg.senderEmail || '').trim(),
    senderName:  String(cfg.senderName || 'Advert Radical').trim(),
    appPassword: String(cfg.appPassword || '').trim(),
    enabled:     cfg.enabled !== false,
    updatedAt:   new Date().toISOString(),
  }, { merge: true });
}

// Build a fresh transporter per call. nodemailer keeps a connection pool
// internally per transporter; for our cron-style "fire a few emails then
// exit" lifecycle, recycling the transporter doesn't matter and avoids
// stale-credential bugs after a sender rotation.
function makeTransporter(cfg) {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: cfg.senderEmail,
      pass: cfg.appPassword,
    },
  });
}

// Core send. Returns { ok: true } on success, { ok: false, error: string }
// on failure. Never throws — callers (cron loop) want to continue past one
// bad recipient instead of aborting the whole batch.
export async function sendEmail({ to, subject, html, text }) {
  const cfg = await getSenderConfig();
  if (!cfg) return { ok: false, error: 'No sender config (or emails disabled).' };
  if (!to) return { ok: false, error: 'No recipient.' };

  try {
    const transporter = makeTransporter(cfg);
    const info = await transporter.sendMail({
      from: `"${cfg.senderName}" <${cfg.senderEmail}>`,
      to,
      subject,
      html,
      text: text || stripHtml(html),
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error('[email] sendEmail failed for', to, ':', err.message);
    return { ok: false, error: err.message };
  }
}

// Plain-text fallback for the multipart/alternative body. Some email clients
// (and most spam filters) prefer multipart messages — having both bodies
// boosts deliverability.
function stripHtml(html = '') {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ────────────────────────────────────────────────────────────────────────────
// Templates
// ────────────────────────────────────────────────────────────────────────────

// Daily-summary email template. Pure data-in / HTML-out — no Firestore
// access here so it's easy to preview/test in isolation.
//
// `data` shape:
//   {
//     restaurantName: string,
//     dateISO:        string  // YYYY-MM-DD (the day this summarises)
//     totals:        { orders, revenue, avgOrderValue, paidCount, refundedCount },
//     topDishes:     [{ name, qty, revenue }],     // already sorted, max 5
//     methodBreakdown: { cash, card, online },     // amounts in rupees
//     busiestHour:   { label, orders } | null,     // e.g. { label: '8 PM', orders: 12 }
//   }
export function dailySummaryTemplate(data) {
  const { restaurantName, dateISO, totals, topDishes, methodBreakdown, busiestHour } = data;
  const dateLabel = formatDateLong(dateISO);
  const ru = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');

  const dishRows = (topDishes || []).slice(0, 5).map((d, i) => `
    <tr>
      <td style="padding:8px 12px;font-size:13px;color:#1A1A1A;font-weight:600;">${i + 1}. ${escapeHtml(d.name)}</td>
      <td style="padding:8px 12px;font-size:13px;color:#A08656;text-align:right;">${d.qty} ordered</td>
      <td style="padding:8px 12px;font-size:13px;color:#1A1A1A;text-align:right;font-weight:600;">${ru(d.revenue)}</td>
    </tr>
  `).join('');

  const noOrdersLine = (!totals.orders || totals.orders === 0)
    ? `<div style="padding:24px;text-align:center;color:rgba(0,0,0,0.55);font-size:13px;">No orders today. Hope tomorrow's a busy one.</div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Daily Summary — ${escapeHtml(restaurantName)}</title>
</head>
<body style="margin:0;padding:0;background:#EDEDED;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EDEDED;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);">

        <!-- Matte-black header -->
        <tr><td style="background:linear-gradient(135deg,#1A1A1A 0%,#2A2A2A 100%);padding:24px 28px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#C4A86D;margin-bottom:6px;">DAILY SUMMARY</div>
          <div style="font-size:22px;font-weight:600;color:#EAE7E3;letter-spacing:-0.3px;">${escapeHtml(restaurantName)}</div>
          <div style="font-size:13px;color:rgba(234,231,227,0.55);margin-top:4px;">${dateLabel}</div>
        </td></tr>

        <!-- Stat tiles -->
        <tr><td style="padding:24px 28px 8px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="50%" style="padding:16px 18px;background:rgba(0,0,0,0.04);border-radius:10px;vertical-align:top;">
                <div style="font-size:10px;font-weight:700;letter-spacing:0.10em;text-transform:uppercase;color:rgba(0,0,0,0.38);margin-bottom:6px;">Orders</div>
                <div style="font-size:24px;font-weight:700;color:#1A1A1A;letter-spacing:-0.4px;">${totals.orders || 0}</div>
                <div style="font-size:11px;color:rgba(0,0,0,0.55);margin-top:4px;">${totals.paidCount || 0} paid${totals.refundedCount ? ` · ${totals.refundedCount} refunded` : ''}</div>
              </td>
              <td width="12"></td>
              <td width="50%" style="padding:16px 18px;background:rgba(196,168,109,0.08);border-radius:10px;vertical-align:top;">
                <div style="font-size:10px;font-weight:700;letter-spacing:0.10em;text-transform:uppercase;color:rgba(0,0,0,0.38);margin-bottom:6px;">Revenue</div>
                <div style="font-size:24px;font-weight:700;color:#A08656;letter-spacing:-0.4px;">${ru(totals.revenue)}</div>
                <div style="font-size:11px;color:rgba(0,0,0,0.55);margin-top:4px;">avg ${ru(totals.avgOrderValue)} per order</div>
              </td>
            </tr>
          </table>
        </td></tr>

        ${noOrdersLine}

        ${dishRows ? `
        <!-- Top dishes -->
        <tr><td style="padding:14px 28px 8px 28px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.10em;text-transform:uppercase;color:#A08656;margin-bottom:10px;">Top Dishes</div>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            ${dishRows}
          </table>
        </td></tr>
        ` : ''}

        ${methodBreakdown && (methodBreakdown.cash || methodBreakdown.card || methodBreakdown.online) ? `
        <!-- Payment breakdown -->
        <tr><td style="padding:14px 28px 8px 28px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.10em;text-transform:uppercase;color:#A08656;margin-bottom:10px;">Payment Breakdown</div>
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="33%" style="padding:10px 12px;background:rgba(0,0,0,0.04);border-radius:8px;text-align:center;">
                <div style="font-size:10px;color:rgba(0,0,0,0.55);font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">Cash</div>
                <div style="font-size:15px;font-weight:700;color:#1A1A1A;margin-top:4px;">${ru(methodBreakdown.cash)}</div>
              </td>
              <td width="8"></td>
              <td width="33%" style="padding:10px 12px;background:rgba(0,0,0,0.04);border-radius:8px;text-align:center;">
                <div style="font-size:10px;color:rgba(0,0,0,0.55);font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">Card</div>
                <div style="font-size:15px;font-weight:700;color:#1A1A1A;margin-top:4px;">${ru(methodBreakdown.card)}</div>
              </td>
              <td width="8"></td>
              <td width="33%" style="padding:10px 12px;background:rgba(0,0,0,0.04);border-radius:8px;text-align:center;">
                <div style="font-size:10px;color:rgba(0,0,0,0.55);font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">UPI</div>
                <div style="font-size:15px;font-weight:700;color:#1A1A1A;margin-top:4px;">${ru(methodBreakdown.online)}</div>
              </td>
            </tr>
          </table>
        </td></tr>
        ` : ''}

        ${busiestHour ? `
        <tr><td style="padding:14px 28px 24px 28px;">
          <div style="background:rgba(196,168,109,0.08);border:1px solid rgba(196,168,109,0.20);border-radius:10px;padding:12px 16px;font-size:12px;color:#1A1A1A;">
            <strong style="color:#A08656;">Busiest hour</strong> — ${escapeHtml(busiestHour.label)} (${busiestHour.orders} orders)
          </div>
        </td></tr>
        ` : `<tr><td style="padding:0 28px 24px 28px;"></td></tr>`}

        <!-- Footer -->
        <tr><td style="padding:18px 28px;background:#FAFAF8;border-top:1px solid rgba(0,0,0,0.06);text-align:center;">
          <div style="font-size:11px;color:rgba(0,0,0,0.38);">
            Sent by <strong style="color:#A08656;">Advert Radical</strong> · <a href="https://advertradical.com" style="color:rgba(0,0,0,0.38);text-decoration:none;">advertradical.com</a>
          </div>
          <div style="font-size:10px;color:rgba(0,0,0,0.30);margin-top:6px;">
            Change where these reports go in <strong>Settings → Notifications email</strong>.
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Test-send template — proves to the superadmin that credentials work and
// emails actually land. Plain content; no per-restaurant data.
export function testEmailTemplate({ recipientLabel = 'this inbox' } = {}) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>Email test — Advert Radical</title></head>
<body style="margin:0;padding:0;background:#EDEDED;font-family:'Inter',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EDEDED;padding:32px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;background:#FFFFFF;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);">
        <tr><td style="background:linear-gradient(135deg,#1A1A1A 0%,#2A2A2A 100%);padding:22px 26px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#C4A86D;margin-bottom:6px;">EMAIL TEST</div>
          <div style="font-size:20px;font-weight:600;color:#EAE7E3;letter-spacing:-0.3px;">It works.</div>
        </td></tr>
        <tr><td style="padding:24px 26px;font-size:14px;color:#1A1A1A;line-height:1.6;">
          If you're reading this in <strong>${escapeHtml(recipientLabel)}</strong>, the Gmail SMTP credentials in
          <em>Super Admin → Email Settings</em> are valid and Advert Radical can send daily summary
          emails to your restaurants.
        </td></tr>
        <tr><td style="padding:18px 26px;background:#FAFAF8;border-top:1px solid rgba(0,0,0,0.06);text-align:center;">
          <div style="font-size:11px;color:rgba(0,0,0,0.38);">
            Sent by <strong style="color:#A08656;">Advert Radical</strong>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function formatDateLong(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
