// pages/api/staff/update.js
// Admin-only endpoint. Handles PIN rotation, enable/disable, rename, and delete
// all in one place to keep the API surface small.
//
// Actions (send in req.body.action):
//   'rotatePin' — generates a new random PIN, returns it ONCE
//   'toggleActive' — flips isActive
//   'rename' — updates name (requires req.body.name)
//   'delete' — removes the staff member entirely
import { adminDb, adminAuth } from '../../../lib/firebaseAdmin';
import admin from 'firebase-admin';
import { hashPin, requireAdminAuth, generateRandomPin, staffUid } from '../../../lib/staffAuth';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ─── Gate ─────────────────────────────────────────────────
  let admin_;
  try {
    admin_ = await requireAdminAuth(req);
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized', detail: e.message });
  }

  const { action, staffId, name } = req.body || {};
  if (!action || !staffId) {
    return res.status(400).json({ error: 'Missing action or staffId' });
  }

  const rid = admin_.restaurantId;
  const staffRef = adminDb
    .collection('restaurants').doc(rid)
    .collection('staff').doc(staffId);

  // ─── Verify staff belongs to this restaurant ──────────────
  let staffSnap;
  try {
    staffSnap = await staffRef.get();
    if (!staffSnap.exists) return res.status(404).json({ error: 'Staff member not found' });
  } catch (e) {
    return res.status(500).json({ error: 'Could not load staff member' });
  }

  const staff = staffSnap.data();

  // ─── Dispatch on action ───────────────────────────────────
  try {
    switch (action) {
      case 'rotatePin': {
        const newPin = generateRandomPin();
        const newHash = await hashPin(newPin);
        await staffRef.update({
          pinHash: newHash,
          pin: admin.firestore.FieldValue.delete(), // remove legacy plain field if present
          pinRotatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // Revoke any existing Firebase auth sessions for this staff user so
        // their old device immediately loses access.
        try {
          await adminAuth.revokeRefreshTokens(staffUid(rid, staffId));
        } catch { /* ignore — token may not exist yet */ }
        return res.status(200).json({
          success: true,
          pin: newPin,  // shown ONCE in UI
        });
      }

      case 'toggleActive': {
        const nextActive = !staff.isActive;
        await staffRef.update({
          isActive: nextActive,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // If deactivating, revoke any active Firebase sessions — they can't
        // log in again, and their current session stops working too.
        if (!nextActive) {
          try {
            await adminAuth.revokeRefreshTokens(staffUid(rid, staffId));
            // Also disable the Firebase Auth user so custom tokens they got
            // earlier won't work either.
            await adminAuth.updateUser(staffUid(rid, staffId), { disabled: true }).catch(() => {});
          } catch {}
        } else {
          // Re-enabling — clear the disabled flag
          try {
            await adminAuth.updateUser(staffUid(rid, staffId), { disabled: false }).catch(() => {});
          } catch {}
        }
        return res.status(200).json({ success: true, isActive: nextActive });
      }

      case 'rename': {
        if (!name || typeof name !== 'string' || !name.trim()) {
          return res.status(400).json({ error: 'New name is required' });
        }
        await staffRef.update({
          name: name.trim(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // Update Firebase Auth displayName too (non-critical)
        try {
          await adminAuth.updateUser(staffUid(rid, staffId), { displayName: name.trim() });
        } catch {}
        return res.status(200).json({ success: true });
      }

      case 'delete': {
        // Remove the Firestore doc
        await staffRef.delete();
        // Remove the Firebase Auth user — the staff's saved session will
        // stop working immediately.
        try {
          await adminAuth.deleteUser(staffUid(rid, staffId));
        } catch (e) {
          // OK if the user didn't exist yet (pre-migration staff)
          if (e.code !== 'auth/user-not-found') console.error('Auth user delete error:', e);
        }
        return res.status(200).json({ success: true });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (e) {
    console.error(`Staff ${action} error:`, e);
    return res.status(500).json({ error: `Failed to ${action}` });
  }
}
