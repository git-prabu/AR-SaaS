// pages/api/staff/create.js
// Admin-only endpoint. Creates a new staff member with a hashed PIN.
// Requires a valid Firebase ID token in the Authorization header from
// the restaurant admin (owner).
//
// Response includes the PLAIN PIN so the admin UI can show it once —
// after this, the PIN is gone forever (only the hash is stored).
import { adminDb } from '../../../lib/firebaseAdmin';
import admin from 'firebase-admin';
import { hashPin, requireAdminAuth, ensureStaffAuthUser, generateRandomPin } from '../../../lib/staffAuth';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ─── Gate: must be authenticated restaurant admin ─────────
  let admin_;
  try {
    admin_ = await requireAdminAuth(req);
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized', detail: e.message });
  }

  const { name, username, pin, role, isActive = true } = req.body || {};

  // ─── Validate ─────────────────────────────────────────────
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (!username || typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ error: 'Username is required' });
  }
  if (!role || (role !== 'kitchen' && role !== 'waiter')) {
    return res.status(400).json({ error: 'Role must be kitchen or waiter' });
  }

  const normalizedUsername = username.trim().toLowerCase().replace(/\s/g, '');
  if (!/^[a-z0-9_]+$/.test(normalizedUsername)) {
    return res.status(400).json({ error: 'Username must be lowercase letters, numbers, or underscores only' });
  }
  if (normalizedUsername.length < 3 || normalizedUsername.length > 32) {
    return res.status(400).json({ error: 'Username must be 3-32 characters' });
  }

  // PIN can be auto-generated if not supplied; otherwise validate
  let plainPin;
  if (pin) {
    const digitsOnly = String(pin).replace(/\D/g, '');
    if (digitsOnly.length < 4 || digitsOnly.length > 6) {
      return res.status(400).json({ error: 'PIN must be 4-6 digits' });
    }
    plainPin = digitsOnly;
  } else {
    plainPin = generateRandomPin();
  }

  const rid = admin_.restaurantId;

  // ─── Check username uniqueness within this restaurant ──────
  try {
    const dup = await adminDb
      .collection('restaurants').doc(rid)
      .collection('staff')
      .where('username', '==', normalizedUsername)
      .limit(1)
      .get();
    if (!dup.empty) {
      return res.status(409).json({ error: `Username "${normalizedUsername}" is already taken` });
    }
  } catch (e) {
    console.error('Username uniqueness check error:', e);
    return res.status(500).json({ error: 'Server error checking username' });
  }

  // ─── Hash PIN ─────────────────────────────────────────────
  let pinHash;
  try { pinHash = await hashPin(plainPin); }
  catch (e) {
    console.error('PIN hashing error:', e);
    return res.status(500).json({ error: 'Server error' });
  }

  // ─── Write staff doc ──────────────────────────────────────
  let newStaffRef;
  try {
    newStaffRef = await adminDb
      .collection('restaurants').doc(rid)
      .collection('staff')
      .add({
        name: name.trim(),
        username: normalizedUsername,
        pinHash,
        // No more `pin` field — the hashed version is the only thing stored.
        role,
        isActive: !!isActive,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        loginCount: 0,
      });
  } catch (e) {
    console.error('Staff create error:', e);
    return res.status(500).json({ error: 'Could not create staff member' });
  }

  // ─── Pre-provision Firebase Auth user + custom claims ─────
  // Doing this now means the staff's first login is fast (no auth-user
  // creation on the critical path). If this fails, staff creation
  // still succeeded; the claims will be applied on first login.
  try {
    await ensureStaffAuthUser({
      restaurantId: rid,
      staffId: newStaffRef.id,
      role,
      name: name.trim(),
    });
  } catch (e) { /* non-fatal, will self-heal on first login */ }

  return res.status(200).json({
    success: true,
    staffId: newStaffRef.id,
    // Plain PIN returned ONCE so the admin UI can display it to the owner.
    // After this response, the PIN is gone — only the hash is stored.
    pin: plainPin,
  });
}
