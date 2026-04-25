import Head from 'next/head';
import { useEffect, useState } from 'react';
import SuperAdminLayout from '../../components/layout/SuperAdminLayout';
import { getAllRestaurants, updateRestaurant } from '../../lib/saDb';
import toast from 'react-hot-toast';

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

// Plan definitions — kept in sync with lib/plans.js. Visual styling is monotone
// (gold accent only); the original rainbow per-plan colours were dropped to
// match Aspire's restrained palette.
const PLANS = [
  { id: 'starter', label: 'Starter', price:  999, maxItems:  20, maxStorageMB:  1024 },
  { id: 'growth',  label: 'Growth',  price: 2499, maxItems:  60, maxStorageMB:  3072 },
  { id: 'pro',     label: 'Pro',     price: 4999, maxItems: 150, maxStorageMB: 10240 },
];

const inputStyle = {
  width: '100%', padding: '10px 12px', boxSizing: 'border-box',
  background: A.shell, border: `1px solid rgba(0,0,0,0.10)`, borderRadius: 9,
  fontSize: 13, color: A.ink, fontFamily: A.font, outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};
const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 600, color: A.faintText,
  letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6,
};

function addMonths(dateStr, n) {
  const d = dateStr ? new Date(dateStr) : new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

function daysLeft(endStr) {
  if (!endStr) return null;
  const diff = new Date(endStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function StatusBadge({ restaurant }) {
  const days = daysLeft(restaurant.subscriptionEnd);
  const active = restaurant.paymentStatus === 'active';
  const isActive = restaurant.isActive;

  const pill = (bg, color, border, text) => (
    <span style={{
      padding: '3px 10px', borderRadius: 20,
      fontFamily: A.font, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
      background: bg, color, border: `1px solid ${border}`,
    }}>{text}</span>
  );

  if (!isActive)     return pill(A.subtleBg, A.faintText, 'rgba(0,0,0,0.06)', 'Inactive');
  if (!active)       return pill('rgba(217,83,79,0.10)', A.danger, 'rgba(217,83,79,0.22)', 'No Subscription');
  if (days === null) return pill('rgba(196,168,109,0.12)', A.warningDim, 'rgba(196,168,109,0.30)', 'No Expiry Set');
  if (days < 0)      return pill('rgba(217,83,79,0.10)', A.danger, 'rgba(217,83,79,0.22)', `Expired ${Math.abs(days)}d ago`);
  if (days <= 14)    return pill('rgba(196,168,109,0.12)', A.warningDim, 'rgba(196,168,109,0.30)', `${days}d left`);
  return pill('rgba(63,158,90,0.10)', A.success, 'rgba(63,158,90,0.22)', `Active · ${days}d left`);
}

export default function SuperAdminPlans() {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(null);
  const [expanded, setExpanded]       = useState(null);
  const [edits, setEdits]             = useState({});
  const [search, setSearch]           = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const load = async () => {
    const r = await getAllRestaurants();
    setRestaurants(r);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const getEdit = (r) => edits[r.id] || {
    plan:              r.plan              || 'starter',
    maxItems:          r.maxItems          ?? 20,
    maxStorageMB:      r.maxStorageMB      ?? 1024,
    subscriptionStart: r.subscriptionStart || '',
    subscriptionEnd:   r.subscriptionEnd   || '',
    paymentStatus:     r.paymentStatus     || 'inactive',
    isActive:          r.isActive          !== false,
  };

  const setEdit = (id, patch) =>
    setEdits(prev => ({ ...prev, [id]: { ...getEdit({ id, ...restaurants.find(r => r.id === id) }), ...patch } }));

  const handlePlanClick = (id, planId) => {
    const plan = PLANS.find(p => p.id === planId);
    setEdit(id, { plan: planId, maxItems: plan.maxItems, maxStorageMB: plan.maxStorageMB });
  };

  const handleQuickExpiry = (id, months) => {
    const edit = getEdit(restaurants.find(r => r.id === id));
    const start = edit.subscriptionStart || new Date().toISOString().slice(0, 10);
    setEdit(id, {
      subscriptionStart: start,
      subscriptionEnd:   addMonths(start, months),
      paymentStatus:     'active',
    });
  };

  const handleSave = async (r) => {
    const edit = getEdit(r);
    setSaving(r.id);
    try {
      await updateRestaurant(r.id, {
        plan:              edit.plan,
        maxItems:          Number(edit.maxItems),
        maxStorageMB:      Number(edit.maxStorageMB),
        subscriptionStart: edit.subscriptionStart || null,
        subscriptionEnd:   edit.subscriptionEnd   || null,
        paymentStatus:     edit.paymentStatus,
        isActive:          edit.isActive,
      });
      toast.success(`${r.name} updated`);
      setEdits(prev => { const n = { ...prev }; delete n[r.id]; return n; });
      await load();
    } catch (e) { toast.error('Save failed: ' + e.message); }
    finally { setSaving(null); }
  };

  const quickToggleActive = async (r) => {
    setSaving(r.id);
    try {
      await updateRestaurant(r.id, { isActive: !r.isActive });
      toast.success(r.isActive ? `${r.name} deactivated` : `${r.name} activated`);
      await load();
    } catch { toast.error('Failed'); }
    finally { setSaving(null); }
  };

  const filtered = restaurants.filter(r => {
    const matchSearch = r.name?.toLowerCase().includes(search.toLowerCase()) ||
                        r.subdomain?.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filterStatus === 'active')   return r.isActive && r.paymentStatus === 'active' && daysLeft(r.subscriptionEnd) > 0;
    if (filterStatus === 'expired')  return r.paymentStatus === 'active' && daysLeft(r.subscriptionEnd) <= 0;
    if (filterStatus === 'inactive') return !r.isActive || r.paymentStatus !== 'active';
    return true;
  });

  const counts = {
    active:   restaurants.filter(r => r.isActive && r.paymentStatus === 'active' && daysLeft(r.subscriptionEnd) > 0).length,
    expired:  restaurants.filter(r => r.paymentStatus === 'active' && daysLeft(r.subscriptionEnd) <= 0).length,
    inactive: restaurants.filter(r => !r.isActive || r.paymentStatus !== 'active').length,
    expiring: restaurants.filter(r => { const d = daysLeft(r.subscriptionEnd); return d !== null && d >= 0 && d <= 14; }).length,
  };

  return (
    <SuperAdminLayout>
      <Head><title>Plan Manager — Advert Radical</title></Head>
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font }}>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
          .sa-inp:focus { border-color: ${A.warning} !important; box-shadow: 0 0 0 3px rgba(196,168,109,0.15); }
          .sa-inp::placeholder { color: ${A.faintText}; }
          .sa-plan-card { cursor: pointer; border-radius: 10px; padding: 12px 14px; border: 2px solid transparent; transition: all 0.15s; text-align: center; }
          .sa-r-row { border-radius: 14px; overflow: hidden; margin-bottom: 10px; box-shadow: ${A.cardShadow}; animation: fadeUp 0.25s ease both; border: ${A.border}; }
          .sa-quick-btn { padding: 6px 12px; border-radius: 8px; border: ${A.borderStrong}; background: ${A.shell}; font-family: ${A.font}; font-size: 11px; font-weight: 600; color: ${A.mutedText}; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
          .sa-quick-btn:hover { border-color: ${A.warning}; color: ${A.warningDim}; background: rgba(196,168,109,0.08); }
        `}</style>

        <div style={{ padding: '24px 28px 60px', maxWidth: 1100, margin: '0 auto' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22, flexWrap: 'wrap', gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, marginBottom: 6, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Super Admin</span>
                <span style={{ opacity: 0.5 }}>›</span>
                <span style={{ color: A.mutedText }}>Plan Manager</span>
              </div>
              <div style={{ fontWeight: 600, fontSize: 26, color: A.ink, letterSpacing: '-0.4px', lineHeight: 1.1 }}>Plan Manager</div>
              <div style={{ fontSize: 13, color: A.mutedText, marginTop: 4 }}>Plans, expiry and access for all restaurants</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { key: 'all',      label: `All (${restaurants.length})` },
                { key: 'active',   label: `Active (${counts.active})` },
                { key: 'expired',  label: `Expired (${counts.expired})` },
                { key: 'inactive', label: `Inactive (${counts.inactive})` },
              ].map(f => {
                const active = filterStatus === f.key;
                return (
                  <button key={f.key} onClick={() => setFilterStatus(f.key)} style={{
                    padding: '7px 14px', borderRadius: 20,
                    border: active ? `1px solid ${A.ink}` : A.borderStrong,
                    fontFamily: A.font, fontSize: 12, fontWeight: active ? 700 : 600,
                    cursor: 'pointer',
                    background: active ? A.ink : A.shell,
                    color: active ? A.cream : A.mutedText, transition: 'all 0.15s',
                  }}>
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 18 }}>
            {[
              { label: 'Active Subscriptions', value: counts.active,   color: A.success    },
              { label: 'Expiring in 14 days',  value: counts.expiring, color: A.warningDim },
              { label: 'Expired / No Sub',     value: counts.expired + counts.inactive, color: A.danger },
            ].map(c => (
              <div key={c.label} style={{
                background: A.shell, borderRadius: 12, padding: '16px 20px',
                border: A.border, boxShadow: A.cardShadow,
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <div style={{ fontFamily: A.font, fontSize: 11, fontWeight: 600, color: A.faintText, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{c.label}</div>
                <div style={{ fontFamily: A.font, fontWeight: 700, fontSize: 28, color: c.color, lineHeight: 1, letterSpacing: '-0.5px' }}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: A.faintText, pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input className="sa-inp" style={{ ...inputStyle, paddingLeft: 40, borderRadius: 30, padding: '11px 14px 11px 40px' }}
              placeholder="Search restaurant name or subdomain…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {/* Restaurant rows */}
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
              <div style={{ width: 28, height: 28, border: `2.5px solid ${A.warning}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: A.mutedText, background: A.shell, borderRadius: 14, border: A.border }}>
              <div style={{ fontSize: 13 }}>No restaurants found</div>
            </div>
          ) : filtered.map((r, idx) => {
            const edit    = getEdit(r);
            const isOpen  = expanded === r.id;
            const original = {
              plan: r.plan || 'starter',
              maxItems: r.maxItems ?? 20,
              maxStorageMB: r.maxStorageMB ?? 1024,
              subscriptionStart: r.subscriptionStart || '',
              subscriptionEnd: r.subscriptionEnd || '',
              paymentStatus: r.paymentStatus || 'inactive',
              isActive: r.isActive !== false,
            };
            const isDirty = edits[r.id] ? JSON.stringify(edit) !== JSON.stringify(original) : false;
            const days    = daysLeft(edit.subscriptionEnd);
            const planInfo = PLANS.find(p => p.id === edit.plan) || PLANS[0];

            return (
              <div key={r.id} className="sa-r-row" style={{ animationDelay: `${idx * 0.04}s` }}>
                {/* Collapsed row */}
                <div onClick={() => setExpanded(isOpen ? null : r.id)} style={{
                  display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', gap: 16, alignItems: 'center',
                  padding: '14px 18px', background: A.shell, cursor: 'pointer',
                  borderBottom: isOpen ? '1px solid rgba(0,0,0,0.05)' : 'none', transition: 'background 0.12s',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = A.shellDarker}
                  onMouseLeave={e => e.currentTarget.style.background = A.shell}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div>
                      <div style={{ fontFamily: A.font, fontWeight: 700, fontSize: 14, color: A.ink }}>{r.name}</div>
                      <div style={{ fontFamily: A.font, fontSize: 11, color: A.faintText, marginTop: 2 }}>{r.subdomain}.advertradical.com</div>
                    </div>
                  </div>
                  <span style={{
                    padding: '3px 10px', borderRadius: 20,
                    fontFamily: A.font, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                    background: 'rgba(196,168,109,0.12)', color: A.warningDim,
                    border: `1px solid rgba(196,168,109,0.30)`,
                  }}>{planInfo.label}</span>
                  <StatusBadge restaurant={r} />
                  <div onClick={e => { e.stopPropagation(); quickToggleActive(r); }} style={{
                    width: 34, height: 20, borderRadius: 99,
                    background: r.isActive ? A.success : 'rgba(0,0,0,0.18)',
                    position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
                    opacity: saving === r.id ? 0.5 : 1,
                  }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: A.shell, position: 'absolute', top: 3, left: r.isActive ? 17 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </div>
                  <span style={{ fontFamily: A.font, fontSize: 13, color: A.faintText, transition: 'transform 0.2s', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
                </div>

                {/* Expanded editor */}
                {isOpen && (
                  <div style={{ padding: '20px 22px 22px', background: A.shellDarker }}>
                    {/* Plan selector */}
                    <div style={{ marginBottom: 18 }}>
                      <label style={labelStyle}>Plan</label>
                      <div style={{ display: 'flex', gap: 10 }}>
                        {PLANS.map(p => {
                          const sel = edit.plan === p.id;
                          return (
                            <div key={p.id} className="sa-plan-card" onClick={() => handlePlanClick(r.id, p.id)} style={{
                              flex: 1,
                              background: sel ? 'rgba(196,168,109,0.10)' : A.shell,
                              borderColor: sel ? A.warning : 'rgba(0,0,0,0.08)',
                              boxShadow: sel ? '0 2px 10px rgba(196,168,109,0.20)' : 'none',
                            }}>
                              <div style={{ fontFamily: A.font, fontWeight: 700, fontSize: 13, color: sel ? A.warningDim : A.ink }}>{p.label}</div>
                              <div style={{ fontFamily: A.font, fontSize: 12, fontWeight: 700, color: sel ? A.warningDim : A.mutedText, marginTop: 2 }}>₹{p.price?.toLocaleString('en-IN')}/mo</div>
                              <div style={{ fontFamily: A.font, fontSize: 11, color: A.faintText, marginTop: 3 }}>{p.maxItems} items · {p.maxStorageMB >= 1024 ? p.maxStorageMB / 1024 + ' GB' : p.maxStorageMB + ' MB'}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Override limits */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
                      <div>
                        <label style={labelStyle}>Max AR Items (override)</label>
                        <input className="sa-inp" style={inputStyle} type="number" min="0" value={edit.maxItems}
                          onChange={e => setEdit(r.id, { maxItems: e.target.value })} />
                      </div>
                      <div>
                        <label style={labelStyle}>Max Storage MB (override)</label>
                        <input className="sa-inp" style={inputStyle} type="number" min="0" value={edit.maxStorageMB}
                          onChange={e => setEdit(r.id, { maxStorageMB: e.target.value })} />
                      </div>
                    </div>

                    {/* Subscription dates */}
                    <div style={{ marginBottom: 14 }}>
                      <label style={labelStyle}>Subscription Period</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 10 }}>
                        <div>
                          <div style={{ fontFamily: A.font, fontSize: 11, color: A.faintText, marginBottom: 5 }}>Start Date</div>
                          <input className="sa-inp" style={inputStyle} type="date" value={edit.subscriptionStart}
                            onChange={e => setEdit(r.id, { subscriptionStart: e.target.value })} />
                        </div>
                        <div>
                          <div style={{ fontFamily: A.font, fontSize: 11, color: A.faintText, marginBottom: 5 }}>
                            End Date
                            {days !== null && (
                              <span style={{ marginLeft: 8, fontWeight: 700, color: days < 0 ? A.danger : days <= 14 ? A.warningDim : A.success }}>
                                ({days < 0 ? `Expired ${Math.abs(days)}d ago` : `${days}d remaining`})
                              </span>
                            )}
                          </div>
                          <input className="sa-inp" style={inputStyle} type="date" value={edit.subscriptionEnd}
                            onChange={e => setEdit(r.id, { subscriptionEnd: e.target.value })} />
                        </div>
                      </div>

                      {/* Quick expiry shortcuts */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: A.font, fontSize: 11, color: A.faintText, fontWeight: 600 }}>Quick set expiry:</span>
                        {[
                          { label: '+1 Month',  months: 1  },
                          { label: '+3 Months', months: 3  },
                          { label: '+6 Months', months: 6  },
                          { label: '+1 Year',   months: 12 },
                        ].map(q => (
                          <button key={q.label} className="sa-quick-btn" onClick={() => handleQuickExpiry(r.id, q.months)}>
                            {q.label}
                          </button>
                        ))}
                        <button className="sa-quick-btn" style={{ color: A.danger, borderColor: 'rgba(217,83,79,0.30)' }}
                          onClick={() => setEdit(r.id, { subscriptionEnd: new Date().toISOString().slice(0, 10), paymentStatus: 'inactive' })}>
                          Expire Now
                        </button>
                      </div>
                    </div>

                    {/* Status toggles */}
                    <div style={{ display: 'flex', gap: 12, marginBottom: 18, paddingTop: 14, borderTop: '1px solid rgba(0,0,0,0.05)', flexWrap: 'wrap' }}>
                      {[
                        { key: 'isActive',      label: 'Restaurant Active',   desc: 'Visible to customers',         isOn: edit.isActive,                 toggle: () => setEdit(r.id, { isActive: !edit.isActive }) },
                        { key: 'paymentStatus', label: 'Payment Active',      desc: 'Subscription marked as paid',  isOn: edit.paymentStatus === 'active', toggle: () => setEdit(r.id, { paymentStatus: edit.paymentStatus === 'active' ? 'inactive' : 'active' }) },
                      ].map(t => (
                        <div key={t.key} onClick={t.toggle} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10,
                          border: `1px solid ${t.isOn ? 'rgba(63,158,90,0.30)' : 'rgba(0,0,0,0.06)'}`,
                          background: t.isOn ? 'rgba(63,158,90,0.06)' : A.shell, cursor: 'pointer', transition: 'all 0.15s',
                        }}>
                          <div style={{ width: 34, height: 20, borderRadius: 99, background: t.isOn ? A.success : 'rgba(0,0,0,0.18)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                            <div style={{ width: 14, height: 14, borderRadius: '50%', background: A.shell, position: 'absolute', top: 3, left: t.isOn ? 17 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                          </div>
                          <div>
                            <div style={{ fontFamily: A.font, fontSize: 13, fontWeight: 700, color: A.ink }}>{t.label}</div>
                            <div style={{ fontFamily: A.font, fontSize: 11, color: A.mutedText }}>{t.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Save / cancel */}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <button onClick={() => handleSave(r)} disabled={saving === r.id} style={{
                        padding: '11px 24px', borderRadius: 10, border: 'none',
                        background: A.ink, color: A.cream,
                        fontFamily: A.font, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        opacity: saving === r.id ? 0.6 : 1,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                      }}>
                        {saving === r.id
                          ? <><span style={{ width: 13, height: 13, border: `2px solid ${A.cream}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} /> Saving…</>
                          : 'Save Changes'}
                      </button>
                      <button onClick={() => { setEdits(prev => { const n = { ...prev }; delete n[r.id]; return n; }); setExpanded(null); }} style={{
                        padding: '11px 18px', borderRadius: 10, border: A.borderStrong,
                        background: 'transparent', fontFamily: A.font, fontSize: 13, fontWeight: 600, color: A.mutedText, cursor: 'pointer',
                      }}>
                        Cancel
                      </button>
                      {isDirty && <span style={{ fontFamily: A.font, fontSize: 11, color: A.warningDim, fontWeight: 600 }}>● Unsaved changes</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </SuperAdminLayout>
  );
}
SuperAdminPlans.getLayout = (page) => page;
