// pages/admin/purchase-orders.js
//
// Phase 3 #5 (3/3) — Purchase orders. Formal orders placed with a
// vendor: line items (qty × rate), optional tax, a running total, and a
// lifecycle draft → sent → received (or cancelled). A received PO can be
// pushed into the expense ledger in one tap (recordPurchaseOrderExpense)
// so spend flows into the P&L without double entry. Totals are always
// recomputed server-side in lib/db.js — the client can't fake them.
// Admin-only data (see firestore.rules).
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
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import {
  createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder,
  setPurchaseOrderStatus, recordPurchaseOrderExpense, todayKey,
} from '../../lib/db';
import toast from 'react-hot-toast';

const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER, cream: '#EDEDED', ink: '#1A1A1A', shell: '#FFFFFF', shellDarker: '#F8F8F8',
  warning: '#C4A86D', warningDim: '#A08656', success: '#3F9E5A', danger: '#D9534F', info: '#2D7DD2',
  mutedText: 'rgba(0,0,0,0.55)', faintText: 'rgba(0,0,0,0.38)', subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)', borderStrong: '1px solid rgba(0,0,0,0.10)',
  cardShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
};

const UNITS = ['kg', 'g', 'L', 'ml', 'pcs', 'box', 'pkt', 'dozen', 'bag', '—'];
const MODES = [
  { k: 'cash',   label: 'Cash',   color: A.success },
  { k: 'upi',    label: 'UPI',    color: A.info },
  { k: 'card',   label: 'Card',   color: A.warningDim },
  { k: 'credit', label: 'Credit', color: A.danger },
];

const STATUS_META = {
  draft:     { label: 'Draft',     bg: 'rgba(0,0,0,0.06)',       color: A.mutedText },
  sent:      { label: 'Sent',      bg: 'rgba(45,125,210,0.12)',  color: A.info },
  received:  { label: 'Received',  bg: 'rgba(63,158,90,0.12)',   color: A.success },
  cancelled: { label: 'Cancelled', bg: 'rgba(217,83,79,0.10)',   color: A.danger },
};
const FILTERS = [['open', 'Open'], ['received', 'Received'], ['all', 'All']];

const inputStyle = {
  width: '100%', padding: '11px 13px', boxSizing: 'border-box',
  background: A.shell, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 9,
  fontSize: 14, color: A.ink, fontFamily: A.font, outline: 'none',
};
const cellStyle = { ...inputStyle, padding: '9px 10px', fontSize: 13.5 };
const labelStyle = { display: 'block', fontSize: 11.5, fontWeight: 700, color: A.faintText, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 };

function formatRupee(n) { return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN'); }
function fmtDate(key) {
  if (!key) return '';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const emptyRow = () => ({ name: '', qty: '', unit: 'kg', rate: '' });
const emptyPO = () => ({ vendorId: '', date: todayKey(), items: [emptyRow()], taxPercent: '', note: '' });

export default function AdminPurchaseOrders() {
  const router = useRouter();
  // RBAC: owner OR a staff member whose role grants 'purchaseOrders'.
  const { ready, isAdmin, rid, scopedDb, canView } = useFeatureAccess('purchaseOrders');

  const [pos, setPos] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState('open');
  const [drawer, setDrawer] = useState(null);   // null | { mode:'new' } | { mode:'edit', id }
  const [form, setForm] = useState(emptyPO);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [recordPo, setRecordPo] = useState(null);   // PO pending "record as expense"
  const [recordMode, setRecordMode] = useState('credit');

  // Access + redirect handled by useFeatureAccess('purchaseOrders').

  useEffect(() => {
    if (!rid || !canView) return;
    const un = onSnapshot(
      query(collection(scopedDb, 'restaurants', rid, 'purchaseOrders'), orderBy('date', 'desc')),
      snap => { setPos(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoaded(true); },
      () => setLoaded(true)
    );
    return un;
  }, [rid]);

  useEffect(() => {
    if (!rid || !canView) return;
    const un = onSnapshot(
      collection(scopedDb, 'restaurants', rid, 'vendors'),
      snap => setVendors(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))),
      () => {}
    );
    return un;
  }, [rid]);

  const visible = useMemo(() => {
    let list = pos;
    if (filter === 'open') list = pos.filter(p => p.status === 'draft' || p.status === 'sent');
    else if (filter === 'received') list = pos.filter(p => p.status === 'received');
    return list;
  }, [pos, filter]);

  const openCount = useMemo(() => pos.filter(p => p.status === 'draft' || p.status === 'sent').length, [pos]);

  // Live totals for the drawer form.
  const formTotals = useMemo(() => {
    const subtotal = (form.items || []).reduce((s, it) => s + num(it.qty) * num(it.rate), 0);
    const taxPercent = Math.max(0, num(form.taxPercent));
    const taxAmount = subtotal * taxPercent / 100;
    return { subtotal, taxAmount, total: subtotal + taxAmount };
  }, [form]);

  const openNew = () => { setForm(emptyPO()); setDrawer({ mode: 'new' }); };
  const openEdit = (p) => {
    setForm({
      vendorId: p.vendorId || '',
      date: p.date || todayKey(),
      items: (p.items && p.items.length ? p.items : [emptyRow()]).map(it => ({
        name: it.name || '', qty: it.qty != null ? String(it.qty) : '', unit: it.unit || 'kg', rate: it.rate != null ? String(it.rate) : '',
      })),
      taxPercent: p.taxPercent ? String(p.taxPercent) : '',
      note: p.note || '',
    });
    setDrawer({ mode: 'edit', id: p.id });
  };
  const closeDrawer = () => { if (!saving) setDrawer(null); };

  const setItem = (idx, key, val) => setForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, [key]: val } : it) }));
  const addRow = () => setForm(f => ({ ...f, items: [...f.items, emptyRow()] }));
  const removeRow = (idx) => setForm(f => ({ ...f, items: f.items.length > 1 ? f.items.filter((_, i) => i !== idx) : f.items }));

  const save = async (e) => {
    e?.preventDefault();
    const cleanItems = form.items.filter(it => it.name.trim() && num(it.qty) > 0);
    if (cleanItems.length === 0) { toast.error('Add at least one item with a quantity'); return; }
    setSaving(true);
    try {
      const vendor = vendors.find(v => v.id === form.vendorId);
      const payload = {
        vendorId: form.vendorId || null, vendorName: vendor ? vendor.name : null,
        date: form.date, items: cleanItems, taxPercent: num(form.taxPercent), note: form.note,
      };
      if (drawer.mode === 'new') { await createPurchaseOrder(rid, payload, { db: scopedDb }); toast.success('Purchase order created'); }
      else { await updatePurchaseOrder(rid, drawer.id, payload, { db: scopedDb }); toast.success('Purchase order updated'); }
      setDrawer(null);
    } catch (err) {
      toast.error('Save failed: ' + (err?.message || 'error'));
    } finally { setSaving(false); }
  };

  const advance = async (p, status) => {
    setBusyId(p.id);
    try { await setPurchaseOrderStatus(rid, p.id, status, { db: scopedDb }); toast.success(`Marked ${status}`); }
    catch (err) { toast.error('Update failed: ' + (err?.message || 'error')); }
    finally { setBusyId(null); }
  };

  const requestDelete = (p) => setConfirm({
    title: 'Delete this purchase order?',
    body: `${p.vendorName || 'PO'} · ${formatRupee(p.total)}. This can't be undone. (Any expense already recorded from it is kept.)`,
    confirmLabel: 'Delete', destructive: true,
    onConfirm: async () => { await deletePurchaseOrder(rid, p.id, { db: scopedDb }); toast.success('Deleted'); },
  });

  const doRecordExpense = async () => {
    const p = recordPo;
    setRecordPo(null);
    setBusyId(p.id);
    try {
      await recordPurchaseOrderExpense(rid, p, recordMode, { db: scopedDb });
      toast.success('Recorded as an expense');
    } catch (err) {
      toast.error('Could not record: ' + (err?.message || 'error'));
    } finally { setBusyId(null); }
  };

  if (!ready) {
    return <FeatureShell ready={ready} isAdmin={isAdmin} active="/admin/purchase-orders"><div style={{ padding: 40, fontFamily: A.font, color: A.mutedText }}>Loading…</div></FeatureShell>;
  }

  return (
    <>
      <Head><title>Purchase Orders — HaloHelm</title></Head>
      <FeatureShell ready={ready} isAdmin={isAdmin} active="/admin/purchase-orders">
        <div style={{ padding: '28px 26px', maxWidth: 980, margin: '0 auto', fontFamily: A.font, color: A.ink }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', margin: 0 }}>Purchase Orders</h1>
              <p style={{ fontSize: 13.5, color: A.mutedText, margin: '6px 0 0', lineHeight: 1.5 }}>
                Order stock from your vendors. Mark received when it arrives, then record it as an expense.
              </p>
            </div>
            <button onClick={openNew} style={primaryBtn}>+ New order</button>
          </div>

          {/* Filter pills */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
            {FILTERS.map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)}
                style={{
                  padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: INTER, fontSize: 13, fontWeight: 600,
                  border: filter === k ? 'none' : A.borderStrong,
                  background: filter === k ? A.ink : A.shell, color: filter === k ? A.cream : A.mutedText,
                }}>
                {label}{k === 'open' && openCount > 0 ? ` · ${openCount}` : ''}
              </button>
            ))}
          </div>

          {loaded && pos.length === 0 && (
            <EmptyState title="No purchase orders" subtitle="Create an order to a vendor — list the items, quantities and rates, then track it through to delivery." />
          )}
          {loaded && pos.length > 0 && visible.length === 0 && (
            <div style={{ color: A.mutedText, fontSize: 14, padding: '10px 2px' }}>No purchase orders in this view.</div>
          )}

          {/* PO cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {visible.map(p => {
              const sm = STATUS_META[p.status] || STATUS_META.draft;
              const busy = busyId === p.id;
              const editable = p.status === 'draft' || p.status === 'sent';
              return (
                <div key={p.id} style={{ background: A.shell, border: A.border, borderRadius: 13, padding: '15px 17px', boxShadow: A.cardShadow }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 16, fontWeight: 800 }}>{p.vendorName || 'Unassigned vendor'}</span>
                        <span style={{ padding: '3px 10px', borderRadius: 6, background: sm.bg, color: sm.color, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{sm.label}</span>
                        <span style={{ fontSize: 11, color: A.faintText, fontWeight: 600 }}>#{p.id.slice(-5).toUpperCase()}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: A.mutedText, marginTop: 3 }}>
                        {fmtDate(p.date)} · {(p.items || []).length} item{(p.items || []).length === 1 ? '' : 's'}
                        {p.note ? ` · ${p.note}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: A.faintText, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total</div>
                      <div style={{ fontSize: 20, fontWeight: 800 }}>{formatRupee(p.total)}</div>
                    </div>
                  </div>

                  {/* Item lines */}
                  {(p.items || []).length > 0 && (
                    <div style={{ marginTop: 12, borderTop: A.border, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {p.items.map((it, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: A.mutedText }}>
                          <span>{it.name} <span style={{ color: A.faintText }}>· {it.qty}{it.unit && it.unit !== '—' ? ' ' + it.unit : ''} × {formatRupee(it.rate)}</span></span>
                          <span style={{ color: A.ink, fontWeight: 600 }}>{formatRupee(it.amount)}</span>
                        </div>
                      ))}
                      {p.taxPercent > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: A.faintText, marginTop: 2 }}>
                          <span>Tax ({p.taxPercent}%)</span><span>{formatRupee(p.taxAmount)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ marginTop: 13, display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                    {p.status === 'draft' && <ActBtn onClick={() => advance(p, 'sent')} busy={busy} color={A.info}>Mark sent</ActBtn>}
                    {(p.status === 'draft' || p.status === 'sent') && <ActBtn onClick={() => advance(p, 'received')} busy={busy} color={A.success}>Mark received</ActBtn>}
                    {p.status === 'received' && !p.expenseRecorded && (
                      <ActBtn onClick={() => { setRecordMode('credit'); setRecordPo(p); }} busy={busy} color={A.warningDim}>Record as expense</ActBtn>
                    )}
                    {p.status === 'received' && p.expenseRecorded && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: A.success }}>✓ Expense recorded</span>
                    )}
                    {editable && <ActBtn onClick={() => openEdit(p)} busy={busy} color={A.mutedText}>Edit</ActBtn>}
                    {p.status !== 'cancelled' && p.status !== 'received' && <ActBtn onClick={() => advance(p, 'cancelled')} busy={busy} color={A.danger}>Cancel</ActBtn>}
                    <ActBtn onClick={() => requestDelete(p)} busy={busy} color={A.faintText}>Delete</ActBtn>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </FeatureShell>

      {/* ── Create / edit drawer ── */}
      {drawer && (
        <>
          <div onClick={closeDrawer} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 60 }} />
          <form onSubmit={save} style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(560px, 100vw)', zIndex: 61,
            background: A.shell, boxShadow: '-8px 0 30px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', fontFamily: A.font,
          }}>
            <div style={{ padding: '20px 22px', borderBottom: A.border, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.3px' }}>{drawer.mode === 'new' ? 'New purchase order' : 'Edit purchase order'}</div>
              <button type="button" onClick={closeDrawer} style={{ background: 'none', border: 'none', fontSize: 22, color: A.faintText, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: 12, marginBottom: 18 }}>
                <div>
                  <label style={labelStyle}>Vendor</label>
                  <select style={inputStyle} value={form.vendorId} onChange={e => setForm(f => ({ ...f, vendorId: e.target.value }))}>
                    <option value="">— Select vendor —</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Date</label>
                  <input style={inputStyle} type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
              </div>

              <label style={labelStyle}>Items</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                {form.items.map((it, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input style={{ ...cellStyle, flex: '2 1 140px' }} value={it.name} onChange={e => setItem(idx, 'name', e.target.value)} placeholder="Item" />
                    <input style={{ ...cellStyle, width: 64 }} type="number" min="0" step="any" value={it.qty} onChange={e => setItem(idx, 'qty', e.target.value)} placeholder="Qty" />
                    <select style={{ ...cellStyle, width: 72 }} value={it.unit} onChange={e => setItem(idx, 'unit', e.target.value)}>
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <input style={{ ...cellStyle, width: 80 }} type="number" min="0" step="any" value={it.rate} onChange={e => setItem(idx, 'rate', e.target.value)} placeholder="Rate" />
                    <div style={{ width: 82, textAlign: 'right', fontSize: 13.5, fontWeight: 700, color: A.ink }}>{formatRupee(num(it.qty) * num(it.rate))}</div>
                    <button type="button" onClick={() => removeRow(idx)} disabled={form.items.length === 1}
                      style={{ background: 'none', border: 'none', color: form.items.length === 1 ? A.faintText : A.danger, fontSize: 18, cursor: form.items.length === 1 ? 'not-allowed' : 'pointer', lineHeight: 1, padding: '0 2px' }}>×</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addRow} style={{ ...ghostBtn, marginBottom: 18 }}>+ Add item</button>

              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 12, marginBottom: 18 }}>
                <div>
                  <label style={labelStyle}>Tax %</label>
                  <input style={inputStyle} type="number" min="0" step="any" value={form.taxPercent} onChange={e => setForm(f => ({ ...f, taxPercent: e.target.value }))} placeholder="0" />
                </div>
                <div>
                  <label style={labelStyle}>Note</label>
                  <input style={inputStyle} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Optional" />
                </div>
              </div>

              {/* Totals */}
              <div style={{ background: A.shellDarker, borderRadius: 11, padding: '13px 15px' }}>
                <Row label="Subtotal" value={formatRupee(formTotals.subtotal)} />
                {num(form.taxPercent) > 0 && <Row label={`Tax (${num(form.taxPercent)}%)`} value={formatRupee(formTotals.taxAmount)} />}
                <div style={{ borderTop: A.border, marginTop: 8, paddingTop: 8 }}>
                  <Row label="Total" value={formatRupee(formTotals.total)} bold />
                </div>
              </div>
            </div>

            <div style={{ padding: '16px 22px', borderTop: A.border, display: 'flex', gap: 10 }}>
              <button type="button" onClick={closeDrawer} disabled={saving} style={{ ...ghostBtn, flex: 1, padding: '12px', fontSize: 14 }}>Cancel</button>
              <button type="submit" disabled={saving} style={{ ...primaryBtn, flex: 1, justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : (drawer.mode === 'new' ? 'Create order' : 'Save changes')}
              </button>
            </div>
          </form>
        </>
      )}

      {/* ── Record-as-expense modal ── */}
      {recordPo && (
        <div onClick={() => setRecordPo(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: A.shell, borderRadius: 16, padding: '24px 24px 20px', width: 'min(420px, 100%)', fontFamily: A.font, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Record as expense</div>
            <div style={{ fontSize: 13.5, color: A.mutedText, lineHeight: 1.5, marginBottom: 18 }}>
              Add {formatRupee(recordPo.total)}{recordPo.vendorName ? ` to ${recordPo.vendorName}` : ''} to your expense ledger. How was it paid?
            </div>
            <div style={{ display: 'flex', gap: 7, marginBottom: 20, flexWrap: 'wrap' }}>
              {MODES.map(m => (
                <button key={m.k} onClick={() => setRecordMode(m.k)}
                  style={{
                    padding: '10px 15px', borderRadius: 9, cursor: 'pointer', fontFamily: INTER, fontSize: 13, fontWeight: 700,
                    border: recordMode === m.k ? 'none' : '1px solid rgba(0,0,0,0.12)',
                    background: recordMode === m.k ? m.color : A.shell, color: recordMode === m.k ? '#fff' : A.mutedText,
                  }}>{m.label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setRecordPo(null)} style={{ ...ghostBtn, flex: 1, padding: '12px' }}>Cancel</button>
              <button onClick={doRecordExpense} style={{ ...primaryBtn, flex: 1, justifyContent: 'center' }}>Record {formatRupee(recordPo.total)}</button>
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
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 18px', borderRadius: 9,
  border: 'none', background: A.ink, color: A.cream, fontSize: 13.5, fontWeight: 700, fontFamily: INTER, cursor: 'pointer',
};
const ghostBtn = {
  padding: '8px 13px', borderRadius: 8, cursor: 'pointer',
  border: '1px solid rgba(0,0,0,0.12)', background: A.shell, color: A.mutedText,
  fontSize: 13, fontWeight: 700, fontFamily: INTER,
};

function ActBtn({ children, onClick, busy, color }) {
  return (
    <button onClick={onClick} disabled={busy}
      style={{
        padding: '7px 12px', borderRadius: 7, cursor: busy ? 'not-allowed' : 'pointer',
        border: '1px solid rgba(0,0,0,0.10)', background: '#FFFFFF', color,
        fontSize: 12.5, fontWeight: 700, fontFamily: INTER, opacity: busy ? 0.5 : 1,
      }}>{children}</button>
  );
}

function Row({ label, value, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: bold ? 16 : 13.5, fontWeight: bold ? 800 : 600, color: bold ? A.ink : A.mutedText, padding: '2px 0' }}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
