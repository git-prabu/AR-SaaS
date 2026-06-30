// pages/admin/reports-v2.js
//
// ★ REDESIGN EXEMPLAR ★ — duplicate of /admin/reports re-laid-out on the
// Orders/Kitchen "ok-root" dark theme (via <OkShell>). ALL logic (period
// ranges, totals + deltas, chart series, daily ledger, payment-method
// breakdown, top sellers, transactions filter, GST summary, CSV / GST
// exports) is copied verbatim from reports.js — only the render is new.
// recharts is re-coloured for the dark surface. Original /admin/reports is
// untouched. (For a printed/filing copy use the original light page — this
// dark theme isn't print-optimised; the CSV + GST exports here are identical.)
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import OkShell from '../../components/admin/OkShell';
import { getOrders } from '../../lib/db';
import { exportRowsCsv } from '../../lib/csv';
import { staffDb } from '../../lib/firebase';
import { readStaffSession } from '../../lib/staffSession';
import { useRouter } from 'next/router';
import CountUp from 'react-countup';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

// Concrete dark-theme colours (recharts needs real colour strings, not CSS vars).
const D = {
  tx: '#EFEBE4', tx2: 'rgba(239,235,228,0.62)', tx3: 'rgba(140,140,140,0.9)',
  gold: '#C4A86D', goldDim: '#A08656', saffron: '#C2562B',
  success: '#3FAA63', successDark: '#6BBF7F', danger: '#E0726D',
  grid: 'rgba(128,128,128,0.16)',
};

const PERIOD_OPTS = [
  { key: 'today', label: 'Today' },
  { key: 'week',  label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all',   label: 'All Time' },
];

function periodRange(period) {
  const now = new Date();
  const end = new Date(now);
  if (period === 'today') {
    const s = new Date(now); s.setHours(0, 0, 0, 0);
    return { start: s, end, label: s.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }) };
  }
  if (period === 'week') {
    const s = new Date(now); s.setDate(s.getDate() - s.getDay()); s.setHours(0, 0, 0, 0);
    const startLbl = s.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    const endLbl   = end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    return { start: s, end, label: `${startLbl} – ${endLbl}` };
  }
  if (period === 'month') {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: s, end, label: s.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) };
  }
  return { start: new Date(0), end, label: 'All time' };
}

function priorRange(period, currentStart) {
  if (period === 'all') return { start: null, end: null };
  const now = new Date();
  const span = now.getTime() - currentStart.getTime();
  const priorEnd = new Date(currentStart);
  const priorStart = new Date(currentStart.getTime() - span);
  return { start: priorStart, end: priorEnd };
}

const PAID_STATUSES   = new Set(['paid', 'paid_cash', 'paid_card', 'paid_online', 'cash_requested', 'card_requested', 'online_requested']);
const METHOD_FOR = {
  paid_cash: 'cash',   cash_requested: 'cash',
  paid_card: 'card',   card_requested: 'card',
  paid_online: 'upi',  online_requested: 'upi',
  paid: 'other',       unpaid: 'unpaid',
};
function methodOf(order) { return METHOD_FOR[order.paymentStatus] || (PAID_STATUSES.has(order.paymentStatus) ? 'other' : 'unpaid'); }

const formatRupee = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const pad2 = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const orderLabel = (o) => {
  if (typeof o.orderNumber === 'number' && o.orderNumber > 0) return `#${o.orderNumber}`;
  return '#' + (o.id || '').slice(-5).toUpperCase();
};
const orderLabelCsv = (o) => {
  if (typeof o.orderNumber === 'number' && o.orderNumber > 0) return String(o.orderNumber).padStart(3, '0');
  return (o.id || '').slice(-5).toUpperCase();
};
const isoTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const cleanTable = (t) => {
  const s = String(t == null ? '' : t).trim();
  if (!s) return '';
  const low = s.toLowerCase();
  if (low === 'not specified' || low === 'none' || s === '—' || s === '-') return '';
  return s;
};
const deltaPct = (curr, prev) => {
  if (prev === null || prev === undefined) return undefined;
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
};

function buildSeries(orders, start, end, period) {
  if (!orders.length) return [];
  const byHour = period === 'today';
  const buckets = new Map();
  orders.forEach(o => {
    if (!o.createdAt?.seconds) return;
    const d = new Date(o.createdAt.seconds * 1000);
    let key, label;
    if (byHour) {
      key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
      label = d.toLocaleTimeString('en-IN', { hour: 'numeric', hour12: true });
    } else {
      key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    }
    const bucket = buckets.get(key) || { key, label, date: d, revenue: 0, orders: 0 };
    bucket.revenue += o.total || 0;
    bucket.orders += 1;
    buckets.set(key, bucket);
  });
  return Array.from(buckets.values()).sort((a, b) => a.date - b.date);
}

// Dark-themed chart tooltip.
function ChartTooltip({ active, payload, label, allData }) {
  if (!active || !payload || !payload.length) return null;
  const v = Number(payload[0].value) || 0;
  const point = allData?.find(d => d.label === label);
  const ords = point?.orders || 0;
  let pct = null;
  if (allData && allData.length) {
    const idx = allData.findIndex(d => d.label === label);
    if (idx > 0) {
      const prev = Number(allData[idx - 1].revenue) || 0;
      if (prev > 0) pct = ((v - prev) / prev) * 100;
      else if (v > 0) pct = 'new';
    }
  }
  const isNew = pct === 'new';
  const up = isNew ? true : (pct == null ? null : pct >= 0);
  return (
    <div style={{ background: '#221F1B', border: '1px solid rgba(196,168,109,0.22)', borderRadius: 10, padding: '10px 14px', boxShadow: '0 12px 30px rgba(0,0,0,0.5)', fontFamily: "'Inter', sans-serif", minWidth: 120 }}>
      <div style={{ fontSize: 12, color: D.tx2, fontWeight: 500, marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: D.tx, letterSpacing: '-0.3px', fontVariantNumeric: 'tabular-nums' }}>{formatRupee(v)}</span>
        {up !== null && (
          <span style={{ fontSize: 11, fontWeight: 700, color: up ? D.successDark : D.danger }}>
            {isNew ? 'new' : `${up ? '↗' : '↘'} ${Math.abs(Math.round(pct))}%`}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: D.tx3, marginTop: 3 }}>{ords} order{ords === 1 ? '' : 's'}</div>
    </div>
  );
}

export default function ReportsV2() {
  const router = useRouter();
  const { userData, loading: authLoading } = useAuth();

  const [staffSession, setStaffSession] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  useEffect(() => { setStaffSession(readStaffSession()); setSessionChecked(true); }, []);

  const adminRid = userData?.restaurantId;
  const isAdmin = !!adminRid;
  const staffPerms = Array.isArray(staffSession?.perms) ? staffSession.perms : [];
  const canView = isAdmin || staffPerms.includes('reports');
  const rid = adminRid || staffSession?.restaurantId || null;
  const ready = !authLoading && sessionChecked;
  const restaurantName = userData?.restaurantName || staffSession?.restaurantName || 'Your Restaurant';

  useEffect(() => {
    if (authLoading || isAdmin || !sessionChecked) return;
    if (!staffSession) { router.replace('/admin/login'); return; }
    if (!staffPerms.includes('reports')) { router.replace('/staff/login'); return; }
  }, [authLoading, isAdmin, sessionChecked, staffSession]); // eslint-disable-line react-hooks/exhaustive-deps

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('week');
  const [chartMode, setChartMode] = useState('bar');
  const [txnFilter, setTxnFilter] = useState({ status: 'all', method: 'all' });
  const [txnSearch, setTxnSearch] = useState('');

  const [customActive, setCustomActive] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd]     = useState('');
  const [customOpen, setCustomOpen]   = useState(false);

  useEffect(() => {
    if (!rid || !canView) return;
    getOrders(rid, isAdmin ? {} : { db: staffDb })
      .then(o => { setOrders(o); setLoading(false); })
      .catch(() => setLoading(false));
  }, [rid, canView, isAdmin]);

  const rangeResolution = useMemo(() => {
    if (customActive && customStart && customEnd) {
      const s = new Date(customStart); s.setHours(0, 0, 0, 0);
      const e = new Date(customEnd);   e.setHours(23, 59, 59, 999);
      const spanMs = e - s;
      const priorE = new Date(s.getTime() - 1);
      const priorS = new Date(s.getTime() - (spanMs + 1));
      const startLbl = s.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      const endLbl   = e.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      const label = customStart === customEnd ? startLbl : `${startLbl} – ${endLbl}`;
      return { start: s, end: e, label, priorStart: priorS, priorEnd: priorE };
    }
    const { start, end, label } = periodRange(period);
    const { start: priorStart, end: priorEnd } = priorRange(period, start);
    return { start, end, label, priorStart, priorEnd };
  }, [customActive, customStart, customEnd, period]);
  const { start, end, label: periodLabel, priorStart, priorEnd } = rangeResolution;

  const inRange = useMemo(() => orders.filter(o => {
    if (!o.createdAt?.seconds) return false;
    const d = new Date(o.createdAt.seconds * 1000);
    return d >= start && d <= end;
  }), [orders, start, end]);

  const priorInRange = useMemo(() => {
    if (!priorStart) return [];
    return orders.filter(o => {
      if (!o.createdAt?.seconds) return false;
      const d = new Date(o.createdAt.seconds * 1000);
      return d >= priorStart && d < priorEnd;
    });
  }, [orders, priorStart, priorEnd]);

  const gross = inRange.reduce((s, o) => s + (o.total || 0), 0);
  const priorGross = priorInRange.reduce((s, o) => s + (o.total || 0), 0);
  const orderCount = inRange.length;
  const avgOrder = orderCount ? gross / orderCount : 0;
  const collected = inRange.filter(o => PAID_STATUSES.has(o.paymentStatus)).reduce((s, o) => s + (o.total || 0), 0);
  const outstanding = gross - collected;
  const outstandingOrders = inRange.filter(o => !PAID_STATUSES.has(o.paymentStatus)).length;
  const collectedPct = gross > 0 ? Math.round((collected / gross) * 100) : 0;
  const gDelta = deltaPct(gross, priorGross);

  const chartData = useMemo(() => buildSeries(inRange, start, end, period), [inRange, start, end, period]);

  const ledgerRows = useMemo(() => {
    if (period === 'today') {
      return orderCount > 0 ? [{
        label: start.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
        orders: orderCount, revenue: gross, avg: avgOrder,
      }] : [];
    }
    return chartData.map(d => ({
      label: d.date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
      orders: d.orders, revenue: d.revenue, avg: d.orders > 0 ? d.revenue / d.orders : 0,
    }));
  }, [chartData, period, orderCount, gross, avgOrder, start]);

  const maxLedgerRevenue = Math.max(...ledgerRows.map(r => r.revenue), 1);

  const methodBreakdown = useMemo(() => {
    const acc = { cash: 0, upi: 0, card: 0, other: 0, unpaid: 0 };
    inRange.forEach(o => { acc[methodOf(o)] += o.total || 0; });
    return acc;
  }, [inRange]);

  const topItems = useMemo(() => {
    const map = new Map();
    inRange.forEach(o => (o.items || []).forEach(it => {
      const key = it.name || '—';
      const cur = map.get(key) || { name: key, qty: 0, revenue: 0 };
      cur.qty += it.qty || 1;
      cur.revenue += (it.price || 0) * (it.qty || 1);
      map.set(key, cur);
    }));
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  }, [inRange]);

  const transactions = useMemo(() => {
    const q = txnSearch.trim().toLowerCase();
    return [...inRange]
      .filter(o => {
        const m = methodOf(o);
        const isPaid = PAID_STATUSES.has(o.paymentStatus);
        if (txnFilter.status === 'paid' && !isPaid) return false;
        if (txnFilter.status === 'unpaid' && isPaid) return false;
        if (txnFilter.method !== 'all' && txnFilter.method !== m) return false;
        if (q) {
          const tableRaw = cleanTable(o.tableNumber).toLowerCase();
          const items = (o.items || []).map(i => (i.name || '').toLowerCase()).join(' | ');
          const id = (o.id || '').toLowerCase();
          const orderNumStr = typeof o.orderNumber === 'number' ? String(o.orderNumber) : '';
          const qStripped = q.replace(/^#/, '').trim();
          const orderNumMatches = orderNumStr && (orderNumStr === qStripped);
          const numericQuery = /^\d+$/.test(q);
          const strippedQuery = q.replace(/^(table\s+|t)/i, '').trim();
          const tableMatches = numericQuery
            ? tableRaw === q
            : (/^\d+$/.test(strippedQuery) ? tableRaw === strippedQuery : tableRaw.includes(q));
          if (!tableMatches && !items.includes(q) && !id.includes(q) && !orderNumMatches) return false;
        }
        return true;
      })
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [inRange, txnFilter, txnSearch]);

  const gstSummary = useMemo(() => {
    const acc = { taxable: 0, cgst: 0, sgst: 0, serviceCharge: 0, discount: 0 };
    inRange.forEach(o => {
      acc.taxable += Number(o.subtotal) || 0;
      acc.cgst += Number(o.cgst) || 0;
      acc.sgst += Number(o.sgst) || 0;
      acc.serviceCharge += Number(o.serviceCharge) || 0;
      acc.discount += Number(o.discount) || 0;
    });
    acc.totalTax = acc.cgst + acc.sgst;
    return acc;
  }, [inRange]);

  const gstByDay = useMemo(() => {
    const map = new Map();
    inRange.forEach(o => {
      if (!o.createdAt?.seconds) return;
      const key = isoDate(new Date(o.createdAt.seconds * 1000));
      const cur = map.get(key) || { date: key, orders: 0, taxable: 0, cgst: 0, sgst: 0 };
      cur.orders += 1;
      cur.taxable += Number(o.subtotal) || 0;
      cur.cgst += Number(o.cgst) || 0;
      cur.sgst += Number(o.sgst) || 0;
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [inRange]);

  const exportCSV = () => {
    const rows = [
      ['Order #', 'Order ID', 'Table', 'Date', 'Time', 'Items', 'Payment Method', 'Payment Status', 'Subtotal (INR)', 'Discount (INR)', 'Service Charge (INR)', 'CGST (INR)', 'SGST (INR)', 'Round Off (INR)', 'Total (INR)'],
      ...transactions.map(o => {
        const d = new Date((o.createdAt?.seconds || 0) * 1000);
        return [
          orderLabelCsv(o), o.id || '', cleanTable(o.tableNumber), isoDate(d), isoTime(d),
          (o.items || []).map(i => `${i.qty || 1} x ${i.name || ''}`).join(' | '),
          methodOf(o), o.paymentStatus || 'unpaid',
          o.subtotal || 0, o.discount || 0, o.serviceCharge || 0, o.cgst || 0, o.sgst || 0, o.roundOff || 0, o.total || 0,
        ];
      }),
    ];
    exportRowsCsv(rows, `revenue-report-${period}-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const exportGstCSV = () => {
    const rows = [
      ['Date', 'Orders', 'Taxable Value (INR)', 'CGST (INR)', 'SGST (INR)', 'Total GST (INR)'],
      ...gstByDay.map(r => [r.date, r.orders, r.taxable.toFixed(2), r.cgst.toFixed(2), r.sgst.toFixed(2), (r.cgst + r.sgst).toFixed(2)]),
      ['Total', orderCount, gstSummary.taxable.toFixed(2), gstSummary.cgst.toFixed(2), gstSummary.sgst.toFixed(2), gstSummary.totalTax.toFixed(2)],
    ];
    exportRowsCsv(rows, `gst-summary-${period}-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const doPrint = () => window.print();

  // ── Gates ──
  if (!ready) {
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Head><title>Revenue Reports — HaloHelm</title></Head>
        <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  // ── Shared dark style bits ──
  const cardStyle = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, marginBottom: 14 };
  const secTitle = { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--tx)', letterSpacing: '-0.01em' };
  const labelSm = { fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--tx-3)' };
  const ghostBtn = { padding: '7px 14px', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, color: 'var(--tx)', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 9, cursor: 'pointer' };

  return (
    <>
      <Head><title>Revenue Reports — HaloHelm</title></Head>
      <OkShell active="reports" eyebrow={`Financial summary · ${periodLabel}`} title="Reports" brand={restaurantName}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 28, height: 28, border: '2.5px solid var(--gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : (
          <>
            {/* Toolbar: period + exports */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16, position: 'relative' }}>
              <div style={{ display: 'inline-flex', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, padding: 3 }}>
                {PERIOD_OPTS.map(p => {
                  const active = !customActive && period === p.key;
                  return (
                    <button key={p.key} onClick={() => { setCustomActive(false); setCustomOpen(false); setPeriod(p.key); }} style={{
                      padding: '6px 14px', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700,
                      color: active ? 'var(--accent-ink)' : 'var(--tx-2)', background: active ? 'var(--accent)' : 'transparent',
                      border: 'none', borderRadius: 7, cursor: 'pointer',
                    }}>{p.label}</button>
                  );
                })}
                <button onClick={() => setCustomOpen(o => !o)} style={{
                  padding: '6px 14px', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700,
                  color: customActive ? 'var(--accent-ink)' : 'var(--tx-2)', background: customActive ? 'var(--accent)' : 'transparent',
                  border: 'none', borderRadius: 7, cursor: 'pointer',
                }}>{customActive ? `${customStart} → ${customEnd}` : 'Custom'}</button>
              </div>

              {customOpen && (
                <div style={{ position: 'absolute', top: 46, left: 0, zIndex: 20, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: '0 16px 40px rgba(0,0,0,0.5)', padding: 14, width: 280 }}>
                  <div style={{ ...labelSm, marginBottom: 8 }}>Custom range</div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--tx-3)', marginBottom: 4, fontFamily: 'var(--font-body)' }}>Start date</label>
                  <input type="date" value={customStart} max={customEnd || undefined} onChange={e => setCustomStart(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, marginBottom: 10, boxSizing: 'border-box', fontFamily: 'var(--font-body)', color: 'var(--tx)', background: 'var(--card-2)', colorScheme: 'dark' }} />
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--tx-3)', marginBottom: 4, fontFamily: 'var(--font-body)' }}>End date</label>
                  <input type="date" value={customEnd} min={customStart || undefined} onChange={e => setCustomEnd(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, marginBottom: 12, boxSizing: 'border-box', fontFamily: 'var(--font-body)', color: 'var(--tx)', background: 'var(--card-2)', colorScheme: 'dark' }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { if (!customStart || !customEnd || customStart > customEnd) return; setCustomActive(true); setCustomOpen(false); }}
                      disabled={!customStart || !customEnd || customStart > customEnd}
                      style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-display)', cursor: (!customStart || !customEnd || customStart > customEnd) ? 'not-allowed' : 'pointer', opacity: (!customStart || !customEnd || customStart > customEnd) ? 0.5 : 1 }}>Apply</button>
                    {customActive && <button onClick={() => { setCustomActive(false); setCustomOpen(false); }} style={ghostBtn}>Clear</button>}
                  </div>
                </div>
              )}

              <span style={{ width: 1, height: 22, background: 'var(--line)', margin: '0 2px' }} />
              <button onClick={exportCSV} style={ghostBtn}>Export CSV</button>
              <button onClick={exportGstCSV} title="Per-day GST (CGST/SGST) summary for filing" style={ghostBtn}>Export GST</button>
              <button onClick={doPrint} style={ghostBtn}>Print</button>
            </div>

            {/* Money summary */}
            <div style={{ ...cardStyle, padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)', boxShadow: '0 0 8px rgba(196,168,109,0.6)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--gold)' }}>Money summary</span>
                <div style={{ flex: 1, height: 1, background: 'var(--line-soft)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)' }}>{orderCount} order{orderCount === 1 ? '' : 's'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <KpiCard label="Gross revenue" valueEl={<CountUp end={gross} duration={1.2} separator="," prefix="₹" preserveValue />} color="var(--gold)" delta={gDelta} sub={period === 'all' ? 'all-time total' : 'vs previous period'} />
                <KpiCard label="Avg order" valueEl={<CountUp end={Math.round(avgOrder)} duration={1.2} separator="," prefix="₹" preserveValue />} color="var(--tx)" sub={`based on ${orderCount} order${orderCount === 1 ? '' : 's'}`} />
                <KpiCard label="Collected" valueEl={<CountUp end={collected} duration={1.2} separator="," prefix="₹" preserveValue />} color={D.successDark} sub={gross > 0 ? `${collectedPct}% settled` : 'no orders yet'} />
                <KpiCard label="Outstanding" valueEl={<CountUp end={outstanding} duration={1.2} separator="," prefix="₹" preserveValue />} color={outstanding > 0 ? D.danger : 'var(--tx-2)'} sub={outstanding > 0 ? `${outstandingOrders} order${outstandingOrders === 1 ? '' : 's'} pending` : 'all clear'} subColor={outstanding > 0 ? D.danger : undefined} />
              </div>
            </div>

            {/* GST summary */}
            <div style={{ ...cardStyle, padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={secTitle}>GST summary</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', marginTop: 3 }}>Tax collected this period · CGST + SGST, from billed orders</div>
                </div>
                <button onClick={exportGstCSV} style={ghostBtn}>Export GST CSV</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                {[
                  { label: 'Taxable Value', value: gstSummary.taxable, accent: false },
                  { label: 'CGST', value: gstSummary.cgst, accent: false },
                  { label: 'SGST', value: gstSummary.sgst, accent: false },
                  { label: 'Total GST', value: gstSummary.totalTax, accent: true },
                ].map(t => (
                  <div key={t.label} style={{ padding: '14px 16px', borderRadius: 12, background: t.accent ? 'rgba(196,168,109,0.10)' : 'var(--card-2)', border: t.accent ? '1px solid rgba(196,168,109,0.30)' : '1px solid var(--line)' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--tx-3)', marginBottom: 8 }}>{t.label}</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: t.accent ? 'var(--gold)' : 'var(--tx)', letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{formatRupee(t.value)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Revenue over time chart */}
            <div style={{ ...cardStyle, padding: '22px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={secTitle}>Revenue over time</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', marginTop: 3 }}>
                    {chartData.length > 0
                      ? `${formatRupee(chartData[chartData.length - 1].revenue)} latest${gDelta !== undefined ? ` · ${gDelta >= 0 ? '↗' : '↘'} ${Math.abs(gDelta)}% vs previous` : ''}`
                      : 'No orders in this period'}
                  </div>
                </div>
                <div style={{ display: 'inline-flex', background: 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 9, padding: 2 }}>
                  {[{ k: 'line', label: 'Line' }, { k: 'bar', label: 'Bar' }].map(opt => {
                    const active = chartMode === opt.k;
                    return (
                      <button key={opt.k} onClick={() => setChartMode(opt.k)} style={{
                        padding: '5px 12px', fontFamily: 'var(--font-display)', fontSize: 12.5, fontWeight: 600,
                        color: active ? 'var(--accent-ink)' : 'var(--tx-2)', background: active ? 'var(--accent)' : 'transparent',
                        border: 'none', borderRadius: 7, cursor: 'pointer',
                      }}>{opt.label}</button>
                    );
                  })}
                </div>
              </div>
              {chartData.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--tx-3)', fontSize: 13, fontFamily: 'var(--font-body)' }}>No orders in this period</div>
              ) : (() => {
                let trendUp = true;
                if (chartData.length >= 2) {
                  const half = Math.max(1, Math.floor(chartData.length / 2));
                  const first = chartData.slice(0, half).map(d => d.revenue || 0);
                  const last = chartData.slice(-half).map(d => d.revenue || 0);
                  const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
                  trendUp = avg(last) >= avg(first);
                }
                const gStart = trendUp ? '#E89143' : '#4A9A5E';
                const gEnd   = trendUp ? '#4A9A5E' : '#E89143';
                return (
                  <ResponsiveContainer width="100%" height={260}>
                    {chartMode === 'line' ? (
                      <AreaChart data={chartData} margin={{ top: 12, right: 22, left: 4, bottom: 8 }}>
                        <defs>
                          <linearGradient id="trendStrokeReportsV2" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor={gStart} /><stop offset="100%" stopColor={gEnd} />
                          </linearGradient>
                          <linearGradient id="trendFillReportsV2" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor={gEnd} stopOpacity={0.30} />
                            <stop offset="50%" stopColor={gStart} stopOpacity={0.12} />
                            <stop offset="100%" stopColor={gStart} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke={D.grid} strokeDasharray="0" vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: D.tx3, fontSize: 12, fontFamily: "'Inter', sans-serif" }} axisLine={false} tickLine={false} tickMargin={10} minTickGap={20} padding={{ left: 18, right: 18 }} />
                        <YAxis tickFormatter={v => `₹${v}`} tick={{ fill: D.tx3, fontSize: 12, fontFamily: "'Inter', sans-serif" }} axisLine={false} tickLine={false} width={46} allowDecimals={false} tickMargin={8} />
                        <Tooltip content={<ChartTooltip allData={chartData} />} cursor={{ stroke: 'rgba(128,128,128,0.28)', strokeDasharray: '3 3' }} wrapperStyle={{ outline: 'none' }} />
                        <Area type="monotone" dataKey="revenue" stroke="url(#trendStrokeReportsV2)" strokeWidth={2.5} fill="url(#trendFillReportsV2)" dot={false} activeDot={{ r: 5, fill: '#221F1B', stroke: gEnd, strokeWidth: 2.5 }} animationDuration={1500} />
                      </AreaChart>
                    ) : (
                      <BarChart data={chartData} margin={{ top: 12, right: 22, left: 4, bottom: 8 }}>
                        <CartesianGrid stroke={D.grid} strokeDasharray="0" vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: D.tx3, fontSize: 12, fontFamily: "'Inter', sans-serif" }} axisLine={false} tickLine={false} tickMargin={10} minTickGap={20} padding={{ left: 18, right: 18 }} />
                        <YAxis tickFormatter={v => `₹${v}`} tick={{ fill: D.tx3, fontSize: 12, fontFamily: "'Inter', sans-serif" }} axisLine={false} tickLine={false} width={46} allowDecimals={false} tickMargin={8} />
                        <Tooltip content={<ChartTooltip allData={chartData} />} cursor={{ fill: 'rgba(128,128,128,0.10)' }} wrapperStyle={{ outline: 'none' }} />
                        <Bar dataKey="revenue" fill={gEnd} radius={[6, 6, 0, 0]} maxBarSize={32} animationDuration={1500} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                );
              })()}
            </div>

            {/* Daily ledger */}
            <div style={{ ...cardStyle, padding: '22px 24px' }}>
              <div style={{ marginBottom: 14 }}>
                <div style={secTitle}>Daily ledger</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', marginTop: 3 }}>Day-by-day breakdown for this period</div>
              </div>
              {ledgerRows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--tx-3)', fontSize: 13, fontFamily: 'var(--font-body)' }}>No orders in this period</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 80px 110px 90px', minWidth: 560, gap: 12, padding: '0 4px 10px', borderBottom: '1px solid var(--line)' }}>
                    <div style={labelSm}>Date</div><div style={labelSm}>Visual</div>
                    <div style={{ ...labelSm, textAlign: 'right' }}>Orders</div>
                    <div style={{ ...labelSm, textAlign: 'right' }}>Revenue</div>
                    <div style={{ ...labelSm, textAlign: 'right' }}>Avg</div>
                  </div>
                  {ledgerRows.map((r, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 80px 110px 90px', minWidth: 560, gap: 12, alignItems: 'center', padding: '11px 4px', borderBottom: '1px solid var(--line)', fontVariantNumeric: 'tabular-nums' }}>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx)' }}>{r.label}</span>
                      <div style={{ height: 6, background: 'rgba(128,128,128,0.16)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: 'var(--gold)', width: `${(r.revenue / maxLedgerRevenue) * 100}%`, opacity: r.revenue > 0 ? 1 : 0, transition: 'width 0.4s' }} />
                      </div>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx)', textAlign: 'right' }}>{r.orders}</span>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: r.revenue > 0 ? 'var(--gold)' : 'var(--tx-3)', textAlign: 'right', fontWeight: 600 }}>{formatRupee(r.revenue)}</span>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-2)', textAlign: 'right' }}>{r.avg > 0 ? formatRupee(r.avg) : '—'}</span>
                    </div>
                  ))}
                  <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 80px 110px 90px', minWidth: 560, gap: 12, alignItems: 'center', padding: '14px 4px 4px', fontVariantNumeric: 'tabular-nums' }}>
                    <span style={labelSm}>Total</span><div />
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx)', textAlign: 'right', fontWeight: 600 }}>{orderCount}</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--gold)', textAlign: 'right', fontWeight: 700 }}>{formatRupee(gross)}</span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-2)', textAlign: 'right' }}>{avgOrder > 0 ? formatRupee(avgOrder) : '—'}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Payment methods + Top sellers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 14 }}>
              <div style={{ ...cardStyle, margin: 0, padding: '22px 24px' }}>
                <div style={{ marginBottom: 16 }}>
                  <div style={secTitle}>Payment methods</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', marginTop: 3 }}>How customers paid</div>
                </div>
                {orderCount === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--tx-3)', fontSize: 13, fontFamily: 'var(--font-body)' }}>No data</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {[
                      { k: 'cash', label: 'Cash' }, { k: 'upi', label: 'UPI / Online' },
                      { k: 'card', label: 'Card' }, { k: 'other', label: 'Paid (unspecified)' },
                    ].filter(m => methodBreakdown[m.k] > 0).map(m => {
                      const amt = methodBreakdown[m.k];
                      const pct = gross > 0 ? (amt / gross) * 100 : 0;
                      return (
                        <div key={m.k}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                            <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, color: 'var(--tx)' }}>{m.label}</span>
                            <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--tx)', fontVariantNumeric: 'tabular-nums' }}>{formatRupee(amt)} <span style={{ color: 'var(--tx-3)', fontWeight: 400, fontSize: 11 }}>· {Math.round(pct)}%</span></span>
                          </div>
                          <div style={{ height: 5, background: 'rgba(128,128,128,0.16)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: 'var(--gold)', width: `${pct}%`, transition: 'width 0.4s' }} />
                          </div>
                        </div>
                      );
                    })}
                    {methodBreakdown.unpaid > 0 && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, color: D.danger }}>Unpaid</span>
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: D.danger, fontVariantNumeric: 'tabular-nums' }}>{formatRupee(methodBreakdown.unpaid)} <span style={{ color: 'var(--tx-3)', fontWeight: 400, fontSize: 11 }}>· {Math.round((methodBreakdown.unpaid / gross) * 100)}%</span></span>
                        </div>
                        <div style={{ height: 5, background: 'rgba(128,128,128,0.16)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: D.danger, width: `${(methodBreakdown.unpaid / gross) * 100}%`, transition: 'width 0.4s' }} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ ...cardStyle, margin: 0, padding: '22px 24px' }}>
                <div style={{ marginBottom: 16 }}>
                  <div style={secTitle}>Top sellers</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', marginTop: 3 }}>Best revenue this period</div>
                </div>
                {topItems.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--tx-3)', fontSize: 13, fontFamily: 'var(--font-body)' }}>No data</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {topItems.map((item, i) => {
                      const maxRev = topItems[0].revenue || 1;
                      return (
                        <div key={item.name}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                            <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                              <span style={{ color: 'var(--tx-3)', fontSize: 11, marginRight: 8, fontVariantNumeric: 'tabular-nums' }}>#{i + 1}</span>{item.name}
                            </span>
                            <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--gold)', fontVariantNumeric: 'tabular-nums' }}>{formatRupee(item.revenue)}</span>
                          </div>
                          <div style={{ height: 5, background: 'rgba(128,128,128,0.16)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: 'var(--gold)', width: `${(item.revenue / maxRev) * 100}%`, transition: 'width 0.4s' }} />
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-3)', marginTop: 3 }}>{item.qty} sold</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Transactions */}
            <div style={{ ...cardStyle, padding: '22px 24px', marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={secTitle}>Transactions</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', marginTop: 3 }}>
                    {transactions.length} of {orderCount} order{orderCount === 1 ? '' : 's'}{(txnFilter.status !== 'all' || txnFilter.method !== 'all' || txnSearch.trim()) ? ' · filtered' : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'inline-flex', background: 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 9, padding: 2 }}>
                    {[{ k: 'all', label: 'All' }, { k: 'paid', label: 'Paid' }, { k: 'unpaid', label: 'Unpaid' }].map(opt => {
                      const active = txnFilter.status === opt.k;
                      return (
                        <button key={opt.k} onClick={() => setTxnFilter(f => ({ ...f, status: opt.k }))} style={{
                          padding: '5px 12px', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700,
                          color: active ? 'var(--accent-ink)' : 'var(--tx-2)', background: active ? 'var(--accent)' : 'transparent',
                          border: 'none', borderRadius: 7, cursor: 'pointer',
                        }}>{opt.label}</button>
                      );
                    })}
                  </div>
                  <select value={txnFilter.method} onChange={e => setTxnFilter(f => ({ ...f, method: e.target.value }))}
                    style={{ padding: '6px 10px', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--tx)', background: 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 9, cursor: 'pointer', outline: 'none' }}>
                    <option value="all">All methods</option><option value="cash">Cash</option><option value="upi">UPI / Online</option><option value="card">Card</option><option value="other">Other</option><option value="unpaid">Unpaid</option>
                  </select>
                  <input type="text" value={txnSearch} onChange={e => setTxnSearch(e.target.value)} placeholder="Search table / item…"
                    style={{ padding: '6px 10px', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx)', background: 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 9, outline: 'none', minWidth: 170 }} />
                </div>
              </div>
              {transactions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--tx-3)', fontSize: 13, fontFamily: 'var(--font-body)' }}>
                  {orderCount === 0 ? 'No orders in this period' : 'No transactions match the current filter'}
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '70px 90px 1fr 90px 130px 100px', minWidth: 600, gap: 12, padding: '0 4px 10px', borderBottom: '1px solid var(--line)' }}>
                    <div style={labelSm}>Order #</div><div style={labelSm}>Table</div><div style={labelSm}>Items</div><div style={labelSm}>Method</div><div style={labelSm}>Time</div><div style={{ ...labelSm, textAlign: 'right' }}>Amount</div>
                  </div>
                  <div style={{ maxHeight: 460, overflowY: 'auto' }}>
                    {transactions.map((o) => {
                      const d = new Date((o.createdAt?.seconds || 0) * 1000);
                      const m = methodOf(o);
                      const isUnpaid = m === 'unpaid';
                      const itemCount = (o.items || []).reduce((s, i) => s + (i.qty || 1), 0);
                      const itemSummary = (o.items || []).slice(0, 2).map(i => i.name).filter(Boolean).join(', ');
                      const extra = (o.items || []).length > 2 ? ` +${(o.items || []).length - 2}` : '';
                      const methodLabel = { cash: 'Cash', upi: 'UPI', card: 'Card', other: 'Paid', unpaid: 'Unpaid' }[m] || m;
                      return (
                        <div key={o.id} style={{ display: 'grid', gridTemplateColumns: '70px 90px 1fr 90px 130px 100px', minWidth: 600, gap: 12, alignItems: 'center', padding: '10px 4px', borderBottom: '1px solid var(--line)', fontVariantNumeric: 'tabular-nums' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)' }}>{orderLabel(o)}</span>
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-2)' }}>{cleanTable(o.tableNumber) ? `Table ${cleanTable(o.tableNumber)}` : '—'}</span>
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{itemSummary || '—'}{extra} <span style={{ color: 'var(--tx-3)' }}>· {itemCount} item{itemCount === 1 ? '' : 's'}</span></span>
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500, color: isUnpaid ? D.danger : 'var(--tx-2)' }}>{methodLabel}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)' }}>{d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, {d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: isUnpaid ? D.danger : 'var(--tx)', textAlign: 'right' }}>{formatRupee(o.total)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </OkShell>
    </>
  );
}

// Dark KPI card for the money summary.
function KpiCard({ label, valueEl, color, delta, sub, subColor }) {
  return (
    <div style={{ padding: '16px 18px', borderRadius: 12, background: 'var(--card-2)', border: '1px solid var(--line)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--tx-3)', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 28 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, color, letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{valueEl}</span>
        {delta !== undefined && delta !== 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700, color: delta > 0 ? D.successDark : D.danger, background: delta > 0 ? 'rgba(107,191,127,0.15)' : 'rgba(224,114,109,0.15)', padding: '3px 8px', borderRadius: 999, lineHeight: 1 }}>{delta > 0 ? '↗' : '↘'} {Math.abs(delta)}%</span>
        )}
      </div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: subColor || 'var(--tx-3)', marginTop: 4 }}>{sub}</div>
    </div>
  );
}

ReportsV2.getLayout = (page) => page;
