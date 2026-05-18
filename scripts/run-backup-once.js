#!/usr/bin/env node
// scripts/run-backup-once.js
//
// One-shot Firestore backup runner. Reads credentials from .env.local and
// performs the exact same backup the (currently un-scheduled) production
// cron at pages/api/cron/firestore-backup.js would do — walks every
// collection + per-restaurant subcollection, JSON-stringifies with the
// timestamp replacer, uploads to Cloud Storage at
// `backups/manual-{YYYY-MM-DD-HH-mm}-full.json`.
//
// Run from project root:
//   node scripts/run-backup-once.js
//
// Why this exists: the production cron isn't currently scheduled in
// vercel.json (Hobby plan caps crons at 2, and the slots went to
// daily-summary + petpooja-menu-sync). Until we move backups to GitHub
// Actions / cron-job.org / Vercel Pro, this script is the manual safety
// net for getting at least one recovery snapshot saved.
//
// Idempotent — safe to run multiple times; each run produces a fresh
// timestamped file. Cloud Storage bills only by usage; one backup ~few MB.

// Load env BEFORE importing firebase-admin so the SDK initializer sees
// FIREBASE_ADMIN_PRIVATE_KEY etc.
require('dotenv').config({ path: '.env.local' });

const admin = require('firebase-admin');
const fs = require('fs');

// Initialize the Admin SDK with service account credentials from env.
// Mirrors lib/firebaseAdmin.js's setup exactly.
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

const adminDb      = admin.firestore();
const adminStorage = admin.storage();

const TOP_LEVEL_COLLECTIONS = ['users', 'plans', 'requests', 'restaurants'];
const RESTAURANT_SUBCOLLECTIONS = [
  'menuItems', 'orders', 'orderCounters', 'requests', 'staff',
  'tableSessions', 'coupons', 'offers', 'combos', 'feedback',
  'waiterCalls', 'analytics',
];

function firestoreReplacer(_key, value) {
  if (value == null) return value;
  if (typeof value === 'object' && '_seconds' in value && '_nanoseconds' in value) {
    return { __type: 'timestamp', iso: new Date(value._seconds * 1000).toISOString(), seconds: value._seconds };
  }
  if (typeof value === 'object' && 'seconds' in value && 'nanoseconds' in value && Object.keys(value).length === 2) {
    return { __type: 'timestamp', iso: new Date(value.seconds * 1000).toISOString(), seconds: value.seconds };
  }
  return value;
}

function formatStamp(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}-${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}`;
}

async function main() {
  const startedAt = Date.now();
  const stamp     = formatStamp(new Date());
  const filename  = `backups/manual-${stamp}-full.json`;

  console.log(`\n📦 HaloHelm Firestore manual backup`);
  console.log(`   Project:   ${process.env.FIREBASE_ADMIN_PROJECT_ID}`);
  console.log(`   Bucket:    ${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}`);
  console.log(`   File path: ${filename}`);
  console.log(`   Started:   ${new Date().toISOString()}`);
  console.log(``);

  // 1. Top-level collections
  console.log(`📥 Reading top-level collections...`);
  const topLevel = {};
  for (const name of TOP_LEVEL_COLLECTIONS) {
    const snap = await adminDb.collection(name).get();
    topLevel[name] = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
    console.log(`   ${name}: ${topLevel[name].length} docs`);
  }

  // 2. Per-restaurant subcollections
  console.log(`\n📥 Reading per-restaurant subcollections...`);
  const restaurantSubs = {};
  for (const rDoc of topLevel.restaurants || []) {
    const rid = rDoc._id;
    const subs = {};
    const subSnaps = await Promise.all(
      RESTAURANT_SUBCOLLECTIONS.map(async (sub) => ({
        name: sub,
        snap: await adminDb.collection('restaurants').doc(rid).collection(sub).get(),
      }))
    );
    let totalDocs = 0;
    for (const { name, snap } of subSnaps) {
      subs[name] = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
      totalDocs += subs[name].length;
    }
    restaurantSubs[rid] = subs;
    console.log(`   ${rid}: ${totalDocs} docs across ${RESTAURANT_SUBCOLLECTIONS.length} subcollections`);
  }

  // 3. Build export blob
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    restaurantCount: (topLevel.restaurants || []).length,
    topLevel,
    restaurantSubcollections: restaurantSubs,
    _meta: {
      source: 'manual-script',
      script: 'scripts/run-backup-once.js',
      reason: 'Pre-scheduling backup safety snapshot',
    },
  };
  const json = JSON.stringify(payload, firestoreReplacer, 2);
  const bytes = Buffer.byteLength(json, 'utf8');
  console.log(`\n📦 Serialised payload: ${(bytes / 1024).toFixed(1)} KB (${bytes} bytes)`);

  // 4. Upload to Cloud Storage
  console.log(`\n☁️  Uploading to Cloud Storage...`);
  const bucket = adminStorage.bucket();
  const file = bucket.file(filename);
  await file.save(json, {
    contentType: 'application/json; charset=utf-8',
    metadata: {
      cacheControl: 'private, max-age=0',
      metadata: {
        exportedAt: payload.exportedAt,
        restaurantCount: String(payload.restaurantCount),
        version: '1',
        source: 'manual-script',
      },
    },
  });

  const elapsedMs = Date.now() - startedAt;
  console.log(`\n✅ BACKUP COMPLETE`);
  console.log(`   File:     gs://${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}/${filename}`);
  console.log(`   Size:     ${(bytes / 1024).toFixed(1)} KB`);
  console.log(`   Duration: ${elapsedMs}ms`);
  console.log(`\nView in Firebase Console:`);
  console.log(`   https://console.firebase.google.com/project/${process.env.FIREBASE_ADMIN_PROJECT_ID}/storage`);
  console.log(``);

  process.exit(0);
}

main().catch(err => {
  console.error(`\n❌ BACKUP FAILED:`, err);
  process.exit(1);
});
