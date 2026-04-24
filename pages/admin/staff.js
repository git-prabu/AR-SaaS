import Head from 'next/head';
import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getStaffMembers } from '../../lib/db';
import { auth } from '../../lib/firebase';

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
function RoleIcon({ role, size = 44 }) {
  const isKitchen = role === 'kitchen';
  const iconSize = Math.round(size * 0.5);
  return (
    <div style={{
      width: size, height: size, borderRadius: 10,
      background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
      border: A.forestBorder,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      {isKitchen ? (
        // Knife + fork
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={A.warning} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2v7a2 2 0 0 0 2 2v11" />
          <path d="M10 2v7" />
          <path d="M6 2v7" />
          <path d="M18 2c-1.5 0-3 1-3 3v6c0 1 .5 2 2 2v9" />
        </svg>
      ) : (
        // Bell (hospitality call bell)
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={A.warning} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      )}
    </div>
  );
}

// ═══ Random 4-digit PIN generator ═══
function randomPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
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
const emptyForm = { name: '', username: '', pin: '', role: 'kitchen' };

// ═══ Helper: get admin ID token for API calls ═══
// All mutation endpoints (/api/staff/create, /api/staff/update) require
// the restaurant owner's Firebase ID token as a Bearer header. The server
// verifies the token and looks up users/{uid} to confirm they're a
// restaurant admin — that gate (in lib/staffAuth.js requireAdminAuth)
// is what stops a non-owner from hitting these endpoints.
async function authHeaders() {
  const currentUser = auth.currentUser;
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
  const { userData } = useAuth();
  const rid = userData?.restaurantId;
  const restaurantName = userData?.restaurantName || 'Your Restaurant';

  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Modal state — add/edit form
  const [modal, setModal] = useState(null); // null | 'add' | staffObj
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  // After a successful create / rotate, we show the PIN ONCE here
  const [pinDisplay, setPinDisplay] = useState(null); // { name, username, pin } | null

  // QR modal
  const [qrOpen, setQrOpen] = useState(false);

  // Filter + search
  const [filter, setFilter] = useState('all'); // 'all' | 'kitchen' | 'waiter' | 'inactive'
  const [search, setSearch] = useState('');

  // Per-row action state
  const [actionId, setActionId] = useState(null);
  const [banner, setBanner] = useState(null); // { kind: 'success'|'error', text: '…' }

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
    if (!rid) return;
    setLoading(true);
    setLoadError('');
    try {
      const list = await getStaffMembers(rid);
      setStaff(list);
    } catch (e) {
      console.error('getStaffMembers error:', e);
      setLoadError('Failed to load staff. Check your Firestore rules.');
    }
    setLoading(false);
  };
  useEffect(() => { reload(); }, [rid]);

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
    const kitchen = staff.filter(s => s.role === 'kitchen' && s.isActive !== false).length;
    const waiters = staff.filter(s => s.role === 'waiter' && s.isActive !== false).length;
    const inactive = staff.filter(s => s.isActive === false).length;
    return { total, kitchen, waiters, inactive };
  }, [staff]);

  // ═══ Filtered list ═══
  const filtered = useMemo(() => {
    let result = staff;
    if (filter === 'kitchen')       result = result.filter(s => s.role === 'kitchen' && s.isActive !== false);
    else if (filter === 'waiter')   result = result.filter(s => s.role === 'waiter' && s.isActive !== false);
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
    setForm({ name: s.name || '', username: s.username || '', pin: '', role: s.role || 'kitchen' });
    setSaveError('');
    setModal(s);
  };
  const closeModal = () => {
    setModal(null);
    setSaveError('');
    setForm(emptyForm);
  };

  // ═══ Save (create or rename/role-change) ═══
  const handleSave = async () => {
    if (!form.name.trim() || !form.username.trim()) return;
    if (modal === 'add' && (!form.pin || form.pin.length < 4)) {
      setSaveError('PIN must be 4-6 digits');
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
        await apiCall('/api/staff/update', {
          action: 'rename',
          staffId: modal.id,
          name: form.name.trim(),
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
  const handleDelete = async (s) => {
    if (!confirm(`Permanently delete ${s.name}? They will no longer be able to log in. This cannot be undone.`)) return;
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
  };

  // ═══ Copy login URL ═══
  const copyLink = () => {
    if (!loginLink) return;
    navigator.clipboard.writeText(loginLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <AdminLayout>
      <Head><title>Staff Management — Advert Radical</title></Head>
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font }}>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
          @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
          @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
          .staff-card { transition: box-shadow 0.12s ease, transform 0.12s ease; }
          .staff-card:hover { box-shadow: 0 4px 18px rgba(38,52,49,0.06); transform: translateY(-1px); }
          .staff-icon-btn:hover { background: ${A.subtleBg}; }
          .staff-filter-pill:hover:not(.active) { background: ${A.subtleBg}; color: ${A.ink}; }
          .staff-add-btn:hover { filter: brightness(1.08); }
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

          {/* ═══ TEAM — matte-black signature stats card (LIVE TODAY pattern) ═══ */}
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
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
            <div style={{
              background: A.shell, borderRadius: 14, border: A.border, padding: '56px 32px',
              textAlign: 'center', boxShadow: A.cardShadow,
            }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: A.ink, marginBottom: 6 }}>
                {staff.length === 0 ? 'No staff added yet' : 'No matches for this filter'}
              </div>
              <div style={{ fontSize: 13, color: A.mutedText, maxWidth: 380, margin: '0 auto', lineHeight: 1.5 }}>
                {staff.length === 0
                  ? 'Add kitchen staff and waiters to give them login access on their tablets.'
                  : 'Try clearing search or picking a different category.'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map(s => {
                const role = ROLES[s.role] || ROLES.kitchen;
                const isInactive = s.isActive === false;
                const busy = actionId === s.id;
                return (
                  <div key={s.id} className="staff-card" style={{
                    background: A.shell, border: A.border, borderRadius: 12,
                    padding: '16px 18px',
                    display: 'flex', alignItems: 'center', gap: 14,
                    boxShadow: A.cardShadow,
                    opacity: isInactive ? 0.65 : 1,
                  }}>
                    {/* Role avatar — matte-black square with gold icon glyph */}
                    <RoleIcon role={s.role} />

                    {/* Name + role + username */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: A.ink, letterSpacing: '-0.2px' }}>
                          {s.name}
                        </span>
                        <span style={{
                          padding: '2px 8px', borderRadius: 4,
                          background: A.subtleBg, color: A.mutedText,
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                        }}>{role.label}</span>
                        {isInactive && (
                          <span style={{
                            padding: '2px 8px', borderRadius: 4,
                            background: A.subtleBg, color: A.faintText,
                            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                          }}>Inactive</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: A.mutedText, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <span>Username: <span style={{ fontFamily: "'JetBrains Mono', monospace", color: A.ink, fontWeight: 600 }}>{s.username}</span></span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button onClick={() => handleToggleActive(s)} disabled={busy} className="staff-icon-btn" style={{
                        padding: '7px 12px', borderRadius: 8, border: A.border, background: A.shell,
                        color: isInactive ? A.success : A.ink, fontSize: 12, fontWeight: 600,
                        cursor: busy ? 'not-allowed' : 'pointer', fontFamily: A.font, opacity: busy ? 0.6 : 1,
                      }}>{isInactive ? 'Enable' : 'Disable'}</button>
                      <button onClick={() => openEdit(s)} disabled={busy} className="staff-icon-btn" style={{
                        padding: '7px 12px', borderRadius: 8, border: A.border, background: A.shell,
                        color: A.ink, fontSize: 12, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer',
                        fontFamily: A.font, opacity: busy ? 0.6 : 1,
                      }}>Edit</button>
                      <button onClick={() => handleDelete(s)} disabled={busy} style={{
                        padding: '7px 12px', borderRadius: 8, border: 'none',
                        background: 'rgba(217,83,79,0.08)', color: A.danger,
                        fontSize: 12, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer',
                        fontFamily: A.font, opacity: busy ? 0.6 : 1,
                      }}>Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Add / Edit Modal ═══ */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100, padding: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)',
        }} onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div style={{
            background: A.shell, borderRadius: 14, padding: '24px',
            width: '100%', maxWidth: 440,
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            fontFamily: A.font,
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: A.ink, marginBottom: 4, letterSpacing: '-0.2px' }}>
              {modal === 'add' ? 'Add Staff Member' : 'Edit Staff Member'}
            </div>
            <div style={{ fontSize: 12, color: A.mutedText, marginBottom: 18 }}>
              {modal === 'add'
                ? 'PIN is shown once after creation — make sure to share it with the staff member before closing.'
                : 'PIN cannot be changed. To reset a staff member\u2019s PIN, delete this account and create a new one.'}
            </div>

            {/* Role picker — card-style selector with matte-black icon, gold accent on active.
                Disabled when editing because role changes need new Firebase custom claims —
                we route users to delete+recreate for a clean state. */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: A.warningDim, letterSpacing: '0.10em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Role</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {Object.entries(ROLES).map(([val, r]) => {
                  const active = form.role === val;
                  const editing = modal !== 'add';
                  return (
                    <button key={val} type="button"
                      onClick={() => { if (!editing) setForm(f => ({ ...f, role: val })); }}
                      disabled={editing && !active}
                      style={{
                        padding: '14px 12px', borderRadius: 10,
                        cursor: editing ? (active ? 'default' : 'not-allowed') : 'pointer',
                        textAlign: 'left',
                        border: `2px solid ${active ? A.warning : 'rgba(0,0,0,0.08)'}`,
                        background: active
                          ? 'rgba(196,168,109,0.06)'
                          : (editing ? A.subtleBg : A.shell),
                        opacity: editing && !active ? 0.5 : 1,
                        fontFamily: A.font, transition: 'all 0.15s',
                        display: 'flex', alignItems: 'center', gap: 12,
                      }}>
                      <RoleIcon role={val} size={36} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: A.ink }}>{r.label}</div>
                        <div style={{ fontSize: 11, color: A.mutedText, marginTop: 2 }}>{r.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {modal !== 'add' && (
                <div style={{ fontSize: 11, color: A.faintText, marginTop: 6 }}>
                  Role cannot be changed. Delete and re-create to assign a different role.
                </div>
              )}
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
                  placeholder="4-6 digits" inputMode="numeric"
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
    </AdminLayout>
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
