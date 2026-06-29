// pages/admin/expenses-v2.js
//
// ★ REDESIGN EXEMPLAR ★ — duplicate of /admin/expenses on the Orders/Kitchen
// "ok-root" dark theme (via <OkShell>). ALL logic (live expenses + vendors
// listeners, month navigation, per-category breakdown + filter, add/edit form,
// CSV export, delete, plan-gating) is copied verbatim from expenses.js — only
// the render is new. Original /admin/expenses untouched.
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import OkShell from '../../components/admin/OkShell';
import ConfirmModal from '../../components/ConfirmModal';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { createExpense, updateExpense, deleteExpense, todayKey } from '../../lib/db';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import { exportRowsCsv } from '../../lib/csv';
import toast from 'react-hot-toast';

const EXPENSE_CATEGORIES = [
  'Vegetables & Fruits', 'Dairy & Eggs', 'Meat & Seafood', 'Groceries & Staples',
  'Beverages', 'Gas & Fuel', 'Packaging & Disposables', 'Cleaning & Supplies',
  'Purchase / stock', 'Rent', 'Utilities', 'Salaries & Wages',
  'Maintenance & Repairs', 'Marketing', 'Transport', 'Miscellaneous',
];

const MODES = [
  { k: 'cash',   label: 'Cash',   color: 'var(--success)' },
  { k: 'upi',    label: 'UPI',    color: 'var(--st-paid)' },
  { k: 'card',   label: 'Card',   color: 'var(--gold)' },
  { k: 'credit', label: 'Credit', color: 'var(--danger)' },
];
const MODE_META = Object.fromEntries(MODES.map(m => [m.k, m]));

const inputStyle = {
  width: '100%', padding: '11px 13px', boxSizing: 'border-box',
  background: 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 10,
  fontSize: 14, color: 'var(--tx)', fontFamily: 'var(--font-body)', outline: 'none', colorScheme: 'dark',
};
const labelStyle = { display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700, color: 'var(--tx-3)', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 6 };
const primaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 18px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)', cursor: 'pointer' };
const ghostBtn = { padding: '8px 13px', borderRadius: 10, cursor: 'pointer', border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--tx-2)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-display)' };
const navArrow = { width: 36, height: 36, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--tx)', fontSize: 18, fontWeight: 700, cursor: 'pointer', lineHeight: 1 };

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

export default function ExpensesV2() {
  const { userData } = useAuth();
  const { ready, isAdmin, rid, scopedDb, canView, planAllowsFeature } = useFeatureAccess('expenses');
  const restaurantName = userData?.restaurantName || 'Your Restaurant';

  const [expenses, setExpenses] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [month, setMonth] = useState(() => todayKey().slice(0, 7));
  const [catFilter, setCatFilter] = useState('');
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
  }, [rid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!rid || !canView) return;
    const un = onSnapshot(
      collection(scopedDb, 'restaurants', rid, 'vendors'),
      snap => setVendors(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))),
      () => {}
    );
    return un;
  }, [rid]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = todayKey();

  const monthRows = useMemo(() => expenses.filter(e => String(e.date || '').slice(0, 7) === month), [expenses, month]);
  const monthTotal  = useMemo(() => monthRows.reduce((s, e) => s + (Number(e.amount) || 0), 0), [monthRows]);
  const todayTotal  = useMemo(() => expenses.filter(e => e.date === today).reduce((s, e) => s + (Number(e.amount) || 0), 0), [expenses, today]);
  const monthCredit = useMemo(() => monthRows.filter(e => e.paymentMode === 'credit').reduce((s, e) => s + (Number(e.amount) || 0), 0), [monthRows]);

  const byCategory = useMemo(() => {
    const m = {};
    for (const e of monthRows) {
      const c = e.category || 'Uncategorised';
      m[c] = (m[c] || 0) + (Number(e.amount) || 0);
    }
    return Object.entries(m).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  }, [monthRows]);
  const maxCat = byCategory[0]?.amount || 1;

  const visible = useMemo(() => catFilter ? monthRows.filter(e => (e.category || 'Uncategorised') === catFilter) : monthRows, [monthRows, catFilter]);
  const byDate = useMemo(() => {
    const m = {};
    for (const e of visible) (m[e.date] = m[e.date] || []).push(e);
    return Object.entries(m).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [visible]);

  const exportCSV = () => {
    const vname = (id) => (vendors.find(v => v.id === id) || {}).name || '';
    const rows = [
      ['Date', 'Category', 'Amount (INR)', 'Payment Mode', 'Vendor', 'Note'],
      ...visible.map(e => [e.date || '', e.category || 'Uncategorised', Number(e.amount) || 0, e.paymentMode || '', vname(e.vendorId), e.note || '']),
    ];
    exportRowsCsv(rows, `expenses-${month}.csv`);
  };

  const startEdit = (e) => {
    setEditingId(e.id);
    setForm({ date: e.date || today, category: e.category || '', amount: e.amount ? String(e.amount) : '', paymentMode: e.paymentMode || 'cash', vendorId: e.vendorId || '', note: e.note || '' });
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
      const payload = { date: form.date, category: form.category, amount: amt, paymentMode: form.paymentMode, vendorId: form.vendorId || null, vendorName: vendor ? vendor.name : null, note: form.note };
      if (editingId) { await updateExpense(rid, editingId, payload, { db: scopedDb }); toast.success('Expense updated'); }
      else { await createExpense(rid, payload, { db: scopedDb }); toast.success('Expense added'); }
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
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Head><title>Expenses — HaloHelm</title></Head>
        <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 14 }}>Loading…</div>
      </div>
    );
  }
  if (planAllowsFeature === false) {
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <Head><title>Expenses — HaloHelm</title></Head>
        <div style={{ textAlign: 'center', maxWidth: 380 }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>✦</div>
          <div style={{ color: 'var(--tx)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Upgrade required</div>
          <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.6, marginBottom: 18 }}>The Expenses log is available on a higher plan. Upgrade to track money going out.</div>
          <Link href="/admin/subscription" style={{ ...primaryBtn, textDecoration: 'none' }}>View plans →</Link>
        </div>
      </div>
    );
  }
  if (!canView) {
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <Head><title>Expenses — HaloHelm</title></Head>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div>
          <div style={{ color: 'var(--tx)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>No access</div>
          <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.6 }}>Your role doesn’t include Expenses. Ask the owner to grant it.</div>
        </div>
      </div>
    );
  }

  const isThisMonth = month === today.slice(0, 7);

  return (
    <>
      <Head><title>Expenses — HaloHelm</title></Head>
      <OkShell active={null} eyebrow="Money out · expense log" title="Expenses" brand={restaurantName}>
        {/* Add / edit form */}
        <form onSubmit={save} style={{ background: 'var(--card)', border: editingId ? '1px solid var(--gold)' : '1px solid var(--line)', borderRadius: 16, padding: '16px 18px', marginBottom: 22 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: editingId ? 'var(--gold)' : 'var(--tx)', marginBottom: 14 }}>
            {editingId ? 'Edit expense' : 'Add an expense'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div><label style={labelStyle}>Date</label><input style={inputStyle} type="date" max={today} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div><label style={labelStyle}>Amount (₹)</label><input style={inputStyle} type="number" min="0" step="1" inputMode="decimal" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" /></div>
            <div><label style={labelStyle}>Category</label>
              <select style={inputStyle} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                <option value="">Select…</option>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><label style={labelStyle}>Vendor (optional)</label>
              <select style={inputStyle} value={form.vendorId} onChange={e => setForm(f => ({ ...f, vendorId: e.target.value }))}>
                <option value="">— None —</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 240px' }}><label style={labelStyle}>Note (optional)</label><input style={inputStyle} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="e.g. 25kg onions" /></div>
            <div>
              <label style={labelStyle}>Paid by</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {MODES.map(m => {
                  const sel = form.paymentMode === m.k;
                  return (
                    <button type="button" key={m.k} onClick={() => setForm(f => ({ ...f, paymentMode: m.k }))}
                      style={{ padding: '9px 13px', borderRadius: 9, cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 12.5, fontWeight: 700, border: sel ? 'none' : '1px solid var(--line)', background: sel ? m.color : 'var(--card)', color: sel ? (m.k === 'card' ? '#1A1815' : '#fff') : 'var(--tx-2)' }}>{m.label}</button>
                  );
                })}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="submit" disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : (editingId ? 'Save changes' : '+ Add expense')}</button>
            {editingId && <button type="button" onClick={cancelEdit} disabled={saving} style={ghostBtn}>Cancel</button>}
          </div>
        </form>

        {/* Month nav + export */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <button onClick={() => setMonth(m => shiftMonth(m, -1))} style={navArrow} aria-label="Previous month">‹</button>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, minWidth: 150, textAlign: 'center', color: 'var(--tx)' }}>{monthLabel(month)}</div>
          <button onClick={() => setMonth(m => shiftMonth(m, 1))} disabled={isThisMonth} style={{ ...navArrow, opacity: isThisMonth ? 0.35 : 1, cursor: isThisMonth ? 'not-allowed' : 'pointer' }} aria-label="Next month">›</button>
          <span style={{ flex: 1 }} />
          <button onClick={exportCSV} style={ghostBtn}>↓ Export CSV</button>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <SCard label={isThisMonth ? 'This month' : 'Month total'} value={formatRupee(monthTotal)} sub={`${monthRows.length} ${monthRows.length === 1 ? 'entry' : 'entries'}`} />
          <SCard label="Today" value={formatRupee(todayTotal)} />
          <SCard label="On credit (unpaid)" value={formatRupee(monthCredit)} accent={monthCredit > 0 ? 'var(--danger)' : 'var(--success)'} />
        </div>

        {/* Category breakdown */}
        {byCategory.length > 0 && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '16px 18px', marginBottom: 22 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--tx)', marginBottom: 12 }}>Where it went · {monthLabel(month)}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {byCategory.map(({ category, amount }) => {
                const active = catFilter === category;
                return (
                  <button key={category} onClick={() => setCatFilter(active ? '' : category)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-body)', fontSize: 12.5, marginBottom: 4, color: active ? 'var(--tx)' : 'var(--tx-2)', fontWeight: active ? 700 : 500 }}>
                      <span>{category}{active ? ' ·  (filtering)' : ''}</span>
                      <span style={{ color: 'var(--tx)', fontWeight: 700 }}>{formatRupee(amount)}</span>
                    </div>
                    <div style={{ height: 7, borderRadius: 4, background: 'var(--card-3)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.max(3, (amount / maxCat) * 100)}%`, background: active ? 'var(--gold)' : 'rgba(196,168,109,0.55)', borderRadius: 4 }} />
                    </div>
                  </button>
                );
              })}
            </div>
            {catFilter && <button onClick={() => setCatFilter('')} style={{ ...ghostBtn, marginTop: 12 }}>Clear filter</button>}
          </div>
        )}

        {/* List */}
        {loaded && expenses.length === 0 && (
          <div style={{ textAlign: 'center', padding: '56px 20px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16 }}>
            <div style={{ fontSize: 34, marginBottom: 12 }}>🧾</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--tx)', marginBottom: 6 }}>No expenses yet</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-3)', maxWidth: 380, margin: '0 auto', lineHeight: 1.6 }}>Use the form above to log your first expense. Daily entries build into monthly reports.</div>
          </div>
        )}
        {loaded && expenses.length > 0 && visible.length === 0 && (
          <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 14, padding: '10px 2px' }}>No expenses {catFilter ? `in “${catFilter}”` : ''} for {monthLabel(month)}.</div>
        )}

        {byDate.map(([date, rows]) => {
          const dayTotal = rows.reduce((s, e) => s + (Number(e.amount) || 0), 0);
          return (
            <div key={date} style={{ marginBottom: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: date === today ? 'var(--gold)' : 'var(--tx)' }}>{date === today ? 'Today · ' : ''}{fmtDate(date)}</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 700, color: 'var(--tx-3)' }}>{formatRupee(dayTotal)}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {rows.map(e => {
                  const mode = MODE_META[e.paymentMode] || MODE_META.cash;
                  return (
                    <div key={e.id} style={{ background: 'var(--card)', border: editingId === e.id ? '1px solid var(--gold)' : '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 170 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14.5, fontWeight: 700, color: 'var(--tx)' }}>{e.category || 'Uncategorised'}</div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--tx-3)', marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          {e.vendorName ? <span>{e.vendorName}</span> : null}
                          {e.note ? <span>{e.note}</span> : null}
                        </div>
                      </div>
                      <span style={{ padding: '3px 10px', borderRadius: 6, background: 'var(--card-3)', color: mode.color, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{mode.label}</span>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, minWidth: 80, textAlign: 'right', color: 'var(--tx)' }}>{formatRupee(e.amount)}</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => startEdit(e)} style={ghostBtn}>Edit</button>
                        <button onClick={() => requestDelete(e)} style={{ ...ghostBtn, color: 'var(--danger)' }}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <ConfirmModal open={!!confirm} title={confirm?.title} body={confirm?.body} confirmLabel={confirm?.confirmLabel} destructive={confirm?.destructive} onCancel={() => setConfirm(null)} onConfirm={async () => { await confirm.onConfirm(); setConfirm(null); }} />
      </OkShell>
    </>
  );
}

function SCard({ label, value, sub, accent }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '12px 16px', minWidth: 150 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, marginTop: 4, color: accent || 'var(--tx)' }}>{value}</div>
      {sub ? <div style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--tx-3)', marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}

ExpensesV2.getLayout = (page) => page;
