// pages/admin/customers-v2.js
//
// ★ REDESIGN EXEMPLAR ★ — duplicate of /admin/customers on the Orders/Kitchen
// "ok-root" dark theme (via <OkShell>). ALL logic (live CRM + restaurant
// listeners, loyalty config, last-visit filter, search, sync-from-orders, CSV
// export, add/edit drawer, points adjust, delete) is copied verbatim from
// customers.js — only the render is new. Original /admin/customers untouched.
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import OkShell from '../../components/admin/OkShell';
import ConfirmModal from '../../components/ConfirmModal';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import { exportRowsCsv } from '../../lib/csv';
import {
  createCustomer, updateCustomer, deleteCustomer, adjustCustomerPoints,
  loyaltyFor, updateRestaurant,
} from '../../lib/db';
import toast from 'react-hot-toast';

const WHATSAPP = '#3FAA63';
const INFO = '#6E8EAF';

const inputStyle = {
  width: '100%', padding: '11px 13px', boxSizing: 'border-box',
  background: 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 10,
  fontSize: 14, color: 'var(--tx)', fontFamily: 'var(--font-body)', outline: 'none',
};
const labelStyle = { display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700, color: 'var(--tx-3)', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 6 };
const primaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)', cursor: 'pointer' };
const ghostBtn = { padding: '8px 13px', borderRadius: 10, cursor: 'pointer', border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--tx-2)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-display)' };

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
function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-IN', sameYear ? { day: '2-digit', month: 'short' } : { day: '2-digit', month: 'short', year: 'numeric' });
}
function visitCutoffMs(key) {
  const now = Date.now();
  switch (key) {
    case '7d':  return now -   7 * 86400000;
    case '30d': return now -  30 * 86400000;
    case '90d': return now -  90 * 86400000;
    default:    return null;
  }
}

const EMPTY = { name: '', phone: '', email: '', tags: '', notes: '', marketingOptOut: false };

export default function CustomersV2() {
  const { user, userData } = useAuth();
  const { ready, isAdmin, rid, scopedDb, canView } = useFeatureAccess('customers');
  const restaurantName = userData?.restaurantName || 'Your Restaurant';

  const [customers, setCustomers] = useState([]);
  const [rest, setRest] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [syncing, setSyncing] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [pointsFor, setPointsFor] = useState(null);
  const [pointsInput, setPointsInput] = useState('');
  const [confirm, setConfirm] = useState(null);

  const [cfgForm, setCfgForm] = useState({ loyaltyEnabled: false, pointsPer100: '1', pointValue: '1' });
  const [cfgSaving, setCfgSaving] = useState(false);
  const [cfgOpen, setCfgOpen] = useState(false);

  useEffect(() => {
    if (!rid || !canView) return;
    const un = onSnapshot(
      collection(scopedDb, 'restaurants', rid, 'customers'),
      snap => { setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoaded(true); },
      () => setLoaded(true)
    );
    return un;
  }, [rid]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [rid]); // eslint-disable-line react-hooks/exhaustive-deps

  const cfg = { pointsPer100: rest?.pointsPer100 ?? 1, pointValue: rest?.pointValue ?? 1 };
  const loyaltyOn = !!rest?.loyaltyEnabled;

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cutoff = visitCutoffMs(dateFilter);
    return [...customers]
      .filter(c => {
        if (cutoff !== null) {
          const t = c.lastSeenAt ? new Date(c.lastSeenAt).getTime() : 0;
          if (!t || t < cutoff) return false;
        }
        if (!q) return true;
        return [c.name, c.phone, c.email, (c.tags || []).join(' ')].some(f => String(f || '').toLowerCase().includes(q));
      })
      .sort((a, b) => String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || '')));
  }, [customers, search, dateFilter]);

  const totals = useMemo(() => {
    let visits = 0, spent = 0, points = 0;
    for (const c of customers) {
      visits += Number(c.visits) || 0;
      spent += Number(c.totalSpent) || 0;
      points += loyaltyFor(c, cfg).balance;
    }
    return { visits, spent, points };
  }, [customers, cfg]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportCSV = () => {
    const rows = [
      ['Name', 'Phone', 'Email', 'Tags', 'Visits', 'Total Spent (INR)', 'Loyalty Points', 'Last Seen', 'Marketing Opt-out'],
      ...sorted.map(c => [
        c.name || '', c.phone || c.id || '', c.email || '',
        Array.isArray(c.tags) ? c.tags.join('; ') : (c.tags || ''),
        Number(c.visits) || 0, Math.round(Number(c.totalSpent) || 0), loyaltyFor(c, cfg).balance,
        c.lastSeenAt ? String(c.lastSeenAt).slice(0, 10) : '', c.marketingOptOut ? 'Yes' : 'No',
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
    setForm({ name: c.name || '', phone: c.phone || '', email: c.email || '', tags: (c.tags || []).join(', '), notes: c.notes || '', marketingOptOut: !!c.marketingOptOut });
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
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Head><title>Customers — HaloHelm</title></Head>
        <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 14 }}>Loading…</div>
      </div>
    );
  }
  if (!canView) {
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <Head><title>Customers — HaloHelm</title></Head>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div>
          <div style={{ color: 'var(--tx)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>No access</div>
          <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.6 }}>Your role doesn’t include Customers. Ask the owner to grant it.</div>
        </div>
      </div>
    );
  }

  const headRight = (
    <>
      {isAdmin && <button onClick={runSync} disabled={syncing} style={{ ...ghostBtn, opacity: syncing ? 0.6 : 1 }}>{syncing ? 'Syncing…' : '↻ Sync from orders'}</button>}
      <button onClick={exportCSV} style={ghostBtn}>↓ Export CSV</button>
      <button onClick={openNew} style={primaryBtn}>+ Add customer</button>
    </>
  );

  return (
    <>
      <Head><title>Customers — HaloHelm</title></Head>
      <OkShell active={null} eyebrow="Guest list · CRM" title="Customers" brand={restaurantName} headRight={headRight}>
        {/* Summary */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <SCard label="Customers" value={customers.length} />
          <SCard label="Total visits" value={totals.visits} />
          <SCard label="Lifetime spend" value={formatRupee(totals.spent)} />
          {loyaltyOn && <SCard label="Points outstanding" value={totals.points.toLocaleString('en-IN')} accent="var(--gold)" />}
        </div>

        {/* Loyalty config — owner-only */}
        {isAdmin && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, marginBottom: 18, overflow: 'hidden' }}>
            <button onClick={() => setCfgOpen(o => !o)} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--tx)' }}>
                Loyalty programme {loyaltyOn ? <span style={{ color: 'var(--success)', fontWeight: 700, fontSize: 12 }}>· ON</span> : <span style={{ color: 'var(--tx-3)', fontWeight: 700, fontSize: 12 }}>· OFF</span>}
              </span>
              <span style={{ color: 'var(--tx-3)', fontSize: 13, fontFamily: 'var(--font-body)' }}>{cfgOpen ? 'Hide' : 'Settings'}</span>
            </button>
            {cfgOpen && (
              <div style={{ padding: '4px 16px 16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--tx)', cursor: 'pointer', marginBottom: 14 }}>
                  <input type="checkbox" checked={cfgForm.loyaltyEnabled} onChange={e => setCfgForm(f => ({ ...f, loyaltyEnabled: e.target.checked }))} style={{ width: 17, height: 17, accentColor: 'var(--gold)' }} />
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
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)', marginTop: 10, lineHeight: 1.5 }}>
                  Points are earned automatically from each guest's paid spend. Add bonuses or redeem points per customer below.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Last-visit chips */}
        {customers.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--tx-3)', letterSpacing: '.06em', textTransform: 'uppercase', marginRight: 4 }}>Last visit</span>
            {[{ k: 'all', label: 'All' }, { k: '7d', label: 'Last 7 days' }, { k: '30d', label: 'Last 30 days' }, { k: '90d', label: 'Last 90 days' }].map(opt => {
              const sel = dateFilter === opt.k;
              return (
                <button key={opt.k} type="button" onClick={() => setDateFilter(opt.k)} style={{
                  padding: '6px 12px', borderRadius: 'var(--r-pill)', border: sel ? 'none' : '1px solid var(--line)',
                  background: sel ? 'var(--accent)' : 'var(--card)', color: sel ? 'var(--accent-ink)' : 'var(--tx-2)',
                  fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>{opt.label}</button>
              );
            })}
          </div>
        )}

        {/* Search */}
        {customers.length > 0 && (
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone, email or tag…" style={{ ...inputStyle, maxWidth: 420, marginBottom: 18 }} />
        )}

        {loaded && customers.length === 0 && (
          <div style={{ textAlign: 'center', padding: '56px 20px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16 }}>
            <div style={{ fontSize: 34, marginBottom: 12 }}>👥</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--tx)', marginBottom: 6 }}>No customers yet</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-3)', maxWidth: 380, margin: '0 auto', lineHeight: 1.6 }}>Tap “Sync from orders” to build your guest list from existing orders &amp; bookings, or add one manually.</div>
          </div>
        )}
        {loaded && customers.length > 0 && sorted.length === 0 && (
          <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 14, padding: '10px 2px' }}>
            {search.trim() ? <>No customers match “{search}”{dateFilter !== 'all' ? ' in that date range' : ''}.</> : <>No customers visited in that date range.</>}
          </div>
        )}

        {/* List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sorted.map(c => {
            const loy = loyaltyFor(c, cfg);
            return (
              <div key={c.id} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 15.5, fontWeight: 700, color: 'var(--tx)' }}>{c.name || 'Unnamed'}</span>
                    {(c.tags || []).map(t => <span key={t} style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(110,142,175,0.16)', color: INFO, fontSize: 11, fontWeight: 700 }}>{t}</span>)}
                    {c.marketingOptOut && <span style={{ padding: '2px 8px', borderRadius: 6, background: 'var(--card-3)', color: 'var(--tx-3)', fontSize: 11, fontWeight: 700 }}>NO MARKETING</span>}
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--tx-3)', marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <a href={`tel:${c.phone}`} style={{ color: INFO, fontWeight: 600, textDecoration: 'none' }}>{c.phone}</a>
                    <a href={`https://wa.me/91${c.phone}`} target="_blank" rel="noopener noreferrer" style={{ color: WHATSAPP, fontWeight: 700, textDecoration: 'none' }}>WhatsApp</a>
                    {c.email ? <span>{c.email}</span> : null}
                    <span>Last seen {relativeDay(c.lastSeenAt)}</span>
                    {c.firstSeenAt && <span>· Customer since {shortDate(c.firstSeenAt)}</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'center', minWidth: 64 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--tx)' }}>{c.visits || 0}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--tx-3)', fontWeight: 600, textTransform: 'uppercase' }}>Visits</div>
                </div>
                <div style={{ textAlign: 'center', minWidth: 84 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--tx)' }}>{formatRupee(c.totalSpent)}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--tx-3)', fontWeight: 600, textTransform: 'uppercase' }}>Spent</div>
                </div>
                {loyaltyOn && (
                  <button onClick={() => { setPointsFor(c); setPointsInput(''); }} title="Adjust points"
                    style={{ textAlign: 'center', minWidth: 74, background: 'rgba(196,168,109,0.12)', border: '1px solid rgba(196,168,109,0.28)', borderRadius: 10, padding: '6px 8px', cursor: 'pointer' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--gold)' }}>{loy.balance}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--gold)', fontWeight: 700, textTransform: 'uppercase' }}>Points</div>
                  </button>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => openEdit(c)} style={ghostBtn}>Edit</button>
                  <button onClick={() => requestDelete(c)} style={{ ...ghostBtn, color: 'var(--danger)' }}>✕</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add / edit drawer */}
        {drawer && (
          <>
            <div onClick={closeDrawer} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }} />
            <form onSubmit={save} style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(440px, 100vw)', zIndex: 201, background: 'var(--surface)', borderLeft: '1px solid var(--line)', boxShadow: '-20px 0 60px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '20px 22px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--tx)' }}>{drawer.mode === 'new' ? 'Add customer' : 'Edit customer'}</div>
                <button type="button" onClick={closeDrawer} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--tx-3)', cursor: 'pointer', lineHeight: 1 }}>×</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
                <div style={{ marginBottom: 16 }}><label style={labelStyle}>Name *</label><input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Priya" autoFocus /></div>
                <div style={{ marginBottom: 16 }}><label style={labelStyle}>Phone {drawer.mode === 'edit' ? '(fixed)' : '*'}</label><input style={{ ...inputStyle, opacity: drawer.mode === 'edit' ? 0.6 : 1 }} type="tel" disabled={drawer.mode === 'edit'} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))} placeholder="10-digit mobile" /></div>
                <div style={{ marginBottom: 16 }}><label style={labelStyle}>Email</label><input style={inputStyle} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Optional" /></div>
                <div style={{ marginBottom: 16 }}><label style={labelStyle}>Tags (comma separated)</label><input style={inputStyle} value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="e.g. regular, vip, birthday-may" /></div>
                <div style={{ marginBottom: 16 }}><label style={labelStyle}>Notes</label><textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Preferences, allergies, anything useful…" /></div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--tx)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.marketingOptOut} onChange={e => setForm(f => ({ ...f, marketingOptOut: e.target.checked }))} style={{ width: 17, height: 17, accentColor: 'var(--gold)' }} />
                  Don’t include in marketing campaigns
                </label>
              </div>
              <div style={{ padding: '16px 22px', borderTop: '1px solid var(--line)', display: 'flex', gap: 10 }}>
                <button type="button" onClick={closeDrawer} disabled={saving} style={{ ...ghostBtn, flex: 1, padding: '12px', fontSize: 14, textAlign: 'center', justifyContent: 'center' }}>Cancel</button>
                <button type="submit" disabled={saving} style={{ ...primaryBtn, flex: 1, justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : (drawer.mode === 'new' ? 'Add customer' : 'Save changes')}</button>
              </div>
            </form>
          </>
        )}

        {/* Adjust points modal */}
        {pointsFor && (
          <div onClick={() => setPointsFor(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 210, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: 24, width: 'min(380px, 100%)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--tx)', marginBottom: 4 }}>{pointsFor.name || pointsFor.phone}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--tx-3)', marginBottom: 16 }}>
                Balance: <b style={{ color: 'var(--gold)' }}>{loyaltyFor(pointsFor, cfg).balance} points</b>
                {cfg.pointValue > 0 ? ` · worth ${formatRupee(loyaltyFor(pointsFor, cfg).worth)}` : ''}
              </div>
              <label style={labelStyle}>Points</label>
              <input style={{ ...inputStyle, marginBottom: 16 }} type="number" min="1" step="1" value={pointsInput} onChange={e => setPointsInput(e.target.value)} placeholder="e.g. 50" autoFocus />
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => applyPoints(-1)} style={{ ...ghostBtn, flex: 1, padding: '12px', color: 'var(--danger)', textAlign: 'center', justifyContent: 'center' }}>− Redeem</button>
                <button onClick={() => applyPoints(1)} style={{ ...primaryBtn, flex: 1, justifyContent: 'center' }}>+ Add bonus</button>
              </div>
            </div>
          </div>
        )}

        <ConfirmModal open={!!confirm} title={confirm?.title} body={confirm?.body} confirmLabel={confirm?.confirmLabel} destructive={confirm?.destructive} onCancel={() => setConfirm(null)} onConfirm={async () => { await confirm.onConfirm(); setConfirm(null); }} />
      </OkShell>
    </>
  );
}

function SCard({ label, value, accent }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '12px 16px', minWidth: 130 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, marginTop: 4, color: accent || 'var(--tx)' }}>{value}</div>
    </div>
  );
}

CustomersV2.getLayout = (page) => page;
