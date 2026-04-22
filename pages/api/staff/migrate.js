// pages/api/staff/migrate.js
// ONE-TIME migration endpoint. Admin-only. Call this ONCE after deploying
// the new auth system.
//
// What it does for each existing staff member in this restaurant:
//   1. Hashes the plain `pin` field → writes it as `pinHash`
//   2. Deletes the plain `pin` field
//   3. Creates/refreshes the Firebase Auth user with custom claims
//
// Safe to run multiple times — skips staff who already have pinHash.
// Returns { migrated: N, skipped: M, errors: [...] }
import { adminDb } from '../../../lib/firebaseAdmin';
import admin from 'firebase-admin';
import { hashPin, requireAdminAuth, ensureStaffAuthUser } from '../../../lib/staffAuth';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let admin_;
  try {
    admin_ = await requireAdminAuth(req);
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized', detail: e.message });
  }

  const rid = admin_.restaurantId;

  const staffSnap = await adminDb
    .collection('restaurants').doc(rid)
    .collection('staff')
    .get();

  let migrated = 0;
  let skipped = 0;
  const errors = [];

  for (const doc of staffSnap.docs) {
    const data = doc.data();
    try {
      // Skip if already migrated (has pinHash and no plain pin)
      if (data.pinHash && !data.pin) {
        // Still refresh custom claims to be safe
        try {
          await ensureStaffAuthUser({
            restaurantId: rid, staffId: doc.id,
            role: data.role || 'kitchen',
            name: data.name || data.username,
          });
        } catch {}
        skipped++;
        continue;
      }

      // Must have a plain pin to migrate
      if (!data.pin) {
        errors.push({ staffId: doc.id, name: data.name, error: 'No PIN to migrate' });
        continue;
      }

      const pinHash = await hashPin(String(data.pin));
      await doc.ref.update({
        pinHash,
        pin: admin.firestore.FieldValue.delete(),
        migratedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Create/refresh Firebase Auth user with claims
      try {
        await ensureStaffAuthUser({
          restaurantId: rid, staffId: doc.id,
          role: data.role || 'kitchen',
          name: data.name || data.username,
        });
      } catch (e) {
        errors.push({ staffId: doc.id, name: data.name, error: `Auth user setup failed: ${e.message}` });
        // Continue anyway — the hash was saved, so login will still work;
        // the auth user will be created on first login via ensureStaffAuthUser.
      }

      migrated++;
    } catch (e) {
      console.error(`Migrate error for ${doc.id}:`, e);
      errors.push({ staffId: doc.id, name: data.name, error: e.message });
    }
  }

  return res.status(200).json({
    success: true,
    migrated,
    skipped,
    total: staffSnap.size,
    errors,
  });
}
