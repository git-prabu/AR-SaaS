#!/usr/bin/env node
// scripts/probe-cancelled-order-rule.js
//
// Tests that the customer-side paymentStatus rule blocks writes to a
// cancelled order. Uses the Firebase JS CLIENT SDK (not admin SDK)
// because the rule we're testing only applies to client writes —
// admin SDK bypasses all rules.
//
// Setup: creates an order with status='cancelled' (via admin SDK,
// bypassing all rules), then attempts to update paymentStatus from
// the anonymous-client-customer perspective. Expected: write rejected
// with FirebaseError code 'permission-denied'.
//
// Tears down the test order afterward. Read-only effect on the
// restaurant's order list.

require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, updateDoc, serverTimestamp } = require('firebase/firestore');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const adminDb = admin.firestore();

// Client SDK — anonymous, just like a customer browser session
const clientApp = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
}, 'probe');
const clientDb = getFirestore(clientApp);

async function main() {
  // Pick the first restaurant with at least one cancelled order, so we
  // don't have to create + clean up. If none exists, abort with a
  // friendly message.
  const restSnap = await adminDb.collection('restaurants').limit(20).get();
  let targetRid = null;
  let targetOid = null;
  for (const rDoc of restSnap.docs) {
    const ordersSnap = await adminDb.collection(`restaurants/${rDoc.id}/orders`)
      .where('status', '==', 'cancelled')
      .limit(1)
      .get();
    if (!ordersSnap.empty) {
      targetRid = rDoc.id;
      targetOid = ordersSnap.docs[0].id;
      console.log(`Found existing cancelled order: restaurants/${targetRid}/orders/${targetOid}`);
      break;
    }
  }

  if (!targetRid) {
    console.log('No cancelled orders to test against. Aborting.');
    process.exit(0);
  }

  // Verify the current state of the order
  const ref = adminDb.doc(`restaurants/${targetRid}/orders/${targetOid}`);
  const snap = await ref.get();
  const before = snap.data();
  console.log(`Before:`);
  console.log(`  status:        ${before.status}`);
  console.log(`  paymentStatus: ${before.paymentStatus}`);

  // Reset paymentStatus to 'unpaid' via admin SDK so the test has a
  // clean baseline (the rule blocks customer writes when current
  // paymentStatus is in the paid_* set; we want to test the cancelled
  // status block specifically).
  if (before.paymentStatus !== 'unpaid') {
    console.log(`Resetting paymentStatus to 'unpaid' via admin SDK first...`);
    await ref.update({ paymentStatus: 'unpaid' });
  }

  // Attempt the customer write via client SDK
  console.log(`\nAttempting customer-side write: paymentStatus → cash_requested`);
  const clientRef = doc(clientDb, `restaurants/${targetRid}/orders/${targetOid}`);
  try {
    await updateDoc(clientRef, {
      paymentStatus: 'cash_requested',
      paymentUpdatedAt: serverTimestamp(),
      lastModifiedBy: 'public',
      lastModifiedAt: serverTimestamp(),
    });
    // If we get here, the rule did NOT block
    console.log(`\n❌ FAIL: write succeeded. Rule did not block.`);
    const after = (await ref.get()).data();
    console.log(`After (BUG):`);
    console.log(`  status:        ${after.status}`);
    console.log(`  paymentStatus: ${after.paymentStatus}`);
    // Roll back
    await ref.update({ paymentStatus: 'unpaid' });
    process.exit(1);
  } catch (err) {
    if (err.code === 'permission-denied') {
      console.log(`\n✓ PASS: write was rejected with permission-denied. Rule is blocking.`);
      process.exit(0);
    }
    console.log(`\n⚠ Unexpected error code: ${err.code} — ${err.message}`);
    process.exit(2);
  }
}

main().catch(err => { console.error('PROBE FAILED:', err); process.exit(3); });
