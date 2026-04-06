import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getStaffMembers, createStaffMember, updateStaffMember, deleteStaffMember } from '../../lib/db';
import { T, ADMIN_STYLES } from '../../lib/utils';

const ROLES = [
  { value: 'kitchen', label: 'Kitchen Staff', icon: 'KDS', color: T.danger, desc: 'Access to Kitchen Display' },
  { value: 'waiter',  label: 'Waiter',         icon: 'WTR', color: '#5A8A9A', desc: 'Access to Waiter Dashboard' },
];

function randomPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

const empty = { name: '', username: '', pin: '', role: 'kitchen', isActive: true };

export default function StaffManagement() {
  const { userData } = useAuth();
  const rid = userData?.restaurantId;

  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [modal, setModal] = useState(null); // null | 'add' | staffObj
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showPins, setShowPins] = useState({});

  const loginLink = typeof window !== 'undefined' && rid
    ? `${window.location.origin}/staff/login?rid=${rid}`
    : '';

  useEffect(() => {
    if (!rid) return;
    setLoading(true);
    setLoadError('');
    getStaffMembers(rid)
      .then(s => { setStaff(s); setLoading(false); })
      .catch(e => { console.error('getStaffMembers error:', e); setLoadError('Failed to load staff. Check Firestore rules for the staff collection.'); setLoading(false); });
  }, [rid]);

  const openAdd = () => { setForm({ ...empty, pin: randomPin() }); setModal('add'); };
  const openEdit = (s) => { setForm({ name: s.name, username: s.username, pin: s.pin, role: s.role, isActive: s.isActive ?? true }); setModal(s); };

  const handleSave = async () => {
    if (!form.name.trim() || !form.username.trim() || !form.pin.trim()) return;
    setSaving(true);
    setSaveError('');
    try {
      if (modal === 'add') {
        await createStaffMember(rid, { ...form, username: form.username.trim().toLowerCase() });
        const updated = await getStaffMembers(rid);
        setStaff(updated);
      } else {
        await updateStaffMember(rid, modal.id, { ...form, username: form.username.trim().toLowerCase() });
        setStaff(s => s.map(x => x.id === modal.id ? { ...x, ...form } : x));
      }
      setModal(null);
    } catch (e) {
      console.error('handleSave error:', e);
      setSaveError('Failed to save. ' + (e?.message || 'Check your connection and try again.'));
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this staff member?')) return;
    setDeleting(id);
    try {
      await deleteStaffMember(rid, id);
      setStaff(s => s.filter(x => x.id !== id));
    } catch {}
    setDeleting(null);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(loginLink).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const togglePin = (id) => setShowPins(p => ({ ...p, [id]: !p[id] }));

  return (
    <AdminLayout>
      <Head><title>Staff Management | Advert Radical</title></Head>

      <div style={{ padding: '28px 32px', maxWidth: 960, paddingBottom: 60 }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: T.fontDisplay, fontWeight: 800, fontSize: 22, color: T.ink }}>Staff Management</div>
          <div style={{ fontFamily: T.font, fontSize: 13, color: 'rgba(38,52,49,0.45)', marginTop: 4 }}>Create login credentials for kitchen staff and waiters</div>
        </div>

        {/* Login Link Card */}
        <div style={{ background: 'linear-gradient(135deg,rgba(196,168,109,0.08),rgba(196,168,109,0.04))', border: '1.5px solid rgba(196,168,109,0.25)', borderRadius: T.radiusCard, padding: '20px 22px', marginBottom: 28 }}>
          <div style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 14, color: T.ink, marginBottom: 6 }}>
            Staff Login Link
          </div>
          <div style={{ fontFamily: T.font, fontSize: 13, color: 'rgba(38,52,49,0.55)', marginBottom: 14, lineHeight: 1.6 }}>
            Share this link with your staff. They open it on their device (kitchen tablet, waiter phone) and log in with their username and PIN.
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{
              flex: 1, minWidth: 0, padding: '10px 14px', borderRadius: T.radiusBtn,
              background: 'rgba(38,52,49,0.05)', border: `1px solid rgba(38,52,49,0.1)`,
              fontSize: 13, color: T.ink, fontFamily: 'monospace',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {loginLink}
            </div>
            <button onClick={copyLink} style={{
              padding: '10px 18px', borderRadius: T.radiusBtn, border: 'none', cursor: 'pointer',
              background: copied ? T.success : T.accent, color: T.shellText,
              fontFamily: T.font, fontWeight: 700, fontSize: 13, flexShrink: 0, transition: 'background 0.2s',
            }}>
              {copied ? '✓ Copied' : 'Copy Link'}
            </button>
          </div>
        </div>

        {/* Staff List */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 16, color: T.ink }}>
            Staff Members ({staff.length})
          </div>
          <button onClick={openAdd} style={{
            padding: '9px 20px', borderRadius: T.radiusBtn, border: 'none', cursor: 'pointer',
            background: T.accent, color: T.shellText, fontFamily: T.font, fontWeight: 700, fontSize: 13,
          }}>
            + Add Staff
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, fontFamily: T.font, color: 'rgba(38,52,49,0.4)' }}>Loading staff…</div>
        ) : loadError ? (
          <div style={{ padding: '16px 18px', borderRadius: 12, background: 'rgba(138,74,66,0.08)', border: '1px solid rgba(138,74,66,0.2)', color: T.danger, fontFamily: T.font, fontSize: 13 }}>
            {loadError}
          </div>
        ) : staff.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', background: 'rgba(38,52,49,0.03)', borderRadius: T.radiusCard, border: '1px dashed rgba(38,52,49,0.12)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
            <div style={{ fontFamily: T.font, fontWeight: 700, color: 'rgba(38,52,49,0.5)' }}>No staff added yet</div>
            <div style={{ fontFamily: T.font, fontSize: 13, color: 'rgba(38,52,49,0.35)', marginTop: 4 }}>Add kitchen staff and waiters to give them login access.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {staff.map(s => {
              const roleMeta = ROLES.find(r => r.value === s.role) || ROLES[0];
              return (
                <div key={s.id} style={{
                  background: T.white, border: `1px solid ${T.sand}`, borderRadius: T.radiusCard,
                  padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14,
                  boxShadow: T.shadowCard,
                }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: roleMeta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: '#fff', flexShrink: 0, letterSpacing: '0.02em' }}>{roleMeta.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <div style={{ fontFamily: T.font, fontWeight: 700, fontSize: 15, color: T.ink }}>{s.name}</div>
                      <div style={{ padding: '2px 10px', borderRadius: 20, background: s.role === 'kitchen' ? 'rgba(138,74,66,0.08)' : 'rgba(90,138,154,0.08)', color: s.role === 'kitchen' ? T.danger : '#5A8A9A', fontFamily: T.font, fontSize: 11, fontWeight: 700 }}>
                        {roleMeta.label}
                      </div>
                      {!s.isActive && (
                        <div style={{ padding: '2px 10px', borderRadius: 20, background: 'rgba(38,52,49,0.06)', color: 'rgba(38,52,49,0.4)', fontFamily: T.font, fontSize: 11, fontWeight: 700 }}>
                          Inactive
                        </div>
                      )}
                    </div>
                    <div style={{ fontFamily: T.font, fontSize: 13, color: 'rgba(38,52,49,0.5)' }}>
                      Username: <span style={{ fontWeight: 600, color: T.ink }}>{s.username}</span>
                      <span style={{ margin: '0 8px', color: 'rgba(38,52,49,0.2)' }}>·</span>
                      PIN: <span style={{ fontWeight: 600, color: T.ink, fontFamily: 'monospace', fontSize: 14 }}>
                        {showPins[s.id] ? s.pin : '••••'}
                      </span>
                      <button onClick={() => togglePin(s.id)} style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.font, fontSize: 12, color: 'rgba(38,52,49,0.4)', padding: 0 }}>
                        {showPins[s.id] ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => openEdit(s)} style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${T.sand}`, background: T.white, color: T.ink, fontFamily: T.font, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                      Edit
                    </button>
                    <button onClick={() => handleDelete(s.id)} disabled={deleting === s.id} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'rgba(138,74,66,0.08)', color: T.danger, fontFamily: T.font, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                      {deleting === s.id ? '…' : 'Delete'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div style={{ background: T.white, borderRadius: 20, padding: '28px 26px', width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ fontFamily: T.fontDisplay, fontWeight: 800, fontSize: 18, color: T.ink, marginBottom: 20 }}>
              {modal === 'add' ? 'Add Staff Member' : 'Edit Staff Member'}
            </div>

            {/* Role picker */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontFamily: T.font, fontSize: 12, fontWeight: 600, color: 'rgba(38,52,49,0.5)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Role</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {ROLES.map(r => (
                  <button key={r.value} onClick={() => setForm(f => ({ ...f, role: r.value }))} style={{
                    padding: '14px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    border: `2px solid ${form.role === r.value ? r.color : 'rgba(38,52,49,0.1)'}`,
                    background: form.role === r.value ? `${r.color}10` : 'transparent',
                  }}>
                    <div style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 8, background: r.color, color: '#fff', fontWeight: 800, fontSize: 11, marginBottom: 8, letterSpacing: '0.04em' }}>{r.icon}</div>
                    <div style={{ fontFamily: T.font, fontWeight: 700, fontSize: 13, color: T.ink }}>{r.label}</div>
                    <div style={{ fontFamily: T.font, fontSize: 11, color: 'rgba(38,52,49,0.45)', marginTop: 2 }}>{r.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Name */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontFamily: T.font, fontSize: 12, fontWeight: 600, color: 'rgba(38,52,49,0.5)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Ravi Kumar"
                style={{ width: '100%', padding: '11px 14px', borderRadius: T.radiusBtn, border: `1px solid ${T.sand}`, background: T.cream, fontSize: 14, fontFamily: T.font, color: T.ink, outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* Username */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontFamily: T.font, fontSize: 12, fontWeight: 600, color: 'rgba(38,52,49,0.5)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Username</label>
              <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value.replace(/\s/g, '') }))} placeholder="e.g. kitchen1"
                style={{ width: '100%', padding: '11px 14px', borderRadius: T.radiusBtn, border: `1px solid ${T.sand}`, background: T.cream, fontSize: 14, fontFamily: 'monospace', color: T.ink, outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* PIN */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontFamily: T.font, fontSize: 12, fontWeight: 600, color: 'rgba(38,52,49,0.5)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>PIN</label>
                <button onClick={() => setForm(f => ({ ...f, pin: randomPin() }))} style={{ fontFamily: T.font, fontSize: 11, color: T.warning, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  Generate Random
                </button>
              </div>
              <input value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 6) }))} placeholder="4-6 digits" inputMode="numeric"
                style={{ width: '100%', padding: '11px 14px', borderRadius: T.radiusBtn, border: `1px solid ${T.sand}`, background: T.cream, fontSize: 20, color: T.ink, outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace', letterSpacing: '0.3em' }} />
            </div>

            {/* Active toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, padding: '12px 14px', borderRadius: T.radiusBtn, background: 'rgba(38,52,49,0.03)', border: '1px solid rgba(38,52,49,0.08)' }}>
              <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} id="activeToggle" style={{ width: 16, height: 16, cursor: 'pointer' }} />
              <label htmlFor="activeToggle" style={{ fontFamily: T.font, fontSize: 14, fontWeight: 600, color: T.ink, cursor: 'pointer' }}>Active (can log in)</label>
            </div>

            {saveError && (
              <div style={{ padding: '10px 14px', borderRadius: T.radiusBtn, background: 'rgba(138,74,66,0.08)', border: '1px solid rgba(138,74,66,0.2)', color: T.danger, fontFamily: T.font, fontSize: 13, marginBottom: 14 }}>
                {saveError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setModal(null); setSaveError(''); }} style={{ flex: 1, padding: '12px', borderRadius: T.radiusBtn, border: `1px solid ${T.sand}`, background: T.white, color: T.ink, fontFamily: T.font, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving || !form.name || !form.username || !form.pin} style={{
                flex: 2, padding: '12px', borderRadius: T.radiusBtn, border: 'none', cursor: 'pointer',
                background: T.accent, color: T.shellText, fontFamily: T.font, fontWeight: 700, fontSize: 14,
                opacity: (!form.name || !form.username || !form.pin) ? 0.5 : 1,
              }}>
                {saving ? 'Saving…' : modal === 'add' ? 'Add Staff Member' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
