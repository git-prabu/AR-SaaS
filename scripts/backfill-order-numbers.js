#!/usr/bin/env node
// scripts/backfill-order-numbers.js
// ═══════════════════════════════════════════════════════════════════════════════
// ONE-TIME MIGRATION — assigns sequential daily orderNumber to existing orders.
// ═══════════════════════════════════════════════════════════════════════════════
//
// WHAT THIS DOES:
//   1. Reads every restaurant in the 'restaurants' collection
//   2. For each restaurant, reads every order in its 'orders' subcollection
//   3. Groups orders by calendar day (local time, YYYY-MM-DD)
//   4. Sorts each day's orders by createdAt ascending
//   5. Assigns orderNumber: 1, 2, 3... per day
//   6. Seeds the daily counter (restaurants/{rid}/orderCounters/{day}) so new orders
//      placed after migration continue from the correct number
//   7. Writes everything in batches of 500 (Firestore's batched-write limit)
//   8. Prints progress and a final summary
//
// HOW TO RUN:
//   1. Make sure you have a Firebase service-account key JSON file. If you don't,
//      generate one at:
//        Firebase Console → Project Settings → Service accounts → Generate new private key
//      Save it somewhere safe (gitignored!).
//   2. Set the environment variable GOOGLE_APPLICATION_CREDENTIALS to its path:
//        export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/serviceAccount.json
//   3. cd to the project root, install firebase-admin if not already:
//        npm install firebase-admin --save-dev
//   4. Run with a dry-run first to see what WOULD happen:
//        node scripts/backfill-order-numbers.js --dry-run
//   5. When the dry-run output looks right, run for real:
//        node scripts/backfill-order-numbers.js
//
// SAFETY:
//   - Dry-run mode (--dry-run flag) makes NO writes. Use this first.
//   - Skips orders that already have orderNumber (safe to re-run).
//   - Does NOT touch the Firestore document ID or any other field.
//   - Only ADDS `orderNumber` and `orderDay` fields; never deletes existing data.
//
// WHAT GETS WRITTEN:
//   On each order:  { orderNumber: 42, orderDay: '2026-04-15' }
//   On counter doc: restaurants/{rid}/orderCounters/{YYYY-MM-DD}
//                   → { nextOrder: 54, updatedAt: <now> }

const admin = require('firebase-admin');

// ─── Init ────────────────────────────────────────────────────────────────────
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('ERROR: GOOGLE_APPLICATION_CREDENTIALS environment variable is not set.');
  console.error('See the header comment in this file for setup instructions.');
  process.exit(1);
}

admin.initializeApp();
const db = admin.firestore();
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

console.log('═══════════════════════════════════════════════════');
console.log(`Order number backfill — ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE MODE'}`);
console.log('═══════════════════════════════════════════════════\n');

// ─── Helpers ─────────────────────────────────────────────────────────────────
function dayKeyFromTs(ts) {
  // ts is a Firestore Timestamp or { seconds, nanoseconds } shape
  const ms = ts.toMillis ? ts.toMillis() : (ts.seconds ? ts.seconds * 1000 : null);
  if (!ms) return null;
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

async function processRestaurant(restaurantDoc) {
  const rid = restaurantDoc.id;
  const rname = restaurantDoc.data().name || rid;
  console.log(`\n── Restaurant: ${rname} (${rid}) ──`);

  const ordersSnap = await db.collection('restaurants').doc(rid).collection('orders').get();
  console.log(`   Found ${ordersSnap.size} orders total.`);

  if (ordersSnap.empty) {
    console.log('   No orders. Skipping.');
    return { restaurant: rname, total: 0, assigned: 0, alreadyNumbered: 0, skippedNoDate: 0 };
  }

  // Group orders by day
  const byDay = new Map();
  let alreadyNumbered = 0;
  let skippedNoDate = 0;

  ordersSnap.docs.forEach(doc => {
    const data = doc.data();
    if (data.orderNumber !== undefined && data.orderNumber !== null) {
      alreadyNumbered++;
      return; // skip already-numbered
    }
    if (!data.createdAt) {
      skippedNoDate++;
      console.log(`   WARN: order ${doc.id} has no createdAt, skipping`);
      return;
    }
    const key = dayKeyFromTs(data.createdAt);
    if (!key) {
      skippedNoDate++;
      return;
    }
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push({ ref: doc.ref, id: doc.id, createdAt: data.createdAt });
  });

  // Sort each day chronologically and plan writes
  const orderedDays = Array.from(byDay.keys()).sort();
  const writes = []; // { ref, data } — will batch-apply
  const counterWrites = []; // seed today-and-before counters

  let totalAssigned = 0;
  for (const day of orderedDays) {
    const items = byDay.get(day);
    items.sort((a, b) => {
      const ams = a.createdAt.toMillis ? a.createdAt.toMillis() : a.createdAt.seconds * 1000;
      const bms = b.createdAt.toMillis ? b.createdAt.toMillis() : b.createdAt.seconds * 1000;
      return ams - bms;
    });

    items.forEach((item, idx) => {
      const num = idx + 1;
      writes.push({ ref: item.ref, data: { orderNumber: num, orderDay: day } });
      totalAssigned++;
      if (VERBOSE) console.log(`   ${day}  #${num}  ${item.id}`);
    });

    // Seed counter for this day so new orders continue from N+1
    const counterRef = db.collection('restaurants').doc(rid).collection('orderCounters').doc(day);
    counterWrites.push({
      ref: counterRef,
      data: { nextOrder: items.length, updatedAt: admin.firestore.FieldValue.serverTimestamp() }
    });
  }

  console.log(`   Plan: assign ${totalAssigned} orders across ${orderedDays.length} days`);
  console.log(`   Already numbered (skipped): ${alreadyNumbered}`);
  if (skippedNoDate > 0) console.log(`   Skipped (no valid date): ${skippedNoDate}`);

  if (DRY_RUN) {
    console.log('   [DRY RUN] no writes performed.');
    return { restaurant: rname, total: ordersSnap.size, assigned: totalAssigned, alreadyNumbered, skippedNoDate };
  }

  // Apply in batches of 500 (Firestore's batched-write limit).
  const allWrites = [...writes, ...counterWrites];
  const BATCH_SIZE = 500;
  let batchNum = 0;
  for (let i = 0; i < allWrites.length; i += BATCH_SIZE) {
    const chunk = allWrites.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach(w => batch.set(w.ref, w.data, { merge: true }));
    await batch.commit();
    batchNum++;
    console.log(`   Batch ${batchNum} committed (${chunk.length} writes)`);
  }

  console.log(`   ✓ Done: ${totalAssigned} orders numbered, ${orderedDays.length} counters seeded`);
  return { restaurant: rname, total: ordersSnap.size, assigned: totalAssigned, alreadyNumbered, skippedNoDate };
}

// ─── Main ────────────────────────────────────────────────────────────────────
(async () => {
  try {
    const restaurantsSnap = await db.collection('restaurants').get();
    console.log(`Scanning ${restaurantsSnap.size} restaurant(s)...\n`);

    const results = [];
    for (const r of restaurantsSnap.docs) {
      const result = await processRestaurant(r);
      results.push(result);
    }

    console.log('\n═══════════════════════════════════════════════════');
    console.log('SUMMARY');
    console.log('═══════════════════════════════════════════════════');
    const totalAssigned = results.reduce((s, r) => s + r.assigned, 0);
    const totalSkippedExisting = results.reduce((s, r) => s + r.alreadyNumbered, 0);
    const totalSkippedNoDate = results.reduce((s, r) => s + r.skippedNoDate, 0);
    results.forEach(r => {
      console.log(`  ${r.restaurant.padEnd(30)} ${r.assigned} numbered, ${r.alreadyNumbered} skipped`);
    });
    console.log('───────────────────────────────────────────────────');
    console.log(`  Total newly numbered:    ${totalAssigned}`);
    console.log(`  Already had numbers:     ${totalSkippedExisting}`);
    if (totalSkippedNoDate > 0) console.log(`  Skipped (no date):       ${totalSkippedNoDate}`);
    console.log(`  Mode:                    ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
    console.log('═══════════════════════════════════════════════════');

    if (DRY_RUN) {
      console.log('\nThis was a DRY RUN. No changes were made.');
      console.log('When ready, run without --dry-run:');
      console.log('  node scripts/backfill-order-numbers.js');
    } else {
      console.log('\n✓ Migration complete. New orders placed in the app will continue from');
      console.log('  the next number in each day\'s counter.');
    }

    process.exit(0);
  } catch (err) {
    console.error('\nMIGRATION FAILED:', err);
    process.exit(1);
  }
})();
