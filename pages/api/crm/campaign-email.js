// pages/api/crm/campaign-email.js
//
// Phase 5 — Send a marketing email blast to the restaurant's customers
// through the existing shared Gmail sender (lib/email.js). Deliberately
// CONSERVATIVE because the Gmail sender is a shared platform resource
// with a daily ceiling:
//   - admin-authenticated (requireAdminAuth)
//   - capped at MAX_RECIPIENTS per send
//   - rate-limited to a few campaigns per restaurant per day
//   - recipients are re-derived SERVER-SIDE from the customers
//     collection (we never trust a client-supplied address list), and
//     anyone with marketingOptOut or no valid email is excluded.
// For larger blasts the UI steers the owner to WhatsApp click-to-send
// (free, no shared-resource cost).
import { adminDb } from '../../../lib/firebaseAdmin';
import { requireAdminAuth } from '../../../lib/staffAuth';
import { sendEmail } from '../../../lib/email';
import { checkRateLimit } from '../../../lib/rateLimit';
import { canUseFeature } from '../../../lib/plans';

const MAX_RECIPIENTS = 40;     // per send (keeps us inside the function time budget)
const CHUNK = 8;               // parallel sends per batch
const MAX_PER_DAY = 5;         // campaigns/restaurant/day
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isLapsed(iso, days = 30) {
  if (!iso) return false;
  const t = Date.parse(iso);
  return !isNaN(t) && (Date.now() - t) > days * 86400000;
}
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function wrapHtml(restaurantName, message) {
  const safe = esc(message).replace(/\n/g, '<br/>');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#EDEDED;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EDEDED;padding:24px 0;"><tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#FFFFFF;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);">
      <tr><td style="background:linear-gradient(135deg,#1A1A1A 0%,#2A2A2A 100%);padding:22px 26px;">
        <div style="font-size:20px;font-weight:600;color:#EAE7E3;letter-spacing:-0.3px;">${esc(restaurantName)}</div>
      </td></tr>
      <tr><td style="padding:24px 26px;font-size:15px;color:#1A1A1A;line-height:1.65;">${safe}</td></tr>
      <tr><td style="padding:16px 26px;background:#FAFAF8;border-top:1px solid rgba(0,0,0,0.06);text-align:center;font-size:11px;color:rgba(0,0,0,0.4);line-height:1.5;">
        You're getting this because you've ordered with ${esc(restaurantName)}.<br/>Reply and let us know if you'd rather not receive these.
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let ctx;
  try { ctx = await requireAdminAuth(req); }
  catch (e) { return res.status(401).json({ error: 'Unauthorized', detail: e.message }); }
  const rid = ctx.restaurantId;

  // Phase D-server-gate: marketing campaigns are Growth+. Defense in depth
  // for someone bypassing the UI and calling this endpoint directly. We
  // read the restaurant doc once to know the plan, then canUseFeature
  // gates everything below.
  try {
    const planSnap = await adminDb.doc(`restaurants/${rid}`).get();
    const planData = planSnap.exists ? planSnap.data() : {};
    if (!canUseFeature(planData, 'marketing')) {
      return res.status(403).json({ error: 'Marketing campaigns are a Growth/Pro feature. Please upgrade your plan.' });
    }
  } catch (e) {
    console.warn('[campaign-email] plan check failed:', e?.message);
    // Fail-OPEN: a transient Firestore hiccup shouldn't block a legitimate
    // Growth/Pro owner. The UI gate is the primary block.
  }

  const { subject, message, audience } = req.body || {};
  const subj = String(subject || '').trim().slice(0, 140);
  const body = String(message || '').trim().slice(0, 2000);
  if (!subj) return res.status(400).json({ error: 'Subject is required' });
  if (!body) return res.status(400).json({ error: 'Message is required' });

  // Rate limit (counts the attempt).
  const lim = await checkRateLimit(`campaign_email_${rid}`, MAX_PER_DAY, 86400);
  if (!lim.ok) return res.status(429).json({ error: 'Daily email-campaign limit reached. Try again tomorrow, or use WhatsApp.' });

  try {
    const restSnap = await adminDb.doc(`restaurants/${rid}`).get();
    const restaurantName = (restSnap.exists && restSnap.data().name) ? restSnap.data().name : 'Our restaurant';

    const aud = audience && typeof audience === 'object' ? audience : { type: 'all' };
    const snap = await adminDb.collection(`restaurants/${rid}/customers`).get();
    let recipients = [];
    snap.forEach(d => {
      const c = d.data();
      if (c.marketingOptOut) return;
      const email = String(c.email || '').trim();
      if (!EMAIL_RE.test(email)) return;
      if (aud.type === 'tag' && aud.tag && !(Array.isArray(c.tags) && c.tags.includes(aud.tag))) return;
      if (aud.type === 'lapsed' && !isLapsed(c.lastSeenAt)) return;
      recipients.push({ name: c.name || '', email });
    });

    const recipientCount = recipients.length;
    const capped = recipientCount > MAX_RECIPIENTS;
    recipients = recipients.slice(0, MAX_RECIPIENTS);
    if (recipients.length === 0) {
      return res.status(200).json({ ok: true, sentCount: 0, recipientCount: 0, capped: false });
    }

    let sent = 0;
    for (let i = 0; i < recipients.length; i += CHUNK) {
      const batch = recipients.slice(i, i + CHUNK);
      const results = await Promise.all(batch.map(r => {
        const personalized = body.replace(/\{name\}/gi, r.name || 'there');
        return sendEmail({ to: r.email, subject: subj, html: wrapHtml(restaurantName, personalized) })
          .catch(() => ({ ok: false }));
      }));
      sent += results.filter(x => x && x.ok).length;
    }

    return res.status(200).json({ ok: true, sentCount: sent, recipientCount, capped });
  } catch (err) {
    console.error('[/api/crm/campaign-email] failed:', err?.message || err);
    return res.status(500).json({ error: 'Send failed. Please try again.' });
  }
}
