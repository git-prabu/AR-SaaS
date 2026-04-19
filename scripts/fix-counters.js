#!/usr/bin/env node
// scripts/fix-counters.js
// ═══════════════════════════════════════════════════════════════════════════════
// ONE-TIME CORRECTION — fixes off-by-one in orderCounters and backfills any
// orders that didn't get numbered.
// ═══════════════════════════════════════════════════════════════════════════════
//
// WHY THIS EXISTS:
//   The original backfill script seeded counter docs with `nextOrder = items.length`.
//   That means if the highest existing order was #18, the counter said next=18,
//   but it SHOULD say next=19 (because the next order placed should get #19, not #18).
//   This script bumps every counter to the correct value: max(observed orderNumber) + 1.
//
//   It also backfills any orders that still don't have orderNumber (e.g., orders that
//   slipped through during the rules-misconfigured period).
//
// WHAT IT DOES:
//   For each restaurant:
//     1. Reads all orders
//     2. Groups by day, sorts by createdAt
//     3. For each day:
//        a. Assigns orderNumber to any order missing one (continuing from the day's max+1)
//        b. Sets orderCounters/{day}.nextOrder = (final max in that day) + 1
//
// SAFETY:
//   - Dry-run mode (--dry-run) makes no writes
//   - Skips counter doc updates that already have the correct value
//   - Skips orders that already have orderNumber (no double-numbering)
//
// HOW TO RUN:
//   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
//   node scripts/fix-counters.js --dry-run
//   node scripts/fix-counters.js

const admin = require('firebase-admin');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('ERROR: GOOGLE_APPLICATION_CREDENTIALS environment variable is not set.');
  process.exit(1);
}

admin.initializeApp();
const db = admin.firestore();
const DRY_RUN = process.argv.includes('--dry-run');

console.log('═══════════════════════════════════════════════════');
console.log(`Counter correction — ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE MODE'}`);
console.log('═══════════════════════════════════════════════════\n');

function dayKeyFromTs(ts) {
  const ms = ts && ts.toMillis ? ts.toMillis() : (ts && ts.seconds ? ts.seconds * 1000 : null);
  if (!ms) return null;
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

(async () => {
  const restaurants = await db.collection('restaurants').get();
  let totalCounterFixes = 0;
  let totalOrdersBackfilled = 0;

  for (const rDoc of restaurants.docs) {
    const rid = rDoc.id;
    const rname = rDoc.data().name || rid;
    console.log(`\n── Restaurant: ${rname} (${rid}) ──`);

    const ordersSnap = await db.collection('restaurants').doc(rid).collection('orders').get();
    if (ordersSnap.empty) {
      console.log('   No orders. Skipping.');
      continue;
    }

    // Group by day
    const byDay = new Map();
    ordersSnap.docs.forEach(doc => {
      const data = doc.data();
      if (!data.createdAt) return;
      const day = dayKeyFromTs(data.createdAt);
      if (!day) return;
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push({
        ref: doc.ref,
        id: doc.id,
        createdAt: data.createdAt,
        orderNumber: data.orderNumber,
      });
    });

    const writes = [];
    let counterFixes = 0;
    let backfilled = 0;

    for (const [day, items] of byDay.entries()) {
      // Sort chronologically
      items.sort((a, b) => {
        const ams = a.createdAt.toMillis ? a.createdAt.toMillis() : a.createdAt.seconds * 1000;
        const bms = b.createdAt.toMillis ? b.createdAt.toMillis() : b.createdAt.seconds * 1000;
        return ams - bms;
      });

      // Find the current max orderNumber for this day
      const numbered = items.filter(i => typeof i.orderNumber === 'number' && i.orderNumber > 0);
      let maxNum = numbered.length ? Math.max(...numbered.map(i => i.orderNumber)) : 0;

      // Backfill any unnumbered orders, continuing from maxNum+1
      const unnumbered = items.filter(i => !(typeof i.orderNumber === 'number' && i.orderNumber > 0));
      if (unnumbered.length > 0) {
        console.log(`   ${day}: backfilling ${unnumbered.length} order(s) starting at #${maxNum + 1}`);
        for (const item of unnumbered) {
          maxNum++;
          writes.push({ ref: item.ref, data: { orderNumber: maxNum, orderDay: day } });
          backfilled++;
        }
      }

      // Read the current counter doc
      const counterRef = db.collection('restaurants').doc(rid).collection('orderCounters').doc(day);
      const counterSnap = await counterRef.get();
      const currentNext = counterSnap.exists ? (counterSnap.data().nextOrder || 0) : 0;
      const correctNext = maxNum + 1;

      if (currentNext !== correctNext) {
        console.log(`   ${day}: counter ${currentNext} → ${correctNext}`);
        writes.push({
          ref: counterRef,
          data: { nextOrder: correctNext, updatedAt: admin.firestore.FieldValue.serverTimestamp() }
        });
        counterFixes++;
      }
    }

    console.log(`   Plan: ${counterFixes} counter fixes, ${backfilled} order backfills`);

    if (DRY_RUN) {
      console.log('   [DRY RUN] no writes performed.');
      totalCounterFixes += counterFixes;
      totalOrdersBackfilled += backfilled;
      continue;
    }

    // Apply in batches of 500
    const BATCH_SIZE = 500;
    for (let i = 0; i < writes.length; i += BATCH_SIZE) {
      const chunk = writes.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      chunk.forEach(w => batch.set(w.ref, w.data, { merge: true }));
      await batch.commit();
    }
    if (writes.length > 0) console.log(`   ✓ Done: ${writes.length} writes committed`);
    totalCounterFixes += counterFixes;
    totalOrdersBackfilled += backfilled;
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Counter fixes:           ${totalCounterFixes}`);
  console.log(`  Orders backfilled:       ${totalOrdersBackfilled}`);
  console.log(`  Mode:                    ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('═══════════════════════════════════════════════════');

  if (DRY_RUN) {
    console.log('\nThis was a DRY RUN. No changes were made.');
    console.log('When ready, run without --dry-run:');
    console.log('  node scripts/fix-counters.js');
  } else {
    console.log('\n✓ Correction complete. Re-run scripts/diagnose-order-numbering.js to verify.');
  }

  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });