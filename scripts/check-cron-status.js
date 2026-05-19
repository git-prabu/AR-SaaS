#!/usr/bin/env node
// scripts/check-cron-status.js — one-shot diagnostic for the cron status doc.
// Mirrors the setup in run-backup-once.js. Read-only; safe to run anytime.

require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

async function main() {
  const snap = await db.doc('systemConfig/cronStatus').get();
  if (!snap.exists) {
    console.log('No cronStatus doc exists yet — no cron has reported a run.');
    process.exit(0);
  }
  const data = snap.data();
  const crons = Object.keys(data);
  console.log(`\n📊 systemConfig/cronStatus — ${crons.length} cron(s) tracked\n`);
  for (const name of crons) {
    const s = data[name];
    const lastRun = s.lastRunAt?.toDate?.()?.toISOString() || 'never';
    const lastSuccess = s.lastSuccessAt?.toDate?.()?.toISOString() || 'never';
    console.log(`  ${name}`);
    console.log(`    lastRunAt:           ${lastRun}`);
    console.log(`    lastOutcome:         ${s.lastOutcome || '—'}`);
    console.log(`    lastDurationMs:      ${s.lastDurationMs || '—'}`);
    console.log(`    lastSuccessAt:       ${lastSuccess}`);
    console.log(`    consecutiveFailures: ${s.consecutiveFailures || 0}`);
    console.log(`    totalRuns:           ${s.totalRuns || 0}`);
    console.log(`    totalFailures:       ${s.totalFailures || 0}`);
    if (s.lastError) console.log(`    lastError:           ${s.lastError}`);
    if (s.lastSummary) console.log(`    lastSummary:         ${JSON.stringify(s.lastSummary)}`);
    console.log();
  }
  process.exit(0);
}

main().catch(err => { console.error('FAILED:', err); process.exit(1); });
