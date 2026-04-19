#!/usr/bin/env node
// scripts/diagnose-order-numbering.js
// ═══════════════════════════════════════════════════════════════════════════════
// READ-ONLY DIAGNOSTIC — investigates why some orders aren't getting orderNumber.
// ═══════════════════════════════════════════════════════════════════════════════
//
// What this checks:
//   1. Lists the 20 most recent orders for each restaurant
//   2. For each: shows the orderNumber, orderDay, createdAt, paymentStatus
//   3. Flags any order missing orderNumber
//   4. Checks the orderCounters subcollection to see what counter docs exist
//   5. Reports any mismatches (e.g., 5 numbered orders today but counter shows 3)
//
// Makes ZERO writes. Safe to run anytime.
//
// HOW TO RUN:
//   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
//   node scripts/diagnose-order-numbering.js

const admin = require('firebase-admin');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('ERROR: GOOGLE_APPLICATION_CREDENTIALS environment variable is not set.');
  process.exit(1);
}

admin.initializeApp();
const db = admin.firestore();

function dayKeyFromTs(ts) {
  const ms = ts && ts.toMillis ? ts.toMillis() : (ts && ts.seconds ? ts.seconds * 1000 : null);
  if (!ms) return null;
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function fmtTime(ts) {
  const ms = ts && ts.toMillis ? ts.toMillis() : (ts && ts.seconds ? ts.seconds * 1000 : null);
  if (!ms) return 'no-date';
  return new Date(ms).toLocaleString('en-IN');
}

(async () => {
  console.log('═══════════════════════════════════════════════════');
  console.log('Order numbering diagnostic — READ-ONLY');
  console.log('═══════════════════════════════════════════════════\n');

  const restaurants = await db.collection('restaurants').get();

  for (const rDoc of restaurants.docs) {
    const rid = rDoc.id;
    const rname = rDoc.data().name || rid;

    // Get the 20 most recent orders
    const ordersSnap = await db.collection('restaurants').doc(rid).collection('orders')
      .orderBy('createdAt', 'desc').limit(20).get();

    if (ordersSnap.empty) continue;

    console.log(`\n══ Restaurant: ${rname} (${rid}) ══`);
    console.log(`   Showing 20 most recent orders:\n`);

    let unnumbered = 0;
    let numbered = 0;
    const byDay = new Map();

    ordersSnap.docs.forEach(doc => {
      const data = doc.data();
      const day = dayKeyFromTs(data.createdAt);
      const num = data.orderNumber;
      const numStr = (typeof num === 'number') ? `#${String(num).padStart(3, '0')}` : '#----';
      const numFlag = (typeof num === 'number') ? '✓' : '✗ MISSING';
      const tableStr = (data.tableNumber || '—').toString().padEnd(8);
      const totalStr = `₹${data.total || 0}`.padStart(8);
      const status = (data.paymentStatus || 'unknown').padEnd(18);
      const idShort = doc.id.slice(0, 12);

      console.log(`   ${numStr}  ${tableStr} ${totalStr}  ${status}  ${fmtTime(data.createdAt)}  [${idShort}...] ${numFlag}`);

      if (typeof num === 'number') {
        numbered++;
        if (day) {
          if (!byDay.has(day)) byDay.set(day, { count: 0, max: 0, nums: [] });
          const d = byDay.get(day);
          d.count++;
          d.max = Math.max(d.max, num);
          d.nums.push(num);
        }
      } else {
        unnumbered++;
      }
    });

    console.log(`\n   Of these 20: ${numbered} numbered, ${unnumbered} unnumbered`);

    // Check counter docs for the days these orders span
    console.log(`\n   Counter docs (orderCounters subcollection):`);
    const countersSnap = await db.collection('restaurants').doc(rid).collection('orderCounters').get();
    if (countersSnap.empty) {
      console.log(`   (none — counter subcollection is empty)`);
    } else {
      countersSnap.docs.forEach(c => {
        const cData = c.data();
        const day = c.id;
        const observedThisDay = byDay.get(day);
        let mismatch = '';
        if (observedThisDay && observedThisDay.max !== cData.nextOrder) {
          mismatch = `   ⚠ MISMATCH — observed max #${observedThisDay.max} but counter says nextOrder=${cData.nextOrder}`;
        }
        console.log(`     ${day} → nextOrder=${cData.nextOrder}${mismatch}`);
      });
    }

    // Check for duplicates within a day
    for (const [day, info] of byDay.entries()) {
      const sorted = [...info.nums].sort((a, b) => a - b);
      const duplicates = sorted.filter((n, i) => sorted[i + 1] === n);
      if (duplicates.length > 0) {
        console.log(`   ⚠ DUPLICATE NUMBERS on ${day}: ${duplicates.join(', ')}`);
      }
      const expected = Array.from({ length: info.count }, (_, i) => i + 1);
      const missing = expected.filter(n => !sorted.includes(n));
      if (missing.length > 0 && info.count <= 20) {
        console.log(`   ⚠ GAP on ${day}: missing #${missing.join(', #')}`);
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('Done. Look for ✗ MISSING, ⚠ MISMATCH, ⚠ DUPLICATE, ⚠ GAP markers above.');
  console.log('═══════════════════════════════════════════════════');
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
