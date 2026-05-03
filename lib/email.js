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
import admin from 'firebase-admin';
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

// Welcome / onboarding template — sent right after a new restaurant signs up
// at /signup. Has three jobs: (1) prove the email reaches them, (2) give
// them an immediate set of next steps so they don't feel lost on first
// login, (3) hand over the support contact in case anything broke during
// signup.
//
// `data` shape:
//   {
//     ownerName:      string,   // first name preferred, falls back to full
//     restaurantName: string,
//     subdomain:      string,
//     planLabel:      string,   // e.g. "Trial" / "Starter"
//     trialEndsAt?:   string,   // ISO date, only when in trial
//     dashboardUrl:   string,   // absolute, https://...
//   }
export function welcomeEmailTemplate(data) {
  const { ownerName, restaurantName, subdomain, planLabel, trialEndsAt, dashboardUrl } = data;
  const firstName = (String(ownerName || '').trim().split(/\s+/)[0]) || 'there';
  const trialLine = trialEndsAt
    ? `Your trial runs through <strong>${formatDateLong(trialEndsAt.slice(0, 10))}</strong> — you've got time to set things up properly before any billing kicks in.`
    : '';
  const customerUrl = subdomain ? `https://advertradical.vercel.app/restaurant/${escapeHtml(subdomain)}` : null;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Welcome to Advert Radical, ${escapeHtml(restaurantName)}</title>
</head>
<body style="margin:0;padding:0;background:#EDEDED;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EDEDED;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);">

        <!-- Matte-black header — same chrome as daily summary so the brand reads consistent -->
        <tr><td style="background:linear-gradient(135deg,#1A1A1A 0%,#2A2A2A 100%);padding:28px 28px 24px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#C4A86D;margin-bottom:6px;">YOU'RE IN</div>
          <div style="font-size:24px;font-weight:600;color:#EAE7E3;letter-spacing:-0.3px;">Welcome, ${escapeHtml(firstName)}.</div>
          <div style="font-size:14px;color:rgba(234,231,227,0.65);margin-top:6px;line-height:1.5;">
            ${escapeHtml(restaurantName)} is now live on Advert Radical.
          </div>
        </td></tr>

        <!-- Plan + trial line -->
        <tr><td style="padding:22px 28px 4px;">
          <div style="font-size:13px;color:rgba(0,0,0,0.65);line-height:1.6;">
            You're on the <strong style="color:#A08656;">${escapeHtml(planLabel || 'Trial')}</strong> plan.
            ${trialLine}
          </div>
        </td></tr>

        <!-- 3-step quick start -->
        <tr><td style="padding:18px 28px 8px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.10em;text-transform:uppercase;color:#A08656;margin-bottom:12px;">Quick start</div>

          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0 8px;">
            <tr><td style="padding:12px 14px;background:rgba(0,0,0,0.04);border-radius:10px;">
              <div style="font-size:13px;font-weight:700;color:#1A1A1A;margin-bottom:2px;">1. Add your menu items</div>
              <div style="font-size:12px;color:rgba(0,0,0,0.55);line-height:1.5;">Open <strong>Menu Items</strong> in the dashboard. Item name, price, photo, category — diners see this within seconds of you saving.</div>
            </td></tr>
            <tr><td style="padding:12px 14px;background:rgba(0,0,0,0.04);border-radius:10px;">
              <div style="font-size:13px;font-weight:700;color:#1A1A1A;margin-bottom:2px;">2. Print &amp; paste your QR codes</div>
              <div style="font-size:12px;color:rgba(0,0,0,0.55);line-height:1.5;">Go to <strong>QR &amp; Tables</strong> → Generate Table QRs → download. Print once, stick on the table — they keep working forever, even when you rotate the security token.</div>
            </td></tr>
            <tr><td style="padding:12px 14px;background:rgba(0,0,0,0.04);border-radius:10px;">
              <div style="font-size:13px;font-weight:700;color:#1A1A1A;margin-bottom:2px;">3. Activate your first table</div>
              <div style="font-size:12px;color:rgba(0,0,0,0.55);line-height:1.5;">When guests sit down, tap <strong>Activate</strong> on that table card. The QR starts working only for them — no fake orders from outside the restaurant.</div>
            </td></tr>
          </table>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:20px 28px 8px;text-align:center;">
          <a href="${escapeHtml(dashboardUrl || 'https://advertradical.vercel.app/admin')}"
             style="display:inline-block;padding:14px 28px;background:#1A1A1A;color:#EAE7E3;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:0.01em;">
            Open Dashboard
          </a>
        </td></tr>

        ${customerUrl ? `
        <!-- Live menu URL — so they can preview what diners will see -->
        <tr><td style="padding:8px 28px 22px;text-align:center;">
          <div style="font-size:11px;color:rgba(0,0,0,0.55);">Your live menu</div>
          <a href="${customerUrl}" style="font-size:13px;color:#A08656;font-family:'Courier New',monospace;text-decoration:none;word-break:break-all;">${customerUrl}</a>
        </td></tr>
        ` : `<tr><td style="padding:0 28px 22px;"></td></tr>`}

        <!-- Footer -->
        <tr><td style="padding:18px 28px;background:#FAFAF8;border-top:1px solid rgba(0,0,0,0.06);text-align:center;">
          <div style="font-size:11px;color:rgba(0,0,0,0.55);line-height:1.5;">
            Stuck on anything? Reply to this email and we'll help.
          </div>
          <div style="font-size:10px;color:rgba(0,0,0,0.30);margin-top:6px;">
            Sent by <strong style="color:#A08656;">Advert Radical</strong> · <a href="https://advertradical.com" style="color:rgba(0,0,0,0.30);text-decoration:none;">advertradical.com</a>
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Phase M — Customer payment-receipt template. Sent automatically
// after a customer's order paymentStatus flips to a paid_* state, IFF
// they shared an email at order time (the field is optional). Same
// matte-black header chrome as the daily-summary + welcome emails so
// brand reads consistent in the customer's inbox.
//
// `data` shape:
//   {
//     restaurantName: string,
//     orderRef:       string,   // e.g. "#9" or last-6 of orderId
//     paidAtIso:      string,   // ISO timestamp of when payment confirmed
//     paymentMethod:  'cash' | 'card' | 'upi' | 'online' | string,
//     items:         [{ name, qty, price }],
//     subtotal:       number,
//     serviceCharge:  number,
//     cgst:           number,
//     sgst:           number,
//     discount:       number,
//     roundOff:       number,
//     total:          number,
//     gstPercent:     number,
//     scPercent:      number,
//     couponCode?:    string,
//     tableNumber?:   string,
//     orderType:      'dinein' | 'takeaway',
//     menuUrl?:       string,   // link back to the customer menu so they can re-order
//   }
export function paymentReceiptTemplate(data) {
  const {
    restaurantName, orderRef, paidAtIso, paymentMethod, items,
    subtotal, serviceCharge, cgst, sgst, discount, roundOff, total,
    gstPercent, scPercent, couponCode, tableNumber, orderType, menuUrl,
  } = data;

  const ru = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
  const ru2 = (n) => '₹' + (Number(n) || 0).toFixed(2);
  const dt = paidAtIso ? new Date(paidAtIso) : new Date();
  const paidLabel = dt.toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const methodLabel = ({
    cash: 'Cash', card: 'Card', upi: 'UPI', online: 'UPI',
    paid_cash: 'Cash', paid_card: 'Card', paid_online: 'UPI',
  })[paymentMethod] || (paymentMethod ? String(paymentMethod) : 'Paid');

  const itemRows = (items || []).map(it => `
    <tr>
      <td style="padding:8px 0;font-size:13px;color:#1A1A1A;">${escapeHtml(it.name)} <span style="color:rgba(0,0,0,0.45);font-weight:500;">× ${it.qty}</span></td>
      <td style="padding:8px 0;font-size:13px;color:#1A1A1A;text-align:right;font-weight:600;">${ru(Number(it.price) * Number(it.qty))}</td>
    </tr>
  `).join('');

  const breakdownRow = (label, value, opts = {}) => `
    <tr>
      <td style="padding:4px 0;font-size:12px;color:rgba(0,0,0,0.55);${opts.green ? 'color:#3F9E5A;font-weight:600;' : ''}">${escapeHtml(label)}</td>
      <td style="padding:4px 0;font-size:12px;color:rgba(0,0,0,0.65);text-align:right;${opts.green ? 'color:#3F9E5A;font-weight:600;' : ''}">${value}</td>
    </tr>
  `;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt — ${escapeHtml(restaurantName)} ${escapeHtml(orderRef)}</title>
</head>
<body style="margin:0;padding:0;background:#EDEDED;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EDEDED;padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#FFFFFF;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);">

        <!-- Matte-black header -->
        <tr><td style="background:linear-gradient(135deg,#1A1A1A 0%,#2A2A2A 100%);padding:24px 28px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#C4A86D;margin-bottom:6px;">PAYMENT CONFIRMED</div>
          <div style="font-size:22px;font-weight:600;color:#EAE7E3;letter-spacing:-0.3px;">Thanks for ordering at ${escapeHtml(restaurantName)}.</div>
          <div style="font-size:13px;color:rgba(234,231,227,0.55);margin-top:6px;">
            Order ${escapeHtml(orderRef)} · ${escapeHtml(paidLabel)}
          </div>
        </td></tr>

        <!-- Total tile -->
        <tr><td style="padding:24px 28px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding:18px 20px;background:rgba(196,168,109,0.08);border-radius:12px;border:1px solid rgba(196,168,109,0.20);">
                <div style="font-size:10px;font-weight:700;letter-spacing:0.10em;text-transform:uppercase;color:rgba(0,0,0,0.45);margin-bottom:4px;">Amount paid</div>
                <div style="font-size:28px;font-weight:700;color:#A08656;letter-spacing:-0.5px;">${ru(total)}</div>
                <div style="font-size:12px;color:rgba(0,0,0,0.55);margin-top:4px;">
                  ${escapeHtml(methodLabel)}
                  ${tableNumber && tableNumber !== 'Not specified' ? ` · Table ${escapeHtml(tableNumber)}` : ''}
                  ${orderType === 'takeaway' ? ' · Takeaway' : ''}
                </div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Items -->
        <tr><td style="padding:18px 28px 4px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.10em;text-transform:uppercase;color:#A08656;margin-bottom:8px;">Order</div>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            ${itemRows}
          </table>
        </td></tr>

        <!-- Breakdown -->
        <tr><td style="padding:14px 28px 8px;">
          <div style="border-top:1px solid rgba(0,0,0,0.08);padding-top:12px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              ${breakdownRow('Subtotal', ru2(subtotal))}
              ${Number(serviceCharge) > 0 ? breakdownRow(`Service Charge (${scPercent}%)`, ru2(serviceCharge)) : ''}
              ${Number(cgst) > 0 ? breakdownRow(`C.G.S.T ${(Number(gstPercent) / 2).toFixed(1)}%`, ru2(cgst)) : ''}
              ${Number(sgst) > 0 ? breakdownRow(`S.G.S.T ${(Number(gstPercent) / 2).toFixed(1)}%`, ru2(sgst)) : ''}
              ${Number(discount) > 0 ? breakdownRow(`Discount${couponCode ? ` (${couponCode})` : ''}`, '−' + ru(discount), { green: true }) : ''}
              ${Number(roundOff) !== 0 ? breakdownRow('Round off', (Number(roundOff) > 0 ? '+' : '') + ru2(roundOff)) : ''}
              <tr><td colspan="2" style="padding:8px 0 0;border-top:1px solid rgba(0,0,0,0.08);"></td></tr>
              <tr>
                <td style="padding:10px 0 0;font-size:14px;font-weight:700;color:#1A1A1A;letter-spacing:-0.2px;">Grand Total</td>
                <td style="padding:10px 0 0;font-size:18px;font-weight:700;color:#A08656;text-align:right;letter-spacing:-0.4px;">${ru(total)}</td>
              </tr>
            </table>
          </div>
        </td></tr>

        ${menuUrl ? `
        <!-- CTA -->
        <tr><td style="padding:18px 28px 4px;text-align:center;">
          <a href="${escapeHtml(menuUrl)}"
             style="display:inline-block;padding:12px 24px;background:#1A1A1A;color:#EAE7E3;border-radius:10px;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:0.01em;">
            Order again
          </a>
        </td></tr>
        ` : ''}

        <!-- Footer -->
        <tr><td style="padding:18px 28px;background:#FAFAF8;border-top:1px solid rgba(0,0,0,0.06);text-align:center;">
          <div style="font-size:11px;color:rgba(0,0,0,0.45);line-height:1.5;">
            Keep this email as your receipt. Reply if anything looks off.
          </div>
          <div style="font-size:10px;color:rgba(0,0,0,0.30);margin-top:6px;">
            Powered by <strong style="color:#A08656;">Advert Radical</strong>
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Phase M — Server-side helper that reads an order, formats the receipt,
// sends it (if the customer shared an email), and stamps the order doc
// so we never double-send. Idempotent — safe to call from multiple
// payment-confirmation paths (admin /admin/payments page + gateway
// webhook). Returns { ok, skipped?, reason? } so callers can surface
// useful info without throwing.
//
// Skip reasons:
//   - 'no-email'       — customer didn't share an email; nothing to do
//   - 'not-paid'       — order isn't in a paid_* state yet
//   - 'already-sent'   — receipt already mailed (idempotency guard)
//   - 'no-sender'      — superadmin hasn't configured email yet
//   - 'send-failed'    — Gmail SMTP rejected (logged + returned)
//
// Reads with adminDb so it's callable from any server context. The
// caller is expected to authenticate the request itself (the API
// route below restricts to authenticated admins or webhook).
export async function sendReceiptForOrder(restaurantId, orderId) {
  if (!restaurantId || !orderId) {
    return { ok: false, skipped: true, reason: 'bad-input' };
  }

  const orderRef = adminDb.doc(`restaurants/${restaurantId}/orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) return { ok: false, skipped: true, reason: 'not-found' };
  const order = orderSnap.data();

  // Skip if not in paid state (defensive — shouldn't be called otherwise).
  const PAID = ['paid_cash', 'paid_card', 'paid_online', 'paid'];
  if (!PAID.includes(order.paymentStatus)) {
    return { ok: false, skipped: true, reason: 'not-paid' };
  }

  // No email? Nothing to do — the customer chose not to share it.
  const to = String(order.customerEmail || '').trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { ok: false, skipped: true, reason: 'no-email' };
  }

  // Idempotency: if we already sent for this order, skip silently.
  if (order.receiptEmailSentAt) {
    return { ok: false, skipped: true, reason: 'already-sent' };
  }

  // Restaurant info for the email header.
  const restSnap = await adminDb.doc(`restaurants/${restaurantId}`).get();
  if (!restSnap.exists) return { ok: false, skipped: true, reason: 'restaurant-not-found' };
  const rest = restSnap.data();
  const restaurantName = rest.name || 'Restaurant';
  const subdomain = rest.subdomain || '';
  // Best-effort menu link back. Falls back to advertradical.com
  // landing if subdomain isn't set on the doc for some reason.
  const menuUrl = subdomain
    ? `https://advertradical.vercel.app/restaurant/${subdomain}`
    : null;

  // Order ref — prefer human-readable orderNumber, fall back to last-6 of id.
  const orderRef_ = (typeof order.orderNumber === 'number' && order.orderNumber > 0)
    ? `#${order.orderNumber}`
    : `#${String(orderId).slice(-6).toUpperCase()}`;

  // Resolved paid-at: paymentUpdatedAt is a Firestore Timestamp.
  const paidAtIso = (() => {
    const t = order.paymentUpdatedAt;
    if (t?.toDate) return t.toDate().toISOString();
    if (t?.seconds) return new Date(t.seconds * 1000).toISOString();
    return new Date().toISOString();
  })();

  const html = paymentReceiptTemplate({
    restaurantName,
    orderRef: orderRef_,
    paidAtIso,
    paymentMethod: order.paymentStatus,
    items: order.items || [],
    subtotal: order.subtotal || 0,
    serviceCharge: order.serviceCharge || 0,
    cgst: order.cgst || 0,
    sgst: order.sgst || 0,
    discount: order.discount || 0,
    roundOff: order.roundOff || 0,
    total: order.total || 0,
    gstPercent: order.gstPercent || 0,
    scPercent: order.serviceChargePercent || 0,
    couponCode: order.couponCode || null,
    tableNumber: order.tableNumber || null,
    orderType: order.orderType || 'dinein',
    menuUrl,
  });

  const subject = `Receipt for your order at ${restaurantName} (${orderRef_})`;
  const result = await sendEmail({ to, subject, html });
  if (!result.ok) {
    return { ok: false, reason: 'send-failed', error: result.error };
  }

  // Stamp success so the next call short-circuits via 'already-sent'.
  // Best-effort — if this fails the worst case is one duplicate email
  // on a retry, which is way better than no email at all.
  try {
    await orderRef.update({
      receiptEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
      receiptEmailMessageId: result.messageId || null,
    });
  } catch (err) {
    console.warn('[email] receipt-sent stamp failed for', orderId, ':', err.message);
  }

  return { ok: true, messageId: result.messageId };
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
