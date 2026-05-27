// pages/api/staff/create.js
// Admin-only endpoint. Creates a new staff member with a hashed PIN.
// Requires a valid Firebase ID token in the Authorization header from
// the restaurant admin (owner).
//
// Response includes the PLAIN PIN so the admin UI can show it once —
// after this, the PIN is gone forever (only the hash is stored).
import { adminDb } from '../../../lib/firebaseAdmin';
import admin from 'firebase-admin';
import { hashPin, requireStaffManageAuth, ensureStaffAuthUser, generateRandomPin } from '../../../lib/staffAuth';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ─── Gate: must be authenticated restaurant admin ─────────
  let admin_;
  try {
    admin_ = await requireStaffManageAuth(req);
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized', detail: e.message });
  }

  const { name, username, pin, role, isActive = true, roleId = null } = req.body || {};

  // ─── Validate ─────────────────────────────────────────────
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (!username || typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ error: 'Username is required' });
  }
  // Unified role model (26 May 2026): 'kitchen'/'waiter' are the built-in
  // station roles (no roleId); 'staff' is the base for a custom access role
  // (roleId required, points at staffRoles/{id}).
  if (!role || (role !== 'kitchen' && role !== 'waiter' && role !== 'staff')) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  if (role === 'staff' && !(typeof roleId === 'string' && roleId.trim())) {
    return res.status(400).json({ error: 'Please choose a role for this staff member' });
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

  // ─── Escalation guard (RBAC) ──────────────────────────────
  // A staff-manager (non-owner) may onboard operational staff, but can NOT
  // create a staffer in a role that grants admin-tier permissions — that
  // would let them mint another manager / role-editor / settings-or-POS
  // admin. Only the owner can assign such roles. (Built-in kitchen/waiter
  // carry no roleId, so they're unaffected.)
  if (!admin_.isOwner && typeof roleId === 'string' && roleId.trim()) {
    const ADMIN_TIER = ['staff', 'manageRoles', 'settings', 'petpooja'];
    try {
      const roleSnap = await adminDb
        .collection('restaurants').doc(rid)
        .collection('staffRoles').doc(roleId.trim()).get();
      const perms = roleSnap.exists && Array.isArray(roleSnap.data().permissions)
        ? roleSnap.data().permissions : [];
      if (perms.some(p => ADMIN_TIER.includes(p))) {
        return res.status(403).json({ error: 'Only the owner can assign an admin-level role.' });
      }
    } catch (e) {
      return res.status(500).json({ error: 'Could not validate the selected role' });
    }
  }

  // ─── Username uniqueness check + PIN hash run in PARALLEL ──
  // (May 8 perf) Both depend only on inputs we already have, neither
  // depends on the other's result. Running in parallel saves ~80-100ms
  // on a typical Vercel cold start. If the uniqueness check rejects,
  // the wasted bcrypt CPU is fine — we don't write anything either way.
  let pinHash;
  try {
    const [dup, hash] = await Promise.all([
      adminDb
        .collection('restaurants').doc(rid)
        .collection('staff')
        .where('username', '==', normalizedUsername)
        .limit(1)
        .get(),
      hashPin(plainPin),
    ]);
    if (!dup.empty) {
      return res.status(409).json({ error: `Username "${normalizedUsername}" is already taken` });
    }
    pinHash = hash;
  } catch (e) {
    console.error('Staff create pre-checks error:', e);
    return res.status(500).json({ error: 'Server error preparing staff record' });
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
        // Phase 8 (RBAC) — optional custom access role (staffRoles doc id).
        // Its permission list is resolved + minted into the login token by
        // /api/staff/login. null = base station access only.
        roleId: (typeof roleId === 'string' && roleId.trim()) ? roleId.trim() : null,
        isActive: !!isActive,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        loginCount: 0,
      });
  } catch (e) {
    console.error('Staff create error:', e);
    return res.status(500).json({ error: 'Could not create staff member' });
  }

  // ─── Pre-provision Firebase Auth user + custom claims ─────
  // (May 8 perf) FIRE-AND-FORGET. Previously we awaited this, costing
  // ~250ms on the response path. The original comment already noted
  // this was non-critical ("self-heals on first login") — so move it
  // off the response path entirely. Use waitUntil-style detached
  // invocation so the Vercel function still completes the call, just
  // not before responding to the client.
  ensureStaffAuthUser({
    restaurantId: rid,
    staffId: newStaffRef.id,
    role,
    name: name.trim(),
  }).catch(e => {
    console.warn('[staff/create] background auth provisioning failed (will self-heal on first login):', e?.message);
  });

  return res.status(200).json({
    success: true,
    staffId: newStaffRef.id,
    // Plain PIN returned ONCE so the admin UI can display it to the owner.
    // After this response, the PIN is gone — only the hash is stored.
    pin: plainPin,
  });
}
