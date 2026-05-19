#!/usr/bin/env node
// scripts/diag-new-restaurants.js — diagnose why orders aren't showing
// in the kitchen page for newly opened restaurants. Lists every
// restaurant created in the last 3 days, their owner's users doc
// shape (role + restaurantId), and the most recent orders under that
// restaurant. Read-only.

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
  const cutoffMs = Date.now() - 3 * 24 * 3600 * 1000;
  const restSnap = await db.collection('restaurants').get();
  const recent = [];
  restSnap.forEach(d => {
    const createdAtMs = d.data().createdAt?.toMillis?.() ?? 0;
    if (createdAtMs >= cutoffMs) {
      recent.push({ id: d.id, ...d.data(), createdAtMs });
    }
  });
  recent.sort((a, b) => b.createdAtMs - a.createdAtMs);

  console.log(`\nFound ${recent.length} restaurant(s) created in last 3 days:\n`);
  for (const r of recent) {
    console.log(`━━━ ${r.name} (${r.id}) ━━━`);
    console.log(`  subdomain:     ${r.subdomain}`);
    console.log(`  plan:          ${r.plan} (maxItems=${r.maxItems}, maxStorageMB=${r.maxStorageMB})`);
    console.log(`  paymentStatus: ${r.paymentStatus}`);
    console.log(`  ownerUid:      ${r.ownerUid}`);
    console.log(`  createdSource: ${r.createdSource || '(missing)'}`);
    console.log(`  isActive:      ${r.isActive}`);

    // Owner user doc
    if (r.ownerUid) {
      const userSnap = await db.doc(`users/${r.ownerUid}`).get();
      if (userSnap.exists) {
        const u = userSnap.data();
        console.log(`  -- users/${r.ownerUid}`);
        console.log(`     role:         ${u.role}`);
        console.log(`     restaurantId: ${u.restaurantId}`);
        console.log(`     email:        ${u.email}`);
        const matches = u.restaurantId === r.id ? '✓ matches' : '✗ DOES NOT MATCH restaurant.id';
        console.log(`     ${matches}`);
      } else {
        console.log(`  -- users/${r.ownerUid} → NOT FOUND ✗`);
      }
    } else {
      console.log(`  -- no ownerUid set ✗`);
    }

    // Recent orders
    const ordersSnap = await db.collection(`restaurants/${r.id}/orders`).get();
    console.log(`  -- ${ordersSnap.size} order(s)`);
    let count = 0;
    ordersSnap.forEach(o => {
      if (count >= 5) return;
      const od = o.data();
      console.log(`     ${o.id.slice(0,8)}.. status=${od.status} paymentStatus=${od.paymentStatus} orderType=${od.orderType || '(none)'} total=${od.total}`);
      count += 1;
    });
    console.log();
  }
  process.exit(0);
}

main().catch(err => { console.error('FAILED:', err); process.exit(1); });
