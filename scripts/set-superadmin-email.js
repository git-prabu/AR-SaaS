#!/usr/bin/env node
// scripts/set-superadmin-email.js
// ═══════════════════════════════════════════════════════════════════════
// One-time: move the superadmin account to a REAL mailbox (12 Jun 2026).
// ═══════════════════════════════════════════════════════════════════════
//
// Why: the superadmin was created as admin@advertradical.com — a
// mailbox that doesn't exist. That made the account unrecoverable
// (password-reset mail goes nowhere) and blocked TOTP enrollment
// (Firebase requires a VERIFIED email before second factors —
// auth/unverified-email).
//
// What it does, for the single users/{uid} doc with role=superadmin:
//   1. adminAuth.updateUser(uid, { email: <new>, emailVerified: true })
//      — password and uid are untouched; only the login email changes.
//      emailVerified set directly via Admin SDK (the operator owns the
//      project AND the mailbox; no click-the-link dance needed).
//   2. Mirrors the email field on the users/{uid} Firestore doc.
//
// Run from repo root:
//   Dry run:  node scripts/set-superadmin-email.js --email you@gmail.com
//   Apply:    node scripts/set-superadmin-email.js --email you@gmail.com --apply

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});

const APPLY = process.argv.includes('--apply');
const i = process.argv.indexOf('--email');
const newEmail = i > -1 ? String(process.argv[i + 1] || '').trim().toLowerCase() : '';

async function main() {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    console.error('Usage: node scripts/set-superadmin-email.js --email you@gmail.com [--apply]');
    process.exit(1);
  }

  const snap = await admin.firestore().collection('users').where('role', '==', 'superadmin').get();
  if (snap.size !== 1) {
    console.error(`Expected exactly 1 superadmin user doc, found ${snap.size} — aborting.`);
    process.exit(1);
  }
  const uid = snap.docs[0].id;
  const before = await admin.auth().getUser(uid);
  console.log(`superadmin uid: ${uid}`);
  console.log(`  current: ${before.email} (verified: ${before.emailVerified})`);
  console.log(`  new:     ${newEmail} (verified: true)`);

  if (!APPLY) { console.log('\nDry run — re-run with --apply to write.'); return; }

  await admin.auth().updateUser(uid, { email: newEmail, emailVerified: true });
  await snap.docs[0].ref.update({ email: newEmail });
  const after = await admin.auth().getUser(uid);
  console.log(`\n✓ done: ${after.email} (verified: ${after.emailVerified})`);
  console.log('  Password unchanged. Log in with the NEW email + same password.');
}

main().then(() => process.exit(0)).catch(e => { console.error('✗', e.message); process.exit(1); });
