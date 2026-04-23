import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getOrders } from '../../lib/db';
import CountUp from 'react-countup';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

// ──────────────────────────────────────────────────────────────
// Aspire palette — matches pages/admin/analytics.js exactly.
// Black / gold / cream + semantic red/green only. No tinted accents per payment method.
// ──────────────────────────────────────────────────────────────
const A = {
  font: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  ink: '#1A1A1A',                 // matte black — primary text, totals
  mutedText: 'rgba(26,26,26,0.55)',
  faintText: 'rgba(26,26,26,0.42)',
  subtleBg: 'rgba(26,26,26,0.025)',
  cream: '#EDEDED',               // page background
  border: '1px solid rgba(0,0,0,0.06)',
  borderStrong: '1px solid rgba(0,0,0,0.12)',
  cardShadow: '0 1px 2px rgba(0,0,0,0.04)',
  warning: '#C4A86D',             // Antique gold — accents, revenue highlights
  warningDark: '#A08656',         // darker gold — active/selected state
  success: '#3F9E5A',             // green — positive deltas, paid
  danger: '#D9534F',              // red — unpaid, negative deltas
  // Matte-black signature dark tokens (unused here but kept for future health/alert cards)
  forest: '#1A1A1A',
  forestDarker: '#0F0F0F',
  forestBorder: '1px solid rgba(196,168,109,0.18)',
  forestText: '#EAE7E3',
  forestTextMuted: 'rgba(234,231,227,0.65)',
  forestTextFaint: 'rgba(234,231,227,0.45)',
  forestSubtleBg: 'rgba(234,231,227,0.04)',
  // Luminous variants for use on matte-black backgrounds (green/red on dark need more lift than their standard hues).
  successOnDark: '#6BBF7F',
  dangerOnDark: '#E87973',
};

// ──────────────────────────────────────────────────────────────
// Period options — accountant-friendly named periods (per product decision).
// Each option yields a {start, end, label} range; 'all' uses epoch-start as its start.
// ──────────────────────────────────────────────────────────────
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
    // Week starts Sunday (matches analytics 7-day window convention)
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

// Prior period of equal length (for delta calc). For 'all', prior is empty → delta undefined.
function priorRange(period, currentStart) {
  if (period === 'all') return { start: null, end: null };
  const now = new Date();
  const span = now.getTime() - currentStart.getTime();
  const priorEnd = new Date(currentStart);
  const priorStart = new Date(currentStart.getTime() - span);
  return { start: priorStart, end: priorEnd };
}

// Payment status categorization.
// Firestore order docs use a mix of statuses: 'paid' (generic), 'paid_cash' / 'paid_card' / 'paid_online'
// (admin-verified), 'cash_requested' / 'card_requested' / 'online_requested' (customer-asked, awaiting verification),
// and 'unpaid'. For reporting we treat any 'paid*' or '*_requested' as collected (money is in hand or inbound);
// only 'unpaid' and missing statuses are outstanding.
const PAID_STATUSES   = new Set(['paid', 'paid_cash', 'paid_card', 'paid_online', 'cash_requested', 'card_requested', 'online_requested']);
const METHOD_FOR = {
  paid_cash: 'cash',   cash_requested: 'cash',
  paid_card: 'card',   card_requested: 'card',
  paid_online: 'upi',  online_requested: 'upi',
  paid: 'other',       unpaid: 'unpaid',
};
function methodOf(order) { return METHOD_FOR[order.paymentStatus] || (PAID_STATUSES.has(order.paymentStatus) ? 'other' : 'unpaid'); }

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────
const formatRupee = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
// Pad single digits for ISO-style dates that Excel displays narrow.
const pad2 = (n) => String(n).padStart(2, '0');
// Tight ISO date (YYYY-MM-DD) + 24h time (HH:MM). Short enough for Excel's default column width.
const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
// Order number display — prefer the new sequential orderNumber field. Fall back to a short slice
// of the Firestore doc id (legacy). Display format: "#5" (no padding, clean on screen).
const orderLabel = (o) => {
  if (typeof o.orderNumber === 'number' && o.orderNumber > 0) return `#${o.orderNumber}`;
  return '#' + (o.id || '').slice(-5).toUpperCase();
};
// Padded version for CSV — 3 digits (005, 054, 123) so Excel sorts alphanumerically correctly.
const orderLabelCsv = (o) => {
  if (typeof o.orderNumber === 'number' && o.orderNumber > 0) return String(o.orderNumber).padStart(3, '0');
  return (o.id || '').slice(-5).toUpperCase();
};
const isoTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
// Normalize Firestore tableNumber — legacy docs may have "Not specified" or placeholder strings; treat them as blank.
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

// Build day-keyed series from orders (one point per calendar day in the range).
function buildSeries(orders, start, end, period) {
  if (!orders.length) return [];
  // For today: one point per hour. Otherwise per day.
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

// Chart tooltip — white card with subtle shadow, matching analytics TrendTip pattern exactly.
// Renders the day label, revenue value (large), and a day-over-day delta pill.
function ChartTooltip({ active, payload, label, allData }) {
  if (!active || !payload || !payload.length) return null;
  const v = Number(payload[0].value) || 0;
  // Order count — look up from allData by label, not from `payload`.
  // Recharts' payload only contains the data series actually rendered (revenue), so
  // payload.find(p => p.dataKey === 'orders') returns undefined and we'd get "0 orders"
  // on every day — even days with revenue. Source it from the original data points.
  const point = allData?.find(d => d.label === label);
  const ords = point?.orders || 0;
  // Day-over-day pct — compare against the previous point in the series.
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
    <div style={{
      background: '#FFFFFF', border: '1px solid rgba(26,26,26,0.08)', borderRadius: 10,
      padding: '10px 14px', boxShadow: '0 8px 24px rgba(26,26,26,0.10)',
      fontFamily: A.font, minWidth: 120,
    }}>
      <div style={{ fontSize: 12, color: A.mutedText, fontWeight: 500, marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: A.ink, letterSpacing: '-0.3px', fontVariantNumeric: 'tabular-nums' }}>{formatRupee(v)}</span>
        {up !== null && (
          <span style={{ fontSize: 11, fontWeight: 700, color: up ? A.success : A.danger }}>
            {isNew ? 'new' : `${up ? '↗' : '↘'} ${Math.abs(Math.round(pct))}%`}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: A.faintText, marginTop: 3 }}>{ords} order{ords === 1 ? '' : 's'}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────
export default function AdminReports() {
  const { userData } = useAuth();
  const rid = userData?.restaurantId;

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('week');
  const [chartMode, setChartMode] = useState('bar'); // 'line' | 'bar' — bar feels right for revenue-per-day
  const [txnFilter, setTxnFilter] = useState({ status: 'all', method: 'all' });
  const [txnSearch, setTxnSearch] = useState('');

  // Custom date-range state. When customActive, overrides period's start/end
  // with customStart/customEnd (local dates). Prior-window auto-shifts to the
  // equivalent length immediately before customStart for delta comparisons.
  const [customActive, setCustomActive] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd]     = useState('');
  const [customOpen, setCustomOpen]   = useState(false);

  useEffect(() => {
    if (!rid) return;
    getOrders(rid).then(o => { setOrders(o); setLoading(false); });
  }, [rid]);

  // ─── Range + filter ──────────────────────────────────────────
  // Custom mode folds custom dates into the same {start,end,label} shape
  // the rest of the page already uses — so chart/ledger/txn code doesn't
  // need to know whether this is a preset period or a custom range.
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

  // ─── Totals ──────────────────────────────────────────────────
  const gross = inRange.reduce((s, o) => s + (o.total || 0), 0);
  const priorGross = priorInRange.reduce((s, o) => s + (o.total || 0), 0);
  const orderCount = inRange.length;
  const avgOrder = orderCount ? gross / orderCount : 0;

  const collected = inRange.filter(o => PAID_STATUSES.has(o.paymentStatus)).reduce((s, o) => s + (o.total || 0), 0);
  const outstanding = gross - collected;
  const outstandingOrders = inRange.filter(o => !PAID_STATUSES.has(o.paymentStatus)).length;
  const collectedPct = gross > 0 ? Math.round((collected / gross) * 100) : 0;

  const gDelta = deltaPct(gross, priorGross);

  // ─── Chart series ────────────────────────────────────────────
  const chartData = useMemo(() => buildSeries(inRange, start, end, period), [inRange, start, end, period]);

  // ─── Daily ledger rows (for table below chart) ───────────────
  // Uses same series data as the chart. For 'today' period we still bucket by hour, but we
  // show a single-day summary row instead — makes the ledger readable.
  const ledgerRows = useMemo(() => {
    if (period === 'today') {
      return orderCount > 0 ? [{
        label: start.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
        orders: orderCount, revenue: gross, avg: avgOrder,
      }] : [];
    }
    return chartData.map(d => ({
      label: d.date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
      orders: d.orders,
      revenue: d.revenue,
      avg: d.orders > 0 ? d.revenue / d.orders : 0,
    }));
  }, [chartData, period, orderCount, gross, avgOrder, start]);

  const maxLedgerRevenue = Math.max(...ledgerRows.map(r => r.revenue), 1);

  // ─── Payment method breakdown ────────────────────────────────
  const methodBreakdown = useMemo(() => {
    const acc = { cash: 0, upi: 0, card: 0, other: 0, unpaid: 0 };
    inRange.forEach(o => { acc[methodOf(o)] += o.total || 0; });
    return acc;
  }, [inRange]);

  // ─── Top items ───────────────────────────────────────────────
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

  // ─── Transactions list (most recent first, filterable) ───────
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
          // Normalize search targets to lowercase so comparisons are case-insensitive.
          const tableRaw = cleanTable(o.tableNumber).toLowerCase();
          const items = (o.items || []).map(i => (i.name || '').toLowerCase()).join(' | ');
          const id = (o.id || '').toLowerCase();
          // Also allow searching by sequential order number: "5", "#5", or "5 " all work.
          const orderNumStr = typeof o.orderNumber === 'number' ? String(o.orderNumber) : '';
          const qStripped = q.replace(/^#/, '').trim(); // "#5" → "5"
          const orderNumMatches = orderNumStr && (orderNumStr === qStripped);
          // If the query is purely digits, match tableNumber exactly (so "3" finds Table 3, not 13 or 30).
          // Also allow common phrasings: "table 3", "t3", or plain "3".
          const numericQuery = /^\d+$/.test(q);
          const strippedQuery = q.replace(/^(table\s+|t)/i, '').trim(); // "table 3" → "3", "t3" → "3"
          const tableMatches = numericQuery
            ? tableRaw === q
            : (/^\d+$/.test(strippedQuery) ? tableRaw === strippedQuery : tableRaw.includes(q));
          if (!tableMatches && !items.includes(q) && !id.includes(q) && !orderNumMatches) return false;
        }
        return true;
      })
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [inRange, txnFilter, txnSearch]);

  // ─── CSV export ──────────────────────────────────────────────
  const exportCSV = () => {
    // Header row uses 'INR' instead of the rupee symbol to guarantee legibility on every spreadsheet tool.
    // Separator between items is ' x ' (ASCII) rather than '×' (unicode) so legacy tools don't mangle it.
    const rows = [
      ['Order #', 'Order ID', 'Table', 'Date', 'Time', 'Items', 'Payment Method', 'Payment Status', 'Total (INR)'],
      ...transactions.map(o => {
        const d = new Date((o.createdAt?.seconds || 0) * 1000);
        return [
          orderLabelCsv(o),          // padded "005" so Excel sorts correctly
          o.id || '',                 // keep the Firestore doc id as a secondary column
          cleanTable(o.tableNumber),
          isoDate(d),
          isoTime(d),
          (o.items || []).map(i => `${i.qty || 1} x ${i.name || ''}`).join(' | '),
          methodOf(o),
          o.paymentStatus || 'unpaid',
          o.total || 0,
        ];
      }),
    ];
    const csv = rows.map(r => r.map(v => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
    // BOM (\uFEFF) tells Excel to decode as UTF-8 instead of Windows-1252. Fixes rupee-symbol mojibake.
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `revenue-report-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Print — @media print CSS below hides controls and expands tables.
  const doPrint = () => window.print();

  // ─── Loading state ───────────────────────────────────────────
  if (loading) return (
    <AdminLayout>
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
        <div style={{ width: 28, height: 28, border: `2.5px solid ${A.warning}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </AdminLayout>
  );

  // ─── Shared style tokens ─────────────────────────────────────
  const card = {
    background: '#FFFFFF',
    borderRadius: 14,
    border: A.border,
    boxShadow: A.cardShadow,
    marginBottom: 14,
  };
  const labelSm = {
    fontFamily: A.font, fontSize: 10, fontWeight: 500,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    color: A.faintText,
  };
  const secTitle = {
    fontFamily: A.font, fontWeight: 500, fontSize: 16, color: A.ink, letterSpacing: '-0.2px',
  };

  return (
    <AdminLayout>
      <Head><title>Revenue Reports — Advert Radical</title></Head>
      <div className="print-page" style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font }}>
        <style>{`
          @keyframes spin{to{transform:rotate(360deg)}}
          @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
          .row-hover:hover{background:rgba(196,168,109,0.04)!important}
          .print-only { display: none; }
          @media print {
            @page { size: A4; margin: 14mm 12mm 16mm 12mm; }
            /* Force color backgrounds (gold bars, red unpaid) to actually print. */
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
            /* Hide all interactive UI: pills, filters, buttons, toggles. */
            .no-print { display: none !important; }
            /* Reveal the print header block. */
            .print-only { display: block !important; }
            /* Override the page's cream background and kill card shadows. */
            html, body { background: #FFFFFF !important; margin: 0 !important; padding: 0 !important; }
            .print-page { background: #FFFFFF !important; }
            .print-card { box-shadow: none !important; border: 1px solid rgba(0,0,0,0.18) !important; break-inside: avoid; page-break-inside: avoid; margin-bottom: 10px !important; }
            /* Shrink card padding for denser print. */
            .print-card { padding: 14px 16px !important; }
            /* Expand the transactions scroll container so all rows print. */
            .print-expand { max-height: none !important; overflow: visible !important; }
            /* Print-specific layout tweaks. */
            .print-hide-sub { display: none !important; }
            .print-header-strip { margin-bottom: 12px !important; padding-bottom: 10px !important; border-bottom: 1.5px solid #000 !important; }
            /* Make tiny gold text readable on paper — force to dark gold for contrast. */
            .gold-on-print { color: #7A6435 !important; }
          }
        `}</style>

        {/* Print-only header strip — shows at the top of the printed report only. */}
        <div className="print-only print-header-strip" style={{ padding: '0 28px 0', marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontFamily: A.font }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#000' }}>Revenue Report</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#000', marginTop: 2 }}>Advert Radical</div>
              <div style={{ fontSize: 11, color: '#333', marginTop: 3 }}>Period: {periodLabel}</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 10, color: '#333' }}>
              <div>Generated {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
              <div>{new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}</div>
            </div>
          </div>
        </div>

        {/* ═══ HEADER ═══ */}
        <div style={{ padding: '24px 28px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 14 }}>
            <div>
              <div style={{ fontFamily: A.font, fontSize: 11, fontWeight: 500, color: A.faintText, marginBottom: 6, letterSpacing: '0.05em' }}>Admin</div>
              <div style={{ fontFamily: A.font, fontSize: 26, fontWeight: 600, color: A.ink, letterSpacing: '-0.4px', lineHeight: 1 }}>Revenue Reports</div>
              <div style={{ fontFamily: A.font, fontSize: 13, color: A.mutedText, marginTop: 6 }}>Financial summary · {periodLabel}</div>
            </div>
            <div className="no-print" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', position: 'relative' }}>
              {/* Period pill */}
              <div style={{ display: 'inline-flex', background: '#FFFFFF', border: A.borderStrong, borderRadius: 8, padding: 2 }}>
                {PERIOD_OPTS.map(p => {
                  const active = !customActive && period === p.key;
                  return (
                    <button key={p.key} onClick={() => { setCustomActive(false); setCustomOpen(false); setPeriod(p.key); }} style={{
                      padding: '6px 14px', fontFamily: A.font, fontSize: 12, fontWeight: 600,
                      color: active ? '#FFFFFF' : A.mutedText,
                      background: active ? A.ink : 'transparent',
                      border: 'none', borderRadius: 6, cursor: 'pointer', letterSpacing: '0.02em',
                    }}>{p.label}</button>
                  );
                })}
                <button onClick={() => setCustomOpen(o => !o)} style={{
                  padding: '6px 14px', fontFamily: A.font, fontSize: 12, fontWeight: 600,
                  color: customActive ? '#FFFFFF' : A.mutedText,
                  background: customActive ? A.ink : 'transparent',
                  border: 'none', borderRadius: 6, cursor: 'pointer', letterSpacing: '0.02em',
                }}>{customActive ? `${customStart} → ${customEnd}` : 'Custom'}</button>
              </div>

              {/* Custom date popover */}
              {customOpen && (
                <div style={{
                  position: 'absolute', top: 42, right: 0, zIndex: 20,
                  background: '#FFFFFF', border: A.borderStrong, borderRadius: 10,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                  padding: 14, width: 280,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: A.faintText, marginBottom: 8 }}>Custom range</div>
                  <label style={{ display: 'block', fontSize: 11, color: A.mutedText, marginBottom: 4 }}>Start date</label>
                  <input type="date" value={customStart} max={customEnd || undefined}
                    onChange={e => setCustomStart(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', border: A.border, borderRadius: 8, fontSize: 13, marginBottom: 10, boxSizing: 'border-box', fontFamily: A.font, color: A.ink, background: '#FFFFFF' }} />
                  <label style={{ display: 'block', fontSize: 11, color: A.mutedText, marginBottom: 4 }}>End date</label>
                  <input type="date" value={customEnd} min={customStart || undefined}
                    onChange={e => setCustomEnd(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', border: A.border, borderRadius: 8, fontSize: 13, marginBottom: 12, boxSizing: 'border-box', fontFamily: A.font, color: A.ink, background: '#FFFFFF' }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => {
                        if (!customStart || !customEnd || customStart > customEnd) return;
                        setCustomActive(true); setCustomOpen(false);
                      }}
                      disabled={!customStart || !customEnd || customStart > customEnd}
                      style={{
                        flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none',
                        background: A.ink, color: '#FFFFFF',
                        fontSize: 12, fontWeight: 600, fontFamily: A.font,
                        cursor: (!customStart || !customEnd || customStart > customEnd) ? 'not-allowed' : 'pointer',
                        opacity: (!customStart || !customEnd || customStart > customEnd) ? 0.5 : 1,
                      }}>Apply</button>
                    {customActive && (
                      <button
                        onClick={() => { setCustomActive(false); setCustomOpen(false); }}
                        style={{
                          padding: '8px 12px', borderRadius: 8, border: A.border,
                          background: '#FFFFFF', color: A.mutedText,
                          fontSize: 12, fontWeight: 600, fontFamily: A.font, cursor: 'pointer',
                        }}>Clear</button>
                    )}
                  </div>
                </div>
              )}

              {/* Thin vertical divider separates filter pills from action buttons */}
              <span style={{ width: 1, height: 22, background: 'rgba(0,0,0,0.10)', margin: '0 4px' }} />
              <button onClick={exportCSV} style={{
                padding: '7px 14px', fontFamily: A.font, fontSize: 12, fontWeight: 600, color: A.ink,
                background: '#FFFFFF', border: A.borderStrong, borderRadius: 8, cursor: 'pointer',
              }}>Export CSV</button>
              <button onClick={doPrint} style={{
                padding: '7px 14px', fontFamily: A.font, fontSize: 12, fontWeight: 600, color: A.ink,
                background: '#FFFFFF', border: A.borderStrong, borderRadius: 8, cursor: 'pointer',
              }}>Print</button>
            </div>
          </div>
        </div>

        {/* ═══ MAIN CONTENT ═══ */}
        <div style={{ padding: '0 28px 28px' }}>

          {/* ── Money summary — matte-black signature card (bookend to LIVE TODAY on analytics) ── */}
          <div className="print-card" style={{
            background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
            borderRadius: 14, padding: '20px 24px', marginBottom: 14,
            border: A.forestBorder,
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: A.warning, boxShadow: '0 0 8px rgba(196,168,109,0.60)' }} />
              <span style={{ fontFamily: A.font, fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>MONEY SUMMARY</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(234,231,227,0.08)' }} />
              <span style={{ fontFamily: A.font, fontSize: 11, color: A.forestTextMuted, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{orderCount} order{orderCount === 1 ? '' : 's'}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {/* Gross revenue — gold (unchanged — gold was always designed for dark bg) */}
              <div style={{ padding: '16px 18px', borderRadius: 10, background: A.forestSubtleBg, border: A.forestBorder }}>
                <div style={{ fontFamily: A.font, fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 8 }}>GROSS REVENUE</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 28 }}>
                  <span style={{ fontFamily: A.font, fontWeight: 700, fontSize: 24, color: A.warning, letterSpacing: '-0.4px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                    <CountUp end={gross} duration={1.2} separator="," prefix="₹" preserveValue />
                  </span>
                  {gDelta !== undefined && gDelta !== 0 && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      fontFamily: A.font, fontSize: 11, fontWeight: 600,
                      color: gDelta > 0 ? A.successOnDark : A.dangerOnDark,
                      background: gDelta > 0 ? 'rgba(107,191,127,0.15)' : 'rgba(232,121,115,0.15)',
                      padding: '3px 8px', borderRadius: 999, lineHeight: 1,
                    }}>{gDelta > 0 ? '↗' : '↘'} {Math.abs(gDelta)}%</span>
                  )}
                </div>
                <div style={{ fontFamily: A.font, fontSize: 11, color: A.forestTextFaint, marginTop: 4 }}>
                  {period === 'all' ? 'all-time total' : 'vs previous period'}
                </div>
              </div>
              {/* Avg order — cream text */}
              <div style={{ padding: '16px 18px', borderRadius: 10, background: A.forestSubtleBg, border: A.forestBorder }}>
                <div style={{ fontFamily: A.font, fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 8 }}>AVG ORDER</div>
                <div style={{ fontFamily: A.font, fontWeight: 700, fontSize: 24, color: A.forestText, letterSpacing: '-0.4px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  <CountUp end={Math.round(avgOrder)} duration={1.2} separator="," prefix="₹" preserveValue />
                </div>
                <div style={{ fontFamily: A.font, fontSize: 11, color: A.forestTextFaint, marginTop: 4 }}>based on {orderCount} order{orderCount === 1 ? '' : 's'}</div>
              </div>
              {/* Collected — luminous green (readable on black) */}
              <div style={{ padding: '16px 18px', borderRadius: 10, background: A.forestSubtleBg, border: A.forestBorder }}>
                <div style={{ fontFamily: A.font, fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 8 }}>COLLECTED</div>
                <div style={{ fontFamily: A.font, fontWeight: 700, fontSize: 24, color: A.successOnDark, letterSpacing: '-0.4px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  <CountUp end={collected} duration={1.2} separator="," prefix="₹" preserveValue />
                </div>
                <div style={{ fontFamily: A.font, fontSize: 11, color: A.forestTextFaint, marginTop: 4 }}>
                  {gross > 0 ? `${collectedPct}% settled` : 'no orders yet'}
                </div>
              </div>
              {/* Outstanding — luminous red when > 0, muted cream when 0 */}
              <div style={{ padding: '16px 18px', borderRadius: 10, background: A.forestSubtleBg, border: A.forestBorder }}>
                <div style={{ fontFamily: A.font, fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 8 }}>OUTSTANDING</div>
                <div style={{ fontFamily: A.font, fontWeight: 700, fontSize: 24, color: outstanding > 0 ? A.dangerOnDark : A.forestTextMuted, letterSpacing: '-0.4px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  <CountUp end={outstanding} duration={1.2} separator="," prefix="₹" preserveValue />
                </div>
                <div style={{ fontFamily: A.font, fontSize: 11, color: outstanding > 0 ? A.dangerOnDark : A.forestTextFaint, marginTop: 4 }}>
                  {outstanding > 0 ? `${outstandingOrders} order${outstandingOrders === 1 ? '' : 's'} pending` : 'all clear'}
                </div>
              </div>
            </div>
          </div>

          {/* ── Revenue over time chart (between money summary and ledger) ── */}
          <div className="print-card" style={{ ...card, padding: '22px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={secTitle}>Revenue over time</div>
                <div style={{ fontFamily: A.font, fontSize: 11, color: A.faintText, marginTop: 3 }}>
                  {chartData.length > 0
                    ? `${formatRupee(chartData[chartData.length - 1].revenue)} latest${gDelta !== undefined ? ` · ${gDelta >= 0 ? '↗' : '↘'} ${Math.abs(gDelta)}% vs previous` : ''}`
                    : 'No orders in this period'}
                </div>
              </div>
              <div className="no-print" style={{ display: 'inline-flex', background: '#FFFFFF', border: '1px solid rgba(26,26,26,0.12)', borderRadius: 8, padding: 2 }}>
                {[{ k: 'line', label: 'Line', icon: '📈' }, { k: 'bar', label: 'Bar', icon: '📊' }].map(opt => {
                  const active = chartMode === opt.k;
                  return (
                    <button key={opt.k} onClick={() => setChartMode(opt.k)} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '5px 10px', fontFamily: A.font, fontSize: 13, fontWeight: 500,
                      color: active ? A.ink : A.mutedText,
                      background: active ? 'rgba(26,26,26,0.06)' : 'transparent',
                      border: 'none', borderRadius: 6, cursor: 'pointer',
                    }}>
                      <span style={{ fontSize: 12 }}>{opt.icon}</span>{opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {chartData.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 0', color: A.faintText, fontSize: 13 }}>No orders in this period</div>
            ) : (() => {
              // Compute trend direction (first-half avg vs last-half avg) so the gradient
              // swaps colors — orange→green when growing, green→orange when declining.
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
                        <linearGradient id="trendStrokeReports" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%"   stopColor={gStart} />
                          <stop offset="100%" stopColor={gEnd} />
                        </linearGradient>
                        <linearGradient id="trendFillReports" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%"   stopColor={gEnd}   stopOpacity={0.28} />
                          <stop offset="50%"  stopColor={gStart} stopOpacity={0.12} />
                          <stop offset="100%" stopColor={gStart} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(26,26,26,0.06)" strokeDasharray="0" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: A.mutedText, fontSize: 12, fontFamily: A.font, fontWeight: 400 }} axisLine={false} tickLine={false} tickMargin={10} minTickGap={20} padding={{ left: 18, right: 18 }} />
                      <YAxis tickFormatter={v => `₹${v}`} tick={{ fill: A.mutedText, fontSize: 12, fontFamily: A.font, fontWeight: 400 }} axisLine={false} tickLine={false} width={46} allowDecimals={false} tickMargin={8} />
                      <Tooltip content={<ChartTooltip allData={chartData} />} cursor={{ stroke: 'rgba(26,26,26,0.20)', strokeDasharray: '3 3' }} wrapperStyle={{ outline: 'none' }} />
                      <Area type="monotone" dataKey="revenue" stroke="url(#trendStrokeReports)" strokeWidth={2.5} fill="url(#trendFillReports)" dot={false} activeDot={{ r: 5, fill: '#FFFFFF', stroke: gEnd, strokeWidth: 2.5 }} animationDuration={1500} />
                    </AreaChart>
                  ) : (
                    <BarChart data={chartData} margin={{ top: 12, right: 22, left: 4, bottom: 8 }}>
                      <defs>
                        <filter id="trendBarShadowReports" x="-50%" y="-50%" width="200%" height="200%">
                          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#1A1A1A" floodOpacity="0.22" />
                        </filter>
                      </defs>
                      <CartesianGrid stroke="rgba(26,26,26,0.06)" strokeDasharray="0" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: A.mutedText, fontSize: 12, fontFamily: A.font, fontWeight: 400 }} axisLine={false} tickLine={false} tickMargin={10} minTickGap={20} padding={{ left: 18, right: 18 }} />
                      <YAxis tickFormatter={v => `₹${v}`} tick={{ fill: A.mutedText, fontSize: 12, fontFamily: A.font, fontWeight: 400 }} axisLine={false} tickLine={false} width={46} allowDecimals={false} tickMargin={8} />
                      <Tooltip content={<ChartTooltip allData={chartData} />} cursor={false} wrapperStyle={{ outline: 'none' }} />
                      <Bar dataKey="revenue" fill={gEnd} radius={[6, 6, 0, 0]} maxBarSize={32} animationDuration={1500} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              );
            })()}
          </div>

          {/* ── Daily ledger ── */}
          <div className="print-card" style={{ ...card, padding: '22px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
              <div>
                <div style={secTitle}>Daily ledger</div>
                <div style={{ fontFamily: A.font, fontSize: 11, color: A.faintText, marginTop: 3 }}>Day-by-day breakdown for this period</div>
              </div>
            </div>
            {ledgerRows.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: A.faintText, fontSize: 13 }}>No orders in this period</div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 80px 100px 90px', gap: 12, padding: '0 4px 10px', borderBottom: A.border }}>
                  <div style={labelSm}>Date</div>
                  <div style={labelSm}>Visual</div>
                  <div style={{ ...labelSm, textAlign: 'right' }}>Orders</div>
                  <div style={{ ...labelSm, textAlign: 'right' }}>Revenue</div>
                  <div style={{ ...labelSm, textAlign: 'right' }}>Avg</div>
                </div>
                {ledgerRows.map((r, i) => (
                  <div key={i} className="row-hover" style={{
                    display: 'grid', gridTemplateColumns: '140px 1fr 80px 100px 90px', gap: 12, alignItems: 'center',
                    padding: '11px 4px', borderBottom: A.border, fontVariantNumeric: 'tabular-nums',
                  }}>
                    <span style={{ fontFamily: A.font, fontSize: 13, color: A.ink }}>{r.label}</span>
                    <div style={{ height: 6, background: 'rgba(0,0,0,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: A.warning, width: `${(r.revenue / maxLedgerRevenue) * 100}%`, opacity: r.revenue > 0 ? 1 : 0, transition: 'width 0.4s' }} />
                    </div>
                    <span style={{ fontFamily: A.font, fontSize: 13, color: A.ink, textAlign: 'right', fontWeight: r.orders > 0 ? 500 : 400 }}>{r.orders}</span>
                    <span style={{ fontFamily: A.font, fontSize: 13, color: r.revenue > 0 ? A.warning : A.faintText, textAlign: 'right', fontWeight: 600 }}>{formatRupee(r.revenue)}</span>
                    <span style={{ fontFamily: A.font, fontSize: 12, color: A.mutedText, textAlign: 'right' }}>{r.avg > 0 ? formatRupee(r.avg) : '—'}</span>
                  </div>
                ))}
                {/* Totals row */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '140px 1fr 80px 100px 90px', gap: 12, alignItems: 'center',
                  padding: '14px 4px 4px', fontVariantNumeric: 'tabular-nums',
                }}>
                  <span style={{ ...labelSm }}>Total</span>
                  <div />
                  <span style={{ fontFamily: A.font, fontSize: 13, color: A.ink, textAlign: 'right', fontWeight: 600 }}>{orderCount}</span>
                  <span style={{ fontFamily: A.font, fontSize: 14, color: A.warning, textAlign: 'right', fontWeight: 700 }}>{formatRupee(gross)}</span>
                  <span style={{ fontFamily: A.font, fontSize: 12, color: A.mutedText, textAlign: 'right' }}>{avgOrder > 0 ? formatRupee(avgOrder) : '—'}</span>
                </div>
              </>
            )}
          </div>

          {/* ── Payment methods + Top items — 2-col row ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            {/* Payment methods */}
            <div className="print-card" style={{ ...card, margin: 0, padding: '22px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
                <div>
                  <div style={secTitle}>Payment methods</div>
                  <div style={{ fontFamily: A.font, fontSize: 11, color: A.faintText, marginTop: 3 }}>How customers paid</div>
                </div>
              </div>
              {orderCount === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: A.faintText, fontSize: 13 }}>No data</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[
                    { k: 'cash',   label: 'Cash' },
                    { k: 'upi',    label: 'UPI / Online' },
                    { k: 'card',   label: 'Card' },
                    { k: 'other',  label: 'Paid (unspecified)' },
                  ].filter(m => methodBreakdown[m.k] > 0).map(m => {
                    const amt = methodBreakdown[m.k];
                    const pct = gross > 0 ? (amt / gross) * 100 : 0;
                    return (
                      <div key={m.k}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                          <span style={{ fontFamily: A.font, fontSize: 13, fontWeight: 500, color: A.ink }}>{m.label}</span>
                          <span style={{ fontFamily: A.font, fontSize: 13, fontWeight: 600, color: A.ink, fontVariantNumeric: 'tabular-nums' }}>
                            {formatRupee(amt)} <span style={{ color: A.faintText, fontWeight: 400, fontSize: 11 }}>· {Math.round(pct)}%</span>
                          </span>
                        </div>
                        <div style={{ height: 5, background: 'rgba(0,0,0,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: A.warning, width: `${pct}%`, transition: 'width 0.4s' }} />
                        </div>
                      </div>
                    );
                  })}
                  {/* Unpaid — red, only shown when > 0 */}
                  {methodBreakdown.unpaid > 0 && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                        <span style={{ fontFamily: A.font, fontSize: 13, fontWeight: 500, color: A.danger }}>Unpaid</span>
                        <span style={{ fontFamily: A.font, fontSize: 13, fontWeight: 600, color: A.danger, fontVariantNumeric: 'tabular-nums' }}>
                          {formatRupee(methodBreakdown.unpaid)} <span style={{ color: A.faintText, fontWeight: 400, fontSize: 11 }}>· {Math.round((methodBreakdown.unpaid / gross) * 100)}%</span>
                        </span>
                      </div>
                      <div style={{ height: 5, background: 'rgba(0,0,0,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: A.danger, width: `${(methodBreakdown.unpaid / gross) * 100}%`, transition: 'width 0.4s' }} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Top items (this period) */}
            <div className="print-card" style={{ ...card, margin: 0, padding: '22px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
                <div>
                  <div style={secTitle}>Top sellers</div>
                  <div style={{ fontFamily: A.font, fontSize: 11, color: A.faintText, marginTop: 3 }}>Best revenue this period</div>
                </div>
              </div>
              {topItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: A.faintText, fontSize: 13 }}>No data</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {topItems.map((item, i) => {
                    const maxRev = topItems[0].revenue || 1;
                    return (
                      <div key={item.name}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                          <span style={{ fontFamily: A.font, fontSize: 13, color: A.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                            <span style={{ color: A.faintText, fontSize: 11, marginRight: 8, fontVariantNumeric: 'tabular-nums' }}>#{i + 1}</span>
                            {item.name}
                          </span>
                          <span style={{ fontFamily: A.font, fontSize: 13, fontWeight: 600, color: A.warning, fontVariantNumeric: 'tabular-nums' }}>{formatRupee(item.revenue)}</span>
                        </div>
                        <div style={{ height: 5, background: 'rgba(0,0,0,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: A.warning, width: `${(item.revenue / maxRev) * 100}%`, transition: 'width 0.4s' }} />
                        </div>
                        <div style={{ fontFamily: A.font, fontSize: 10.5, color: A.faintText, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{item.qty} sold</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Transactions list ── */}
          <div className="print-card" style={{ ...card, padding: '22px 24px', marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={secTitle}>Transactions</div>
                <div style={{ fontFamily: A.font, fontSize: 11, color: A.faintText, marginTop: 3 }}>
                  {transactions.length} of {orderCount} order{orderCount === 1 ? '' : 's'}{(txnFilter.status !== 'all' || txnFilter.method !== 'all' || txnSearch.trim()) ? ' · filtered' : ''}
                </div>
              </div>
              <div className="no-print" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Status filter */}
                <div style={{ display: 'inline-flex', background: '#FFFFFF', border: A.borderStrong, borderRadius: 8, padding: 2 }}>
                  {[{ k: 'all', label: 'All' }, { k: 'paid', label: 'Paid' }, { k: 'unpaid', label: 'Unpaid' }].map(opt => {
                    const active = txnFilter.status === opt.k;
                    return (
                      <button key={opt.k} onClick={() => setTxnFilter(f => ({ ...f, status: opt.k }))} style={{
                        padding: '5px 12px', fontFamily: A.font, fontSize: 12, fontWeight: 600,
                        color: active ? '#FFFFFF' : A.mutedText,
                        background: active ? A.ink : 'transparent',
                        border: 'none', borderRadius: 6, cursor: 'pointer', letterSpacing: '0.02em',
                      }}>{opt.label}</button>
                    );
                  })}
                </div>
                {/* Method filter */}
                <select value={txnFilter.method} onChange={e => setTxnFilter(f => ({ ...f, method: e.target.value }))} style={{
                  padding: '6px 10px', fontFamily: A.font, fontSize: 12, fontWeight: 600, color: A.ink,
                  background: '#FFFFFF', border: A.borderStrong, borderRadius: 8, cursor: 'pointer', outline: 'none',
                }}>
                  <option value="all">All methods</option>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI / Online</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                  <option value="unpaid">Unpaid</option>
                </select>
                {/* Search */}
                <input
                  type="text"
                  value={txnSearch}
                  onChange={e => setTxnSearch(e.target.value)}
                  placeholder="Search table / item…"
                  style={{
                    padding: '6px 10px', fontFamily: A.font, fontSize: 12, color: A.ink,
                    background: '#FFFFFF', border: A.borderStrong, borderRadius: 8, outline: 'none',
                    minWidth: 170,
                  }}
                />
              </div>
            </div>
            {transactions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: A.faintText, fontSize: 13 }}>
                {orderCount === 0 ? 'No orders in this period' : 'No transactions match the current filter'}
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '70px 90px 1fr 90px 110px 100px', gap: 12, padding: '0 4px 10px', borderBottom: A.border }}>
                  <div style={labelSm}>Order #</div>
                  <div style={labelSm}>Table</div>
                  <div style={labelSm}>Items</div>
                  <div style={labelSm}>Method</div>
                  <div style={labelSm}>Time</div>
                  <div style={{ ...labelSm, textAlign: 'right' }}>Amount</div>
                </div>
                <div className="print-expand" style={{ maxHeight: 460, overflowY: 'auto' }}>
                  {transactions.map((o) => {
                    const d = new Date((o.createdAt?.seconds || 0) * 1000);
                    const m = methodOf(o);
                    const isUnpaid = m === 'unpaid';
                    const itemCount = (o.items || []).reduce((s, i) => s + (i.qty || 1), 0);
                    const itemSummary = (o.items || []).slice(0, 2).map(i => i.name).filter(Boolean).join(', ');
                    const extra = (o.items || []).length > 2 ? ` +${(o.items || []).length - 2}` : '';
                    const methodLabel = { cash: 'Cash', upi: 'UPI', card: 'Card', other: 'Paid', unpaid: 'Unpaid' }[m] || m;
                    return (
                      <div key={o.id} className="row-hover" style={{
                        display: 'grid', gridTemplateColumns: '70px 90px 1fr 90px 110px 100px', gap: 12, alignItems: 'center',
                        padding: '10px 4px', borderBottom: A.border, fontVariantNumeric: 'tabular-nums',
                      }}>
                        <span style={{ fontFamily: A.font, fontSize: 11, color: A.faintText, fontVariantNumeric: 'tabular-nums' }}>{orderLabel(o)}</span>
                        <span style={{ fontFamily: A.font, fontSize: 12, color: A.mutedText }}>{cleanTable(o.tableNumber) ? `Table ${cleanTable(o.tableNumber)}` : '—'}</span>
                        <span style={{ fontFamily: A.font, fontSize: 12, color: A.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {itemSummary || '—'}{extra} <span style={{ color: A.faintText }}>· {itemCount} item{itemCount === 1 ? '' : 's'}</span>
                        </span>
                        <span style={{ fontFamily: A.font, fontSize: 12, fontWeight: 500, color: isUnpaid ? A.danger : A.mutedText }}>{methodLabel}</span>
                        <span style={{ fontFamily: A.font, fontSize: 11, color: A.faintText }}>
                          {d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, {d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}
                        </span>
                        <span style={{ fontFamily: A.font, fontSize: 13, fontWeight: 600, color: isUnpaid ? A.danger : A.ink, textAlign: 'right' }}>{formatRupee(o.total)}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

        </div>
      </div>
    </AdminLayout>
  );
}

AdminReports.getLayout = (page) => page;