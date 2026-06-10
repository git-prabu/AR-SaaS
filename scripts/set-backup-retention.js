#!/usr/bin/env node
// scripts/set-backup-retention.js
// ═══════════════════════════════════════════════════════════════════════
// One-time: 90-day lifecycle rule for backup files (audit Phase C, #9b).
// ═══════════════════════════════════════════════════════════════════════
//
// Cloud Storage otherwise keeps every weekly backup forever — slow cost
// creep and clutter. This sets a bucket lifecycle rule:
//
//   DELETE objects whose name starts with "backups/" once age > 90 days
//
// 90 days ≈ 13 weekly snapshots retained at any time. Menu photos and
// other non-backup objects are untouched (prefix-scoped rule).
//
// Idempotent: re-running replaces the same rule. Existing other rules
// (if any) are preserved.
//
// Run from repo root:   node scripts/set-backup-retention.js

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}
const bucket = admin.storage().bucket();

const RULE = {
  action: { type: 'Delete' },
  condition: { age: 90, matchesPrefix: ['backups/'] },
};

async function main() {
  const [metadata] = await bucket.getMetadata();
  const existing = metadata.lifecycle?.rule || [];
  // Drop any previous version of our backups rule, keep everything else.
  const others = existing.filter(r => !(r.condition?.matchesPrefix || []).includes('backups/'));
  const rules = [...others, RULE];

  await bucket.setMetadata({ lifecycle: { rule: rules } });

  const [after] = await bucket.getMetadata();
  console.log('✓ Lifecycle rules now on bucket', bucket.name + ':');
  for (const r of after.lifecycle?.rule || []) {
    console.log(' ', JSON.stringify(r));
  }
}

main().then(() => process.exit(0)).catch(e => { console.error('✗ failed:', e.message); process.exit(1); });
