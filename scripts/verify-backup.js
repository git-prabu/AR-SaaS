#!/usr/bin/env node
// scripts/verify-backup.js
// ═══════════════════════════════════════════════════════════════════════
// Backup integrity verification (2026-06-11 audit Phase C, issue #9c).
// "An untested backup is a hope, not a plan."
// ═══════════════════════════════════════════════════════════════════════
//
// What it does (read-only on real data; writes ONLY to a scratch path):
//   1. Lists the newest files under backups/ in Cloud Storage —
//      proves the GitHub Action schedule is actually producing files.
//   2. Downloads the newest backup and parses it — proves the JSON is
//      well-formed and counts what's inside.
//   3. RESTORE DRILL: takes the `plans` collection from the backup,
//      writes it into a scratch collection `_restoreDrill`, reads it
//      back, compares doc counts, then deletes the scratch collection.
//      Proves the restore write-path works end to end without touching
//      production collections.
//
// Run from repo root:   node scripts/verify-backup.js
// Exit code 0 = backup chain healthy. Non-zero = investigate.

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
const db = admin.firestore();
const bucket = admin.storage().bucket();

const SCRATCH = '_restoreDrill';

async function main() {
  console.log('═══ 1/3 Listing backups/ in', bucket.name, '═══');
  const [files] = await bucket.getFiles({ prefix: 'backups/' });
  if (files.length === 0) {
    console.error('✗ NO BACKUP FILES FOUND. The GitHub Action has never produced one.');
    console.error('  Check: repo → Actions → "Firestore weekly backup" → run history,');
    console.error('  and that the 4 GitHub Secrets are configured (see workflow header).');
    process.exit(2);
  }
  const sorted = files
    .map(f => ({ name: f.name, size: Number(f.metadata.size), created: f.metadata.timeCreated }))
    .sort((a, b) => new Date(b.created) - new Date(a.created));
  for (const f of sorted.slice(0, 6)) {
    console.log(`  ${f.created}  ${(f.size / 1024).toFixed(1).padStart(9)} KB  ${f.name}`);
  }
  const newest = sorted[0];
  const ageDays = (Date.now() - new Date(newest.created)) / 86400000;
  console.log(`\n  Newest backup is ${ageDays.toFixed(1)} days old.`);
  if (ageDays > 8) {
    console.warn('  ⚠ Older than the weekly schedule — the GitHub Action may be failing.');
  }

  console.log('\n═══ 2/3 Downloading + parsing newest backup ═══');
  const [buf] = await bucket.file(newest.name).download();
  let payload;
  try {
    payload = JSON.parse(buf.toString('utf8'));
  } catch (e) {
    console.error('✗ BACKUP FILE IS NOT VALID JSON:', e.message);
    process.exit(3);
  }
  // Shape (scripts/run-backup-once.js + api/cron/firestore-backup.js):
  //   { version, exportedAt, restaurantCount,
  //     topLevel: { users: [{_id,...}], plans: [...], ... },
  //     restaurantSubcollections: { rid: { menuItems: [...], ... } } }
  const topLevel = payload.topLevel || {};
  const collNames = Object.keys(topLevel);
  let totalDocs = 0;
  for (const c of collNames) totalDocs += (topLevel[c] || []).length;
  const subs = payload.restaurantSubcollections || {};
  const ridCount = Object.keys(subs).length;
  let subDocs = 0;
  for (const rid of Object.keys(subs)) {
    for (const sub of Object.keys(subs[rid] || {})) {
      subDocs += (subs[rid][sub] || []).length;
    }
  }
  console.log(`  exportedAt: ${payload.exportedAt} · version: ${payload.version}`);
  console.log(`  top-level collections: ${collNames.join(', ') || '(none)'}`);
  console.log(`  top-level docs: ${totalDocs} · restaurants with subs: ${ridCount} · subcollection docs: ${subDocs}`);
  if (totalDocs + subDocs === 0) {
    console.error('✗ Backup parsed but contains zero documents.');
    process.exit(3);
  }

  console.log('\n═══ 3/3 Restore drill → scratch collection ═══');
  const srcName = (topLevel.plans || []).length > 0
    ? 'plans'
    : collNames.find(c => (topLevel[c] || []).length > 0);
  const docsArr = topLevel[srcName];
  console.log(`  restoring '${srcName}' (${docsArr.length} docs) → /${SCRATCH}`);
  const batch = db.batch();
  const ids = [];
  for (const d of docsArr) {
    const { _id, ...data } = d;
    ids.push(_id);
    batch.set(db.collection(SCRATCH).doc(_id), data);
  }
  await batch.commit();

  const readBack = await db.collection(SCRATCH).get();
  const ok = readBack.size === ids.length;
  console.log(`  read back ${readBack.size}/${ids.length} docs — ${ok ? '✓ MATCH' : '✗ MISMATCH'}`);

  // Clean up scratch
  const delBatch = db.batch();
  readBack.docs.forEach(d => delBatch.delete(d.ref));
  await delBatch.commit();
  console.log(`  scratch /${SCRATCH} deleted.`);

  if (!ok) process.exit(4);
  console.log('\n✓ Backup chain healthy: schedule producing files, JSON valid, restore path works.');
}

main().then(() => process.exit(0)).catch(e => { console.error('✗ verify-backup failed:', e); process.exit(1); });
