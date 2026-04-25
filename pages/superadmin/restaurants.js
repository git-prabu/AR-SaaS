import Head from 'next/head';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import SuperAdminLayout from '../../components/layout/SuperAdminLayout';
import { getAllRestaurants, createRestaurant, updateRestaurant, setUserDoc } from '../../lib/saDb';
import { createUserWithEmailAndPassword } from 'firebase/auth';
// auth (adminAuth) is correct here — new restaurant admins authenticate via adminAuth
import { auth } from '../../lib/firebase';
import toast from 'react-hot-toast';

const BLANK = { name: '', subdomain: '', email: '', password: '' };

// ═══ Aspire palette — same tokens as admin pages ═══
const A = {
  font: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  cream: '#EDEDED',
  ink: '#1A1A1A',
  shell: '#FFFFFF',
  shellDarker: '#FAFAF8',
  warning: '#C4A86D',
  warningDim: '#A08656',
  success: '#3F9E5A',
  danger: '#D9534F',
  mutedText: 'rgba(0,0,0,0.55)',
  faintText: 'rgba(0,0,0,0.38)',
  subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)',
  borderStrong: '1px solid rgba(0,0,0,0.10)',
  cardShadow: '0 2px 10px rgba(0,0,0,0.03)',
};

// Plan pills — same gold/dim accent across all plans for the Aspire monotone look.
// Distinguishing plans by capitalization + the "Plan Manager" page is enough; no
// per-plan rainbow needed.
const PLAN_PILL = {
  background: 'rgba(196,168,109,0.12)',
  color: A.warningDim,
  border: '1px solid rgba(196,168,109,0.25)',
};

const inputStyle = {
  width: '100%', padding: '11px 14px', boxSizing: 'border-box',
  background: A.shell, border: `1px solid rgba(0,0,0,0.10)`, borderRadius: 10,
  fontSize: 14, color: A.ink, fontFamily: A.font, outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 600, color: A.faintText,
  letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6,
};

export default function SuperAdminRestaurants() {
  const [restaurants, setRestaurants] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState(BLANK);
  const [saving,   setSaving]   = useState(false);
  const [search,   setSearch]   = useState('');
  const [editId,   setEditId]   = useState(null);
  const [editData, setEditData] = useState({});

  const load = () => { getAllRestaurants().then(r => { setRestaurants(r); setLoading(false); }); };
  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name || !form.subdomain || !form.email || !form.password) { toast.error('All fields required'); return; }
    if (!/^[a-z0-9-]+$/.test(form.subdomain)) { toast.error('Subdomain: lowercase letters, numbers, hyphens only'); return; }
    setSaving(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      const restaurantRef = await createRestaurant({ name: form.name, subdomain: form.subdomain.toLowerCase(), isActive: true });
      await setUserDoc(cred.user.uid, { email: form.email, role: 'restaurant', restaurantId: restaurantRef.id, restaurantName: form.name });
      toast.success(`Restaurant "${form.name}" created!`);
      setForm(BLANK); setShowForm(false); load();
    } catch (err) { toast.error(err.message || 'Failed to create restaurant'); }
    finally { setSaving(false); }
  };

  const saveEdit = async (id) => {
    await updateRestaurant(id, editData);
    toast.success('Updated!'); setEditId(null); load();
  };

  const filtered = restaurants.filter(r =>
    r.name?.toLowerCase().includes(search.toLowerCase()) ||
    r.subdomain?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SuperAdminLayout>
      <Head><title>Restaurants — Super Admin</title></Head>
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font }}>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          .sa-inp:focus { border-color: ${A.warning} !important; box-shadow: 0 0 0 3px rgba(196,168,109,0.15); }
          .sa-inp::placeholder { color: ${A.faintText}; }
          .sa-row:hover { background: ${A.shellDarker} !important; }
        `}</style>

        <div style={{ padding: '24px 28px 60px', maxWidth: 1100, margin: '0 auto' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, marginBottom: 6, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Super Admin</span>
                <span style={{ opacity: 0.5 }}>›</span>
                <span style={{ color: A.mutedText }}>Restaurants</span>
              </div>
              <div style={{ fontWeight: 600, fontSize: 26, color: A.ink, letterSpacing: '-0.4px', lineHeight: 1.1 }}>Restaurants</div>
              <div style={{ fontSize: 13, color: A.mutedText, marginTop: 4 }}>{restaurants.length} restaurant{restaurants.length === 1 ? '' : 's'} on the platform</div>
            </div>
            <button onClick={() => setShowForm(!showForm)} style={{
              padding: '10px 20px', borderRadius: 10,
              border: showForm ? A.borderStrong : 'none',
              background: showForm ? A.shell : A.ink,
              color: showForm ? A.ink : A.cream,
              fontFamily: A.font, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              boxShadow: showForm ? 'none' : '0 2px 8px rgba(0,0,0,0.10)',
            }}>
              {showForm ? '✕ Cancel' : '+ Add Restaurant'}
            </button>
          </div>

          {/* Create form */}
          {showForm && (
            <div style={{
              background: A.shell, borderRadius: 14, padding: '22px 24px',
              border: A.border, boxShadow: A.cardShadow, marginBottom: 18,
            }}>
              <div style={{ fontFamily: A.font, fontWeight: 600, fontSize: 15, color: A.ink, marginBottom: 18, letterSpacing: '-0.2px' }}>New Restaurant</div>
              <form onSubmit={handleCreate}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                  <div>
                    <label style={labelStyle}>Restaurant Name *</label>
                    <input className="sa-inp" style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Spot Restaurant" required />
                  </div>
                  <div>
                    <label style={labelStyle}>Subdomain *</label>
                    <div style={{ position: 'relative' }}>
                      <input className="sa-inp" style={{ ...inputStyle, paddingRight: 140 }} value={form.subdomain} onChange={e => setForm(f => ({ ...f, subdomain: e.target.value.toLowerCase() }))} placeholder="spot" required />
                      <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: A.faintText, pointerEvents: 'none' }}>.advertradical.com</span>
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Admin Email *</label>
                    <input className="sa-inp" style={inputStyle} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="admin@spot.com" required />
                  </div>
                  <div>
                    <label style={labelStyle}>Password *</label>
                    <input className="sa-inp" style={inputStyle} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 6 characters" required />
                  </div>
                </div>
                <button type="submit" disabled={saving} style={{
                  padding: '11px 24px', borderRadius: 10, border: 'none',
                  background: A.ink, color: A.cream,
                  fontFamily: A.font, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  opacity: saving ? 0.6 : 1, boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
                }}>
                  {saving ? 'Creating…' : 'Create Restaurant'}
                </button>
              </form>
            </div>
          )}

          {/* Search */}
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: A.faintText, pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input className="sa-inp" style={{ ...inputStyle, paddingLeft: 40, borderRadius: 30 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search restaurants…" />
          </div>

          {/* Table */}
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
              <div style={{ width: 28, height: 28, border: `2.5px solid ${A.warning}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: A.mutedText, background: A.shell, borderRadius: 14, border: A.border }}>
              <div style={{ fontSize: 13 }}>No restaurants found.</div>
            </div>
          ) : (
            <div style={{
              background: A.shell, borderRadius: 14, overflow: 'hidden',
              border: A.border, boxShadow: A.cardShadow,
            }}>
              {/* Table header */}
              <div style={{
                display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr 130px',
                padding: '12px 20px', borderBottom: A.border, background: A.shellDarker,
              }}>
                {['Restaurant', 'Subdomain', 'Plan', 'Items', 'Status', 'Actions'].map(h => (
                  <div key={h} style={{ fontSize: 10, fontWeight: 700, color: A.faintText, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{h}</div>
                ))}
              </div>
              {filtered.map((r, i) => {
                const plan = r.plan || 'starter';
                const isEdit = editId === r.id;
                return (
                  <div key={r.id} className="sa-row" style={{
                    borderBottom: i < filtered.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                    transition: 'background 0.12s', background: A.shell,
                  }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr 130px', padding: '14px 20px', alignItems: 'center' }}>
                      <div>
                        <Link href={`/superadmin/restaurant/${r.id}`} style={{ fontFamily: A.font, fontWeight: 600, fontSize: 13, color: A.ink, textDecoration: 'none' }}
                          onMouseOver={e => e.currentTarget.style.color = A.warningDim}
                          onMouseOut={e => e.currentTarget.style.color = A.ink}>
                          {r.name}
                        </Link>
                        <div style={{ fontFamily: A.font, fontSize: 11, color: A.faintText, marginTop: 2 }}>ID: {r.id?.slice(0, 8)}…</div>
                      </div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: A.mutedText }}>{r.subdomain}</div>
                      <div>
                        <span style={{
                          padding: '3px 10px', borderRadius: 20,
                          fontFamily: A.font, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                          ...PLAN_PILL,
                        }}>{plan}</span>
                      </div>
                      <div style={{ fontFamily: A.font, fontSize: 12, color: A.mutedText }}>{r.itemsUsed || 0}/{r.maxItems || 10}</div>
                      <div>
                        <span style={{
                          padding: '3px 10px', borderRadius: 20,
                          fontFamily: A.font, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                          background: r.isActive ? 'rgba(63,158,90,0.10)' : A.subtleBg,
                          color: r.isActive ? A.success : A.faintText,
                          border: `1px solid ${r.isActive ? 'rgba(63,158,90,0.20)' : 'rgba(0,0,0,0.06)'}`,
                        }}>{r.isActive ? 'Active' : 'Inactive'}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Link href={`/superadmin/restaurant/${r.id}`} style={{
                          padding: '6px 12px', borderRadius: 8,
                          border: `1px solid rgba(196,168,109,0.30)`,
                          background: 'rgba(196,168,109,0.10)',
                          fontFamily: A.font, fontSize: 12, fontWeight: 600, color: A.warningDim,
                          cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap',
                        }}>View →</Link>
                        <button onClick={() => { setEditId(isEdit ? null : r.id); setEditData({ plan: r.plan || 'starter', isActive: r.isActive !== false, maxItems: r.maxItems || 10 }); }} style={{
                          padding: '6px 12px', borderRadius: 8,
                          border: A.borderStrong, background: 'transparent',
                          fontFamily: A.font, fontSize: 12, fontWeight: 600, color: A.mutedText, cursor: 'pointer',
                        }}>
                          {isEdit ? 'Cancel' : 'Edit'}
                        </button>
                      </div>
                    </div>
                    {isEdit && (
                      <div style={{ padding: '16px 20px 20px', background: A.shellDarker, borderTop: '1px solid rgba(0,0,0,0.05)', display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div>
                          <label style={labelStyle}>Plan</label>
                          <select className="sa-inp" style={{ ...inputStyle, width: 150 }} value={editData.plan} onChange={e => setEditData(d => ({ ...d, plan: e.target.value }))}>
                            <option value="starter">Starter</option>
                            <option value="growth">Growth</option>
                            <option value="pro">Pro</option>
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Max Items</label>
                          <input className="sa-inp" type="number" style={{ ...inputStyle, width: 110 }} value={editData.maxItems} onChange={e => setEditData(d => ({ ...d, maxItems: Number(e.target.value) }))} min="1" />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 4 }}>
                          <label style={{ ...labelStyle, marginBottom: 0 }}>Active</label>
                          <div onClick={() => setEditData(d => ({ ...d, isActive: !d.isActive }))} style={{
                            width: 44, height: 24, borderRadius: 99,
                            background: editData.isActive ? A.success : 'rgba(0,0,0,0.18)',
                            cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                          }}>
                            <div style={{
                              width: 18, height: 18, borderRadius: '50%', background: A.shell,
                              position: 'absolute', top: 3, left: editData.isActive ? 23 : 3,
                              transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                            }} />
                          </div>
                        </div>
                        <button onClick={() => saveEdit(r.id)} style={{
                          padding: '10px 20px', borderRadius: 10, border: 'none',
                          background: A.ink, color: A.cream,
                          fontFamily: A.font, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
                        }}>Save</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </SuperAdminLayout>
  );
}
SuperAdminRestaurants.getLayout = (page) => page;
