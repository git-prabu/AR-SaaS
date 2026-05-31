// pages/api/email/send-welcome.js
//
// Superadmin-triggered welcome email for a freshly-onboarded restaurant.
// (Originally fire-and-forget from /signup, repurposed Jun 2026 — the
// owner requested superadmin-only manual send so it isn't dependent on
// timing of email-config setup / template review at signup time.)
//
// Auth: superadmin Firebase ID token via `Authorization: Bearer <token>`.
// Role is confirmed against the users/{uid} doc (no custom claim for
// superadmin in this project — same check pattern as /api/email/send-test).
//
// Body: { restaurantId: string }
//
// Recipient resolution (in order):
//   1. restaurant.notificationsEmail  (the daily-summary inbox — owner-
//                                      preferred address)
//   2. owner user.email               (the address used for /admin/login)
//   3. → 400 if neither resolves
//
// Idempotency: superadmin CAN re-send. We don't 200-skip on
// welcomeEmailSentAt — re-sending is a deliberate manual action. The
// UI shows the previous sent date next to the button so it's never
// accidental.

import { adminAuth, adminDb } from '../../../lib/firebaseAdmin';
import { sendEmail, welcomeEmailTemplate } from '../../../lib/email';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL
  || process.env.SITE_URL
  || 'https://halohelm.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Superadmin auth ──
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing auth token.' });

  let decoded;
  try { decoded = await adminAuth.verifyIdToken(token); }
  catch { return res.status(401).json({ error: 'Invalid auth token.' }); }

  const callerSnap = await adminDb.doc(`users/${decoded.uid}`).get();
  if (!callerSnap.exists || callerSnap.data().role !== 'superadmin') {
    return res.status(403).json({ error: 'Superadmin only.' });
  }

  // ── Body ──
  const { restaurantId } = req.body || {};
  if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' });

  // ── Restaurant doc ──
  const restSnap = await adminDb.doc(`restaurants/${restaurantId}`).get();
  if (!restSnap.exists) return res.status(404).json({ error: 'Restaurant not found' });
  const restaurant = restSnap.data();

  // ── Resolve recipient + owner name ──
  // notificationsEmail wins (owner explicitly set it as their preferred
  // inbox), then fall back to the owner user.email from /admin/login.
  let recipient = String(restaurant.notificationsEmail || '').trim();
  let ownerName = '';
  try {
    const ownerQuery = await adminDb.collection('users')
      .where('restaurantId', '==', restaurantId)
      .where('role', '==', 'admin')
      .limit(1).get();
    if (!ownerQuery.empty) {
      const owner = ownerQuery.docs[0].data();
      ownerName = owner.name || '';
      if (!recipient) recipient = String(owner.email || '').trim();
    }
  } catch (e) {
    console.warn('[send-welcome] owner lookup failed (will rely on notificationsEmail):', e?.message);
  }

  if (!recipient) {
    return res.status(400).json({ error: 'No recipient — set Notifications email on /admin/settings or check that an owner user doc exists.' });
  }

  // ── Build + send ──
  const html = welcomeEmailTemplate({
    ownerName,
    restaurantName: restaurant.name || 'your restaurant',
    subdomain: restaurant.subdomain || '',
    planLabel: prettyPlanLabel(restaurant.plan, restaurant.paymentStatus),
    trialEndsAt: restaurant.trialEndsAt || null,
    dashboardUrl: `${SITE_URL}/admin`,
  });

  const result = await sendEmail({
    to: recipient,
    subject: `Welcome to HaloHelm, ${restaurant.name || 'your restaurant'}`,
    html,
  });

  if (!result.ok) {
    console.warn('[send-welcome] sendEmail failed:', result.error);
    return res.status(500).json({ ok: false, error: result.error });
  }

  // ── Stamp the doc for audit ──
  // Records WHO sent it (superadmin uid), WHEN (ISO ts), and WHERE
  // (the actual recipient email). UI uses sentAt to render "Sent X ago"
  // next to the button so a superadmin doesn't accidentally re-send.
  try {
    await restSnap.ref.update({
      welcomeEmailSentAt: new Date().toISOString(),
      welcomeEmailSentBy: decoded.uid,
      welcomeEmailRecipient: recipient,
    });
  } catch (e) {
    console.warn('[send-welcome] stamp failed (email DID send):', e?.message);
  }

  return res.status(200).json({ ok: true, recipient });
}

function prettyPlanLabel(plan, paymentStatus) {
  if (paymentStatus === 'trial') return 'Trial';
  if (!plan) return 'Trial';
  return String(plan).charAt(0).toUpperCase() + String(plan).slice(1);
}
