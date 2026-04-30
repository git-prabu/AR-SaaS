// pages/api/email/send-welcome.js
// Phase M — Sends the welcome email to a freshly-signed-up restaurant
// owner. Called fire-and-forget from /signup right after the auth +
// Firestore docs are created.
//
// Why a server endpoint and not a client send: nodemailer + the SMTP
// credentials live server-side only. Calling sendEmail() from the
// signup page would either need to ship credentials to the browser
// (catastrophic) or proxy through this endpoint anyway.
//
// Auth: this endpoint takes the new user's idToken to verify the
// caller is the same Firebase user who just signed up. Without that
// guard, anyone could spam welcome emails at any address.

import { adminAuth, adminDb } from '../../../lib/firebaseAdmin';
import { sendEmail, welcomeEmailTemplate } from '../../../lib/email';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL
  || process.env.SITE_URL
  || 'https://advertradical.vercel.app';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify the idToken so only the just-signed-up user can trigger
  // their own welcome email.
  const idToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
                || req.body?.idToken;
  if (!idToken) return res.status(401).json({ error: 'Missing idToken' });

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch {
    return res.status(401).json({ error: 'Invalid idToken' });
  }

  // Read the user doc + restaurant doc to get the personalisation data
  // server-side. We don't trust anything from the request body except
  // the idToken — a malicious caller could otherwise pass arbitrary
  // names/emails.
  const userSnap = await adminDb.doc(`users/${decoded.uid}`).get();
  if (!userSnap.exists) return res.status(404).json({ error: 'User doc not found' });
  const user = userSnap.data();

  if (!user.restaurantId) return res.status(400).json({ error: 'User has no restaurantId' });

  const restSnap = await adminDb.doc(`restaurants/${user.restaurantId}`).get();
  if (!restSnap.exists) return res.status(404).json({ error: 'Restaurant doc not found' });
  const restaurant = restSnap.data();

  // Idempotency: if we've already sent the welcome email for this
  // restaurant, don't send it again. The signup flow may retry the
  // POST on a flaky network and we don't want to double-mail.
  if (restaurant.welcomeEmailSentAt) {
    return res.status(200).json({ ok: true, skipped: 'already_sent' });
  }

  const html = welcomeEmailTemplate({
    ownerName: user.name || restaurant.ownerName || '',
    restaurantName: restaurant.name || 'your restaurant',
    subdomain: restaurant.subdomain || '',
    planLabel: prettyPlanLabel(restaurant.plan, restaurant.paymentStatus),
    trialEndsAt: restaurant.trialEndsAt || null,
    dashboardUrl: `${SITE_URL}/admin`,
  });

  const result = await sendEmail({
    to: user.email || decoded.email,
    subject: `Welcome to Advert Radical, ${restaurant.name || 'your restaurant'}`,
    html,
  });

  if (!result.ok) {
    // Don't 500 — the signup itself already succeeded, the email is
    // ancillary. Log the failure so the superadmin can chase it up.
    console.warn('[send-welcome] sendEmail failed:', result.error);
    return res.status(200).json({ ok: false, error: result.error });
  }

  // Stamp the restaurant doc so future retries no-op.
  try {
    await restSnap.ref.update({ welcomeEmailSentAt: new Date().toISOString() });
  } catch (e) {
    console.warn('[send-welcome] stamp failed (email DID send):', e?.message);
  }

  return res.status(200).json({ ok: true });
}

function prettyPlanLabel(plan, paymentStatus) {
  if (paymentStatus === 'trial') return 'Trial';
  if (!plan) return 'Trial';
  // Capitalise first letter; plan ids are lowercase like "starter"/"pro".
  return String(plan).charAt(0).toUpperCase() + String(plan).slice(1);
}
