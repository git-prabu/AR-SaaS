// pages/admin/expenses.js
//
// Phase 3 #5 (2/3) — Expense log. The daily-use page: record every
// rupee going out (vegetables, gas, rent, salaries…), see this month's
// spend, a per-category breakdown, and what's still owed on credit.
// One form does both add + edit. Live via onSnapshot; mutations go
// through lib/db.js (sanitized + audit-stamped). Admin-only data.
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import EmptyState from '../../components/EmptyState';
import ConfirmModal from '../../components/ConfirmModal';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { createExpense, updateExpense, deleteExpense, todayKey } from '../../lib/db';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import { exportRowsCsv } from '../../lib/csv';
import FeatureShell from '../../components/layout/FeatureShell';
import toast from 'react-hot-toast';

const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER, cream: '#EDEDED', ink: '#1A1A1A', shell: '#FFFFFF', shellDarker: '#F8F8F8',
  warning: '#C4A86D', warningDim: '#A08656', success: '#3F9E5A', danger: '#D9534F', info: '#2D7DD2',
  mutedText: 'rgba(0,0,0,0.55)', faintText: 'rgba(0,0,0,0.38)', subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)', borderStrong: '1px solid rgba(0,0,0,0.10)',
  cardShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
};

const EXPENSE_CATEGORIES = [
  'Vegetables & Fruits', 'Dairy & Eggs', 'Meat & Seafood', 'Groceries & Staples',
  'Beverages', 'Gas & Fuel', 'Packaging & Disposables', 'Cleaning & Supplies',
  'Purchase / stock', 'Rent', 'Utilities', 'Salaries & Wages',
  'Maintenance & Repairs', 'Marketing', 'Transport', 'Miscellaneous',
];

const MODES = [
  { k: 'cash',   label: 'Cash',   color: A.success },
  { k: 'upi',    label: 'UPI',    color: A.info },
  { k: 'card',   label: 'Card',   color: A.warningDim },
  { k: 'credit', label: 'Credit', color: A.danger },
];
const MODE_META = Object.fromEntries(MODES.map(m => [m.k, m]));

const inputStyle = {
  width: '100%', padding: '11px 13px', boxSizing: 'border-box',
  background: A.shell, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 9,
  fontSize: 14, color: A.ink, fontFamily: A.font, outline: 'none',
};
const labelStyle = { display: 'block', fontSize: 11.5, fontWeight: 700, color: A.faintText, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 };

function formatRupee(n) { return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN'); }
function fmtDate(key) {
  if (!key) return '';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

const emptyForm = () => ({ date: todayKey(), category: '', amount: '', paymentMode: 'cash', vendorId: '', note: '' });

export default function AdminExpenses() {
  const router = useRouter();
  // RBAC: owner OR a staff member whose role grants 'expenses'.
  const { ready, isAdmin, rid, scopedDb, canView, planAllowsFeature } = useFeatureAccess('expenses');

  const [expenses, setExpenses] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [month, setMonth] = useState(() => todayKey().slice(0, 7));
  const [catFilter, setCatFilter] = useState('');     // '' = all
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    if (!rid || !canView) return;
    const un = onSnapshot(
      query(collection(scopedDb, 'restaurants', rid, 'expenses'), orderBy('date', 'desc')),
      snap => { setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoaded(true); },
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

  const today = todayKey();

  // Rows for the selected month (newest first — already date-desc from query).
  const monthRows = useMemo(
    () => expenses.filter(e => String(e.date || '').slice(0, 7) === month),
    [expenses, month]
  );

  const monthTotal  = useMemo(() => monthRows.reduce((s, e) => s + (Number(e.amount) || 0), 0), [monthRows]);
  const todayTotal  = useMemo(() => expenses.filter(e => e.date === today).reduce((s, e) => s + (Number(e.amount) || 0), 0), [expenses, today]);
  const monthCredit = useMemo(() => monthRows.filter(e => e.paymentMode === 'credit').reduce((s, e) => s + (Number(e.amount) || 0), 0), [monthRows]);

  // Per-category totals for the month (desc).
  const byCategory = useMemo(() => {
    const m = {};
    for (const e of monthRows) {
      const c = e.category || 'Uncategorised';
      m[c] = (m[c] || 0) + (Number(e.amount) || 0);
    }
    return Object.entries(m).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  }, [monthRows]);
  const maxCat = byCategory[0]?.amount || 1;

  // Visible rows after the category filter, grouped by date.
  const visible = useMemo(
    () => catFilter ? monthRows.filter(e => (e.category || 'Uncategorised') === catFilter) : monthRows,
    [monthRows, catFilter]
  );
  const byDate = useMemo(() => {
    const m = {};
    for (const e of visible) (m[e.date] = m[e.date] || []).push(e);
    return Object.entries(m).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [visible]);

  // Export the visible expenses (selected month + category filter) to CSV,
  // resolving each vendorId to its name.
  const exportCSV = () => {
    const vname = (id) => (vendors.find(v => v.id === id) || {}).name || '';
    const rows = [
      ['Date', 'Category', 'Amount (INR)', 'Payment Mode', 'Vendor', 'Note'],
      ...visible.map(e => [
        e.date || '',
        e.category || 'Uncategorised',
        Number(e.amount) || 0,
        e.paymentMode || '',
        vname(e.vendorId),
        e.note || '',
      ]),
    ];
    exportRowsCsv(rows, `expenses-${month}.csv`);
  };

  const startEdit = (e) => {
    setEditingId(e.id);
    setForm({
      date: e.date || today, category: e.category || '', amount: e.amount ? String(e.amount) : '',
      paymentMode: e.paymentMode || 'cash', vendorId: e.vendorId || '', note: e.note || '',
    });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const cancelEdit = () => { setEditingId(null); setForm(emptyForm()); };

  const save = async (e) => {
    e?.preventDefault();
    if (!form.category) { toast.error('Pick a category'); return; }
    const amt = Number(form.amount);
    if (!amt || amt <= 0) { toast.error('Enter an amount'); return; }
    if (!form.date) { toast.error('Pick a date'); return; }
    setSaving(true);
    try {
      const vendor = vendors.find(v => v.id === form.vendorId);
      const payload = {
        date: form.date, category: form.category, amount: amt, paymentMode: form.paymentMode,
        vendorId: form.vendorId || null, vendorName: vendor ? vendor.name : null, note: form.note,
      };
      if (editingId) { await updateExpense(rid, editingId, payload, { db: scopedDb }); toast.success('Expense updated'); }
      else { await createExpense(rid, payload, { db: scopedDb }); toast.success('Expense added'); }
      // Keep the date + mode for fast repeat entry; clear the rest.
      setForm(f => ({ ...emptyForm(), date: f.date, paymentMode: f.paymentMode }));
      setEditingId(null);
    } catch (err) {
      toast.error('Save failed: ' + (err?.message || 'error'));
    } finally { setSaving(false); }
  };

  const requestDelete = (e) => setConfirm({
    title: 'Delete this expense?',
    body: `${e.category || 'Expense'} · ${formatRupee(e.amount)} on ${fmtDate(e.date)}. This can't be undone.`,
    confirmLabel: 'Delete', destructive: true,
    onConfirm: async () => { if (editingId === e.id) cancelEdit(); await deleteExpense(rid, e.id, { db: scopedDb }); toast.success('Deleted'); },
  });

  if (!ready) {
    return <FeatureShell ready={ready} isAdmin={isAdmin} active="/admin/expenses" permKey="expenses" planAllowsFeature={planAllowsFeature}><div style={{ padding: 40, fontFamily: A.font, color: A.mutedText }}>Loading…</div></FeatureShell>;
  }

  const isThisMonth = month === today.slice(0, 7);

  return (
    <>
      <Head><title>Expenses — HaloHelm</title></Head>
      <FeatureShell ready={ready} isAdmin={isAdmin} active="/admin/expenses" permKey="expenses" planAllowsFeature={planAllowsFeature}>
        <div style={{ padding: '28px 26px', maxWidth: 960, margin: '0 auto', fontFamily: A.font, color: A.ink }}>
          <div style={{ marginBottom: 18 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', margin: 0 }}>Expenses</h1>
            <p style={{ fontSize: 13.5, color: A.mutedText, margin: '6px 0 0', lineHeight: 1.5 }}>
              Track money going out — purchases, rent, salaries, utilities and more.
            </p>
          </div>

          {/* ── Add / edit form ── */}
          <form onSubmit={save} style={{ background: A.shell, border: editingId ? `1px solid ${A.warning}` : A.border, borderRadius: 14, padding: '16px 18px', boxShadow: A.cardShadow, marginBottom: 22 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: editingId ? A.warningDim : A.ink, marginBottom: 14, letterSpacing: '-0.1px' }}>
              {editingId ? 'Edit expense' : 'Add an expense'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Date</label>
                <input style={inputStyle} type="date" max={today} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Amount (₹)</label>
                <input style={inputStyle} type="number" min="0" step="1" inputMode="decimal" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <label style={labelStyle}>Category</label>
                <select style={inputStyle} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  <option value="">Select…</option>
                  {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Vendor (optional)</label>
                <select style={inputStyle} value={form.vendorId} onChange={e => setForm(f => ({ ...f, vendorId: e.target.value }))}>
                  <option value="">— None —</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 240px' }}>
                <label style={labelStyle}>Note (optional)</label>
                <input style={inputStyle} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="e.g. 25kg onions" />
              </div>
              <div>
                <label style={labelStyle}>Paid by</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {MODES.map(m => (
                    <button type="button" key={m.k} onClick={() => setForm(f => ({ ...f, paymentMode: m.k }))}
                      style={{
                        padding: '9px 13px', borderRadius: 8, cursor: 'pointer', fontFamily: INTER, fontSize: 12.5, fontWeight: 700,
                        border: form.paymentMode === m.k ? 'none' : '1px solid rgba(0,0,0,0.12)',
                        background: form.paymentMode === m.k ? m.color : A.shell,
                        color: form.paymentMode === m.k ? '#fff' : A.mutedText,
                      }}>{m.label}</button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button type="submit" disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : (editingId ? 'Save changes' : '+ Add expense')}
              </button>
              {editingId && <button type="button" onClick={cancelEdit} disabled={saving} style={ghostBtn}>Cancel</button>}
            </div>
          </form>

          {/* ── Month navigator + summary ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <button onClick={() => setMonth(m => shiftMonth(m, -1))} style={navArrow} aria-label="Previous month">‹</button>
            <div style={{ fontSize: 15, fontWeight: 800, minWidth: 150, textAlign: 'center' }}>{monthLabel(month)}</div>
            <button onClick={() => setMonth(m => shiftMonth(m, 1))} disabled={isThisMonth} style={{ ...navArrow, opacity: isThisMonth ? 0.35 : 1, cursor: isThisMonth ? 'not-allowed' : 'pointer' }} aria-label="Next month">›</button>
            <span style={{ flex: 1 }} />
            <button onClick={exportCSV} style={ghostBtn}>↓ Export CSV</button>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <StatCard label={isThisMonth ? 'This month' : 'Month total'} value={formatRupee(monthTotal)} sub={`${monthRows.length} ${monthRows.length === 1 ? 'entry' : 'entries'}`} />
            <StatCard label="Today" value={formatRupee(todayTotal)} />
            <StatCard label="On credit (unpaid)" value={formatRupee(monthCredit)} accent={monthCredit > 0 ? A.danger : A.success} />
          </div>

          {/* ── Category breakdown ── */}
          {byCategory.length > 0 && (
            <div style={{ background: A.shell, border: A.border, borderRadius: 14, padding: '16px 18px', boxShadow: A.cardShadow, marginBottom: 22 }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>Where it went · {monthLabel(month)}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {byCategory.map(({ category, amount }) => {
                  const active = catFilter === category;
                  return (
                    <button key={category} onClick={() => setCatFilter(active ? '' : category)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: INTER }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4, color: active ? A.ink : A.mutedText, fontWeight: active ? 800 : 600 }}>
                        <span>{category}{active ? ' ·  (filtering)' : ''}</span>
                        <span style={{ color: A.ink, fontWeight: 700 }}>{formatRupee(amount)}</span>
                      </div>
                      <div style={{ height: 7, borderRadius: 4, background: A.subtleBg, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.max(3, (amount / maxCat) * 100)}%`, background: active ? A.warning : 'rgba(196,168,109,0.55)', borderRadius: 4 }} />
                      </div>
                    </button>
                  );
                })}
              </div>
              {catFilter && (
                <button onClick={() => setCatFilter('')} style={{ ...ghostBtn, marginTop: 12 }}>Clear filter</button>
              )}
            </div>
          )}

          {/* ── List ── */}
          {loaded && expenses.length === 0 && (
            <EmptyState title="No expenses yet" subtitle="Use the form above to log your first expense. Daily entries build into monthly reports." />
          )}
          {loaded && expenses.length > 0 && visible.length === 0 && (
            <div style={{ color: A.mutedText, fontSize: 14, padding: '10px 2px' }}>
              No expenses {catFilter ? `in “${catFilter}”` : ''} for {monthLabel(month)}.
            </div>
          )}

          {byDate.map(([date, rows]) => {
            const dayTotal = rows.reduce((s, e) => s + (Number(e.amount) || 0), 0);
            return (
              <div key={date} style={{ marginBottom: 22 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: date === today ? A.warningDim : A.ink }}>{date === today ? 'Today · ' : ''}{fmtDate(date)}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: A.mutedText }}>{formatRupee(dayTotal)}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {rows.map(e => {
                    const mode = MODE_META[e.paymentMode] || MODE_META.cash;
                    return (
                      <div key={e.id} style={{ background: A.shell, border: editingId === e.id ? `1px solid ${A.warning}` : A.border, borderRadius: 11, padding: '12px 14px', boxShadow: A.cardShadow, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 170 }}>
                          <div style={{ fontSize: 14.5, fontWeight: 700 }}>{e.category || 'Uncategorised'}</div>
                          <div style={{ fontSize: 12.5, color: A.mutedText, marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {e.vendorName ? <span>{e.vendorName}</span> : null}
                            {e.note ? <span style={{ color: A.faintText }}>{e.note}</span> : null}
                          </div>
                        </div>
                        <span style={{ padding: '3px 10px', borderRadius: 6, background: `${mode.color}1A`, color: mode.color, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{mode.label}</span>
                        <div style={{ fontSize: 16, fontWeight: 800, minWidth: 80, textAlign: 'right' }}>{formatRupee(e.amount)}</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => startEdit(e)} style={ghostBtn}>Edit</button>
                          <button onClick={() => requestDelete(e)} style={{ ...ghostBtn, color: A.danger }}>✕</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </FeatureShell>

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
const navArrow = {
  width: 36, height: 36, borderRadius: 9, border: '1px solid rgba(0,0,0,0.12)', background: A.shell,
  color: A.ink, fontSize: 20, fontWeight: 700, cursor: 'pointer', fontFamily: INTER, lineHeight: 1,
};

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{ background: A.shell, border: A.border, borderRadius: 12, padding: '12px 16px', minWidth: 150, boxShadow: A.cardShadow }}>
      <div style={{ fontSize: 11, color: A.faintText, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: accent || A.ink }}>{value}</div>
      {sub ? <div style={{ fontSize: 11.5, color: A.faintText, marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}
