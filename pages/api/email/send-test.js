// pages/api/email/send-test.js
//
// Triggered by the "Send test email" button on /superadmin/email. Verifies
// the saved sender credentials by sending a tiny "it works" email to the
// caller's email (which the page passes in the body).
//
// Auth: requires a Firebase ID token belonging to a superadmin. The token
// is read off the Authorization: Bearer <id_token> header, verified with
// the Admin SDK, and the user's role is checked in the users/{uid} doc.

import { adminDb, adminAuth } from '../../../lib/firebaseAdmin';
import { sendEmail, testEmailTemplate } from '../../../lib/email';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  // ── Verify caller is a superadmin ──
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'Missing auth token.' });

  let decoded;
  try { decoded = await adminAuth.verifyIdToken(token); }
  catch { return res.status(401).json({ ok: false, error: 'Invalid auth token.' }); }

  // Confirm role from Firestore (custom claims aren't set for superadmin).
  const userSnap = await adminDb.doc(`users/${decoded.uid}`).get();
  if (!userSnap.exists || userSnap.data().role !== 'superadmin') {
    return res.status(403).json({ ok: false, error: 'Superadmin only.' });
  }

  const to = String(req.body?.to || decoded.email || '').trim();
  if (!to) return res.status(400).json({ ok: false, error: 'No recipient.' });

  const html = testEmailTemplate({ recipientLabel: to });
  const result = await sendEmail({
    to,
    subject: 'Advert Radical — email test',
    html,
  });

  if (result.ok) return res.status(200).json({ ok: true, messageId: result.messageId });
  return res.status(500).json({ ok: false, error: result.error });
}
