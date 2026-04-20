import Head from 'next/head';
import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getCoupons, createCoupon, updateCoupon, deleteCoupon } from '../../lib/db';
import toast from 'react-hot-toast';

// ═══ Aspire palette — same tokens as other admin pages ═══
const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER,
  mono: "'JetBrains Mono', monospace",
  cream: '#EDEDED', ink: '#1A1A1A',
  shell: '#FFFFFF', shellDarker: '#FAFAF8',
  warning: '#C4A86D', warningDim: '#A08656',
  success: '#3F9E5A', danger: '#D9534F',
  mutedText: 'rgba(0,0,0,0.55)', faintText: 'rgba(0,0,0,0.38)',
  subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)',
  borderStrong: '1px solid rgba(0,0,0,0.10)',
  shadowCard: '0 2px 10px rgba(38,52,49,0.03)',
  forest: '#1A1A1A', forestDarker: '#2A2A2A',
  forestText: '#EAE7E3', forestTextMuted: 'rgba(234,231,227,0.55)', forestTextFaint: 'rgba(234,231,227,0.35)',
  forestSubtleBg: 'rgba(255,255,255,0.04)',
  forestBorder: '1px solid rgba(255,255,255,0.06)',
};

const EMPTY_FORM = { code: '', type: 'percent', value: '', maxUses: '', validUntil: '', isActive: true };

function formatDate(value) {
  if (!value) return '—';
  const d = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ═══ Coupon status derived from 3 signals in precedence order ═══
function couponStatus(c) {
  if (c.isActive === false) return 'inactive';
  if (c.validUntil && new Date(c.validUntil) < new Date()) return 'expired';
  if (c.maxUses && (c.usedCount || 0) >= c.maxUses) return 'exhausted';
  return 'active';
}
const STATUS_META = {
  active:    { label: 'Active',    color: A.success,     bg: 'rgba(63,158,90,0.10)' },
  inactive:  { label: 'Inactive',  color: A.faintText,   bg: A.subtleBg },
  expired:   { label: 'Expired',   color: A.danger,      bg: 'rgba(217,83,79,0.08)' },
  exhausted: { label: 'Exhausted', color: A.warningDim,  bg: 'rgba(196,168,109,0.10)' },
};

export default function AdminCoupons() {
  const { userData } = useAuth();
  const rid = userData?.restaurantId;

  const [coupons, setCoupons] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = async () => {
    if (!rid) return;
    try { setCoupons(await getCoupons(rid)); }
    catch (e) { console.error('Coupons load failed:', e); }
    finally { setLoaded(true); }
  };
  useEffect(() => { load(); }, [rid]);

  const stats = useMemo(() => {
    const byStatus = coupons.reduce((acc, c) => {
      const s = couponStatus(c);
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    return {
      active: byStatus.active || 0,
      inactive: byStatus.inactive || 0,
      expired: (byStatus.expired || 0) + (byStatus.exhausted || 0),
      totalUses: coupons.reduce((s, c) => s + (c.usedCount || 0), 0),
    };
  }, [coupons]);

  const displayed = useMemo(() => {
    let list = coupons;
    if (filter !== 'all') list = list.filter(c => couponStatus(c) === filter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(c => (c.code || '').toLowerCase().includes(q));
    return list;
  }, [coupons, filter, search]);

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setDrawerOpen(true); };
  const openEdit = (c) => {
    setEditingId(c.id);
    setForm({
      code: c.code || '', type: c.type || 'percent',
      value: String(c.value ?? ''),
      maxUses: c.maxUses ? String(c.maxUses) : '',
      validUntil: c.validUntil || '',
      isActive: c.isActive !== false,
    });
    setDrawerOpen(true);
  };
  const closeDrawer = () => { setDrawerOpen(false); setEditingId(null); setForm(EMPTY_FORM); };

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') closeDrawer(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const handleSave = async () => {
    if (!form.code.trim()) return toast.error('Coupon code is required');
    if (!form.value || isNaN(parseFloat(form.value))) return toast.error('Enter a valid discount value');
    if (form.type === 'percent' && parseFloat(form.value) > 100) return toast.error('Percentage discount cannot exceed 100%');
    if (parseFloat(form.value) <= 0) return toast.error('Discount value must be greater than 0');
    const codeUpper = form.code.toUpperCase().trim();
    if (coupons.find(c => c.code === codeUpper && c.id !== editingId)) return toast.error('A coupon with this code already exists');

    setSaving(true);
    try {
      const payload = {
        code: codeUpper, type: form.type, value: parseFloat(form.value),
        maxUses: form.maxUses ? parseInt(form.maxUses, 10) : null,
        validUntil: form.validUntil || null,
        isActive: form.isActive,
      };
      if (editingId) { await updateCoupon(rid, editingId, payload); toast.success('Coupon updated'); }
      else           { await createCoupon(rid, payload);            toast.success('Coupon created'); }
      closeDrawer();
      await load();
    } catch (e) { toast.error('Save failed: ' + e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (c) => {
    if (!confirm(`Delete coupon "${c.code}"? This cannot be undone.`)) return;
    setDeleting(c.id);
    try { await deleteCoupon(rid, c.id); toast.success('Coupon deleted'); await load(); }
    catch { toast.error('Delete failed'); }
    finally { setDeleting(null); }
  };

  const handleToggle = async (c) => {
    try { await updateCoupon(rid, c.id, { isActive: !c.isActive }); await load(); }
    catch { toast.error('Update failed'); }
  };

  return (
    <AdminLayout>
      <Head><title>Coupons | Advert Radical</title></Head>
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font }}>
        <style>{`
          @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
          @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes slideInRight { from { transform: translateX(100%); } to { transform: none; } }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          .cp-row { transition: all 0.15s; }
          .cp-row:hover { box-shadow: 0 4px 20px rgba(38,52,49,0.06); }
          .cp-tab-pill:hover:not(.active) { background: ${A.subtleBg}; color: ${A.ink}; }
          .cp-btn:hover:not(:disabled) { filter: brightness(1.08); }
          .cp-ghost:hover { background: ${A.subtleBg}; }
          .cp-input:focus { border-color: ${A.warning} !important; background: ${A.shell} !important; }
        `}</style>

        {/* Header */}
        <div style={{ padding: '24px 28px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, gap: 14, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, marginBottom: 6, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Menu</span>
                <span style={{ opacity: 0.5 }}>›</span>
                <span style={{ color: A.mutedText }}>Coupons</span>
              </div>
              <div style={{ fontWeight: 600, fontSize: 28, color: A.ink, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                Coupons
              </div>
            </div>
            <button className="cp-btn" onClick={openCreate}
              style={{
                padding: '10px 18px', borderRadius: 10, border: 'none',
                background: A.ink, color: A.cream, fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: A.font, letterSpacing: '0.01em', alignSelf: 'flex-start',
              }}>+ New Coupon</button>
          </div>

          {/* Stats strip */}
          <div style={{
            background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
            borderRadius: 12, padding: '12px 18px', marginTop: 12, marginBottom: 14,
            border: A.forestBorder, boxShadow: '0 4px 16px rgba(38,52,49,0.12)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: A.warning, animation: 'pulse 2s ease infinite', boxShadow: '0 0 6px rgba(196,168,109,0.6)' }} />
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: A.warning }}>DISCOUNT CODES</span>
              </div>
              <div style={{ width: 1, height: 28, background: 'rgba(234,231,227,0.10)', flexShrink: 0 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1, flexWrap: 'wrap' }}>
                <StatTile label="Active" value={stats.active} big color={stats.active > 0 ? A.success : A.forestText} />
                <Divider />
                <StatTile label="Inactive" value={stats.inactive} />
                <Divider />
                <StatTile label="Expired" value={stats.expired} />
                <Divider />
                <StatTile label="Total uses" value={stats.totalUses} color={A.warning} />
              </div>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div style={{ padding: '0 28px', marginBottom: 14 }}>
          <div style={{
            background: A.shell, border: A.border, borderRadius: 14,
            boxShadow: A.shadowCard, padding: '12px 18px',
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'inline-flex', background: A.subtleBg, borderRadius: 10, padding: 3 }}>
              {[
                ['all', 'All', coupons.length],
                ['active', 'Active', stats.active],
                ['inactive', 'Inactive', stats.inactive],
                ['expired', 'Expired', stats.expired],
              ].map(([val, label, count]) => {
                const active = filter === val;
                return (
                  <button key={val} className={`cp-tab-pill ${active ? 'active' : ''}`}
                    onClick={() => setFilter(val)}
                    style={{
                      padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
                      fontFamily: A.font, fontSize: 12, fontWeight: active ? 700 : 600,
                      background: active ? A.ink : 'transparent',
                      color: active ? A.cream : A.mutedText,
                      display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
                    }}>
                    {label}
                    {count > 0 && (
                      <span style={{
                        padding: '1px 6px', borderRadius: 8,
                        background: active ? 'rgba(237,237,237,0.18)' : 'rgba(196,168,109,0.20)',
                        color: active ? A.cream : A.warningDim,
                        fontSize: 10, fontWeight: 700, fontFamily: A.mono,
                      }}>{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
            <span style={{ width: 1, height: 22, background: 'rgba(0,0,0,0.10)' }} />
            <input className="cp-input"
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search code…"
              style={{
                flex: 1, minWidth: 220, padding: '8px 12px', borderRadius: 8,
                border: A.border, background: A.shellDarker,
                fontSize: 13, fontFamily: A.font, color: A.ink,
                outline: 'none', transition: 'all 0.15s',
              }} />
            <span style={{ fontSize: 12, color: A.faintText, fontWeight: 500 }}>
              {displayed.length} coupon{displayed.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {/* List */}
        <div style={{ padding: '0 28px 80px' }}>
          {!loaded ? (
            <LoadingCard />
          ) : displayed.length === 0 ? (
            <EmptyCard
              titleText={coupons.length === 0 ? 'No coupons yet' : 'No coupons match your filter'}
              subtitleText={coupons.length === 0
                ? 'Create discount codes that customers can redeem at checkout.'
                : 'Try a different filter or search term.'}
              ctaText={coupons.length === 0 ? 'Create your first coupon' : null}
              onCta={openCreate}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {displayed.map((c, idx) => {
                const status = couponStatus(c);
                const meta = STATUS_META[status];
                return (
                  <div key={c.id} className="cp-row"
                    style={{
                      background: A.shell, borderRadius: 14, border: A.border,
                      borderLeft: `4px solid ${meta.color}`,
                      boxShadow: A.shadowCard, padding: '14px 20px',
                      display: 'flex', alignItems: 'center', gap: 16,
                      animation: 'fadeUp 0.22s ease both',
                      animationDelay: `${Math.min(idx * 0.03, 0.3)}s`,
                      opacity: c.isActive === false ? 0.7 : 1,
                    }}>
                    <div style={{
                      background: A.subtleBg, color: A.ink,
                      fontFamily: A.mono, fontWeight: 700, fontSize: 15,
                      padding: '10px 16px', borderRadius: 10, flexShrink: 0,
                      letterSpacing: '0.08em', border: A.borderStrong,
                    }}>{c.code}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: A.mono, fontWeight: 700, fontSize: 15, color: A.ink, letterSpacing: '-0.2px' }}>
                          {c.type === 'percent' ? `${c.value}%` : `₹${c.value}`}
                        </span>
                        <span style={{ fontSize: 12, color: A.mutedText }}>off</span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                          padding: '3px 8px', borderRadius: 4, textTransform: 'uppercase',
                          background: meta.bg, color: meta.color,
                        }}>{meta.label}</span>
                      </div>
                      <div style={{ fontSize: 12, color: A.mutedText, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <span>Used <strong style={{ color: A.ink, fontWeight: 600 }}>{c.usedCount || 0}</strong>{c.maxUses ? ` / ${c.maxUses}` : ''}</span>
                        {c.validUntil && <span>Expires <strong style={{ color: A.ink, fontWeight: 600 }}>{formatDate(c.validUntil)}</strong></span>}
                        <span style={{ color: A.faintText }}>Created {formatDate(c.createdAt?.seconds)}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                      <Toggle on={c.isActive !== false} onClick={() => handleToggle(c)} />
                      <button className="cp-ghost" onClick={() => openEdit(c)}
                        style={{
                          padding: '7px 14px', borderRadius: 8, border: A.border,
                          background: A.shell, color: A.ink, fontWeight: 600, fontSize: 12,
                          cursor: 'pointer', fontFamily: A.font,
                        }}>Edit</button>
                      <button onClick={() => handleDelete(c)} disabled={deleting === c.id}
                        style={{
                          padding: '7px 12px', borderRadius: 8, border: 'none',
                          background: 'rgba(217,83,79,0.08)', color: A.danger,
                          fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: A.font,
                          opacity: deleting === c.id ? 0.5 : 1,
                        }}>{deleting === c.id ? '…' : 'Delete'}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Drawer */}
        {drawerOpen && (
          <>
            <div onClick={closeDrawer} style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
              zIndex: 90, animation: 'fadeIn 0.2s ease both',
            }} />
            <div style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 440,
              background: A.shell, zIndex: 91,
              display: 'flex', flexDirection: 'column',
              boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
              animation: 'slideInRight 0.28s ease both',
            }}>
              <DrawerHeader title="Coupon" editing={!!editingId} onClose={closeDrawer} />
              <div style={{ flex: 1, overflowY: 'auto', padding: '22px' }}>
                <div style={{ marginBottom: 18 }}>
                  <Label>Coupon code</Label>
                  <input className="cp-input"
                    value={form.code}
                    onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/\s/g, '') }))}
                    placeholder="e.g. HAPPY10" maxLength={20}
                    style={{
                      width: '100%', padding: '12px 14px', borderRadius: 10,
                      border: A.borderStrong, background: A.shellDarker,
                      fontFamily: A.mono, fontWeight: 700, fontSize: 16,
                      letterSpacing: '0.1em', color: A.ink,
                      outline: 'none', transition: 'all 0.15s', boxSizing: 'border-box',
                    }} />
                  <Hint>Uppercase only, max 20 chars, no spaces</Hint>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
                  <div>
                    <Label>Discount type</Label>
                    <select className="cp-input"
                      value={form.type}
                      onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                      style={inputStyle}>
                      <option value="percent">Percentage</option>
                      <option value="fixed">Fixed amount</option>
                    </select>
                  </div>
                  <div>
                    <Label>Value</Label>
                    <div style={{ position: 'relative' }}>
                      <input className="cp-input"
                        type="number" min="0" value={form.value}
                        onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                        placeholder={form.type === 'percent' ? '10' : '50'}
                        style={{ ...inputStyle, paddingRight: 32 }} />
                      <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: A.mutedText, fontWeight: 600, pointerEvents: 'none' }}>
                        {form.type === 'percent' ? '%' : '₹'}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
                  <div>
                    <Label>Max uses <Optional /></Label>
                    <input className="cp-input" type="number" min="1"
                      value={form.maxUses}
                      onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))}
                      placeholder="Unlimited" style={inputStyle} />
                  </div>
                  <div>
                    <Label>Valid until <Optional /></Label>
                    <input className="cp-input" type="date"
                      value={form.validUntil}
                      onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))}
                      style={inputStyle} />
                  </div>
                </div>

                <div style={{ padding: '14px 16px', borderRadius: 10, background: A.subtleBg, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: A.ink, marginBottom: 2 }}>Visible to customers</div>
                    <div style={{ fontSize: 11, color: A.mutedText }}>Customers can redeem this code at checkout</div>
                  </div>
                  <Toggle big on={form.isActive} onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))} />
                </div>
              </div>
              <DrawerFooter saving={saving} editing={!!editingId} onCancel={closeDrawer} onSave={handleSave} saveLabel="coupon" />
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

// ═══ Shared inline helpers ═══
const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1px solid rgba(0,0,0,0.10)', background: '#FAFAF8',
  fontSize: 13, color: '#1A1A1A', fontFamily: INTER,
  outline: 'none', boxSizing: 'border-box', transition: 'all 0.15s',
};

function Label({ children }) {
  return <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'rgba(0,0,0,0.55)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6, fontFamily: INTER }}>{children}</label>;
}
function Hint({ children }) {
  return <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.38)', marginTop: 6, fontFamily: INTER }}>{children}</div>;
}
function Optional() {
  return <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'rgba(0,0,0,0.38)' }}>(optional)</span>;
}
function Divider() {
  return <div style={{ width: 1, height: 24, background: 'rgba(234,231,227,0.06)', flexShrink: 0 }} />;
}
function StatTile({ label, value, color = '#EAE7E3', big = false }) {
  return (
    <div style={{ minWidth: 80 }}>
      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'rgba(234,231,227,0.35)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: big ? 22 : 18, color, lineHeight: 1, letterSpacing: big ? '-0.5px' : '-0.3px' }}>
        {value}
      </div>
    </div>
  );
}
function Toggle({ on, onClick, big = false }) {
  const w = big ? 42 : 36;
  const h = big ? 24 : 20;
  const ball = big ? 18 : 14;
  return (
    <div onClick={onClick} style={{
      width: w, height: h, borderRadius: 99,
      background: on ? '#3F9E5A' : 'rgba(0,0,0,0.15)',
      cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
    }}>
      <div style={{
        width: ball, height: ball, borderRadius: '50%', background: '#FFFFFF',
        position: 'absolute', top: 3, left: on ? w - ball - 3 : 3,
        transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
      }} />
    </div>
  );
}
function LoadingCard() {
  return (
    <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid rgba(0,0,0,0.06)', padding: '64px 32px', textAlign: 'center', boxShadow: '0 2px 10px rgba(38,52,49,0.03)' }}>
      <div style={{ display: 'inline-block', width: 24, height: 24, border: '2px solid rgba(0,0,0,0.04)', borderTopColor: '#C4A86D', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 16 }} />
      <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)' }}>Loading…</div>
    </div>
  );
}
function EmptyCard({ titleText, subtitleText, ctaText, onCta }) {
  return (
    <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid rgba(0,0,0,0.06)', padding: '64px 32px', textAlign: 'center', boxShadow: '0 2px 10px rgba(38,52,49,0.03)' }}>
      <div style={{ display: 'inline-flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#C4A86D', opacity: 0.8, animation: 'pulse 1.8s infinite' }} />
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(0,0,0,0.10)' }} />
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(0,0,0,0.06)' }} />
      </div>
      <div style={{ fontWeight: 600, fontSize: 16, color: '#1A1A1A', marginBottom: 8, letterSpacing: '-0.2px' }}>{titleText}</div>
      <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)', lineHeight: 1.6, maxWidth: 360, margin: '0 auto 20px' }}>{subtitleText}</div>
      {ctaText && (
        <button onClick={onCta} style={{
          padding: '9px 18px', borderRadius: 10, border: 'none',
          background: '#C4A86D', color: '#FFFFFF',
          fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: INTER,
        }}>{ctaText}</button>
      )}
    </div>
  );
}
function DrawerHeader({ title, editing, onClose }) {
  return (
    <div style={{
      padding: '18px 22px', borderBottom: '1px solid rgba(0,0,0,0.06)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(0,0,0,0.38)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>
          {editing ? 'Edit' : 'New'}
        </div>
        <div style={{ fontWeight: 700, fontSize: 18, color: '#1A1A1A', letterSpacing: '-0.2px' }}>{title}</div>
      </div>
      <button onClick={onClose} style={{
        width: 34, height: 34, borderRadius: 8, border: 'none',
        background: 'rgba(0,0,0,0.04)', color: '#1A1A1A',
        fontSize: 18, cursor: 'pointer', lineHeight: 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>×</button>
    </div>
  );
}
function DrawerFooter({ saving, editing, onCancel, onSave, saveLabel }) {
  return (
    <div style={{
      padding: '14px 22px', borderTop: '1px solid rgba(0,0,0,0.06)',
      display: 'flex', gap: 10, justifyContent: 'flex-end',
    }}>
      <button onClick={onCancel} style={{
        padding: '10px 18px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.06)',
        background: '#FFFFFF', color: 'rgba(0,0,0,0.55)',
        fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: INTER,
      }}>Cancel</button>
      <button onClick={onSave} disabled={saving} style={{
        padding: '10px 22px', borderRadius: 10, border: 'none',
        background: '#1A1A1A', color: '#EDEDED',
        fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: INTER,
        opacity: saving ? 0.6 : 1,
        display: 'inline-flex', alignItems: 'center', gap: 8,
      }}>
        {saving && <span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#EDEDED', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />}
        {saving ? 'Saving…' : editing ? 'Save changes' : `Create ${saveLabel}`}
      </button>
    </div>
  );
}

AdminCoupons.getLayout = (page) => page;