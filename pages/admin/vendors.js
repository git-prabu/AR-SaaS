// pages/admin/vendors.js
//
// Phase 3 #5 (1/3) — Vendor / supplier registry. The back-of-house
// address book: who you buy from, their category, GST number, and how
// much you currently owe them. "Outstanding" is derived live from the
// expenses collection (openingBalance + every credit-mode expense booked
// against this vendor) — there's no separate ledger doc to drift, and
// the user clears a credit by editing that expense's payment mode on the
// /admin/expenses page. Financial data → admin-only (see firestore.rules).
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import FeatureShell from '../../components/layout/FeatureShell';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import EmptyState from '../../components/EmptyState';
import ConfirmModal from '../../components/ConfirmModal';
import { db } from '../../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { createVendor, updateVendor, deleteVendor } from '../../lib/db';
import toast from 'react-hot-toast';

const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER, cream: '#EDEDED', ink: '#1A1A1A', shell: '#FFFFFF', shellDarker: '#F8F8F8',
  warning: '#C4A86D', warningDim: '#A08656', success: '#3F9E5A', danger: '#D9534F', info: '#2D7DD2',
  mutedText: 'rgba(0,0,0,0.55)', faintText: 'rgba(0,0,0,0.38)', subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)', borderStrong: '1px solid rgba(0,0,0,0.10)',
  cardShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
};

// Categories shared (conceptually) with the expense page so a vendor's
// type lines up with the expense bucket it usually feeds.
const VENDOR_CATEGORIES = [
  'Vegetables & Fruits', 'Dairy & Eggs', 'Meat & Seafood', 'Groceries & Staples',
  'Beverages', 'Bakery', 'Gas & Fuel', 'Packaging & Disposables',
  'Cleaning & Supplies', 'Equipment', 'Rent', 'Utilities', 'Other',
];

const EMPTY = { name: '', phone: '', category: '', gstin: '', openingBalance: '', notes: '', isActive: true };

const inputStyle = {
  width: '100%', padding: '11px 13px', boxSizing: 'border-box',
  background: A.shell, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 9,
  fontSize: 14, color: A.ink, fontFamily: A.font, outline: 'none',
};
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 700, color: A.faintText, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 };

function formatRupee(n) {
  const v = Math.round(Number(n) || 0);
  return '₹' + v.toLocaleString('en-IN');
}

export default function AdminVendors() {
  const router = useRouter();
  // RBAC: owner OR a staff member whose role grants 'vendors'.
  const { ready, isAdmin, rid, scopedDb, canView } = useFeatureAccess('vendors');

  const [vendors, setVendors] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [drawer, setDrawer] = useState(null);   // null | { mode:'new' } | { mode:'edit', id }
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);

  // Access + redirect handled by useFeatureAccess('vendors').

  // Vendors (live).
  useEffect(() => {
    if (!rid || !canView) return;
    const un = onSnapshot(
      collection(scopedDb, 'restaurants', rid, 'vendors'),
      snap => { setVendors(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoaded(true); },
      () => setLoaded(true)
    );
    return un;
  }, [rid]);

  // Expenses (live) — only used to derive each vendor's outstanding +
  // lifetime spend. We don't render the rows here.
  useEffect(() => {
    if (!rid || !canView) return;
    const un = onSnapshot(
      collection(scopedDb, 'restaurants', rid, 'expenses'),
      snap => setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {}
    );
    return un;
  }, [rid]);

  // Per-vendor aggregates: { credit, total } summed from expenses.
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
        // Active first, then by outstanding desc, then name.
        if ((a.isActive !== false) !== (b.isActive !== false)) return a.isActive === false ? 1 : -1;
        const od = outstandingOf(b) - outstandingOf(a);
        if (od !== 0) return od;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
  }, [vendors, search, agg]);

  const totalOutstanding = useMemo(() => vendors.reduce((s, v) => s + outstandingOf(v), 0), [vendors, agg]);

  const openNew = () => { setForm(EMPTY); setDrawer({ mode: 'new' }); };
  const openEdit = (v) => {
    setForm({
      name: v.name || '', phone: v.phone || '', category: v.category || '', gstin: v.gstin || '',
      openingBalance: v.openingBalance ? String(v.openingBalance) : '', notes: v.notes || '',
      isActive: v.isActive !== false,
    });
    setDrawer({ mode: 'edit', id: v.id });
  };
  const closeDrawer = () => { if (!saving) setDrawer(null); };

  const save = async (e) => {
    e?.preventDefault();
    if (!form.name.trim()) { toast.error('Vendor name is required'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name, phone: form.phone, category: form.category, gstin: form.gstin,
        openingBalance: Number(form.openingBalance) || 0, notes: form.notes, isActive: form.isActive,
      };
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
    return <FeatureShell isAdmin={isAdmin} active="/admin/vendors"><div style={{ padding: 40, fontFamily: A.font, color: A.mutedText }}>Loading…</div></FeatureShell>;
  }

  return (
    <>
      <Head><title>Vendors — HaloHelm</title></Head>
      <FeatureShell isAdmin={isAdmin} active="/admin/vendors">
        <div style={{ padding: '28px 26px', maxWidth: 960, margin: '0 auto', fontFamily: A.font, color: A.ink }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', margin: 0 }}>Vendors</h1>
              <p style={{ fontSize: 13.5, color: A.mutedText, margin: '6px 0 0', lineHeight: 1.5 }}>
                Your suppliers — track who you buy from and what you owe them.
              </p>
            </div>
            <button onClick={openNew} style={primaryBtn}>+ Add vendor</button>
          </div>

          {/* Summary strip */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <StatCard label="Vendors" value={vendors.filter(v => v.isActive !== false).length} />
            <StatCard label="Outstanding (you owe)" value={formatRupee(totalOutstanding)} accent={totalOutstanding > 0 ? A.danger : A.success} />
          </div>

          {/* Search */}
          {vendors.length > 0 && (
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, category, phone or GSTIN…"
              style={{ ...inputStyle, maxWidth: 420, marginBottom: 18 }}
            />
          )}

          {loaded && vendors.length === 0 && (
            <EmptyState title="No vendors yet" subtitle="Add your suppliers to track purchases and credit. Tap “Add vendor” to start." />
          )}

          {loaded && vendors.length > 0 && sorted.length === 0 && (
            <div style={{ color: A.mutedText, fontSize: 14, padding: '10px 2px' }}>No vendors match “{search}”.</div>
          )}

          {/* Vendor cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sorted.map(v => {
              const outstanding = outstandingOf(v);
              const total = agg[v.id]?.total || 0;
              const inactive = v.isActive === false;
              return (
                <div key={v.id} style={{
                  background: A.shell, border: A.border, borderRadius: 12, padding: '14px 16px',
                  boxShadow: A.cardShadow, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                  opacity: inactive ? 0.62 : 1,
                }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15.5, fontWeight: 700 }}>{v.name}</span>
                      {v.category ? (
                        <span style={{ padding: '2px 9px', borderRadius: 6, background: A.subtleBg, color: A.mutedText, fontSize: 11, fontWeight: 700 }}>{v.category}</span>
                      ) : null}
                      {inactive && <span style={{ padding: '2px 9px', borderRadius: 6, background: 'rgba(0,0,0,0.06)', color: A.faintText, fontSize: 11, fontWeight: 700 }}>INACTIVE</span>}
                    </div>
                    <div style={{ fontSize: 12.5, color: A.mutedText, marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {v.phone ? <a href={`tel:${v.phone}`} style={{ color: A.info, fontWeight: 600, textDecoration: 'none' }}>{v.phone}</a> : <span style={{ color: A.faintText }}>No phone</span>}
                      {v.gstin ? <span>GSTIN {v.gstin}</span> : null}
                      {total > 0 ? <span>Total billed {formatRupee(total)}</span> : null}
                    </div>
                    {v.notes ? <div style={{ fontSize: 12.5, color: A.faintText, marginTop: 4 }}>{v.notes}</div> : null}
                  </div>

                  <div style={{ textAlign: 'right', minWidth: 110 }}>
                    <div style={{ fontSize: 11, color: A.faintText, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Outstanding</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: outstanding > 0 ? A.danger : A.success }}>{formatRupee(outstanding)}</div>
                  </div>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => openEdit(v)} style={ghostBtn}>Edit</button>
                    <button onClick={() => requestDelete(v)} style={{ ...ghostBtn, color: A.danger }}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </FeatureShell>

      {/* Slide-in drawer: create / edit */}
      {drawer && (
        <>
          <div onClick={closeDrawer} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 60 }} />
          <form onSubmit={save} style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(440px, 100vw)', zIndex: 61,
            background: A.shell, boxShadow: '-8px 0 30px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column',
            fontFamily: A.font,
          }}>
            <div style={{ padding: '20px 22px', borderBottom: A.border, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.3px' }}>{drawer.mode === 'new' ? 'Add vendor' : 'Edit vendor'}</div>
              <button type="button" onClick={closeDrawer} style={{ background: 'none', border: 'none', fontSize: 22, color: A.faintText, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Vendor name *</label>
                <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Anand Vegetables" autoFocus />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input style={inputStyle} type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 15) }))} placeholder="Mobile" />
                </div>
                <div>
                  <label style={labelStyle}>Category</label>
                  <select style={inputStyle} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    <option value="">Select…</option>
                    {VENDOR_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>GSTIN</label>
                  <input style={inputStyle} value={form.gstin} onChange={e => setForm(f => ({ ...f, gstin: e.target.value.toUpperCase().slice(0, 15) }))} placeholder="Optional" />
                </div>
                <div>
                  <label style={labelStyle}>Opening balance (₹)</label>
                  <input style={inputStyle} type="number" min="0" step="1" value={form.openingBalance} onChange={e => setForm(f => ({ ...f, openingBalance: e.target.value }))} placeholder="Amount you owe now" />
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Notes</label>
                <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Delivery days, payment terms, contact person…" />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: A.ink, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} style={{ width: 17, height: 17 }} />
                Active vendor
              </label>
            </div>

            <div style={{ padding: '16px 22px', borderTop: A.border, display: 'flex', gap: 10 }}>
              <button type="button" onClick={closeDrawer} disabled={saving} style={{ ...ghostBtn, flex: 1, padding: '12px', fontSize: 14 }}>Cancel</button>
              <button type="submit" disabled={saving} style={{ ...primaryBtn, flex: 1, justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : (drawer.mode === 'new' ? 'Add vendor' : 'Save changes')}
              </button>
            </div>
          </form>
        </>
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
  border: 'none', background: A.ink, color: A.cream, fontSize: 13.5, fontWeight: 700,
  fontFamily: INTER, cursor: 'pointer',
};
const ghostBtn = {
  padding: '8px 13px', borderRadius: 8, cursor: 'pointer',
  border: '1px solid rgba(0,0,0,0.12)', background: A.shell, color: A.mutedText,
  fontSize: 13, fontWeight: 700, fontFamily: INTER,
};

function StatCard({ label, value, accent }) {
  return (
    <div style={{ background: A.shell, border: A.border, borderRadius: 12, padding: '12px 16px', minWidth: 150, boxShadow: A.cardShadow }}>
      <div style={{ fontSize: 11, color: A.faintText, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: accent || A.ink }}>{value}</div>
    </div>
  );
}
