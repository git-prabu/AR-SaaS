// pages/admin/vendors-v2.js
//
// ★ REDESIGN EXEMPLAR ★ — duplicate of /admin/vendors on the dark "ok-root"
// theme (via <OkShell>). Logic copied verbatim from vendors.js — only the
// render is new. Original untouched.
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import OkShell from '../../components/admin/OkShell';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import { exportRowsCsv } from '../../lib/csv';
import ConfirmModal from '../../components/ConfirmModal';
import { collection, onSnapshot } from 'firebase/firestore';
import { createVendor, updateVendor, deleteVendor } from '../../lib/db';
import toast from 'react-hot-toast';

const VENDOR_CATEGORIES = [
  'Vegetables & Fruits', 'Dairy & Eggs', 'Meat & Seafood', 'Groceries & Staples',
  'Beverages', 'Bakery', 'Gas & Fuel', 'Packaging & Disposables',
  'Cleaning & Supplies', 'Equipment', 'Rent', 'Utilities', 'Other',
];

const EMPTY = { name: '', phone: '', category: '', gstin: '', openingBalance: '', notes: '', isActive: true };

const inputStyle = {
  width: '100%', padding: '11px 13px', boxSizing: 'border-box',
  background: 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 10,
  fontSize: 14, color: 'var(--tx)', fontFamily: 'var(--font-body)', outline: 'none',
};
const labelStyle = { display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700, color: 'var(--tx-3)', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 6 };
const primaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)', cursor: 'pointer' };
const ghostBtn = { padding: '8px 13px', borderRadius: 10, cursor: 'pointer', border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--tx-2)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-display)' };

function formatRupee(n) { return '₹' + (Math.round(Number(n) || 0)).toLocaleString('en-IN'); }

export default function VendorsV2() {
  const { userData } = useAuth();
  const { ready, isAdmin, rid, scopedDb, canView, planAllowsFeature } = useFeatureAccess('vendors');
  const restaurantName = userData?.restaurantName || 'Your Restaurant';

  const [vendors, setVendors] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [drawer, setDrawer] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    if (!rid || !canView) return;
    const un = onSnapshot(collection(scopedDb, 'restaurants', rid, 'vendors'),
      snap => { setVendors(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoaded(true); },
      () => setLoaded(true));
    return un;
  }, [rid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!rid || !canView) return;
    const un = onSnapshot(collection(scopedDb, 'restaurants', rid, 'expenses'),
      snap => setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {});
    return un;
  }, [rid]); // eslint-disable-line react-hooks/exhaustive-deps

  const agg = useMemo(() => {
    const m = {};
    for (const e of expenses) {
      if (!e.vendorId) continue;
      const a = m[e.vendorId] || { credit: 0, total: 0 };
      const amt = Number(e.amount) || 0;
      a.total += amt;
      if (e.paymentMode === 'credit') a.credit += amt;
      m[e.vendorId] = a;
    }
    return m;
  }, [expenses]);

  const outstandingOf = (v) => (Number(v.openingBalance) || 0) + (agg[v.id]?.credit || 0);

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...vendors]
      .filter(v => !q || [v.name, v.category, v.phone, v.gstin].some(f => String(f || '').toLowerCase().includes(q)))
      .sort((a, b) => {
        if ((a.isActive !== false) !== (b.isActive !== false)) return a.isActive === false ? 1 : -1;
        const od = outstandingOf(b) - outstandingOf(a);
        if (od !== 0) return od;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
  }, [vendors, search, agg]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalOutstanding = useMemo(() => vendors.reduce((s, v) => s + outstandingOf(v), 0), [vendors, agg]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportCSV = () => {
    const rows = [
      ['Name', 'Category', 'Phone', 'GSTIN', 'Opening Balance (INR)', 'Outstanding (INR)', 'Active', 'Notes'],
      ...sorted.map(v => [v.name || '', v.category || '', v.phone || '', v.gstin || '', Math.round(Number(v.openingBalance) || 0), Math.round(outstandingOf(v)), v.isActive === false ? 'No' : 'Yes', v.notes || '']),
    ];
    exportRowsCsv(rows, `vendors-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const openNew = () => { setForm(EMPTY); setDrawer({ mode: 'new' }); };
  const openEdit = (v) => {
    setForm({ name: v.name || '', phone: v.phone || '', category: v.category || '', gstin: v.gstin || '', openingBalance: v.openingBalance ? String(v.openingBalance) : '', notes: v.notes || '', isActive: v.isActive !== false });
    setDrawer({ mode: 'edit', id: v.id });
  };
  const closeDrawer = () => { if (!saving) setDrawer(null); };

  const save = async (e) => {
    e?.preventDefault();
    if (!form.name.trim()) { toast.error('Vendor name is required'); return; }
    setSaving(true);
    try {
      const payload = { name: form.name, phone: form.phone, category: form.category, gstin: form.gstin, openingBalance: Number(form.openingBalance) || 0, notes: form.notes, isActive: form.isActive };
      if (drawer.mode === 'new') { await createVendor(rid, payload, { db: scopedDb }); toast.success('Vendor added'); }
      else { await updateVendor(rid, drawer.id, payload, { db: scopedDb }); toast.success('Vendor updated'); }
      setDrawer(null);
    } catch (err) {
      toast.error('Save failed: ' + (err?.message || 'error'));
    } finally { setSaving(false); }
  };

  const requestDelete = (v) => setConfirm({
    title: `Delete ${v.name || 'vendor'}?`,
    body: 'This removes the vendor from your registry. Past expense records linked to them are kept.',
    confirmLabel: 'Delete', destructive: true,
    onConfirm: async () => { await deleteVendor(rid, v.id, { db: scopedDb }); toast.success('Vendor deleted'); },
  });

  if (!ready) {
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Head><title>Vendors — HaloHelm</title></Head>
        <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 14 }}>Loading…</div>
      </div>
    );
  }
  if (planAllowsFeature === false) {
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <Head><title>Vendors — HaloHelm</title></Head>
        <div style={{ textAlign: 'center', maxWidth: 380 }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>✦</div>
          <div style={{ color: 'var(--tx)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Upgrade required</div>
          <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.6, marginBottom: 18 }}>The Vendor registry is available on a higher plan. Upgrade to track suppliers and credit.</div>
          <Link href="/admin/subscription" style={{ ...primaryBtn, textDecoration: 'none' }}>View plans →</Link>
        </div>
      </div>
    );
  }
  if (!canView) {
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <Head><title>Vendors — HaloHelm</title></Head>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div>
          <div style={{ color: 'var(--tx)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>No access</div>
          <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.6 }}>Your role doesn’t include Vendors. Ask the owner to grant it.</div>
        </div>
      </div>
    );
  }

  const headRight = (
    <>
      <button onClick={exportCSV} style={ghostBtn}>↓ Export CSV</button>
      <button onClick={openNew} style={primaryBtn}>+ Add vendor</button>
    </>
  );

  return (
    <>
      <Head><title>Vendors — HaloHelm</title></Head>
      <OkShell active={null} eyebrow="Suppliers · accounts payable" title="Vendors" brand={restaurantName} headRight={headRight}>
        {/* Summary */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <SCard label="Vendors" value={vendors.filter(v => v.isActive !== false).length} />
          <SCard label="Outstanding (you owe)" value={formatRupee(totalOutstanding)} accent={totalOutstanding > 0 ? 'var(--danger)' : 'var(--success)'} />
        </div>

        {vendors.length > 0 && (
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, category, phone or GSTIN…" style={{ ...inputStyle, maxWidth: 420, marginBottom: 18 }} />
        )}

        {loaded && vendors.length === 0 && (
          <div style={{ textAlign: 'center', padding: '56px 20px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16 }}>
            <div style={{ fontSize: 34, marginBottom: 12 }}>🚚</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--tx)', marginBottom: 6 }}>No vendors yet</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-3)', maxWidth: 380, margin: '0 auto', lineHeight: 1.6 }}>Add your suppliers to track purchases and credit. Tap “Add vendor” to start.</div>
          </div>
        )}
        {loaded && vendors.length > 0 && sorted.length === 0 && (
          <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 14, padding: '10px 2px' }}>No vendors match “{search}”.</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sorted.map(v => {
            const outstanding = outstandingOf(v);
            const total = agg[v.id]?.total || 0;
            const inactive = v.isActive === false;
            return (
              <div key={v.id} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', opacity: inactive ? 0.6 : 1 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 15.5, fontWeight: 700, color: 'var(--tx)' }}>{v.name}</span>
                    {v.category ? <span style={{ padding: '2px 9px', borderRadius: 6, background: 'var(--card-3)', color: 'var(--tx-2)', fontSize: 11, fontWeight: 700 }}>{v.category}</span> : null}
                    {inactive && <span style={{ padding: '2px 9px', borderRadius: 6, background: 'var(--card-3)', color: 'var(--tx-3)', fontSize: 11, fontWeight: 700 }}>INACTIVE</span>}
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--tx-3)', marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {v.phone ? <a href={`tel:${v.phone}`} style={{ color: 'var(--st-paid)', fontWeight: 600, textDecoration: 'none' }}>{v.phone}</a> : <span>No phone</span>}
                    {v.gstin ? <span>GSTIN {v.gstin}</span> : null}
                    {total > 0 ? <span>Total billed {formatRupee(total)}</span> : null}
                  </div>
                  {v.notes ? <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--tx-3)', marginTop: 4 }}>{v.notes}</div> : null}
                </div>
                <div style={{ textAlign: 'right', minWidth: 110 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Outstanding</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: outstanding > 0 ? 'var(--danger)' : 'var(--success)' }}>{formatRupee(outstanding)}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => openEdit(v)} style={ghostBtn}>Edit</button>
                  <button onClick={() => requestDelete(v)} style={{ ...ghostBtn, color: 'var(--danger)' }}>✕</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Drawer */}
        {drawer && (
          <>
            <div onClick={closeDrawer} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }} />
            <form onSubmit={save} style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(440px, 100vw)', zIndex: 201, background: 'var(--surface)', borderLeft: '1px solid var(--line)', boxShadow: '-20px 0 60px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '20px 22px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--tx)' }}>{drawer.mode === 'new' ? 'Add vendor' : 'Edit vendor'}</div>
                <button type="button" onClick={closeDrawer} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--tx-3)', cursor: 'pointer', lineHeight: 1 }}>×</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
                <div style={{ marginBottom: 16 }}><label style={labelStyle}>Vendor name *</label><input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Anand Vegetables" autoFocus /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div><label style={labelStyle}>Phone</label><input style={inputStyle} type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 15) }))} placeholder="Mobile" /></div>
                  <div><label style={labelStyle}>Category</label>
                    <select style={inputStyle} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                      <option value="">Select…</option>
                      {VENDOR_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div><label style={labelStyle}>GSTIN</label><input style={inputStyle} value={form.gstin} onChange={e => setForm(f => ({ ...f, gstin: e.target.value.toUpperCase().slice(0, 15) }))} placeholder="Optional" /></div>
                  <div><label style={labelStyle}>Opening balance (₹)</label><input style={inputStyle} type="number" min="0" step="1" value={form.openingBalance} onChange={e => setForm(f => ({ ...f, openingBalance: e.target.value }))} placeholder="Amount you owe now" /></div>
                </div>
                <div style={{ marginBottom: 16 }}><label style={labelStyle}>Notes</label><textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Delivery days, payment terms, contact person…" /></div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--tx)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} style={{ width: 17, height: 17, accentColor: 'var(--gold)' }} />
                  Active vendor
                </label>
              </div>
              <div style={{ padding: '16px 22px', borderTop: '1px solid var(--line)', display: 'flex', gap: 10 }}>
                <button type="button" onClick={closeDrawer} disabled={saving} style={{ ...ghostBtn, flex: 1, padding: '12px', fontSize: 14, textAlign: 'center', justifyContent: 'center' }}>Cancel</button>
                <button type="submit" disabled={saving} style={{ ...primaryBtn, flex: 1, justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : (drawer.mode === 'new' ? 'Add vendor' : 'Save changes')}</button>
              </div>
            </form>
          </>
        )}

        <ConfirmModal open={!!confirm} title={confirm?.title} body={confirm?.body} confirmLabel={confirm?.confirmLabel} destructive={confirm?.destructive} onCancel={() => setConfirm(null)} onConfirm={async () => { await confirm.onConfirm(); setConfirm(null); }} />
      </OkShell>
    </>
  );
}

function SCard({ label, value, accent }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '12px 16px', minWidth: 150 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, marginTop: 4, color: accent || 'var(--tx)' }}>{value}</div>
    </div>
  );
}

VendorsV2.getLayout = (page) => page;
