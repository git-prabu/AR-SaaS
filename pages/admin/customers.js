// pages/admin/customers.js
//
// Phase 4 #6 — Customer CRM + loyalty. A phone-keyed registry of your
// guests with visit count, lifetime spend, and a derived loyalty-points
// balance. "Sync from orders" rebuilds it from existing orders +
// reservations (server-side, never touching the live order path).
// Points are derived (floor(spend/100) × earn rate) + a manual adjust
// delta, so redemptions/bonuses survive a re-sync. Admin-only PII.
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import EmptyState from '../../components/EmptyState';
import ConfirmModal from '../../components/ConfirmModal';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import FeatureShell from '../../components/layout/FeatureShell';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import { exportRowsCsv } from '../../lib/csv';
import {
  createCustomer, updateCustomer, deleteCustomer, adjustCustomerPoints,
  loyaltyFor, updateRestaurant,
} from '../../lib/db';
import toast from 'react-hot-toast';

const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER, cream: '#EDEDED', ink: '#1A1A1A', shell: '#FFFFFF', shellDarker: '#F8F8F8',
  warning: '#C4A86D', warningDim: '#A08656', success: '#3F9E5A', danger: '#D9534F', info: '#2D7DD2',
  whatsapp: '#25D366',
  mutedText: 'rgba(0,0,0,0.55)', faintText: 'rgba(0,0,0,0.38)', subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)', borderStrong: '1px solid rgba(0,0,0,0.10)',
  cardShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
};

const inputStyle = {
  width: '100%', padding: '11px 13px', boxSizing: 'border-box',
  background: A.shell, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 9,
  fontSize: 14, color: A.ink, fontFamily: A.font, outline: 'none',
};
const labelStyle = { display: 'block', fontSize: 11.5, fontWeight: 700, color: A.faintText, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 };

function formatRupee(n) { return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN'); }
function relativeDay(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

const EMPTY = { name: '', phone: '', email: '', tags: '', notes: '', marketingOptOut: false };

export default function AdminCustomers() {
  const { user, userData } = useAuth();
  const router = useRouter();
  // RBAC: owner OR a staff member whose role grants 'customers'. The
  // "Sync from orders" + loyalty-config controls stay owner-only (below).
  const { ready, isAdmin, rid, scopedDb, canView } = useFeatureAccess('customers');

  const [customers, setCustomers] = useState([]);
  const [rest, setRest] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [drawer, setDrawer] = useState(null);   // null | { mode:'new' } | { mode:'edit', phone }
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [pointsFor, setPointsFor] = useState(null);   // customer being adjusted
  const [pointsInput, setPointsInput] = useState('');
  const [confirm, setConfirm] = useState(null);

  // Loyalty config form (mirrors restaurant doc).
  const [cfgForm, setCfgForm] = useState({ loyaltyEnabled: false, pointsPer100: '1', pointValue: '1' });
  const [cfgSaving, setCfgSaving] = useState(false);
  const [cfgOpen, setCfgOpen] = useState(false);

  // Access + redirect handled by useFeatureAccess('customers').

  useEffect(() => {
    if (!rid || !canView) return;
    const un = onSnapshot(
      collection(scopedDb, 'restaurants', rid, 'customers'),
      snap => { setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoaded(true); },
      () => setLoaded(true)
    );
    return un;
  }, [rid]);

  useEffect(() => {
    if (!rid || !canView) return;
    const un = onSnapshot(doc(scopedDb, 'restaurants', rid), s => {
      if (!s.exists()) return;
      const d = s.data();
      setRest(d);
      setCfgForm({
        loyaltyEnabled: !!d.loyaltyEnabled,
        pointsPer100: d.pointsPer100 != null ? String(d.pointsPer100) : '1',
        pointValue: d.pointValue != null ? String(d.pointValue) : '1',
      });
    });
    return un;
  }, [rid]);

  const cfg = { pointsPer100: rest?.pointsPer100 ?? 1, pointValue: rest?.pointValue ?? 1 };
  const loyaltyOn = !!rest?.loyaltyEnabled;

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...customers]
      .filter(c => !q || [c.name, c.phone, c.email, (c.tags || []).join(' ')].some(f => String(f || '').toLowerCase().includes(q)))
      .sort((a, b) => String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || '')));
  }, [customers, search]);

  const totals = useMemo(() => {
    let visits = 0, spent = 0, points = 0;
    for (const c of customers) {
      visits += Number(c.visits) || 0;
      spent += Number(c.totalSpent) || 0;
      points += loyaltyFor(c, cfg).balance;
    }
    return { visits, spent, points };
  }, [customers, cfg]);

  // Export the current (search-filtered) customer list, loyalty points included.
  const exportCSV = () => {
    const rows = [
      ['Name', 'Phone', 'Email', 'Tags', 'Visits', 'Total Spent (INR)', 'Loyalty Points', 'Last Seen', 'Marketing Opt-out'],
      ...sorted.map(c => [
        c.name || '',
        c.phone || c.id || '',
        c.email || '',
        Array.isArray(c.tags) ? c.tags.join('; ') : (c.tags || ''),
        Number(c.visits) || 0,
        Math.round(Number(c.totalSpent) || 0),
        loyaltyFor(c, cfg).balance,
        c.lastSeenAt ? String(c.lastSeenAt).slice(0, 10) : '',
        c.marketingOptOut ? 'Yes' : 'No',
      ]),
    ];
    exportRowsCsv(rows, `customers-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const runSync = async () => {
    if (!user) return;
    setSyncing(true);
    try {
      const token = await user.getIdToken();
      const r = await fetch('/api/crm/sync', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || 'Sync failed');
      toast.success(`Synced ${j.count} customer${j.count === 1 ? '' : 's'} from orders & bookings`);
    } catch (e) {
      toast.error(e?.message || 'Sync failed');
    } finally { setSyncing(false); }
  };

  const saveCfg = async () => {
    setCfgSaving(true);
    try {
      await updateRestaurant(rid, {
        loyaltyEnabled: !!cfgForm.loyaltyEnabled,
        pointsPer100: Math.max(0, Math.round(Number(cfgForm.pointsPer100) || 0)),
        pointValue: Math.max(0, Number(cfgForm.pointValue) || 0),
      });
      toast.success('Loyalty settings saved');
    } catch (e) {
      toast.error('Save failed: ' + (e?.message || 'error'));
    } finally { setCfgSaving(false); }
  };

  const openNew = () => { setForm(EMPTY); setDrawer({ mode: 'new' }); };
  const openEdit = (c) => {
    setForm({
      name: c.name || '', phone: c.phone || '', email: c.email || '',
      tags: (c.tags || []).join(', '), notes: c.notes || '', marketingOptOut: !!c.marketingOptOut,
    });
    setDrawer({ mode: 'edit', phone: c.id });
  };
  const closeDrawer = () => { if (!saving) setDrawer(null); };

  const save = async (e) => {
    e?.preventDefault();
    if (drawer.mode === 'new' && form.phone.replace(/\D/g, '').length < 10) { toast.error('Enter a valid 10-digit phone'); return; }
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 20);
      if (drawer.mode === 'new') {
        await createCustomer(rid, { name: form.name, phone: form.phone, email: form.email, tags, notes: form.notes, marketingOptOut: form.marketingOptOut }, { db: scopedDb });
        toast.success('Customer added');
      } else {
        await updateCustomer(rid, drawer.phone, { name: form.name, email: form.email, tags, notes: form.notes, marketingOptOut: form.marketingOptOut }, { db: scopedDb });
        toast.success('Customer updated');
      }
      setDrawer(null);
    } catch (err) {
      toast.error('Save failed: ' + (err?.message || 'error'));
    } finally { setSaving(false); }
  };

  const requestDelete = (c) => setConfirm({
    title: `Delete ${c.name || c.phone}?`,
    body: 'This removes the customer from your CRM (their orders are kept). You can re-sync to bring them back.',
    confirmLabel: 'Delete', destructive: true,
    onConfirm: async () => { await deleteCustomer(rid, c.id, { db: scopedDb }); toast.success('Deleted'); },
  });

  const applyPoints = async (sign) => {
    const n = Math.round(Number(pointsInput) || 0);
    if (!n || n <= 0) { toast.error('Enter a points amount'); return; }
    const bal = loyaltyFor(pointsFor, cfg).balance;
    if (sign < 0 && n > bal) { toast.error(`Only ${bal} points available`); return; }
    try {
      await adjustCustomerPoints(rid, pointsFor.id, sign * n, { db: scopedDb });
      toast.success(sign > 0 ? `Added ${n} points` : `Redeemed ${n} points`);
      setPointsFor(null); setPointsInput('');
    } catch (e) { toast.error('Failed: ' + (e?.message || 'error')); }
  };

  if (!ready) {
    return <FeatureShell ready={ready} isAdmin={isAdmin} active="/admin/customers"><div style={{ padding: 40, fontFamily: A.font, color: A.mutedText }}>Loading…</div></FeatureShell>;
  }

  return (
    <>
      <Head><title>Customers — HaloHelm</title></Head>
      <FeatureShell ready={ready} isAdmin={isAdmin} active="/admin/customers">
        <div style={{ padding: '28px 26px', maxWidth: 980, margin: '0 auto', fontFamily: A.font, color: A.ink }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', margin: 0 }}>Customers</h1>
              <p style={{ fontSize: 13.5, color: A.mutedText, margin: '6px 0 0', lineHeight: 1.5 }}>
                Your guest list — visits, spend and loyalty points, built from your orders &amp; bookings.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {isAdmin && (
                <button onClick={runSync} disabled={syncing} style={{ ...ghostBtn, padding: '10px 15px', fontSize: 13.5, opacity: syncing ? 0.6 : 1 }}>
                  {syncing ? 'Syncing…' : '↻ Sync from orders'}
                </button>
              )}
              <button onClick={exportCSV} style={{ ...ghostBtn, padding: '10px 15px', fontSize: 13.5 }}>↓ Export CSV</button>
              <button onClick={openNew} style={primaryBtn}>+ Add customer</button>
            </div>
          </div>

          {/* Summary */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <StatCard label="Customers" value={customers.length} />
            <StatCard label="Total visits" value={totals.visits} />
            <StatCard label="Lifetime spend" value={formatRupee(totals.spent)} />
            {loyaltyOn && <StatCard label="Points outstanding" value={totals.points.toLocaleString('en-IN')} accent={A.warningDim} />}
          </div>

          {/* Loyalty config — owner-only (staff don't manage loyalty settings) */}
          {isAdmin && (
          <div style={{ background: A.shell, border: A.border, borderRadius: 12, boxShadow: A.cardShadow, marginBottom: 18, overflow: 'hidden' }}>
            <button onClick={() => setCfgOpen(o => !o)} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: INTER }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: A.ink }}>
                Loyalty programme {loyaltyOn ? <span style={{ color: A.success, fontWeight: 700, fontSize: 12 }}>· ON</span> : <span style={{ color: A.faintText, fontWeight: 700, fontSize: 12 }}>· OFF</span>}
              </span>
              <span style={{ color: A.faintText, fontSize: 13 }}>{cfgOpen ? 'Hide' : 'Settings'}</span>
            </button>
            {cfgOpen && (
              <div style={{ padding: '4px 16px 16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer', marginBottom: 14 }}>
                  <input type="checkbox" checked={cfgForm.loyaltyEnabled} onChange={e => setCfgForm(f => ({ ...f, loyaltyEnabled: e.target.checked }))} style={{ width: 17, height: 17 }} />
                  Enable loyalty points
                </label>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div style={{ width: 170 }}>
                    <label style={labelStyle}>Points per ₹100 spent</label>
                    <input style={inputStyle} type="number" min="0" step="1" value={cfgForm.pointsPer100} onChange={e => setCfgForm(f => ({ ...f, pointsPer100: e.target.value }))} />
                  </div>
                  <div style={{ width: 170 }}>
                    <label style={labelStyle}>₹ value per point</label>
                    <input style={inputStyle} type="number" min="0" step="0.1" value={cfgForm.pointValue} onChange={e => setCfgForm(f => ({ ...f, pointValue: e.target.value }))} />
                  </div>
                  <button onClick={saveCfg} disabled={cfgSaving} style={{ ...primaryBtn, opacity: cfgSaving ? 0.6 : 1 }}>{cfgSaving ? 'Saving…' : 'Save'}</button>
                </div>
                <div style={{ fontSize: 12, color: A.faintText, marginTop: 10, lineHeight: 1.5 }}>
                  Points are earned automatically from each guest's paid spend. Add bonuses or redeem points per customer below.
                </div>
              </div>
            )}
          </div>
          )}

          {/* Search */}
          {customers.length > 0 && (
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone, email or tag…" style={{ ...inputStyle, maxWidth: 420, marginBottom: 18 }} />
          )}

          {loaded && customers.length === 0 && (
            <EmptyState title="No customers yet" subtitle="Tap “Sync from orders” to build your guest list from existing orders &amp; bookings, or add one manually." />
          )}
          {loaded && customers.length > 0 && sorted.length === 0 && (
            <div style={{ color: A.mutedText, fontSize: 14, padding: '10px 2px' }}>No customers match “{search}”.</div>
          )}

          {/* List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sorted.map(c => {
              const loy = loyaltyFor(c, cfg);
              return (
                <div key={c.id} style={{ background: A.shell, border: A.border, borderRadius: 12, padding: '14px 16px', boxShadow: A.cardShadow, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15.5, fontWeight: 700 }}>{c.name || 'Unnamed'}</span>
                      {(c.tags || []).map(t => <span key={t} style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(45,125,210,0.10)', color: A.info, fontSize: 11, fontWeight: 700 }}>{t}</span>)}
                      {c.marketingOptOut && <span style={{ padding: '2px 8px', borderRadius: 6, background: A.subtleBg, color: A.faintText, fontSize: 11, fontWeight: 700 }}>NO MARKETING</span>}
                    </div>
                    <div style={{ fontSize: 12.5, color: A.mutedText, marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      <a href={`tel:${c.phone}`} style={{ color: A.info, fontWeight: 600, textDecoration: 'none' }}>{c.phone}</a>
                      <a href={`https://wa.me/91${c.phone}`} target="_blank" rel="noopener noreferrer" style={{ color: A.whatsapp, fontWeight: 700, textDecoration: 'none' }}>WhatsApp</a>
                      {c.email ? <span>{c.email}</span> : null}
                      <span style={{ color: A.faintText }}>Last seen {relativeDay(c.lastSeenAt)}</span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'center', minWidth: 64 }}>
                    <div style={{ fontSize: 17, fontWeight: 800 }}>{c.visits || 0}</div>
                    <div style={{ fontSize: 10.5, color: A.faintText, fontWeight: 600, textTransform: 'uppercase' }}>Visits</div>
                  </div>
                  <div style={{ textAlign: 'center', minWidth: 84 }}>
                    <div style={{ fontSize: 17, fontWeight: 800 }}>{formatRupee(c.totalSpent)}</div>
                    <div style={{ fontSize: 10.5, color: A.faintText, fontWeight: 600, textTransform: 'uppercase' }}>Spent</div>
                  </div>
                  {loyaltyOn && (
                    <button onClick={() => { setPointsFor(c); setPointsInput(''); }} title="Adjust points"
                      style={{ textAlign: 'center', minWidth: 74, background: 'rgba(196,168,109,0.10)', border: '1px solid rgba(196,168,109,0.25)', borderRadius: 9, padding: '6px 8px', cursor: 'pointer', fontFamily: INTER }}>
                      <div style={{ fontSize: 17, fontWeight: 800, color: A.warningDim }}>{loy.balance}</div>
                      <div style={{ fontSize: 10.5, color: A.warningDim, fontWeight: 700, textTransform: 'uppercase' }}>Points</div>
                    </button>
                  )}

                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => openEdit(c)} style={ghostBtn}>Edit</button>
                    <button onClick={() => requestDelete(c)} style={{ ...ghostBtn, color: A.danger }}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </FeatureShell>

      {/* Add / edit drawer */}
      {drawer && (
        <>
          <div onClick={closeDrawer} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 60 }} />
          <form onSubmit={save} style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(440px, 100vw)', zIndex: 61, background: A.shell, boxShadow: '-8px 0 30px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', fontFamily: A.font }}>
            <div style={{ padding: '20px 22px', borderBottom: A.border, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{drawer.mode === 'new' ? 'Add customer' : 'Edit customer'}</div>
              <button type="button" onClick={closeDrawer} style={{ background: 'none', border: 'none', fontSize: 22, color: A.faintText, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Name *</label>
                <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Priya" autoFocus />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Phone {drawer.mode === 'edit' ? '(fixed)' : '*'}</label>
                <input style={{ ...inputStyle, opacity: drawer.mode === 'edit' ? 0.6 : 1 }} type="tel" disabled={drawer.mode === 'edit'}
                  value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))} placeholder="10-digit mobile" />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Email</label>
                <input style={inputStyle} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Optional" />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Tags (comma separated)</label>
                <input style={inputStyle} value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="e.g. regular, vip, birthday-may" />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Notes</label>
                <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Preferences, allergies, anything useful…" />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.marketingOptOut} onChange={e => setForm(f => ({ ...f, marketingOptOut: e.target.checked }))} style={{ width: 17, height: 17 }} />
                Don’t include in marketing campaigns
              </label>
            </div>
            <div style={{ padding: '16px 22px', borderTop: A.border, display: 'flex', gap: 10 }}>
              <button type="button" onClick={closeDrawer} disabled={saving} style={{ ...ghostBtn, flex: 1, padding: '12px', fontSize: 14 }}>Cancel</button>
              <button type="submit" disabled={saving} style={{ ...primaryBtn, flex: 1, justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : (drawer.mode === 'new' ? 'Add customer' : 'Save changes')}</button>
            </div>
          </form>
        </>
      )}

      {/* Adjust points modal */}
      {pointsFor && (
        <div onClick={() => setPointsFor(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: A.shell, borderRadius: 16, padding: '24px', width: 'min(380px, 100%)', fontFamily: A.font, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{pointsFor.name || pointsFor.phone}</div>
            <div style={{ fontSize: 13.5, color: A.mutedText, marginBottom: 16 }}>
              Balance: <b style={{ color: A.warningDim }}>{loyaltyFor(pointsFor, cfg).balance} points</b>
              {cfg.pointValue > 0 ? ` · worth ${formatRupee(loyaltyFor(pointsFor, cfg).worth)}` : ''}
            </div>
            <label style={labelStyle}>Points</label>
            <input style={{ ...inputStyle, marginBottom: 16 }} type="number" min="1" step="1" value={pointsInput} onChange={e => setPointsInput(e.target.value)} placeholder="e.g. 50" autoFocus />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => applyPoints(-1)} style={{ ...ghostBtn, flex: 1, padding: '12px', color: A.danger }}>− Redeem</button>
              <button onClick={() => applyPoints(1)} style={{ ...primaryBtn, flex: 1, justifyContent: 'center' }}>+ Add bonus</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirm} title={confirm?.title} body={confirm?.body}
        confirmLabel={confirm?.confirmLabel} destructive={confirm?.destructive}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => { await confirm.onConfirm(); setConfirm(null); }}
      />
    </>
  );
}

const primaryBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 9,
  border: 'none', background: A.ink, color: A.cream, fontSize: 13.5, fontWeight: 700, fontFamily: INTER, cursor: 'pointer',
};
const ghostBtn = {
  padding: '8px 13px', borderRadius: 8, cursor: 'pointer',
  border: '1px solid rgba(0,0,0,0.12)', background: A.shell, color: A.mutedText,
  fontSize: 13, fontWeight: 700, fontFamily: INTER,
};

function StatCard({ label, value, accent }) {
  return (
    <div style={{ background: A.shell, border: A.border, borderRadius: 12, padding: '12px 16px', minWidth: 130, boxShadow: A.cardShadow }}>
      <div style={{ fontSize: 11, color: A.faintText, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: accent || A.ink }}>{value}</div>
    </div>
  );
}
