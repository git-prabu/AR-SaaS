import Head from 'next/head';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import FeatureShell from '../../components/layout/FeatureShell';
import EmptyState from '../../components/EmptyState';
import ConfirmModal from '../../components/ConfirmModal';
import { useRouter } from 'next/router';
import { getStaffMembers, getRestaurantById, getAreas, setStaffAreas, getStaffRoles, setStaffRole } from '../../lib/db';
import { uploadImage, fileSizeMB, deleteFile, buildImagePath, extractStoragePath } from '../../lib/storage';
import dynamic from 'next/dynamic';
// Lazy-loaded: this panel pulls in chart rendering + its own Firestore
// queries, but only appears inside the activity overlay (when a card is
// clicked). Keeping it out of the initial /admin/staff bundle speeds up
// first load. It's client-only anyway (self-fetches in an effect).
const StaffActivityPanel = dynamic(() => import('../../components/StaffActivityPanel'), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 40, textAlign: 'center', color: 'rgba(0,0,0,0.5)', fontSize: 13 }}>
      Loading activity…
    </div>
  ),
});
import { ADMIN_TIER_PERMS } from '../../lib/permissions';
import toast from 'react-hot-toast';
import { auth, staffAuth } from '../../lib/firebaseAuth';

// ═══ Aspire palette — same tokens as analytics/kitchen/waiter ═══
const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER,
  cream: '#EDEDED',
  ink: '#1A1A1A',
  shell: '#FFFFFF',
  shellDarker: '#F8F8F8',
  warning: '#C4A86D',              // Antique gold — brand signature
  warningDim: '#A08656',
  // Matte black signature dark-card tokens
  forest: '#1A1A1A',
  forestDarker: '#2A2A2A',
  forestText: '#EAE7E3',
  forestTextMuted: 'rgba(234,231,227,0.55)',
  forestTextFaint: 'rgba(234,231,227,0.35)',
  forestSubtleBg: 'rgba(255,255,255,0.04)',
  forestBorder: '1px solid rgba(255,255,255,0.06)',
  success: '#3F9E5A',
  danger: '#D9534F',
  mutedText: 'rgba(0,0,0,0.55)',
  faintText: 'rgba(0,0,0,0.38)',
  subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)',
  cardShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
};

// ═══ Role metadata ═══
// Both roles use the matte-black/gold Aspire signature. Differentiation comes from the icon glyph
// (knife+fork for kitchen, bell for waiter) rather than color. Keeps the whole row calm and premium.
// Icons are rendered inline via SVG (see roleIcon helper below).
const ROLES = {
  kitchen: { label: 'Kitchen Staff', desc: 'Access to Kitchen Display' },
  waiter:  { label: 'Waiter',        desc: 'Access to Waiter Dashboard' },
};

// ═══ Role icon — matte black avatar with gold SVG glyph ═══
// 'kitchen' → knife+fork, 'waiter' → call bell, 'custom' → key (a custom
// access role). Unified role model: custom-role staff show the key, not a
// misleading waiter bell.
function RoleIcon({ role, size = 44 }) {
  const iconSize = Math.round(size * 0.5);
  return (
    <div style={{
      width: size, height: size, borderRadius: 10,
      background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
      border: A.forestBorder,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      {role === 'kitchen' ? (
        // Knife + fork
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={A.warning} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2v7a2 2 0 0 0 2 2v11" />
          <path d="M10 2v7" />
          <path d="M6 2v7" />
          <path d="M18 2c-1.5 0-3 1-3 3v6c0 1 .5 2 2 2v9" />
        </svg>
      ) : role === 'waiter' ? (
        // Bell (hospitality call bell)
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={A.warning} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      ) : (
        // Key (custom access role)
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={A.warning} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="7.5" cy="15.5" r="4.5" />
          <path d="M10.5 12.5 19 4" />
          <path d="M16 7l3 3" />
          <path d="M19 4l2 2" />
        </svg>
      )}
    </div>
  );
}

// ═══ Avatar — employee photo if set, else the role-icon glyph ═══
// Rounded square to match the existing RoleIcon language. `photoUrl`
// wins; otherwise we fall back to the gold-on-black role glyph.
function Avatar({ photoUrl, role, size = 44 }) {
  if (photoUrl) {
    return (
      <div style={{
        width: size, height: size, borderRadius: 10, flexShrink: 0,
        overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)',
        background: '#EDEDED',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
    );
  }
  return <RoleIcon role={role} size={size} />;
}

// ═══ Random 6-digit PIN generator ═══
// (2026-06-11 audit #14: 4 → 6 digits, matching the server rule in
// /api/staff/create. crypto.getRandomValues because this PIN is a real
// credential, not a UI placeholder.)
function randomPin() {
  try {
    const buf = new Uint32Array(1);
    window.crypto.getRandomValues(buf);
    return String(buf[0] % 1000000).padStart(6, '0');
  } catch {
    return String(Math.floor(100000 + Math.random() * 900000));
  }
}

// ═══ Time helpers ═══
function timeAgo(ts) {
  if (!ts) return '—';
  const seconds = ts.seconds || ts._seconds;
  if (!seconds) return '—';
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  const d = new Date(seconds * 1000);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ═══ Empty form state ═══
// photoUrl/phone/email/notes are employee-profile fields (13 Jun 2026).
// Photo upload + these extras are edit-only (a staffId must exist to
// store the photo + persist via /api/staff/update 'profile').
const emptyForm = { name: '', username: '', pin: '', role: 'kitchen', roleId: '', phone: '', email: '', notes: '', photoUrl: '' };

// ═══ Helper: get admin ID token for API calls ═══
// All mutation endpoints (/api/staff/create, /api/staff/update) require
// the restaurant owner's Firebase ID token as a Bearer header. The server
// verifies the token and looks up users/{uid} to confirm they're a
// restaurant admin — that gate (in lib/staffAuth.js requireAdminAuth)
// is what stops a non-owner from hitting these endpoints.
async function authHeaders() {
  // Owner is signed into the admin app; a staff manager into the staff app.
  // Use whichever session exists so the right ID token (owner OR staff, with
  // its perms claim) reaches /api/staff/* — requireStaffManageAuth accepts both.
  const currentUser = auth.currentUser || staffAuth.currentUser;
  if (!currentUser) throw new Error('Not signed in');
  // Force-refresh the ID token so we don't send a stale one. Firebase tokens
  // expire after 1 hour; stale tokens cause "Unauthorized" on the server.
  const token = await currentUser.getIdToken(true);
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

// ═══ API call wrapper ═══
// Handles auth header, JSON body, graceful error parsing (some 5xx responses
// come back as HTML so we handle that too), and surfaces the error text so
// the UI can show a useful banner.
async function apiCall(endpoint, body) {
  const headers = await authHeaders();
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); }
  catch {
    // Non-JSON response (usually Vercel's generic 500 HTML page). Surface
    // a clearer hint so the admin knows to check env vars / Vercel logs.
    if (resp.status === 500) {
      throw new Error(
        'Server error (500). Likely cause: FIREBASE_ADMIN_* env vars missing on Vercel. ' +
        'Go to Vercel → Project Settings → Environment Variables and add ' +
        'FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY, ' +
        'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET. Then redeploy.'
      );
    }
    throw new Error(`Server error (${resp.status})`);
  }
  if (!resp.ok) {
    // Surface server-side detail — requireAdminAuth throws messages like
    // "User doc not found", "Not a restaurant admin", "No restaurantId" that
    // tell the admin exactly which gate failed. Previously we swallowed them.
    const base = data.error || `Request failed (${resp.status})`;
    throw new Error(data.detail ? `${base} — ${data.detail}` : base);
  }
  return data;
}

export default function StaffManagement() {
  // RBAC: owner OR a staff member whose role grants 'staff' (a manager who
  // onboards staff). Staff managers read the roster + roles via staffDb and
  // create/manage staff through /api/staff/* (guarded). Re-assigning roles to
  // existing staff + area editing stay owner-only (hidden below for staff).
  const { ready, isAdmin, rid, scopedDb, scopedStorage, canView, userData, staffSession } = useFeatureAccess('staff');
  const restaurantName = userData?.restaurantName || staffSession?.restaurantName || 'Your Restaurant';

  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // Restaurant subdomain — needed for the "Restaurant Code" banner so the
  // admin can share it with new staff. userData only has restaurantId, the
  // subdomain lives on the restaurant doc.
  const [subdomain, setSubdomain] = useState('');
  useEffect(() => {
    if (!rid) return;
    getRestaurantById(rid)
      .then(r => setSubdomain(r?.subdomain || ''))
      .catch(() => setSubdomain(''));
  }, [rid]);

  // Modal state — add/edit form
  const [modal, setModal] = useState(null); // null | 'add' | staffObj
  // Per-staff activity (13 Jun 2026) — clicking a profile card opens
  // the activity panel in an overlay (image-5 "gap above to close").
  // Holds the staff object whose activity is shown, or null.
  const [activityFor, setActivityFor] = useState(null);
  const router = useRouter();

  // Esc closes the activity overlay.
  useEffect(() => {
    if (!activityFor) return;
    const onKey = (e) => { if (e.key === 'Escape') setActivityFor(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activityFor]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  // After a successful create / rotate, we show the PIN ONCE here
  const [pinDisplay, setPinDisplay] = useState(null); // { name, username, pin } | null

  // QR modal
  const [qrOpen, setQrOpen] = useState(false);

  // Employee photo upload (edit modal). Uploads to Storage via the
  // scoped instance, stores the URL in form.photoUrl, persisted on Save.
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoProgress, setPhotoProgress] = useState(0);
  const photoInputRef = useRef(null);

  // Phase 0 step 5 — areas for the per-waiter access-control chips.
  const [areas, setAreas] = useState([]);
  const [areaSavingId, setAreaSavingId] = useState(null);

  // Phase 8 (RBAC) — custom access roles for the per-staff role dropdown.
  const [rolesList, setRolesList] = useState([]);
  const [roleSavingId, setRoleSavingId] = useState(null);

  // Filter + search
  const [filter, setFilter] = useState('all'); // 'all' | 'kitchen' | 'waiter' | 'inactive'
  const [search, setSearch] = useState('');

  // Per-row action state
  const [actionId, setActionId] = useState(null);
  const [banner, setBanner] = useState(null); // { kind: 'success'|'error', text: '…' }
  // ConfirmModal state — replaces the native browser confirm() for
  // delete prompts. Shape: { title, body, confirmLabel, destructive,
  // onConfirm } | null (closed).
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Copy link feedback
  const [copied, setCopied] = useState(false);

  // ═══ Login URL ═══
  // Staff use this URL on their tablets — we append ?rid= so the login page can pre-select the restaurant.
  const loginLink = typeof window !== 'undefined' && rid
    ? `${window.location.origin}/staff/login?rid=${rid}`
    : '';

  // ═══ QR code (via free public api.qrserver.com — no key, no signup) ═══
  const qrSrc = loginLink
    ? `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&data=${encodeURIComponent(loginLink)}`
    : '';

  // ═══ Load staff ═══
  const reload = async () => {
    if (!rid || !canView) return;
    setLoading(true);
    setLoadError('');
    try {
      const list = await getStaffMembers(rid, { db: scopedDb });
      // Defensive: getStaffMembers should always return an array, but if
      // a transient Firestore quirk returns null/undefined we'd crash on
      // .map() in render. Coerce to [] and surface a banner instead.
      if (!Array.isArray(list)) {
        console.warn('getStaffMembers returned non-array:', list);
        setStaff([]);
        setLoadError('Unexpected response loading staff. Try again.');
      } else {
        setStaff(list);
      }
    } catch (e) {
      console.error('getStaffMembers error:', e);
      setLoadError('Failed to load staff. Check your Firestore rules.');
    }
    setLoading(false);
  };
  useEffect(() => { reload(); }, [rid, canView]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load areas for the waiter access-control chips.
  useEffect(() => {
    if (!rid || !canView) return;
    getAreas(rid, { db: scopedDb }).then(setAreas).catch(() => setAreas([]));
  }, [rid, canView, scopedDb]);

  // Load custom access roles (Phase 8) for the per-staff role dropdown.
  useEffect(() => {
    if (!rid || !canView) return;
    getStaffRoles(rid, { db: scopedDb }).then(setRolesList).catch(() => setRolesList([]));
  }, [rid, canView, scopedDb]);

  // Toggle one area on/off for a waiter. Empty list = all areas.
  const toggleStaffArea = async (staffMember, areaId) => {
    const current = Array.isArray(staffMember.assignedAreas) ? staffMember.assignedAreas : [];
    const next = current.includes(areaId)
      ? current.filter(a => a !== areaId)
      : [...current, areaId];
    setAreaSavingId(staffMember.id);
    // Optimistic local update so the chips respond instantly.
    setStaff(prev => prev.map(s => s.id === staffMember.id ? { ...s, assignedAreas: next } : s));
    try {
      await setStaffAreas(rid, staffMember.id, next);
    } catch (e) {
      toast.error('Could not update areas: ' + (e?.message || 'error'));
      reload(); // revert to server truth on failure
    } finally {
      setAreaSavingId(null);
    }
  };

  // Unified role model: change a staffer's ONE role from the card dropdown.
  // `value` is 'kitchen' | 'waiter' (built-in stations) or a staffRoles id
  // (custom role). We map it to {role, roleId} and write both. Optimistic;
  // reverts on failure. Custom claims re-mint on the staffer's next login.
  const assignRole = async (staffMember, value) => {
    const isBuiltin = value === 'kitchen' || value === 'waiter';
    const role = isBuiltin ? value : 'staff';
    const roleId = isBuiltin ? null : value;
    setRoleSavingId(staffMember.id);
    setStaff(prev => prev.map(s => s.id === staffMember.id ? { ...s, role, roleId } : s));
    try {
      await setStaffRole(rid, staffMember.id, roleId, { role });
      toast.success('Role updated — they must sign out and back in to apply it.');
    } catch (e) {
      toast.error('Could not set role: ' + (e?.message || 'error'));
      reload();
    } finally {
      setRoleSavingId(null);
    }
  };

  // Auto-clear banner after 3s
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 3000);
    return () => clearTimeout(t);
  }, [banner]);

  // ═══ Stats ═══
  // Computed once per staff change. Active = isActive !== false (so missing field defaults to active).
  const stats = useMemo(() => {
    const total = staff.length;
    const kitchen = staff.filter(s => s.role === 'kitchen' && !s.roleId && s.isActive !== false).length;
    const waiters = staff.filter(s => s.role === 'waiter' && !s.roleId && s.isActive !== false).length;
    const inactive = staff.filter(s => s.isActive === false).length;
    return { total, kitchen, waiters, inactive };
  }, [staff]);

  // ═══ Filtered list ═══
  const filtered = useMemo(() => {
    let result = staff;
    if (filter === 'kitchen')       result = result.filter(s => s.role === 'kitchen' && !s.roleId && s.isActive !== false);
    else if (filter === 'waiter')   result = result.filter(s => s.role === 'waiter' && !s.roleId && s.isActive !== false);
    else if (filter === 'inactive') result = result.filter(s => s.isActive === false);
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(s =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.username || '').toLowerCase().includes(q)
      );
    }
    // Sort: active first, then oldest created first (stable order)
    return [...result].sort((a, b) => {
      const aActive = a.isActive !== false ? 0 : 1;
      const bActive = b.isActive !== false ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
    });
  }, [staff, filter, search]);

  // ═══ Modal handlers ═══
  const openAdd = () => {
    setForm({ ...emptyForm, pin: randomPin() });
    setSaveError('');
    setModal('add');
  };
  const openEdit = (s) => {
    setForm({
      name: s.name || '', username: s.username || '', pin: '',
      role: s.role || 'kitchen', roleId: s.roleId || '',
      phone: s.phone || '', email: s.email || '', notes: s.notes || '',
      photoUrl: s.photoUrl || '',
    });
    setSaveError('');
    setModal(s);
  };
  const closeModal = () => {
    setModal(null);
    setSaveError('');
    setForm(emptyForm);
    setPhotoBusy(false);
    setPhotoProgress(0);
  };

  // ═══ Employee photo upload ═══
  // Resizes browser-side (uploadImage) then stores under the
  // restaurant's images path via the scoped Storage instance (works for
  // owner AND staff-manager per storage.rules). On success the URL goes
  // into form.photoUrl; the old photo (if any) is best-effort deleted.
  // Persistence happens on Save (the 'profile' update action).
  const handlePhotoPick = async (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = ''; // allow re-picking the same file
    if (!file || !modal || modal === 'add') return;
    if (!file.type.startsWith('image/')) { setSaveError('Please choose an image file.'); return; }
    if (fileSizeMB(file) > 10) { setSaveError('Image is too large (max 10MB).'); return; }
    setPhotoBusy(true);
    setPhotoProgress(0);
    setSaveError('');
    try {
      const path = buildImagePath(rid, `staff_${modal.id}_${file.name}`);
      const url = await uploadImage(file, path, setPhotoProgress, undefined, scopedStorage);
      const prev = form.photoUrl;
      setForm(f => ({ ...f, photoUrl: url }));
      // Best-effort cleanup of the previous photo so replaces don't pile up.
      if (prev) {
        const oldPath = extractStoragePath(prev);
        if (oldPath) deleteFile(oldPath, scopedStorage).catch(() => {});
      }
    } catch (err) {
      console.error('photo upload failed:', err);
      setSaveError('Photo upload failed. Try again.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const handlePhotoRemove = () => {
    const prev = form.photoUrl;
    setForm(f => ({ ...f, photoUrl: '' }));
    if (prev) {
      const oldPath = extractStoragePath(prev);
      if (oldPath) deleteFile(oldPath, scopedStorage).catch(() => {});
    }
  };

  // ═══ Reset PIN ═══
  // Surfaces the existing /api/staff/update rotatePin action and shows
  // the new PIN once in the PIN-display modal. Revokes the staffer's
  // sessions server-side so the old PIN stops working immediately.
  const handleResetPin = (s) => {
    setConfirmDialog({
      title: `Reset PIN for ${s.name}?`,
      body: `A new 6-digit PIN is generated and shown once. ${s.name}'s current PIN stops working immediately and they'll need the new one to sign in.`,
      confirmLabel: 'Generate new PIN',
      cancelLabel: 'Cancel',
      onConfirm: async () => {
        setActionId(s.id);
        try {
          const res = await apiCall('/api/staff/update', { action: 'rotatePin', staffId: s.id });
          setPinDisplay({ name: s.name, username: s.username, pin: res.pin });
        } catch (e) {
          setBanner({ kind: 'error', text: e.message || 'Could not reset PIN' });
        }
        setActionId(null);
      },
    });
  };

  // ═══ Save (create or rename/role-change) ═══
  const handleSave = async () => {
    if (!form.name.trim() || !form.username.trim()) return;
    if (modal === 'add' && (!form.pin || form.pin.length !== 6)) {
      setSaveError('PIN must be 6 digits');
      return;
    }

    // Username uniqueness check (case-insensitive, trimmed).
    // When editing, we allow the current staff member's own username to remain.
    const usernameNorm = form.username.trim().toLowerCase();
    const clash = staff.some(s =>
      (s.username || '').toLowerCase() === usernameNorm &&
      (modal === 'add' ? true : s.id !== modal.id)
    );
    if (clash) {
      setSaveError('Username already in use. Pick a different one.');
      return;
    }

    setSaving(true);
    setSaveError('');
    try {
      if (modal === 'add') {
        // /api/staff/create hashes the PIN via bcrypt before writing to Firestore.
        // Response includes the plain PIN once (server echoes what we sent, or
        // a server-generated one if we sent nothing). We show that PIN ONCE in
        // the PIN-display modal so the admin can copy/share it — it's never
        // stored in plaintext and never readable again.
        const res = await apiCall('/api/staff/create', {
          name: form.name.trim(),
          username: usernameNorm,
          pin: form.pin,
          role: form.role,
          roleId: form.roleId || null,
        });
        await reload();
        closeModal();
        // Show PIN once — admin copies it / shares it with staff before closing
        setPinDisplay({
          name: form.name.trim(),
          username: usernameNorm,
          pin: res.pin || form.pin,
        });
      } else {
        // Edit = rename only via the 'rename' action on /api/staff/update.
        // Username changes require delete+recreate because it's the primary
        // identifier and changing it mid-flight would orphan staff sessions.
        // Role changes also need re-creation (custom claims change).
        // For this pass, we only support renaming.
        if (form.username.trim().toLowerCase() !== (modal.username || '').toLowerCase()) {
          setSaveError('Username cannot be changed. Delete and re-create with a new username.');
          setSaving(false);
          return;
        }
        if (form.role !== modal.role) {
          setSaveError('Role cannot be changed. Delete and re-create with the new role.');
          setSaving(false);
          return;
        }
        // Name change syncs the Firebase Auth displayName (rename action);
        // only call it when the name actually changed.
        if (form.name.trim() !== (modal.name || '').trim()) {
          await apiCall('/api/staff/update', {
            action: 'rename',
            staffId: modal.id,
            name: form.name.trim(),
          });
        }
        // Employee-profile fields — always persisted on Save.
        await apiCall('/api/staff/update', {
          action: 'profile',
          staffId: modal.id,
          photoUrl: form.photoUrl || '',
          phone: form.phone.trim(),
          email: form.email.trim(),
          notes: form.notes.trim(),
        });
        await reload();
        closeModal();
        setBanner({ kind: 'success', text: 'Saved' });
      }
    } catch (e) {
      console.error('save failed:', e);
      setSaveError(e.message || 'Failed to save.');
    }
    setSaving(false);
  };

  // ═══ Toggle active (enable / disable) ═══
  // /api/staff/update action:toggleActive also revokes Firebase Auth refresh
  // tokens when disabling — so a deactivated staff member's active tablet
  // loses access immediately, not just on next login.
  const handleToggleActive = async (s) => {
    setActionId(s.id);
    try {
      await apiCall('/api/staff/update', {
        action: 'toggleActive',
        staffId: s.id,
      });
      await reload();
      setBanner({ kind: 'success', text: `${s.name} ${s.isActive === false ? 'enabled' : 'disabled'}` });
    } catch (e) {
      console.error('toggle failed:', e);
      setBanner({ kind: 'error', text: e.message || 'Failed to update' });
    }
    setActionId(null);
  };

  // ═══ Delete staff member ═══
  // /api/staff/update action:delete removes the Firestore doc AND the Firebase
  // Auth user — so the staff's saved session stops working immediately.
  // Uses ConfirmModal (the styled card dialog used elsewhere in the app)
  // instead of the native browser confirm() popup so the prompt feels
  // in-app and visually consistent.
  const handleDelete = (s) => {
    setConfirmDialog({
      title: `Delete ${s.name}?`,
      body: `${s.name} will no longer be able to sign in. Their saved sessions stop working immediately. This cannot be undone.`,
      confirmLabel: 'Yes, delete',
      cancelLabel: 'Keep staff member',
      destructive: true,
      onConfirm: async () => {
        setActionId(s.id);
        try {
          await apiCall('/api/staff/update', {
            action: 'delete',
            staffId: s.id,
          });
          await reload();
          setBanner({ kind: 'success', text: 'Staff member deleted' });
        } catch (e) {
          console.error('delete failed:', e);
          setBanner({ kind: 'error', text: e.message || 'Failed to delete' });
        }
        setActionId(null);
      },
    });
  };

  // ═══ Copy login URL ═══
  const copyLink = () => {
    if (!loginLink) return;
    navigator.clipboard.writeText(loginLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Lock the page scroll while any overlay is open — otherwise the
  // page behind the activity overlay / edit modal scrolls (owner
  // reported this on the modal + activity panel). Restores on close.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const open = !!(modal || activityFor || pinDisplay || qrOpen);
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [modal, activityFor, pinDisplay, qrOpen]);

  return (
    <FeatureShell ready={ready} isAdmin={isAdmin} active="/admin/staff">
      <Head><title>Staff Management — HaloHelm</title></Head>
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font }}>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
          @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
          @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
          .staff-card { transition: box-shadow 0.16s ease, transform 0.16s ease; }
          .staff-card:hover { box-shadow: 0 12px 32px rgba(0,0,0,0.32), 0 0 0 1px rgba(196,168,109,0.55); transform: translateY(-3px); }
          .staff-icon-btn:hover { background: ${A.subtleBg}; }
          .staff-filter-pill:hover:not(.active) { background: ${A.subtleBg}; color: ${A.ink}; }
          .staff-add-btn:hover { filter: brightness(1.08); }
          @media (max-width: 520px) { .staff-form-row-2 { grid-template-columns: 1fr !important; } }
        `}</style>

        {/* ═══ ASPIRE HEADER ═══ */}
        <div style={{ padding: '24px 28px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, gap: 14, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, marginBottom: 6, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>People</span>
                <span style={{ opacity: 0.5 }}>›</span>
                <span style={{ color: A.mutedText }}>Staff Logins</span>
              </div>
              <div style={{ fontWeight: 600, fontSize: 28, color: A.ink, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                {restaurantName} <span style={{ color: A.mutedText, fontWeight: 500 }}>Staff</span>
              </div>
              <div style={{ fontSize: 12, color: A.mutedText, marginTop: 4 }}>
                Manage kitchen and waiter login credentials. PINs are shown once after creation.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button onClick={openAdd} className="staff-add-btn" style={{
                padding: '8px 18px', borderRadius: 10, border: 'none',
                background: A.ink, color: A.cream, fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: A.font,
              }}>
                + Add Staff
              </button>
            </div>
          </div>

          {/* ═══ Restaurant Code banner ═══
              Surfaces the subdomain (== "restaurant code" on /staff/login)
              so admins can read it off and share with new staff. Without
              this, the only places the subdomain appears in admin are the
              settings page URL preview and the QR-code page sidebar — both
              easy to miss when an admin lands on /admin/staff to onboard
              someone. */}
          {subdomain && (
            <div style={{
              background: A.shell, border: A.border, borderRadius: 12,
              padding: '14px 18px', marginBottom: 14,
              display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: A.faintText, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                  Restaurant Code
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: A.ink, letterSpacing: '0.02em' }}>
                    {subdomain}
                  </span>
                  <span style={{ fontSize: 12, color: A.mutedText }}>
                    Share with staff so they can sign in at <strong>{typeof window !== 'undefined' ? window.location.host : 'halohelm.com'}/staff/login</strong>
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  if (typeof navigator === 'undefined' || !navigator.clipboard) return;
                  navigator.clipboard.writeText(subdomain).then(
                    () => toast.success('Copied!'),
                    () => toast.error('Could not copy. Select and copy manually.'),
                  );
                }}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none',
                  background: A.ink, color: A.cream, fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', fontFamily: A.font, letterSpacing: '0.04em',
                }}
              >
                Copy
              </button>
            </div>
          )}

          {/* ═══ TEAM — matte-black signature stats card (LIVE TODAY pattern) ═══
              Structure A card (label row then tile grid) — inner already
              uses .ar-tile-grid-4 so the 4 stats become 2x2 on mobile.
              Removed the .ar-stat-strip class — that's for Structure B
              cards which have label+divider+tiles in a single flex row. */}
          <div style={{
            background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
            borderRadius: 14, padding: '20px 24px', marginBottom: 14,
            border: A.forestBorder,
            boxShadow: '0 4px 16px rgba(38,52,49,0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: A.warning, animation: 'pulse 2s ease infinite', boxShadow: '0 0 8px rgba(196,168,109,0.6)' }} />
              <span style={{ fontFamily: A.font, fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>TEAM</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(234,231,227,0.08)' }} />
              <span style={{ fontFamily: A.font, fontSize: 11, color: A.forestTextMuted, fontWeight: 500 }}>
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
            <div className="ar-tile-grid-4">
              {[
                { label: 'TOTAL',    value: stats.total,    accent: false },
                { label: 'KITCHEN',  value: stats.kitchen,  accent: true  },
                { label: 'WAITERS',  value: stats.waiters,  accent: true  },
                { label: 'INACTIVE', value: stats.inactive, accent: false, danger: stats.inactive > 0 },
              ].map(s => (
                <div key={s.label} style={{
                  padding: '16px 18px', borderRadius: 10,
                  background: A.forestSubtleBg,
                  border: A.forestBorder,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 8 }}>{s.label}</div>
                  <div style={{ fontWeight: 700, fontSize: 28, lineHeight: 1, letterSpacing: '-0.5px',
                    color: s.accent ? A.warning : (s.danger ? A.danger : A.forestText),
                  }}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ═══ Login URL card — plain white card per design choice ═══ */}
          <div style={{
            background: A.shell, borderRadius: 14, padding: '16px 20px', marginBottom: 14,
            border: A.border, boxShadow: A.cardShadow,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: A.warning, boxShadow: '0 0 6px rgba(196,168,109,0.35)' }} />
              <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>STAFF LOGIN URL</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(196,168,109,0.20)' }} />
              <span style={{ fontSize: 11, color: A.mutedText, fontWeight: 500 }}>
                Open this on staff tablets
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{
                flex: 1, minWidth: 260, padding: '10px 14px', borderRadius: 10,
                background: A.shellDarker, border: A.border,
                fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: A.ink,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {loginLink || 'Loading…'}
              </div>
              <button onClick={copyLink} className="staff-icon-btn" style={{
                padding: '8px 16px', borderRadius: 10, border: A.border,
                background: A.shell, color: copied ? A.success : A.ink,
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: A.font,
              }}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
              <button onClick={() => setQrOpen(true)} className="staff-icon-btn" style={{
                padding: '8px 16px', borderRadius: 10, border: A.border,
                background: A.shell, color: A.ink,
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: A.font,
              }}>
                Show QR
              </button>
            </div>
          </div>
        </div>

        {/* ═══ Main content ═══ */}
        <div style={{ padding: '0 28px 40px' }}>
          {/* Banner */}
          {banner && (
            <div style={{
              padding: '10px 14px', marginBottom: 12, borderRadius: 10,
              background: banner.kind === 'success' ? 'rgba(63,158,90,0.10)' : 'rgba(217,83,79,0.10)',
              border: `1px solid ${banner.kind === 'success' ? 'rgba(63,158,90,0.30)' : 'rgba(217,83,79,0.30)'}`,
              color: banner.kind === 'success' ? A.success : A.danger,
              fontSize: 13, fontWeight: 600,
              animation: 'slideDown 0.2s ease',
            }}>
              {banner.kind === 'success' ? '✓ ' : '⚠ '}{banner.text}
            </div>
          )}

          {/* ═══ Filter + search bar (plain card) ═══ */}
          <div style={{
            background: A.shell, border: A.border, borderRadius: 12,
            padding: '10px 14px', marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            boxShadow: A.cardShadow,
          }}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {[
                { key: 'all',      label: 'All',      count: staff.length },
                { key: 'kitchen',  label: 'Kitchen',  count: stats.kitchen },
                { key: 'waiter',   label: 'Waiters',  count: stats.waiters },
                { key: 'inactive', label: 'Inactive', count: stats.inactive },
              ].map(f => {
                const active = filter === f.key;
                return (
                  <button key={f.key} className={`staff-filter-pill ${active ? 'active' : ''}`}
                    onClick={() => setFilter(f.key)}
                    style={{
                      padding: '6px 12px', fontFamily: A.font, fontSize: 12, fontWeight: active ? 700 : 500,
                      background: active ? A.ink : 'transparent', color: active ? A.cream : A.mutedText,
                      border: 'none', borderRadius: 7, cursor: 'pointer', transition: 'all 0.15s',
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}>
                    {f.label}
                    <span style={{
                      padding: '1px 6px', borderRadius: 10,
                      background: active ? 'rgba(237,237,237,0.18)' : A.subtleBg,
                      color: active ? A.cream : A.faintText,
                      fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                    }}>{f.count}</span>
                  </button>
                );
              })}
            </div>
            <span style={{ width: 1, height: 22, background: 'rgba(0,0,0,0.10)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or username…"
              style={{
                flex: 1, minWidth: 180,
                padding: '7px 12px', borderRadius: 8,
                border: A.border, background: A.shellDarker,
                fontSize: 13, fontFamily: A.font, color: A.ink, outline: 'none',
              }}
              onFocus={e => e.target.style.background = A.shell}
              onBlur={e => e.target.style.background = A.shellDarker}
            />
            <span style={{ fontSize: 11, color: A.faintText, fontWeight: 500 }}>
              {filtered.length} of {staff.length}
            </span>
          </div>

          {/* ═══ Staff list ═══ */}
          {loading ? (
            <div style={{
              background: A.shell, borderRadius: 14, border: A.border, padding: '48px',
              textAlign: 'center', boxShadow: A.cardShadow,
            }}>
              <div style={{ width: 30, height: 30, border: `3px solid ${A.warning}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              <div style={{ fontSize: 13, color: A.mutedText, fontWeight: 600 }}>Loading staff…</div>
            </div>
          ) : loadError ? (
            <div style={{
              background: 'rgba(217,83,79,0.06)', border: `1px solid rgba(217,83,79,0.30)`,
              borderRadius: 12, padding: '16px 18px',
              color: A.danger, fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
            }}>
              ⚠ {loadError}
              <button onClick={reload} style={{
                padding: '7px 14px', borderRadius: 8, border: 'none', background: A.danger, color: A.shell,
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: A.font,
              }}>Retry</button>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title={staff.length === 0 ? 'No staff added yet' : 'No matches for this filter'}
              subtitle={staff.length === 0
                ? 'Add kitchen staff and waiters to give them login access on their tablets.'
                : 'Try clearing search or picking a different category.'}
              ctaLabel={staff.length === 0 ? '+ Add staff member' : null}
              onCta={staff.length === 0 ? openAdd : null}
            />
          ) : (
            <div className="staff-grid" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(256px, 1fr))',
              gap: 16,
              // Cards stretch to equal height across the row (default). The
              // photo hero flex-grows to absorb the height difference (the
              // waiter card has an extra Areas row), so every card is the same
              // height with buttons aligned at the bottom — no dead space.
            }}>
              {filtered.map(s => {
                // Unified role model: show the staffer's ONE role name — the
                // custom role's name if assigned, else the built-in station.
                const roleName = s.roleId
                  ? (rolesList.find(r => r.id === s.roleId)?.name || 'Custom role')
                  : (ROLES[s.role]?.label || 'Staff');
                const isInactive = s.isActive === false;
                const busy = actionId === s.id;
                return (
                  // Photo-forward profile card (image-2/3 reference): a
                  // photo hero with name over a gradient scrim, then a dark
                  // controls footer. The hero is the click target → activity
                  // overlay; the footer stops propagation so its controls
                  // don't also fire it.
                  <div key={s.id} className="staff-card"
                    style={{
                      borderRadius: 20, overflow: 'hidden',
                      display: 'flex', flexDirection: 'column',
                      // One continuous dark surface (image-2 reference): the
                      // photo melts into the footer with no seam. The "glass"
                      // is the frosted name bar over the photo + the light rim
                      // + soft float — NOT a lightened footer.
                      background: '#1B1A18',
                      border: '1px solid rgba(255,255,255,0.09)',
                      boxShadow: '0 14px 34px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.06)',
                      // NB: no card-wide opacity here — the inactive "faded"
                      // look is applied only to the photo + name below, so the
                      // controls (Activity, Enable/Edit/Delete) stay full
                      // strength and usable. A child can't be made brighter
                      // than a dimmed parent, hence the per-element approach.
                    }}>
                    {/* ── Photo hero (click target) ── */}
                    <div
                      role="button" tabIndex={0}
                      onClick={() => setActivityFor(s)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActivityFor(s); } }}
                      title="Click to view activity"
                      style={{
                        position: 'relative', flexGrow: 1, flexShrink: 0, minHeight: 240, cursor: 'pointer',
                        background: s.photoUrl ? '#1B1A18' : `linear-gradient(150deg, ${A.forestDarker}, #0d0d0c)`,
                      }}>
                      {s.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: isInactive ? 0.38 : 1, filter: isInactive ? 'grayscale(0.75)' : 'none' }} />
                      ) : (
                        // Monogram fallback — gold initial on matte black
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isInactive ? 0.35 : 1 }}>
                          <span style={{ fontFamily: A.font, fontWeight: 800, fontSize: 60, color: 'rgba(196,168,109,0.5)', letterSpacing: '-1px' }}>
                            {(s.name || '?')[0].toUpperCase()}
                          </span>
                        </div>
                      )}
                      {/* gentle vignette — the frosted info bar below does the
                          heavy lifting for name legibility */}
                      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.08) 42%, rgba(0,0,0,0) 60%)' }} />
                      {/* inactive veil — darkens the whole photo/monogram so an
                          inactive staffer reads as clearly faded. Sits BELOW the
                          chips, Activity hint, and footer (rendered after), so
                          those controls stay crisp and usable. */}
                      {isInactive && <div style={{ position: 'absolute', inset: 0, background: 'rgba(6,6,9,0.5)', pointerEvents: 'none' }} />}
                      {/* role chip (top-left) */}
                      <span style={{
                        position: 'absolute', top: 11, left: 11,
                        padding: '3px 9px', borderRadius: 6,
                        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                        color: A.warning, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
                        border: '1px solid rgba(196,168,109,0.3)',
                      }}>{roleName}</span>
                      {isInactive && (
                        <span style={{
                          position: 'absolute', top: 39, left: 11,
                          padding: '3px 9px', borderRadius: 6,
                          background: 'rgba(217,83,79,0.9)', color: '#fff',
                          fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
                        }}>Inactive</span>
                      )}
                      {/* Activity hint (top-right) */}
                      <span style={{
                        position: 'absolute', top: 11, right: 11,
                        padding: '3px 9px', borderRadius: 6,
                        background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
                        color: A.forestText, fontSize: 10.5, fontWeight: 700,
                      }}>Activity →</span>
                      {/* name + username on a frosted glass info bar (image-2).
                          The gradient bottom is the EXACT card colour (#1B1A18),
                          so it covers the photo's hard bottom edge and melts
                          seamlessly into the footer below. */}
                      <div style={{
                        position: 'absolute', left: 0, right: 0, bottom: 0,
                        padding: '34px 15px 13px',
                        background: 'linear-gradient(to top, #1B1A18 0%, rgba(27,26,24,0.92) 16%, rgba(27,26,24,0.45) 52%, rgba(27,26,24,0) 100%)',
                        backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
                      }}>
                        <div style={{
                          fontWeight: 700, fontSize: 18, color: '#fff', letterSpacing: '-0.3px',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          textShadow: '0 1px 6px rgba(0,0,0,0.7)',
                          opacity: isInactive ? 0.55 : 1,
                        }}>{s.name}</div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'rgba(255,255,255,0.74)', marginTop: 1, opacity: isInactive ? 0.65 : 1 }}>
                          @{s.username}
                        </div>
                      </div>
                    </div>

                    {/* ── Controls footer — continuous with the photo above (top
                        colour matches the info-bar fade, so no seam). Generous
                        top padding gives breathing room between the name and
                        the Role row. ── */}
                    <div onClick={e => e.stopPropagation()} style={{ padding: '26px 14px 14px', display: 'flex', flexDirection: 'column', gap: 10, background: 'linear-gradient(180deg, #1B1A18 0%, #141312 100%)' }}>
                      {/* Phase 0 step 5 — area access control (built-in Waiter
                          role only). Owner-only — a staff manager onboards staff
                          but doesn't reassign floor sections. */}
                      {isAdmin && s.role === 'waiter' && !s.roleId && areas.length > 0 && (() => {
                        const assigned = Array.isArray(s.assignedAreas) ? s.assignedAreas : [];
                        const allAreas = assigned.length === 0;
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: A.forestTextFaint, letterSpacing: '0.04em', textTransform: 'uppercase', marginRight: 2 }}>Areas:</span>
                            {areas.map(a => {
                              const on = allAreas || assigned.includes(a.id);
                              return (
                                <button key={a.id} onClick={() => toggleStaffArea(s, a.id)} disabled={areaSavingId === s.id}
                                  title={allAreas ? 'Currently: all areas. Click to limit to this area.' : (on ? 'Click to remove this area' : 'Click to add this area')}
                                  style={{
                                    padding: '3px 10px', borderRadius: 20, cursor: 'pointer', fontFamily: A.font,
                                    fontSize: 11, fontWeight: 600,
                                    border: `1px solid ${on && !allAreas ? A.warning : 'rgba(255,255,255,0.18)'}`,
                                    background: on && !allAreas ? 'rgba(196,168,109,0.2)' : 'transparent',
                                    color: on && !allAreas ? A.warning : A.forestTextMuted,
                                    opacity: allAreas ? 0.5 : 1,
                                  }}>{a.name}</button>
                              );
                            })}
                            <span style={{ fontSize: 11, color: A.forestTextFaint, marginLeft: 2 }}>
                              {allAreas ? '(all areas)' : `(${assigned.length} selected)`}
                            </span>
                          </div>
                        );
                      })()}

                      {/* Unified role model — the staffer's ONE role. Re-assigning
                          a role is OWNER-ONLY (a staff manager can only set a role
                          at creation, from the non-admin roles you defined). Staff
                          managers see the role on the badge above, read-only. */}
                      {isAdmin && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: A.forestTextFaint, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Role:</span>
                        <select value={s.roleId || s.role} disabled={roleSavingId === s.id}
                          onChange={e => assignRole(s, e.target.value)}
                          style={{ flex: 1, minWidth: 120, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.07)', fontFamily: A.font, fontSize: 12, color: A.forestText, cursor: 'pointer' }}>
                          {/* Native dropdown lists render on a white popup, so the
                              options need dark text — otherwise the cream select
                              color bleeds through and they read as invisible. */}
                          <optgroup label="Station" style={{ color: '#1A1A1A' }}>
                            <option value="kitchen" style={{ color: '#1A1A1A', background: '#fff' }}>Kitchen</option>
                            <option value="waiter" style={{ color: '#1A1A1A', background: '#fff' }}>Waiter</option>
                          </optgroup>
                          {rolesList.length > 0 && (
                            <optgroup label="Custom roles" style={{ color: '#1A1A1A' }}>
                              {rolesList.map(r => <option key={r.id} value={r.id} style={{ color: '#1A1A1A', background: '#fff' }}>{r.name}</option>)}
                            </optgroup>
                          )}
                        </select>
                      </div>
                      )}

                      {/* Actions */}
                      <div className="staff-card-actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button onClick={() => handleToggleActive(s)} disabled={busy} style={{
                          flex: 1, padding: '8px 10px', borderRadius: 8, border: A.forestBorder,
                          background: 'rgba(255,255,255,0.06)',
                          color: isInactive ? '#7BC99A' : A.forestText, fontSize: 12, fontWeight: 600,
                          cursor: busy ? 'not-allowed' : 'pointer', fontFamily: A.font, opacity: busy ? 0.6 : 1,
                        }}>{isInactive ? 'Enable' : 'Disable'}</button>
                        <button onClick={() => openEdit(s)} disabled={busy} style={{
                          flex: 1, padding: '8px 10px', borderRadius: 8, border: A.forestBorder,
                          background: 'rgba(255,255,255,0.06)',
                          color: A.forestText, fontSize: 12, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer',
                          fontFamily: A.font, opacity: busy ? 0.6 : 1,
                        }}>Edit</button>
                        <button onClick={() => handleDelete(s)} disabled={busy} style={{
                          flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(217,83,79,0.35)',
                          background: 'rgba(217,83,79,0.18)', color: '#F0A8A4',
                          fontSize: 12, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer',
                          fontFamily: A.font, opacity: busy ? 0.6 : 1,
                        }}>Delete</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Activity overlay (click a card) ═══
          Image-5 behaviour: dimmed/blurred backdrop with a clickable
          GAP above the panel — tap the gap (or the ✕, or Esc) to close.
          The panel itself stops propagation. */}
      {activityFor && (
        <div
          onClick={() => setActivityFor(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 95,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '52px 16px 16px', overflowY: 'auto',
          }}>
          {/* grab-hint pill sitting in the clickable gap */}
          <div style={{
            position: 'absolute', top: 22, left: '50%', transform: 'translateX(-50%)',
            width: 44, height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.5)',
          }} />
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(1000px, 100%)', background: A.cream,
              borderRadius: 18, boxShadow: '0 24px 70px rgba(0,0,0,0.45)',
              padding: '16px 20px 24px', position: 'relative',
              maxHeight: 'calc(100vh - 72px)', overflowY: 'auto',
            }}>
            {/* Header: name + open-full-page + close */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warningDim }}>Staff activity</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: A.ink, letterSpacing: '-0.3px', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activityFor.name}</div>
              </div>
              <button
                onClick={() => router.push(`/admin/staff-activity/${activityFor.id}`)}
                title="Open as full page"
                style={{
                  padding: '7px 12px', borderRadius: 9, border: A.border, background: A.shell,
                  color: A.mutedText, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: A.font,
                }}>Open full page ↗</button>
              <button
                onClick={() => setActivityFor(null)} aria-label="Close"
                style={{
                  width: 34, height: 34, borderRadius: 9, border: A.border, background: A.shell,
                  color: A.mutedText, fontSize: 16, cursor: 'pointer', flexShrink: 0,
                }}>✕</button>
            </div>
            <StaffActivityPanel rid={rid} scopedDb={scopedDb} staffId={activityFor.id} member={activityFor} embedded />
          </div>
        </div>
      )}

      {/* ═══ Add / Edit Modal ═══ */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100, padding: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)',
        }} onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div style={{
            background: A.shell, borderRadius: 14, padding: '24px',
            width: '100%', maxWidth: 460,
            maxHeight: '92vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            fontFamily: A.font,
          }}>
            {/* Profile-style identity header on edit — photo uploader +
                identity. Makes the modal read as an employee profile. */}
            {modal !== 'add' && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '16px 18px', borderRadius: 12, marginBottom: 16,
                background: `linear-gradient(135deg, ${A.forest}, ${A.forestDarker})`,
                border: A.forestBorder,
              }}>
                {/* Photo (or initial) — click to upload/change */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: '50%', overflow: 'hidden',
                    background: form.photoUrl ? '#000' : `linear-gradient(135deg, ${A.warning}, #C2562B)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 24, fontWeight: 800, color: '#1A1815',
                    border: '2px solid rgba(196,168,109,0.4)',
                  }}>
                    {form.photoUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={form.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : (form.name || '?')[0].toUpperCase()}
                  </div>
                  {photoBusy && (
                    <div style={{
                      position: 'absolute', inset: 0, borderRadius: '50%',
                      background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: A.warning,
                    }}>{photoProgress}%</div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: A.forestText, letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {form.name || 'Staff member'}
                  </div>
                  <div style={{ fontSize: 12, color: A.forestTextMuted, marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
                    @{form.username}
                  </div>
                  {/* Photo controls */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoPick} style={{ display: 'none' }} />
                    <button type="button" disabled={photoBusy} onClick={() => photoInputRef.current?.click()} style={{
                      padding: '5px 12px', borderRadius: 7, border: A.forestBorder,
                      background: 'rgba(255,255,255,0.06)', color: A.forestText,
                      fontSize: 11.5, fontWeight: 700, cursor: photoBusy ? 'wait' : 'pointer', fontFamily: A.font,
                    }}>{photoBusy ? 'Uploading…' : (form.photoUrl ? 'Change photo' : 'Upload photo')}</button>
                    {form.photoUrl && !photoBusy && (
                      <button type="button" onClick={handlePhotoRemove} style={{
                        padding: '5px 12px', borderRadius: 7, border: A.forestBorder,
                        background: 'transparent', color: A.forestTextMuted,
                        fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: A.font,
                      }}>Remove</button>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div style={{ fontSize: 16, fontWeight: 700, color: A.ink, marginBottom: 4, letterSpacing: '-0.2px' }}>
              {modal === 'add' ? 'Add Staff Member' : 'Edit Staff Member'}
            </div>
            <div style={{ fontSize: 12, color: A.mutedText, marginBottom: 18 }}>
              {modal === 'add'
                ? 'PIN is shown once after creation — make sure to share it with the staff member before closing.'
                : 'PIN cannot be changed. To reset a staff member\u2019s PIN, delete this account and create a new one.'}
            </div>

            {/* Unified role picker — ONE role per staffer: a built-in station
                role (Kitchen / Waiter) OR a custom role (the features ticked on
                the Roles page). Read-only when editing — change it from the
                card's Role dropdown so claims re-mint on next sign-in. */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: A.warningDim, letterSpacing: '0.10em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Role</label>
              <select
                value={form.roleId || form.role}
                disabled={modal !== 'add'}
                onChange={e => {
                  const v = e.target.value;
                  const isBuiltin = v === 'kitchen' || v === 'waiter';
                  setForm(f => ({ ...f, role: isBuiltin ? v : 'staff', roleId: isBuiltin ? '' : v }));
                }}
                style={{ ...inputStyle, cursor: modal !== 'add' ? 'not-allowed' : 'pointer', ...(modal !== 'add' ? { background: A.subtleBg, color: A.mutedText } : {}) }}>
                <optgroup label="Station roles">
                  <option value="kitchen">Kitchen — Kitchen Display screen</option>
                  <option value="waiter">Waiter — Waiter Dashboard</option>
                </optgroup>
                {(() => {
                  // A staff manager (non-owner) can only assign roles that don't
                  // grant admin-tier perms — mirrors the server guard in
                  // /api/staff/create. The owner sees every role.
                  const roles = isAdmin
                    ? rolesList
                    : rolesList.filter(r => !(Array.isArray(r.permissions) ? r.permissions : []).some(p => ADMIN_TIER_PERMS.includes(p)));
                  return roles.length > 0 ? (
                    <optgroup label="Custom roles">
                      {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </optgroup>
                  ) : null;
                })()}
              </select>
              <div style={{ fontSize: 11, color: A.faintText, marginTop: 6 }}>
                {modal === 'add'
                  ? 'Kitchen & Waiter open their station screens. Custom roles (made on the Roles page) grant the features you ticked there.'
                  : 'To change role, use the Role dropdown on the staff card.'}
              </div>
            </div>

            {/* Name */}
            <FormField label="Name">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Ravi Kumar"
                style={inputStyle} />
            </FormField>

            {/* Username — read-only when editing because changing it would orphan the staff's Firebase Auth session */}
            <FormField label="Username">
              <input value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase() }))}
                placeholder="e.g. kitchen1"
                readOnly={modal !== 'add'}
                style={{
                  ...inputStyle,
                  fontFamily: "'JetBrains Mono', monospace",
                  ...(modal !== 'add' ? { background: A.subtleBg, cursor: 'not-allowed', color: A.mutedText } : {}),
                }} />
              <div style={{ fontSize: 11, color: A.faintText, marginTop: 4 }}>
                {modal === 'add'
                  ? 'Lowercase letters, numbers, and underscores only.'
                  : 'Username cannot be changed. Delete and re-create to assign a new one.'}
              </div>
            </FormField>

            {/* Employee-profile fields — edit only (need an existing
                staffId to persist via the 'profile' update action). */}
            {modal !== 'add' && (
              <>
                <div className="staff-form-row-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <FormField label="Phone">
                    <input value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/[^\d+\-\s]/g, '').slice(0, 20) }))}
                      placeholder="e.g. 98765 43210" inputMode="tel"
                      style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }} />
                  </FormField>
                  <FormField label="Email">
                    <input value={form.email} type="email"
                      onChange={e => setForm(f => ({ ...f, email: e.target.value.slice(0, 120) }))}
                      placeholder="optional"
                      style={inputStyle} />
                  </FormField>
                </div>
                <FormField label="Notes">
                  <textarea value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value.slice(0, 500) }))}
                    placeholder="e.g. weekends only · speaks Tamil + Hindi · joined Jan 2026"
                    rows={2}
                    style={{ ...inputStyle, resize: 'vertical', minHeight: 56, lineHeight: 1.5 }} />
                </FormField>

                {/* Reset PIN — surfaces the rotatePin action; shows the new
                    PIN once. Replaces the old "delete & recreate to reset". */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  padding: '12px 14px', borderRadius: 10, marginBottom: 14,
                  background: A.subtleBg, border: A.border,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: A.ink }}>PIN</div>
                    <div style={{ fontSize: 11, color: A.faintText, marginTop: 1 }}>Hidden for security. Reset to generate a new one.</div>
                  </div>
                  <button type="button" onClick={() => handleResetPin(modal)} style={{
                    padding: '8px 14px', borderRadius: 8, border: A.border, background: A.shell,
                    color: A.warningDim, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: A.font, flexShrink: 0,
                  }}>Reset PIN</button>
                </div>
              </>
            )}

            {/* PIN (only on add — not on edit, since rotate is a separate action) */}
            {modal === 'add' && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: A.warningDim, letterSpacing: '0.10em', textTransform: 'uppercase' }}>PIN</label>
                  <button type="button" onClick={() => setForm(f => ({ ...f, pin: randomPin() }))} style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    fontSize: 11, fontWeight: 700, color: A.warning, fontFamily: A.font,
                  }}>Generate random</button>
                </div>
                <input value={form.pin}
                  onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                  placeholder="6 digits" inputMode="numeric"
                  style={{
                    ...inputStyle, fontSize: 20, letterSpacing: '0.3em',
                    fontFamily: "'JetBrains Mono', monospace",
                  }} />
              </div>
            )}

            {saveError && (
              <div style={{
                padding: '10px 14px', borderRadius: 8, marginBottom: 14,
                background: 'rgba(217,83,79,0.10)', border: '1px solid rgba(217,83,79,0.30)',
                color: A.danger, fontSize: 13, fontWeight: 600,
              }}>
                ⚠ {saveError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={closeModal} style={{
                flex: 1, padding: '11px', borderRadius: 10, border: A.border, background: A.shell,
                color: A.mutedText, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: A.font,
              }}>Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.name || !form.username || (modal === 'add' && !form.pin)} style={{
                flex: 2, padding: '11px', borderRadius: 10, border: 'none',
                background: A.ink, color: A.cream, fontWeight: 700, fontSize: 13,
                cursor: saving ? 'not-allowed' : 'pointer', fontFamily: A.font,
                opacity: (saving || !form.name || !form.username || (modal === 'add' && !form.pin)) ? 0.5 : 1,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                {saving && <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />}
                {saving ? 'Saving…' : modal === 'add' ? 'Create Staff Member' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Show-PIN-once modal (fancy) ═══ */}
      {pinDisplay && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 101, padding: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)',
        }}>
          <div style={{
            background: A.shell, borderRadius: 14, padding: '28px 24px',
            width: '100%', maxWidth: 400,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            fontFamily: A.font, textAlign: 'center',
            border: `2px solid ${A.warning}`,
            animation: 'fadeUp 0.25s ease',
          }}>
            <div style={{
              display: 'inline-block', padding: '3px 10px', borderRadius: 4,
              background: A.warning, color: A.shell,
              fontSize: 10, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase',
              marginBottom: 14,
            }}>
              SHOWN ONLY ONCE
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: A.ink, marginBottom: 4 }}>
              PIN for {pinDisplay.name}
            </div>
            <div style={{ fontSize: 12, color: A.mutedText, marginBottom: 18 }}>
              Username: <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: A.ink }}>{pinDisplay.username}</span>
            </div>

            <div style={{
              padding: '22px 18px', borderRadius: 12,
              background: `linear-gradient(135deg, ${A.forest}, ${A.forestDarker})`,
              border: A.forestBorder,
              marginBottom: 16,
            }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 40, fontWeight: 800,
                color: A.warning, letterSpacing: '0.5em', paddingLeft: '0.5em',
              }}>
                {pinDisplay.pin}
              </div>
            </div>

            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: 'rgba(196,168,109,0.10)', border: '1px solid rgba(196,168,109,0.30)',
              fontSize: 12, color: A.warningDim, lineHeight: 1.5, marginBottom: 16, textAlign: 'left',
            }}>
              <b>Important:</b> This PIN will not be shown again. Copy it or share it with {pinDisplay.name} now. Losing it means rotating the PIN.
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { navigator.clipboard.writeText(pinDisplay.pin); }} style={{
                flex: 1, padding: '11px', borderRadius: 10, border: A.border, background: A.shell,
                color: A.ink, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: A.font,
              }}>Copy PIN</button>
              <button onClick={() => setPinDisplay(null)} style={{
                flex: 1, padding: '11px', borderRadius: 10, border: 'none',
                background: A.ink, color: A.cream, fontWeight: 700, fontSize: 13,
                cursor: 'pointer', fontFamily: A.font,
              }}>I've saved it</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ QR code modal ═══ */}
      {qrOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100, padding: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)',
        }} onClick={e => { if (e.target === e.currentTarget) setQrOpen(false); }}>
          <div style={{
            background: A.shell, borderRadius: 14, padding: '28px 24px',
            width: '100%', maxWidth: 360,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            fontFamily: A.font, textAlign: 'center',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: A.ink, marginBottom: 4 }}>
              Scan to open staff login
            </div>
            <div style={{ fontSize: 12, color: A.mutedText, marginBottom: 20 }}>
              Aim the staff tablet camera at this code.
            </div>
            <div style={{
              padding: 10, borderRadius: 10, border: A.border, background: A.shellDarker,
              display: 'inline-block', marginBottom: 16,
            }}>
              {qrSrc ? <img src={qrSrc} alt="Staff login QR" style={{ display: 'block', width: 280, height: 280 }} /> : null}
            </div>
            <div style={{
              padding: '8px 12px', borderRadius: 6, background: A.shellDarker,
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: A.ink,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              marginBottom: 14,
            }}>{loginLink}</div>
            <button onClick={() => setQrOpen(false)} style={{
              width: '100%', padding: '11px', borderRadius: 10, border: 'none',
              background: A.ink, color: A.cream, fontWeight: 700, fontSize: 13,
              cursor: 'pointer', fontFamily: A.font,
            }}>Close</button>
          </div>
        </div>
      )}

      {/* Card-style confirmation dialog (replaces native confirm()
          for delete prompts — matches /admin/orders + /admin/items). */}
      <ConfirmModal
        open={!!confirmDialog}
        {...(confirmDialog || {})}
        onCancel={() => setConfirmDialog(null)}
      />
    </FeatureShell>
  );
}

// ═══ Reusable atom: form field label + input wrapper ═══
function FormField({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#A08656', display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

// ═══ Shared input style ═══
const inputStyle = {
  width: '100%', padding: '11px 14px', borderRadius: 10,
  border: '1px solid rgba(0,0,0,0.08)', background: '#F8F8F8',
  fontSize: 14, color: '#1A1A1A', outline: 'none', boxSizing: 'border-box',
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
};
