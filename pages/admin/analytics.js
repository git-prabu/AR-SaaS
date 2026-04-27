import Head from 'next/head';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import {
  getAnalytics, getTodayAnalytics, getAllMenuItems,
  getWaiterCallsCount, getOrders, todayKey,
} from '../../lib/db';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
  LineChart, Line, ReferenceLine,
} from 'recharts';
import CountUp from 'react-countup';
import BentoGlow from '../../components/BentoGlow';
import DateRangePicker from '../../components/DateRangePicker';

// ═══ Aspire theme (local to analytics page — replaces Cinematic Forest per user request) ═══
const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  // Previously this spread `...T` from lib/utils.js to inherit the old Forest
  // palette. The Aspire redesign overrides every meaningful token below, so the
  // spread is removed. The one T key still referenced in this file (A.white)
  // is inlined here.
  font: INTER,
  fontDisplay: INTER,
  cream: '#EDEDED',
  ink: '#1A1A1A',
  shell: '#FFFFFF',
  shellDarker: '#F8F8F8',
  shellText: '#1A1A1A',
  white: '#FFFFFF',                 // plain white — used for a couple of card backgrounds
  warning: '#C4A86D',               // Antique Gold — the brand signature (back from orange)
  cardShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)',
  mutedText: 'rgba(0,0,0,0.55)',
  faintText: 'rgba(0,0,0,0.38)',
  subtleBg: 'rgba(0,0,0,0.04)',
  // Matte black tokens for signature dark cards (LIVE TODAY, Restaurant Health)
  forest: '#1A1A1A',                 // Matte Black — signature dark card bg
  forestDarker: '#2A2A2A',           // slightly lighter for inner tiles
  forestText: '#EAE7E3',             // soft cream text on black (high contrast, not harsh white)
  forestTextMuted: 'rgba(234,231,227,0.55)',
  forestTextFaint: 'rgba(234,231,227,0.35)',
  forestSubtleBg: 'rgba(255,255,255,0.04)',
  forestBorder: '1px solid rgba(255,255,255,0.06)',
};

const tip = { backgroundColor: A.ink, border: 'none', borderRadius: 10, color: A.cream, fontSize: 12, fontFamily: A.font, padding: '8px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.25)' };
const tipLabel = { color: A.cream, fontWeight: 600 };
const tipItem = { color: 'rgba(234,231,227,0.8)' };
function Trend({ val }) {
  if (!val) return null;
  const up = val > 0;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: up ? 'rgba(63,158,90,0.10)' : 'rgba(217,83,79,0.10)', color: up ? '#3F9E5A' : '#D9534F' }}>
      {up ? '▲' : '▼'} {Math.abs(val)}%
    </span>
  );
}

function Stars({ avg, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {[1, 2, 3, 4, 5].map(s => (
        <span key={s} style={{ fontSize: 11, color: s <= Math.round(avg || 0) ? A.warning : 'rgba(38,52,49,0.15)' }}>★</span>
      ))}
      <span style={{ fontSize: 11, fontWeight: 700, color: A.warning }}>{(avg || 0).toFixed(1)}</span>
      {count !== undefined && <span style={{ fontSize: 10, color: 'rgba(38,52,49,0.35)' }}>({count})</span>}
    </div>
  );
}

function Sparkline({ data, dataKey, color, width = 80, height = 26 }) {
  if (!data || data.length < 2) return null;
  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={data}><Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} dot={false} /></LineChart>
    </ResponsiveContainer>
  );
}

function downloadCSV(rows, filename) {
  if (!rows.length) return;
  const header = Object.keys(rows[0]).join(',');
  const body = rows.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function formatTime(secs) {
  if (!secs) return '—';
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatDateTick(val) {
  if (!val || typeof val !== 'string') return val;
  const parts = val.split('-');
  if (parts.length !== 2) return val;
  const m = parseInt(parts[0], 10), d = parseInt(parts[1], 10);
  if (isNaN(m) || isNaN(d)) return val;
  return `${MONTHS[m - 1] || ''} ${d}`;
}
function formatRupee(val) {
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}K`;
  return `₹${val}`;
}
function getTodayKey() {
  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// ─── Period → date-range bounds ──────────────────────────────────────────────
// One helper drives every widget in this page (fetch, filter, pad, label,
// CountUp keys). `period` is 'today'|'week'|'month'|'all'; `customRange` is
// { active, start, end } where start/end are YYYY-MM-DD local dates (from the
// DateRangePicker component). A non-null `customRange.active` overrides period.
//
// Returns:
//   start        — Date at 00:00:00 local on the first day of the range
//   end          — Date at 23:59:59 local on the last day of the range
//   spanDays     — integer day count (>=1) for getAnalytics/getWaiterCallsCount
//   startKey     — 'YYYY-MM-DD' for getAnalytics(rid, days, startKey, endKey)
//   endKey       — 'YYYY-MM-DD' for getAnalytics
//   labelLong    — UI label, e.g. 'This Week' or '2026-04-20 → 2026-04-24'
//   labelShort   — compact label for tab-bars, e.g. 'Week'
//   key          — stable identifier for CountUp keys — changes when period
//                  or custom range changes so the number animates on swap.
function getPeriodBounds(period, customRange) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // Custom range takes precedence over the period pill.
  if (customRange && customRange.active && customRange.start && customRange.end) {
    const s = new Date(customRange.start + 'T00:00:00'); s.setHours(0, 0, 0, 0);
    const e = new Date(customRange.end   + 'T23:59:59'); e.setHours(23, 59, 59, 999);
    const spanDays = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
    return {
      start: s, end: e, spanDays,
      startKey: ymd(s), endKey: ymd(e),
      labelLong: `${customRange.start} → ${customRange.end}`,
      labelShort: `${customRange.start.slice(5)} → ${customRange.end.slice(5)}`,
      key: `${customRange.start}_${customRange.end}`,
    };
  }

  if (period === 'today') {
    return {
      start: todayStart, end: todayEnd, spanDays: 1,
      startKey: ymd(todayStart), endKey: ymd(todayEnd),
      labelLong: 'Today', labelShort: 'Today', key: 'today',
    };
  }
  if (period === 'week') {
    // Rolling last 7 days — matches /admin/reports + /admin/orders + /admin/payments semantics.
    const s = new Date(todayStart); s.setDate(s.getDate() - 6);
    return {
      start: s, end: todayEnd, spanDays: 7,
      startKey: ymd(s), endKey: ymd(todayEnd),
      labelLong: 'This Week', labelShort: 'Week', key: 'week',
    };
  }
  if (period === 'month') {
    // Rolling last 30 days — matches reports/orders/payments.
    const s = new Date(todayStart); s.setDate(s.getDate() - 29);
    return {
      start: s, end: todayEnd, spanDays: 30,
      startKey: ymd(s), endKey: ymd(todayEnd),
      labelLong: 'This Month', labelShort: 'Month', key: 'month',
    };
  }
  // 'all' — capped at 365 days to bound Firestore reads. Most restaurants won't
  // have 365 days of analytics docs yet; for older accounts this shows the last
  // 12 months which is the common "all time" mental model for restaurant ops.
  const s = new Date(todayStart); s.setDate(s.getDate() - 364);
  return {
    start: s, end: todayEnd, spanDays: 365,
    startKey: ymd(s), endKey: ymd(todayEnd),
    labelLong: 'All Time', labelShort: 'All', key: 'all',
  };
}

/* ═══════════════════════════════════════ */
export default function AdminAnalytics() {
  const { userData } = useAuth();
  const [analytics, setAnalytics] = useState([]);
  const [prevAnal, setPrevAnal] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [todayStat, setTodayStat] = useState(null);
  const [waiterStat, setWaiterStat] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  // Period pill state — 'today' | 'week' | 'month' | 'all'. Defaults to 'week'
  // (last 7 days) since that's the most common at-a-glance range for ops.
  const [period, setPeriod] = useState('week');
  // Custom date range — overrides `period` when active. Shape matches the
  // <DateRangePicker> component: { active, start, end } where start/end are
  // YYYY-MM-DD local dates. Picking Custom overrides the period pill; picking
  // a period pill clears the custom range.
  const [customRange, setCustomRange] = useState({ active: false, start: '', end: '' });
  // Stable identifier that changes when the committed fetch bounds change —
  // used as the CountUp `key` so numbers re-animate when swapping periods.
  // Updated at the end of load() so numbers don't flicker mid-request.
  const [committedBounds, setCommittedBounds] = useState('week');
  const [tab, setTab] = useState('overview');
  const [chartMode, setChartMode] = useState({}); // { trend: 'line'|'bar' } — single shared mode for the merged trend chart
  const [chartMetric, setChartMetric] = useState('revenue'); // merged trend chart metric: 'revenue' | 'orders' | 'visits'
  const [visitsBarHover, setVisitsBarHover] = useState(null);
  // revRangeOpen state removed — the chart-local range dropdown is gone; the
  // main header's period pills now drive the chart.
  const [revBarHover, setRevBarHover] = useState(null);
  const [ordBarHover, setOrdBarHover] = useState(null);
  const [peakBarHover, setPeakBarHover] = useState(null);
  const [dayBarHover, setDayBarHover] = useState(null);
  // Tracks which Restaurant Health alert cards are expanded to show all item chips (keyed by `${type}::${title}`).
  const [expandedAlerts, setExpandedAlerts] = useState(new Set());
  // Item Performance table sort mode — 'revenue' | 'orders' | 'views'. Click pills to re-sort.
  const [menuSort, setMenuSort] = useState('revenue');
  // Item Performance view mode — 'top12' (default, capped) or 'all' (full menu). Search bypasses the cap.
  const [menuView, setMenuView] = useState('top12');
  // Item Performance search term — case-insensitive filter across item names and categories.
  const [menuSearch, setMenuSearch] = useState('');
  const toggleAlertExpand = useCallback((key) => {
    setExpandedAlerts(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  const rid = userData?.restaurantId;
  const initialLoadDone = useRef(false);

  const load = useCallback(async () => {
    if (!rid) return;
    if (!initialLoadDone.current) setLoading(true);

    // All range logic flows through getPeriodBounds so custom and preset
    // periods share the same code path. The prior-window query is shifted
    // back by spanDays (same length, immediately before the current window)
    // so the delta % is always an equal-length comparison.
    const bounds = getPeriodBounds(period, customRange);
    const { startKey, endKey, spanDays } = bounds;
    const priorStart = new Date(bounds.start); priorStart.setDate(priorStart.getDate() - spanDays);
    const priorEnd   = new Date(bounds.start); priorEnd.setDate(priorEnd.getDate() - 1);
    const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

    const [anal, prev, items, today, waiter, allOrders] = await Promise.all([
      getAnalytics(rid, spanDays, startKey, endKey),
      getAnalytics(rid, spanDays, ymd(priorStart), ymd(priorEnd)),
      getAllMenuItems(rid),
      getTodayAnalytics(rid),
      getWaiterCallsCount(rid, spanDays),
      getOrders(rid),
    ]);
    setAnalytics(anal);
    setPrevAnal(prev);
    setMenuItems(items); setTodayStat(today); setWaiterStat(waiter);
    setOrders(allOrders || []); setLoading(false);
    setCommittedBounds(bounds.key);
    initialLoadDone.current = true;
  }, [rid, period, customRange]);

  useEffect(() => { load(); }, [load]);

  const sum = (arr, k) => arr.reduce((s, d) => s + (d[k] || 0), 0);
  const delta = (curr, prev) => prev === 0 ? (curr > 0 ? null : 0) : Math.round(((curr - prev) / prev) * 100);

  const totalVisits = sum(analytics, 'totalVisits');
  const uniqueVisits = sum(analytics, 'uniqueVisitors');
  const prevVisits = sum(prevAnal, 'totalVisits');
  const prevUnique = sum(prevAnal, 'uniqueVisitors');

  const activeItems = menuItems.filter(i => i.isActive !== false);
  // Per-day sums (range-responsive) — populated from incrementItemView/incrementARView dual-writes.
  // Customer Journey + conversion rates use these so they respond to the date filter.
  const totalViews = sum(analytics, 'itemViews');
  const totalARViews = sum(analytics, 'arViews');
  const arRate = totalViews > 0 ? ((totalARViews / totalViews) * 100).toFixed(1) : '0.0';
  // Lifetime sums (range-independent) — used by Smart Insights for strategic "overall adoption" questions
  // and by any insight that needs the long view (e.g. items with zero views, popularity rankings).
  const totalViewsLifetime = activeItems.reduce((s, i) => s + (i.views || 0), 0);
  const totalARViewsLifetime = activeItems.reduce((s, i) => s + (i.arViews || 0), 0);
  const arRateLifetime = totalViewsLifetime > 0 ? ((totalARViewsLifetime / totalViewsLifetime) * 100).toFixed(1) : '0.0';
  const avgRating = (() => {
    const rated = activeItems.filter(i => (i.ratingCount || 0) > 0);
    if (!rated.length) return 0;
    return (rated.reduce((s, i) => s + (i.ratingAvg || 0), 0) / rated.length).toFixed(1);
  })();

  // Derived bounds for the currently-selected period (or custom range).
  // Single source of truth for every date-window filter on this page.
  const bounds = useMemo(() => getPeriodBounds(period, customRange), [period, customRange]);
  const rangeStart = bounds.start;
  const rangeEnd   = bounds.end;
  const ordersInRange = orders.filter(o => {
    if (!o.createdAt) return true;
    const d = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000) : new Date(o.createdAt || Date.now()));
    // Both ends inclusive — custom ranges can end on a past day so a
    // single `d >= start` check (the old one-sided bug) leaked orders
    // from after the selected window into every stat.
    return d >= rangeStart && d <= rangeEnd;
  });

  // ─── Bounds for the chart specifically ──────────────────────────────
  // The chart data is built from these bounds (NOT live `bounds`). This
  // ties the chart's data shape to whatever period the analytics docs
  // are loaded for, so when the user clicks a new period the chart
  // continues showing the OLD data + OLD shape until load() completes —
  // then both data and shape update in a single atomic re-render.
  // Without this, the chart would receive a new-length data array
  // (e.g. 7 → 24 buckets) while still on the old chart instance, and
  // recharts would snap mid-animation trying to tween between mismatched
  // shapes. With this, recharts gets ONE clean update and can smoothly
  // morph between values.
  const chartBounds = useMemo(() => {
    if (!committedBounds) return bounds;
    if (committedBounds.includes('_')) {
      const [start, end] = committedBounds.split('_');
      return getPeriodBounds(null, { active: true, start, end });
    }
    return getPeriodBounds(committedBounds, { active: false, start: '', end: '' });
  }, [committedBounds, bounds]);

  const ordersForChart = orders.filter(o => {
    if (!o.createdAt) return true;
    const d = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000) : new Date(o.createdAt || Date.now()));
    return d >= chartBounds.start && d <= chartBounds.end;
  });
  const totalOrders = ordersInRange.length;
  // Revenue excludes refunded orders — those happened but the money went
  // back, so counting them as revenue would double-count. Count of total
  // orders still includes refunded (the order did exist).
  const paidOrdersInRange = ordersInRange.filter(o => o.paymentStatus !== 'refunded');
  const totalRevenue = paidOrdersInRange.reduce((s, o) => s + (o.total || 0), 0);
  const avgOrderValue = paidOrdersInRange.length > 0 ? (totalRevenue / paidOrdersInRange.length) : 0;

  const phonesByDay = {};
  ordersInRange.forEach(o => {
    if (!o.customerPhone) return;
    const d = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000) : new Date(o.createdAt || Date.now()));
    const key = d.toISOString().slice(5, 10);
    if (!phonesByDay[key]) phonesByDay[key] = new Set();
    phonesByDay[key].add(o.customerPhone);
  });
  const chartData = analytics.map(d => {
    const key = d.date?.slice(5) || '';
    return { date: key, visits: d.totalVisits || 0, unique: d.uniqueVisitors || 0, customers: phonesByDay[key]?.size || 0 };
  });

  // In Today mode (1-day span) we bucket by HOUR instead of by day — the
  // chart then shows a time-of-day curve instead of a single flat bar.
  // Matches /admin/reports behavior for the same period. For multi-day ranges
  // we keep the daily "MM-DD" buckets.
  // NOTE: this uses chartBounds (committed), not live bounds, so the chart's
  // data shape stays stable until load() completes — recharts gets one
  // atomic update instead of a mid-flight reshape that would cause snapping.
  const isTodayChart = chartBounds.spanDays === 1;

  const revByBucket = {};
  ordersForChart.forEach(o => {
    const d = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000) : new Date(o.createdAt || Date.now()));
    // Hourly keys sort correctly because they're zero-padded 2-digit strings ("00"…"23").
    const key = isTodayChart
      ? String(d.getHours()).padStart(2, '0')
      : d.toISOString().slice(5, 10);
    if (!revByBucket[key]) revByBucket[key] = { date: key, revenue: 0, orders: 0 };
    revByBucket[key].revenue += o.total || 0; revByBucket[key].orders += 1;
  });
  // Pad empty buckets so the chart axis stays consistent (prevents misleading
  // skipped hours/days). Hourly pads all 24 hours; daily walks forward from
  // chartBounds.start across spanDays.
  if (isTodayChart) {
    for (let h = 0; h < 24; h++) {
      const k = String(h).padStart(2, '0');
      if (!revByBucket[k]) revByBucket[k] = { date: k, revenue: 0, orders: 0 };
    }
  } else {
    for (let i = 0; i < chartBounds.spanDays; i++) {
      const d = new Date(chartBounds.start); d.setDate(d.getDate() + i);
      const k = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!revByBucket[k]) revByBucket[k] = { date: k, revenue: 0, orders: 0 };
    }
  }
  const revenueChartData = Object.values(revByBucket).sort((a, b) => a.date.localeCompare(b.date));

  // Merged trend chart data — unions chartData (visits) with revenueChartData
  // (revenue + orders) by bucket key.
  //   Daily mode: visits come from the analytics docs keyed by date.
  //   Hourly mode (Today): visits come from the `hourlyVisits` map field on
  //   today's analytics doc — a Firestore map keyed by hour-of-day
  //   ("0"..."23") with the count of visits in that hour. Field is written
  //   by trackVisit() in lib/db.js. For days where the field is missing
  //   (legacy docs from before this field was introduced) the chart shows
  //   0 visits — those days' hourly breakdown is simply unrecoverable.
  const combinedChartData = (() => {
    const visitsByDate = {};
    chartData.forEach(d => { visitsByDate[d.date] = d.visits || 0; });
    // todayStat is always today's doc; chartData[0] is the same doc when in
    // Today mode so we can reach the hourlyVisits map either way.
    const hourlyMap = isTodayChart
      ? (todayStat?.hourlyVisits || chartData[0]?.hourlyVisits || {})
      : null;
    return revenueChartData.map(r => ({
      date: r.date,
      revenue: r.revenue || 0,
      orders: r.orders || 0,
      // In hourly mode, `r.date` is a 2-digit zero-padded hour ("00"…"23").
      // hourlyVisits is keyed by non-padded hour ("0"…"23"), so parseInt
      // bridges the two representations.
      visits: isTodayChart
        ? (hourlyMap?.[String(parseInt(r.date, 10))] || 0)
        : (visitsByDate[r.date] || 0),
    }));
  })();

  const itemFreq = {};
  ordersInRange.forEach(o => {
    (o.items || []).forEach(item => {
      if (!itemFreq[item.name]) itemFreq[item.name] = { name: item.name, qty: 0, revenue: 0 };
      itemFreq[item.name].qty += item.qty || 1;
      itemFreq[item.name].revenue += (item.price || 0) * (item.qty || 1);
    });
  });
  const topOrderedItems = Object.values(itemFreq).sort((a, b) => b.qty - a.qty).slice(0, 8);
  // Top 3 performers by revenue in the selected range — fuels the "Top Performers" panel in Restaurant Health.
  // Rating is looked up by name against menuItems (lifetime rating — ratings are slow-moving).
  const topPerformers = Object.values(itemFreq)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 3)
    .map(f => {
      const item = menuItems.find(i => i.name === f.name);
      return {
        name: f.name,
        qty: f.qty,
        revenue: f.revenue,
        rating: item?.ratingAvg || 0,
        ratingCount: item?.ratingCount || 0,
      };
    });

  const hourlyOrders = Array(24).fill(0);
  ordersInRange.forEach(o => {
    const d = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000) : new Date(o.createdAt || Date.now()));
    hourlyOrders[d.getHours()] += 1;
  });
  const peakHourData = hourlyOrders.map((count, h) => ({
    hour: h, label: `${h === 0 ? 12 : h > 12 ? h - 12 : h}${h < 12 ? 'AM' : 'PM'}`, orders: count,
  })).filter(h => h.orders > 0);
  const peakHour = peakHourData.reduce((best, h) => h.orders > (best?.orders || 0) ? h : best, null);

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dailyOrders = Array(7).fill(0);
  ordersInRange.forEach(o => {
    const d = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000) : new Date(o.createdAt || Date.now()));
    dailyOrders[d.getDay()] += 1;
  });
  const dayData = dailyOrders.map((count, i) => ({ day: dayNames[i], orders: count }));
  const busiestDay = dayData.reduce((best, d) => d.orders > (best?.orders || 0) ? d : best, null);

  const heatmapData = [...activeItems]
    .map(i => ({ ...i, score: (i.views || 0) + (i.arViews || 0) * 2 + (i.ratingAvg || 0) * 10, arRate: i.views > 0 ? Math.round(((i.arViews || 0) / i.views) * 100) : 0 }))
    .sort((a, b) => b.score - a.score);
  const maxScore = heatmapData[0]?.score || 1;
  const heatColor = score => {
    const p = score / maxScore;
    if (p >= 0.7) return A.warning;       // gold for hot
    if (p >= 0.3) return '#A08656';       // darker gold for active
    return 'rgba(38,52,49,0.18)';         // grey for cold
  };

  const topRated = [...activeItems].filter(i => (i.ratingCount || 0) > 0).sort((a, b) => (b.ratingAvg || 0) - (a.ratingAvg || 0)).slice(0, 5);
  // Require at least 3 ratings before flagging an item as low-rated — single bad reviews shouldn't trigger an alert.
  const lowRated = [...activeItems].filter(i => (i.ratingAvg || 0) < 3.5 && (i.ratingCount || 0) >= 3).sort((a, b) => (a.ratingAvg || 0) - (b.ratingAvg || 0)).slice(0, 3);
  // Zero-view items, split by age: items < 7 days old are "new" (informational), older are "stale" (real problem).
  // createdAt is set via serverTimestamp() in lib/db.js item creation flows; if missing, treat as old.
  const NEW_ITEM_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
  const __itemAgeMs = (i) => {
    const ms = i.createdAt?.toDate ? i.createdAt.toDate().getTime() : (i.createdAt?.seconds ? i.createdAt.seconds * 1000 : null);
    return ms == null ? Infinity : (Date.now() - ms);
  };
  const __zeroViewAll = heatmapData.filter(i => (i.views || 0) === 0);
  const zeroView = __zeroViewAll.filter(i => __itemAgeMs(i) > NEW_ITEM_GRACE_MS);   // stale: older than 7 days, still no views
  const newUnviewed = __zeroViewAll.filter(i => __itemAgeMs(i) <= NEW_ITEM_GRACE_MS); // brand-new: in grace period
  const topItems = [...activeItems].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 10);

  const catMap = {};
  activeItems.forEach(i => {
    const raw = i.category || 'Uncategorised';
    const cat = raw.charAt(0).toUpperCase() + raw.slice(1);
    if (!catMap[cat]) catMap[cat] = { name: cat, views: 0, items: 0 };
    catMap[cat].views += (i.views || 0) + (i.arViews || 0); catMap[cat].items += 1;
  });
  const catData = Object.values(catMap).sort((a, b) => b.views - a.views);

  const funnelData = [
    { label: 'Menu Visits', value: totalVisits, pct: 100, color: '#1A1A1A' },
    { label: 'Item Views', value: totalViews, pct: totalVisits > 0 ? Math.min(100, Math.round((totalViews / totalVisits) * 100)) : 0, color: '#A08656' },
    { label: 'AR Views', value: totalARViews, pct: totalViews > 0 ? Math.min(100, Math.round((totalARViews / totalViews) * 100)) : 0, color: A.warning },
  ];

  const insights = useMemo(() => {
    const list = [];
    const now = Date.now();
    const daysSince = (ts) => ts?.toDate ? Math.floor((now - ts.toDate().getTime()) / 86400000) : ts?.seconds ? Math.floor((now - ts.seconds * 1000) / 86400000) : null;

    // ── CRITICAL (priority 100) — risks to revenue or reputation ──

    // Revenue concentration risk — top dish is too much of the pie (only meaningful at 10+ orders)
    if (topOrderedItems.length > 0 && totalRevenue > 0 && totalOrders >= 10) {
      const top = topOrderedItems[0];
      const revPct = Math.round((top.revenue / totalRevenue) * 100);
      if (revPct >= 40) {
        list.push({
          priority: 100, type: 'warning',
          text: `${top.name} is ${revPct}% of revenue. High concentration — if it's off the menu one day, revenue drops hard. Feature your #2 and #3 dishes more.`,
        });
      }
    }

    // AR models exist but nobody launches them — discoverability problem
    if (totalARViewsLifetime === 0) {
      const arItems = activeItems.filter(i => i.modelURL);
      if (arItems.length > 0) {
        list.push({
          priority: 100, type: 'danger',
          text: `${arItems.length} dish${arItems.length > 1 ? 'es have' : ' has'} AR ready but 0 launches ever. The AR button may not be visible to customers.`,
        });
      }
    }

    // ── OPPORTUNITIES (priority 80) — specific items that could perform better with a small nudge ──
    // Problem reporting (low-rated, converting poorly, zero-view) lives in Restaurant Health → Needs Attention now.

    // Hidden gem — high rating but low orders
    const hiddenGem = activeItems
      .filter(i => (i.ratingCount || 0) >= 3 && (i.ratingAvg || 0) >= 4.5)
      .filter(i => !itemFreq[i.name] || itemFreq[i.name].qty < 3)
      .sort((a, b) => (b.ratingAvg || 0) - (a.ratingAvg || 0))[0];
    if (hiddenGem) {
      list.push({
        priority: 80, type: 'info',
        text: `${hiddenGem.name} has a ${hiddenGem.ratingAvg.toFixed(1)}★ rating but few orders — hidden gem. Feature it on your homepage.`,
      });
    }

    // ── STRATEGIC (priority 60) — patterns worth knowing ──

    // Day-of-week concentration (only meaningful with enough orders)
    if (busiestDay && busiestDay.orders > 0 && totalOrders >= 10) {
      const totalDayOrders = dayData.reduce((s, d) => s + d.orders, 0);
      const sharePct = Math.round((busiestDay.orders / totalDayOrders) * 100);
      const fullDay = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' }[busiestDay.day];
      if (sharePct >= 30) {
        list.push({
          priority: 60, type: 'info',
          text: `${fullDay} drives ${sharePct}% of your orders. Worth a ${fullDay}-specific promo or extra staffing.`,
        });
      }
    }

    // Rating capture rate — low ratings per order means customers don't engage
    const totalRatings = activeItems.reduce((s, i) => s + (i.ratingCount || 0), 0);
    if (totalOrders >= 10 && totalRatings > 0) {
      const capturePct = Math.round((totalRatings / totalOrders) * 100);
      if (capturePct < 20) {
        list.push({
          priority: 60, type: 'warning',
          text: `Only ${capturePct}% of orders get rated (${totalRatings} of ${totalOrders}). Add a rating prompt after the meal.`,
        });
      }
    }

    // AR adoption — lifetime tier (requires enough views to be statistically meaningful)
    const arLife = parseFloat(arRateLifetime);
    if (totalARViewsLifetime > 0 && totalViewsLifetime >= 20) {
      if (arLife >= 20) {
        list.push({ priority: 40, type: 'success', text: `AR is a hit — ${arLife}% of item views launch AR. Keep adding AR to new dishes.` });
      } else if (arLife >= 10) {
        list.push({ priority: 60, type: 'info', text: `AR adoption at ${arLife}%. Add AR to your top 3 dishes to push higher.` });
      } else if (arLife >= 3) {
        list.push({ priority: 60, type: 'warning', text: `AR at ${arLife}% — underused. Highlight the AR badge more prominently on item cards.` });
      } else {
        list.push({ priority: 80, type: 'warning', text: `AR at ${arLife}% — only ${totalARViewsLifetime} launches ever. Check the AR button is discoverable.` });
      }
    }

    // ── WINS (priority 40) — positive signal ──

    // Strong AR conversion — specific: an item with high AR launch rate
    const arStar = activeItems
      .filter(i => (i.views || 0) >= 10 && (i.arViews || 0) > 0)
      .map(i => ({ ...i, arConv: (i.arViews / i.views) * 100 }))
      .filter(i => i.arConv >= 25)
      .sort((a, b) => b.arConv - a.arConv)[0];
    if (arStar) {
      list.push({
        priority: 40, type: 'success',
        text: `${arStar.name} has ${arStar.arConv.toFixed(0)}% AR launch rate — customers love seeing it in 3D.`,
      });
    }

    // Avg order value — tells the owner whether to push upsells or features
    if (totalOrders >= 10) {
      if (avgOrderValue >= 600) {
        list.push({
          priority: 40, type: 'success',
          text: `Avg order ₹${Math.round(avgOrderValue)} — customers buy multiple items per order. Your upsells are working.`,
        });
      } else if (avgOrderValue < 250) {
        list.push({
          priority: 60, type: 'warning',
          text: `Avg order ₹${Math.round(avgOrderValue)} is low. Offer combos or sides to push basket size up.`,
        });
      }
    }

    // Customer loyalty signal — returning customer rate
    if (totalOrders >= 10) {
      const phoneCounts = {};
      ordersInRange.forEach(o => {
        if (o.customerPhone) phoneCounts[o.customerPhone] = (phoneCounts[o.customerPhone] || 0) + 1;
      });
      const uniqueCustomers = Object.keys(phoneCounts).length;
      if (uniqueCustomers >= 5) {
        const returningCount = Object.values(phoneCounts).filter(c => c > 1).length;
        const returningPct = Math.round((returningCount / uniqueCustomers) * 100);
        if (returningPct >= 40) {
          list.push({
            priority: 40, type: 'success',
            text: `${returningPct}% of customers came back — strong loyalty. Consider a referral offer to amplify it.`,
          });
        } else if (returningPct < 15) {
          list.push({
            priority: 60, type: 'warning',
            text: `Only ${returningPct}% of customers return. A small loyalty reward could lift repeat visits.`,
          });
        }
      }
    }

    // ── INFORMATIONAL (priority 20) ──

    // Dead items — 0 views ever, but specific
    const deadItems = activeItems
      .filter(i => (i.views || 0) === 0)
      .map(i => ({ ...i, age: daysSince(i.createdAt) }))
      .filter(i => i.age === null || i.age < 14); // exclude ones already flagged as stale-new
    if (deadItems.length >= 3) {
      list.push({
        priority: 20, type: 'info',
        text: `${deadItems.length} items have 0 views — recently added or buried in the menu order.`,
      });
    }

    // Sort by priority desc, then by severity (danger > warning > info > success), take top 4
    const severityRank = { danger: 4, warning: 3, info: 2, success: 1 };
    return list
      .sort((a, b) => (b.priority - a.priority) || (severityRank[b.type] - severityRank[a.type]))
      .slice(0, 4);
  }, [
    topOrderedItems, totalRevenue, totalOrders, avgOrderValue, arRateLifetime, totalARViewsLifetime, totalViewsLifetime,
    activeItems, itemFreq, ordersInRange, lowRated, busiestDay, dayData, period, customRange,
  ]);

  const healthScore = useMemo(() => {
    let score = 50;
    if (totalOrders > 0) score += Math.min(20, totalOrders / 2);
    if (parseFloat(avgRating) >= 4) score += 15; else if (parseFloat(avgRating) >= 3) score += 10; else if (parseFloat(avgRating) > 0) score += 5;
    if (parseFloat(arRate) >= 20) score += 10; else if (parseFloat(arRate) >= 10) score += 7; else if (parseFloat(arRate) > 0) score += 3;
    if (totalVisits > 100) score += 5; else if (totalVisits > 20) score += 3;
    return Math.min(100, Math.round(score));
  }, [totalOrders, avgRating, arRate, totalVisits]);
  const scoreColor = healthScore >= 80 ? '#3F9E5A' : healthScore >= 60 ? A.warning : '#D9534F';

  const viewToOrderRate = totalVisits > 0 && totalOrders > 0 ? ((totalOrders / totalVisits) * 100).toFixed(1) : '0.0';
  const itemsWithAR = activeItems.filter(i => (i.arViews || 0) > 0);
  const arItemNames = new Set(itemsWithAR.map(i => i.name));
  const ordersFromARItems = ordersInRange.filter(o => (o.items || []).some(item => arItemNames.has(item.name))).length;
  // AR Item Order Ratio — % of orders that included at least one AR-enabled item
  const arToOrderRate = totalOrders > 0 && ordersFromARItems > 0 ? Math.min(100, ((ordersFromARItems / totalOrders) * 100)).toFixed(1) : '0.0';

  // ── TODAY's live metrics ──
  const todayDate = new Date();
  const todayOrders = orders.filter(o => {
    const d = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000) : new Date(o.createdAt || Date.now()));
    return d.toDateString() === todayDate.toDateString();
  });
  const todayOrderCount = todayOrders.length;
  const todayRevenue = todayOrders.reduce((s, o) => s + (o.total || 0), 0);
  const todayVisits = todayStat?.totalVisits || 0;
  const todayWaiterCalls = todayStat?.waiterCalls || 0;

  // Item Performance dataset — signal only fires when it matters; most rows have no flag.
  // signalType: 'top' (top performer), 'high-conv' (rare high conversion), 'low-conv' (views but no orders), null (quiet)
  const itemIntelligence = useMemo(() => {
    const withMetrics = activeItems.map(item => {
      const freq = itemFreq[item.name];
      const views = item.views || 0;
      const arViews = item.arViews || 0;
      const ordered = freq?.qty || 0;
      const revenue = freq?.revenue || 0;
      const rating = item.ratingAvg || 0;
      const ratingCount = item.ratingCount || 0;
      const convRate = views > 0 ? (ordered / views) : 0; // orders per view
      return { ...item, ordered, revenue, views, arViews, rating, ratingCount, convRate };
    });

    // Compute per-restaurant thresholds so signal flags scale with the menu.
    // Top performer: top 3 by revenue with rating >= 4 (or any rating if rating data is thin).
    // High conversion: conversion rate >= 2x the menu median (only items with >=10 views qualify, so small samples don't game it).
    // Low conversion: views >= top-quartile by views AND ordered === 0 this range.
    const ratingVolume = withMetrics.filter(x => x.ratingCount >= 3).length;
    const topByRev = [...withMetrics].sort((a, b) => b.revenue - a.revenue).filter(x => x.revenue > 0).slice(0, 3);
    const topByRevSet = new Set(topByRev.filter(x => ratingVolume < 3 || x.rating >= 4).map(x => x.id));
    const convCandidates = withMetrics.filter(x => x.views >= 10 && x.convRate > 0).map(x => x.convRate).sort((a, b) => a - b);
    const medianConv = convCandidates.length ? convCandidates[Math.floor(convCandidates.length / 2)] : 0;
    const viewSorted = [...withMetrics].map(x => x.views).filter(v => v > 0).sort((a, b) => b - a);
    const topQuartileViewsThresh = viewSorted.length >= 4 ? viewSorted[Math.max(0, Math.ceil(viewSorted.length * 0.25) - 1)] : Infinity;

    const withFlags = withMetrics.map(x => {
      let signalType = null;
      if (topByRevSet.has(x.id)) signalType = 'top';
      else if (x.views >= 10 && medianConv > 0 && x.convRate >= medianConv * 2) signalType = 'high-conv';
      else if (x.views >= topQuartileViewsThresh && x.ordered === 0) signalType = 'low-conv';
      return { ...x, signalType };
    });

    const keyFor = { revenue: x => x.revenue, orders: x => x.ordered, views: x => x.views };
    const picker = keyFor[menuSort] || keyFor.revenue;
    // Return the full sorted list — the render layer applies the Top 12/All cap and search filter.
    return withFlags.sort((a, b) => picker(b) - picker(a) || b.views - a.views);
  }, [activeItems, itemFreq, menuSort]);

  // Visible items for the Item Performance table: apply search (bypasses cap) OR Top 12 cap.
  const visibleMenuItems = useMemo(() => {
    const q = menuSearch.trim().toLowerCase();
    if (q) {
      return itemIntelligence.filter(i =>
        (i.name || '').toLowerCase().includes(q) ||
        (i.category || '').toLowerCase().includes(q)
      );
    }
    return menuView === 'all' ? itemIntelligence : itemIntelligence.slice(0, 12);
  }, [itemIntelligence, menuView, menuSearch]);

  const exportCSV = () => {
    // Overview now combines visits + revenue + orders (Orders & Revenue tab folded in).
    if (tab === 'overview') downloadCSV(combinedChartData.map(d => ({ date: d.date, visits: d.visits, revenue: d.revenue, orders: d.orders })), `analytics-${bounds.key}.csv`);
    else downloadCSV(activeItems.map(i => ({ name: i.name, category: i.category || '', views: i.views || 0, ar_views: i.arViews || 0, rating_avg: i.ratingAvg || 0 })), 'menu-performance.csv');
  };

  const bestSeller = topOrderedItems[0] || null;
  const bestSellerItem = bestSeller ? activeItems.find(i => i.name === bestSeller.name) : null;
  const topDishes = topOrderedItems.slice(0, 6);
  const restaurantName = userData?.restaurantName || 'Your Restaurant';

  // Card + section shared styles
  const card = { background: A.white, borderRadius: 16, border: '1px solid rgba(38,52,49,0.06)', boxShadow: '0 2px 10px rgba(38,52,49,0.03)' };
  const secTitle = { fontFamily: A.font, fontWeight: 500, fontSize: 18, color: A.ink, letterSpacing: '-0.2px' };
  const labelSm = { fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(38,52,49,0.35)' };

  // Date range label + today key for charts. Uses the committed bounds so the
  // label matches the data currently rendered (not mid-request bounds).
  const dateRangeLabel = (() => {
    const fmt = d => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
    return `${fmt(bounds.start)} — ${fmt(bounds.end)}`;
  })();
  const todayDotKey = getTodayKey();
  const getAnnotation = (data, key) => {
    if (!data || data.length < 2) return null;
    const last = data[data.length - 1]?.[key] || 0;
    const prev = data[data.length - 2]?.[key] || 0;
    const trend = prev > 0 ? Math.round(((last - prev) / prev) * 100) : (last > 0 ? 100 : 0);
    return { value: last, trend };
  };

  // Chart type toggle
  const getMode = (key, fallback) => chartMode[key] || fallback;
  const toggleChart = (key, fallback) => setChartMode(p => ({ ...p, [key]: (p[key] || fallback) === 'line' ? 'bar' : 'line' }));
  const ChartToggle = ({ chartKey, fallback = 'line' }) => {
    const mode = getMode(chartKey, fallback);
    const isLine = mode === 'line';
    return (
      <button onClick={() => toggleChart(chartKey, fallback)} title={`Switch to ${isLine ? 'bar' : 'line'} chart`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 14, border: '1px solid rgba(196,168,109,0.5)', background: 'rgba(196,168,109,0.08)', cursor: 'pointer', fontFamily: A.font, fontSize: 10, fontWeight: 600, color: '#A08656', transition: 'all 0.15s', verticalAlign: 'middle', lineHeight: 1 }}>
        {isLine ? (
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><rect x="2" y="7" width="2.5" height="5" rx="0.8" fill="currentColor" /><rect x="5.75" y="4" width="2.5" height="8" rx="0.8" fill="currentColor" /><rect x="9.5" y="5.5" width="2.5" height="6.5" rx="0.8" fill="currentColor" /></svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M2 10 C3.5 8, 5 5, 6.5 6.5 S9.5 4, 12 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        )}
        {isLine ? 'Bar' : 'Line'}
      </button>
    );
  };

  return (
    <AdminLayout>
      <Head><title>Analytics — Advert Radical</title></Head>
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font }}>
        <style>{`
          @keyframes spin{to{transform:rotate(360deg)}}
          @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
          @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
          .row-hover:hover{background:rgba(196,168,109,0.04)!important}
          .kpi-card{transition:transform 0.12s ease,box-shadow 0.12s ease}
          .kpi-card:hover{transform:translateY(-1px);box-shadow:0 4px 18px rgba(38,52,49,0.07)!important}
        `}</style>

        {/* ═══ ASPIRE HEADER ═══ */}
        <div style={{ padding: '24px 28px 0' }}>
          <div style={{ margin: 0 }}>
            {/* Title row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div>
                <div style={{ fontFamily: A.font, fontSize: 11, fontWeight: 500, color: A.faintText, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Dashboard</span>
                  <span style={{ opacity: 0.5 }}>›</span>
                  <span style={{ color: A.mutedText }}>Analytics</span>
                </div>
                <div style={{ fontFamily: A.font, fontWeight: 600, fontSize: 28, color: A.ink, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                  {restaurantName} <span style={{ color: A.mutedText, fontWeight: 500 }}>Analytics</span>
                </div>
                <div style={{ fontFamily: A.font, fontSize: 12, color: A.mutedText, marginTop: 4 }}>
                  Live data · Updated {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', position: 'relative' }}>
                {/* Period pills + Custom date-range picker.
                    Replaces the old 7d/14d/30d/90d pills with Today/Week/Month/All
                    to match /admin/reports semantics. Picking a pill clears any
                    active custom range; picking Custom overrides the pill. */}
                <div style={{ display: 'inline-flex', background: '#FFFFFF', border: A.border, borderRadius: 10, padding: 3 }}>
                  {[['today', 'Today'], ['week', 'Week'], ['month', 'Month'], ['all', 'All']].map(([key, label]) => {
                    const active = !customRange.active && period === key;
                    return (
                      <button key={key} onClick={() => { setCustomRange({ active: false, start: '', end: '' }); setPeriod(key); }} style={{
                        padding: '6px 14px', borderRadius: 7,
                        border: 'none',
                        fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: A.font,
                        background: active ? A.subtleBg : 'transparent',
                        color: active ? A.ink : A.mutedText, transition: 'all 0.15s',
                      }}>{label}</button>
                    );
                  })}
                  {/* Main header Custom pill — compactLabel=true to show
                      "MM-DD → MM-DD" instead of the full ISO form, so the
                      label doesn't wrap on narrower viewports. */}
                  <DateRangePicker
                    value={customRange}
                    onChange={setCustomRange}
                    maxDate={todayKey()}
                    theme={A}
                    compactLabel={true}
                    pillStyle={{ padding: '6px 14px', borderRadius: 7, fontSize: 13, whiteSpace: 'nowrap' }}
                    pillActiveStyle={{ background: A.subtleBg, color: A.ink, fontWeight: 700 }}
                  />
                </div>

                <button onClick={exportCSV} style={{
                  padding: '8px 14px', borderRadius: 10, border: A.border,
                  background: '#FFFFFF', color: A.ink, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: A.font,
                }}>Export</button>
              </div>
            </div>

            {/* ── LIVE TODAY — Deep Forest signature dark card ── */}
            <div style={{
              background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
              borderRadius: 14, padding: '20px 24px', marginBottom: 14,
              border: A.forestBorder,
              boxShadow: '0 4px 16px rgba(38,52,49,0.15)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#C4A86D', animation: 'pulse 2s ease infinite', boxShadow: '0 0 8px rgba(196,168,109,0.6)' }} />
                <span style={{ fontFamily: A.font, fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>LIVE TODAY</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(234,231,227,0.08)' }} />
                <span style={{ fontFamily: A.font, fontSize: 11, color: A.forestTextMuted, fontWeight: 500 }}>{todayDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                {[
                  { label: 'VISITORS', value: todayVisits, prefix: '', accent: false },
                  { label: 'ORDERS', value: todayOrderCount, prefix: '', accent: false },
                  { label: 'REVENUE', value: todayRevenue, prefix: '₹', accent: true },
                  { label: 'WAITER CALLS', value: todayWaiterCalls, prefix: '', accent: false },
                ].map(s => (
                  <div key={s.label} style={{
                    padding: '16px 18px', borderRadius: 10,
                    background: A.forestSubtleBg,
                    border: A.forestBorder,
                  }}>
                    <div style={{ fontFamily: A.font, fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 8 }}>{s.label}</div>
                    <div style={{ fontFamily: A.font, fontWeight: 700, fontSize: 28, color: s.accent ? A.warning : A.forestText, lineHeight: 1, letterSpacing: '-0.5px' }}>
                      <CountUp end={s.value} duration={1.5} separator="," prefix={s.prefix} preserveValue />
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* ═══ MAIN CONTENT ═══ */}
        <div style={{ margin: 0, padding: '0 28px 28px' }}>

          {/* Hero stats — Light wrapper card mirroring LIVE TODAY's structure (daylight palette) */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: 14, padding: '20px 24px', marginBottom: 14,
            border: A.border,
            boxShadow: A.cardShadow,
          }}>
            {/* Header row — gold dot + label + thin rule + 'vs previous period' meta */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: A.warning, boxShadow: '0 0 6px rgba(196,168,109,0.35)' }} />
              <span style={{ fontFamily: A.font, fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>{bounds.labelLong.toUpperCase()}</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(196,168,109,0.20)' }} />
              <span style={{ fontFamily: A.font, fontSize: 11, color: A.mutedText, fontWeight: 500 }}>vs previous period</span>
            </div>
            {/* Inner stat tiles — subtle cream bg to differentiate from the wrapper */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'VISITORS', value: totalVisits, prefix: '', d: delta(totalVisits, prevVisits) },
                { label: 'ORDERS', value: totalOrders, prefix: '' },
                { label: 'REVENUE', value: totalRevenue, prefix: '₹', highlight: true },
                { label: 'AVG ORDER', value: Math.round(avgOrderValue), prefix: '₹' },
              ].map(s => (
                <div key={s.label} style={{
                  padding: '16px 18px', borderRadius: 10,
                  background: A.subtleBg,
                  border: '1px solid rgba(0,0,0,0.04)',
                }}>
                  <div style={{ fontFamily: A.font, fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.faintText, marginBottom: 8 }}>{s.label}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 28 }}>
                    <span style={{ fontFamily: A.font, fontWeight: 700, fontSize: 24, color: s.highlight ? A.warning : A.ink, letterSpacing: '-0.4px', lineHeight: 1 }}>
                      <CountUp end={s.value} duration={1.5} separator="," prefix={s.prefix} preserveValue key={committedBounds} />
                    </span>
                    {s.d !== undefined && s.d !== 0 && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        fontFamily: A.font, fontSize: 11, fontWeight: 600,
                        color: s.d > 0 ? '#3F9E5A' : '#D9534F',
                        background: s.d > 0 ? 'rgba(63,158,90,0.10)' : 'rgba(217,83,79,0.10)',
                        padding: '3px 8px', borderRadius: 999, lineHeight: 1,
                      }}>{s.d > 0 ? '↗' : '↘'} {Math.abs(s.d)}%</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Trend Over Time — single chart, metric-toggleable (Visits / Revenue / Orders).
              Replaces the old Revenue Over Time + Orders Per Day pair; Visits Over Time deleted from Overview. */}
          {(() => {
            const aspireFont = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
            const trendMode = chartMode.trend || 'line';

            // Per-metric config — keeps tooltip prefix, y-axis formatter, key, label, latest-CountUp prefix in one place.
            const METRICS = {
              revenue: { key: 'revenue', label: 'Revenue', prefix: '₹', yWidth: 46, yFmt: formatRupee, default: 'line' },
              orders:  { key: 'orders',  label: 'Orders',  prefix: '',  yWidth: 32, yFmt: undefined,    default: 'bar'  },
              visits:  { key: 'visits',  label: 'Visits',  prefix: '',  yWidth: 32, yFmt: undefined,    default: 'line' },
            };
            const M = METRICS[chartMetric] || METRICS.revenue;

            // Trend up/down for gradient color choice — compares first-half vs last-half average for the active metric.
            let trendUp = true;
            if (combinedChartData.length >= 2) {
              const half = Math.max(1, Math.floor(combinedChartData.length / 2));
              const first = combinedChartData.slice(0, half).map(d => d[M.key] || 0);
              const last = combinedChartData.slice(-half).map(d => d[M.key] || 0);
              const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
              trendUp = avg(last) >= avg(first);
            }
            const gStart = trendUp ? '#E89143' : '#4A9A5E';
            const gEnd = trendUp ? '#4A9A5E' : '#E89143';

            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            // Parse both day keys ("MM-DD" / "YYYY-MM-DD") AND hour keys ("HH")
            // — hour keys are 2-digit 00-23 strings used only in Today mode.
            const parseKey = v => {
              if (!v) return null;
              const p = String(v).split('-').map(Number);
              if (p.length === 1 && isTodayChart) {
                const h = p[0];
                if (isNaN(h) || h < 0 || h > 23) return null;
                return { isHour: true, h };
              }
              let yy, mm, dd;
              if (p.length === 2) { mm = p[0]; dd = p[1]; yy = new Date().getFullYear(); }
              else if (p.length === 3) { yy = p[0]; mm = p[1]; dd = p[2]; } else return null;
              if (!mm || !dd || mm < 1 || mm > 12) return null;
              return { yy, mm, dd };
            };
            // Hour formatters render "2 PM" style; day formatters unchanged.
            const fmtHour = h => {
              if (h === 0) return '12 AM';
              if (h === 12) return 'Noon';
              return h < 12 ? `${h} AM` : `${h - 12} PM`;
            };
            const fmtDayFirst = v => {
              const p = parseKey(v);
              if (!p) return '';
              if (p.isHour) return fmtHour(p.h);
              return `${p.dd} ${months[p.mm - 1]}`;
            };
            const fmtFullDate = v => {
              const p = parseKey(v);
              if (!p) return '';
              if (p.isHour) {
                // In hourly mode the "full" label includes today's date so
                // the tooltip header reads like "2 PM · 24 Apr".
                const now = new Date();
                return `${fmtHour(p.h)} · ${now.getDate()} ${months[now.getMonth()]}`;
              }
              return `${p.dd} ${months[p.mm - 1]} ${p.yy}`;
            };
            const chipTxt = isTodayChart
              ? `Today · ${new Date().getDate()} ${months[new Date().getMonth()]} (hourly)`
              : combinedChartData.length
                ? `${fmtDayFirst(combinedChartData[0].date)} - ${fmtFullDate(combinedChartData[combinedChartData.length - 1].date)}`
                : '';

            // Tooltip — uses active metric's prefix and value formatting.
            const TrendTip = ({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const v = Number(payload[0].value) || 0;
              const idx = combinedChartData.findIndex(d => d.date === label);
              let pct = null;
              if (idx > 0) {
                const prev = Number(combinedChartData[idx - 1][M.key]) || 0;
                if (prev > 0) pct = ((v - prev) / prev) * 100;
                else if (v > 0) pct = 'new';
              }
              const isNew = pct === 'new';
              const up = isNew ? true : (pct == null ? null : pct >= 0);
              const formatted = M.prefix === '₹' ? `${M.prefix}${v.toLocaleString('en-IN')}` : v.toLocaleString();
              return (
                <div style={{ background: '#FFFFFF', border: '1px solid rgba(38,52,49,0.08)', borderRadius: 10, padding: '10px 14px', boxShadow: '0 8px 24px rgba(38,52,49,0.10)', fontFamily: aspireFont, minWidth: 110 }}>
                  <div style={{ fontSize: 12, color: 'rgba(38,52,49,0.55)', fontWeight: 500, marginBottom: 4 }}>{fmtFullDate(label)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: A.ink, letterSpacing: '-0.3px' }}>{formatted}</span>
                    {up !== null && (<span style={{ fontSize: 11, fontWeight: 700, color: up ? '#3F9E5A' : '#D9534F' }}>{isNew ? 'new' : `${up ? '↗' : '↘'} ${Math.abs(Math.round(pct))}%`}</span>)}
                  </div>
                </div>
              );
            };

            return (
              <BentoGlow style={{ ...card, padding: '22px 22px 18px', marginBottom: 14, fontFamily: aspireFont }}>
                <Head>
                  <link rel="preconnect" href="https://fonts.googleapis.com" />
                  <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
                </Head>

                {/* Header: title + metric pill on left, line/bar + range chip + range dropdown on right */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontFamily: aspireFont, fontWeight: 500, fontSize: 18, color: A.ink, letterSpacing: '-0.2px' }}>{M.label} Over Time</div>
                    <div style={{ display: 'inline-flex', background: '#FFFFFF', border: '1px solid rgba(38,52,49,0.12)', borderRadius: 8, padding: 2 }}>
                      {[
                        { k: 'revenue', label: 'Revenue' },
                        { k: 'orders',  label: 'Orders'  },
                        { k: 'visits',  label: 'Visits'  },
                      ].map(opt => {
                        const active = chartMetric === opt.k;
                        return (
                          <button key={opt.k} onClick={() => setChartMetric(opt.k)} style={{
                            padding: '5px 12px', fontFamily: aspireFont, fontSize: 12, fontWeight: 600,
                            color: active ? '#FFFFFF' : 'rgba(38,52,49,0.55)',
                            background: active ? '#1A1A1A' : 'transparent',
                            border: 'none', borderRadius: 6, cursor: 'pointer', letterSpacing: '0.02em',
                          }}>{opt.label}</button>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'inline-flex', background: '#FFFFFF', border: '1px solid rgba(38,52,49,0.12)', borderRadius: 8, padding: 2 }}>
                      {[{ k: 'line', label: 'Line', icon: '📈' }, { k: 'bar', label: 'Bar', icon: '📊' }].map(opt => {
                        const active = trendMode === opt.k;
                        return (
                          <button key={opt.k} onClick={() => setChartMode(prev => ({ ...prev, trend: opt.k }))} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontFamily: aspireFont, fontSize: 13, fontWeight: 500, color: active ? A.ink : 'rgba(38,52,49,0.55)', background: active ? 'rgba(38,52,49,0.06)' : 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                            <span style={{ fontSize: 12 }}>{opt.icon}</span>{opt.label}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: '#FFFFFF', border: '1px solid rgba(38,52,49,0.12)', borderRadius: 8, fontFamily: aspireFont, fontSize: 13, fontWeight: 500, color: A.ink }}>
                      <span style={{ fontSize: 13, opacity: 0.55 }}>📅</span>{chipTxt}
                    </div>
                    {/* Chart-local range dropdown removed — the single source of
                        truth is now the main Today/Week/Month/All/Custom pills
                        in the page header. The date chip above still shows the
                        current window for this chart. */}
                  </div>
                </div>

                {/* "Latest" annotation — value + day-over-day pct + 'latest' label */}
                {(() => {
                  const pts = combinedChartData.filter(d => (d[M.key] || 0) > 0);
                  if (!pts.length) return null;
                  const i = combinedChartData.length - 1;
                  const v = Number(combinedChartData[i]?.[M.key]) || 0;
                  const prev = i > 0 ? (Number(combinedChartData[i - 1]?.[M.key]) || 0) : 0;
                  let trendPct = null, isNew = false;
                  if (prev > 0) trendPct = Math.max(-99, Math.min(99, ((v - prev) / prev) * 100));
                  else if (v > 0) isNew = true;
                  const up = isNew ? true : (trendPct == null ? null : trendPct >= 0);
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                      <span style={{ fontFamily: aspireFont, fontWeight: 700, fontSize: 22, color: A.ink, letterSpacing: '-0.3px', lineHeight: 1 }}><CountUp end={v} duration={1.5} separator="," prefix={M.prefix} preserveValue key={`${committedBounds}-${chartMetric}`} /></span>
                      {up !== null && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          fontFamily: aspireFont, fontSize: 12, fontWeight: 700,
                          color: up ? '#3F9E5A' : '#D9534F',
                          background: up ? 'rgba(74,154,94,0.12)' : 'rgba(155,91,83,0.12)',
                          padding: '3px 9px', borderRadius: 999, lineHeight: 1,
                        }}>{isNew ? 'new' : `${up ? '↗' : '↘'} ${Math.abs(Math.round(trendPct))}%`}</span>
                      )}
                      <span style={{ fontFamily: aspireFont, fontSize: 12, color: 'rgba(38,52,49,0.5)', lineHeight: 1 }}>latest</span>
                    </div>
                  );
                })()}

                {/* Chart — Line (AreaChart) or Bar.
                    Animation stays smooth because `combinedChartData` is
                    derived from `chartBounds` (the committed-bounds —
                    matches the loaded analytics docs), not from live
                    `bounds`. So the chart keeps showing the OLD data + OLD
                    shape until load() completes; then everything updates in
                    one atomic re-render and recharts can smoothly morph.
                    No `key` prop — letting the same chart instance receive
                    the new data prop is what triggers recharts' built-in
                    tween. A `key` would force a remount and lose that tween. */}
                {combinedChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    {trendMode === 'line' ? (
                      <AreaChart data={combinedChartData} margin={{ top: 12, right: 22, left: 4, bottom: 8 }}>
                        <defs>
                          <linearGradient id="trendStroke" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor={gStart} /><stop offset="100%" stopColor={gEnd} /></linearGradient>
                          <linearGradient id="trendFill" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor={gEnd} stopOpacity={0.28} />
                            <stop offset="50%" stopColor={gStart} stopOpacity={0.12} />
                            <stop offset="100%" stopColor={gStart} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="rgba(38,52,49,0.06)" strokeDasharray="0" vertical={false} />
                        <XAxis dataKey="date" tick={{ fill: 'rgba(38,52,49,0.55)', fontSize: 12, fontFamily: aspireFont, fontWeight: 400 }} axisLine={false} tickLine={false} tickFormatter={fmtDayFirst} tickMargin={10} minTickGap={20} padding={{ left: 18, right: 18 }} />
                        <YAxis tick={{ fill: 'rgba(38,52,49,0.55)', fontSize: 12, fontFamily: aspireFont, fontWeight: 400 }} axisLine={false} tickLine={false} width={M.yWidth} allowDecimals={false} tickFormatter={M.yFmt} tickMargin={8} />
                        <Tooltip content={<TrendTip />} cursor={{ stroke: 'rgba(38,52,49,0.20)', strokeDasharray: '3 3' }} wrapperStyle={{ outline: 'none' }} />
                        <Area type="monotone" dataKey={M.key} stroke="url(#trendStroke)" strokeWidth={2.5} fill="url(#trendFill)" dot={false} activeDot={{ r: 5, fill: '#FFFFFF', stroke: gEnd, strokeWidth: 2.5 }} name={M.label} animationDuration={1500} />
                      </AreaChart>
                    ) : (
                      <BarChart data={combinedChartData} margin={{ top: 12, right: 22, left: 4, bottom: 8 }} onMouseMove={(s) => { if (s && typeof s.activeTooltipIndex === 'number') setRevBarHover(s.activeTooltipIndex); else setRevBarHover(null); }} onMouseLeave={() => setRevBarHover(null)}>
                        <defs>
                          <filter id="trendBarShadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#1A1A1A" floodOpacity="0.22" /></filter>
                        </defs>
                        <CartesianGrid stroke="rgba(38,52,49,0.06)" strokeDasharray="0" vertical={false} />
                        <XAxis dataKey="date" tick={{ fill: 'rgba(38,52,49,0.55)', fontSize: 12, fontFamily: aspireFont, fontWeight: 400 }} axisLine={false} tickLine={false} tickFormatter={fmtDayFirst} tickMargin={10} minTickGap={20} padding={{ left: 18, right: 18 }} />
                        <YAxis tick={{ fill: 'rgba(38,52,49,0.55)', fontSize: 12, fontFamily: aspireFont, fontWeight: 400 }} axisLine={false} tickLine={false} width={M.yWidth} allowDecimals={false} tickFormatter={M.yFmt} tickMargin={8} />
                        <Tooltip content={<TrendTip />} cursor={false} wrapperStyle={{ outline: 'none' }} />
                        <Bar dataKey={M.key} name={M.label} fill={gEnd} radius={[6, 6, 0, 0]} maxBarSize={32} animationDuration={1500} shape={(props) => {
                          const { x, y, width, height, index, fill } = props;
                          if (height < 1) return null;
                          const active = revBarHover === index;
                          const r = Math.min(6, height / 2);
                          const path = `M${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height} L${x},${y + height} Z`;
                          return (<g><path d={path} fill={fill} filter={active ? 'url(#trendBarShadow)' : undefined} style={{ transition: 'opacity 0.18s', opacity: revBarHover == null || active ? 1 : 0.55 }} /></g>);
                        }} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                ) : <div style={{ textAlign: 'center', padding: '50px 0', color: 'rgba(38,52,49,0.3)', fontSize: 13, fontFamily: aspireFont }}>No data in this period</div>}
              </BentoGlow>
            );
          })()}

          {/* ── Sticky tabs + range selector bar ── */}
          <div style={{ position: 'sticky', top: 0, zIndex: 10, background: A.cream, marginLeft: -28, marginRight: -28, padding: '0 28px', borderBottom: '2px solid rgba(38,52,49,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 0 }}>
                {[['overview', 'Overview'], ['menu', 'Menu Performance']].map(([id, label]) => (
                  <button key={id} onClick={() => setTab(id)} style={{
                    padding: '10px 24px', border: 'none', cursor: 'pointer', fontFamily: A.font,
                    fontSize: 13, fontWeight: tab === id ? 700 : 500,
                    color: tab === id ? A.ink : 'rgba(38,52,49,0.4)',
                    background: 'transparent',
                    borderBottom: tab === id ? `2.5px solid ${A.warning}` : '2.5px solid transparent',
                    marginBottom: -2, transition: 'all 0.15s',
                  }}>{label}</button>
                ))}
              </div>
              {/* Sticky tab-bar period pills. Mirrors the main header selector
                  (shared `period` + `customRange` state). Rendered with chip-style
                  borders to fit the compact sticky-bar aesthetic. Parent needs
                  position:relative so the DateRangePicker popover anchors here. */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', position: 'relative' }}>
                {[['today', 'Today'], ['week', 'Week'], ['month', 'Month'], ['all', 'All']].map(([key, label]) => {
                  const active = !customRange.active && period === key;
                  return (
                    <button key={key} onClick={() => { setCustomRange({ active: false, start: '', end: '' }); setPeriod(key); }} style={{
                      padding: '4px 12px', borderRadius: 16,
                      border: active ? `1.5px solid ${A.warning}` : '1.5px solid rgba(38,52,49,0.1)',
                      fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: A.font,
                      background: active ? 'rgba(196,168,109,0.12)' : 'transparent',
                      color: active ? A.warning : 'rgba(38,52,49,0.35)', transition: 'all 0.15s',
                    }}>{label}</button>
                  );
                })}
                <DateRangePicker
                  value={customRange}
                  onChange={setCustomRange}
                  maxDate={todayKey()}
                  theme={A}
                  compactLabel
                  pillStyle={{
                    padding: '4px 12px', borderRadius: 16,
                    border: customRange.active ? `1.5px solid ${A.warning}` : '1.5px solid rgba(38,52,49,0.1)',
                    fontSize: 11, fontWeight: 700,
                    background: 'transparent',
                    color: 'rgba(38,52,49,0.35)',
                  }}
                  pillActiveStyle={{
                    background: 'rgba(196,168,109,0.12)', color: A.warning,
                    border: `1.5px solid ${A.warning}`,
                  }}
                />
              </div>
            </div>
          </div>
          <div style={{ height: 14 }} />

          {/* Spinner */}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
              <div style={{ width: 28, height: 28, border: `3px solid ${A.warning}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>

          ) : tab === 'overview' ? (
            <div style={{ animation: 'fadeUp 0.2s ease' }}>
              {/* Journey + Dish Performance — grid default stretch so both cards equal height */}
              <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 14, marginBottom: 14 }}>
                {/* Journey — vertical funnel (Aspire light) — grid default stretches to Dish Performance height */}
                <BentoGlow style={{
                  background: '#FFFFFF',
                  borderRadius: 14, padding: '20px 22px',
                  border: A.border, boxShadow: A.cardShadow,
                  display: 'flex', flexDirection: 'column',
                }}>
                  <div style={{ fontFamily: A.font, fontWeight: 500, fontSize: 18, color: A.ink, letterSpacing: '-0.2px' }}>Customer Journey</div>
                  <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {funnelData.map((f, i) => {
                      const widthPct = [100, 75, 58][i];
                      return (
                        <div key={f.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{
                            width: `${widthPct}%`, padding: '14px 18px', borderRadius: 10,
                            background: i === 2 ? 'rgba(232,145,67,0.10)' : A.subtleBg,
                            border: `1px solid ${i === 2 ? 'rgba(232,145,67,0.30)' : 'rgba(0,0,0,0.05)'}`,
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          }}>
                            <span style={{ fontFamily: A.font, fontSize: 13, fontWeight: 500, color: A.mutedText }}>{f.label}</span>
                            <span style={{ fontFamily: A.font, fontWeight: 700, fontSize: 20, color: i === 2 ? A.warning : A.ink, letterSpacing: '-0.3px' }}>{f.value.toLocaleString()}</span>
                          </div>
                          {i < funnelData.length - 1 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0' }}>
                              <div style={{ width: 1, height: 12, background: 'rgba(0,0,0,0.12)' }} />
                              <span style={{ fontFamily: A.font, fontSize: 11, fontWeight: 600, color: A.warning, background: 'rgba(232,145,67,0.12)', padding: '3px 10px', borderRadius: 999 }}>{funnelData[i + 1].pct}%</span>
                              <div style={{ width: 1, height: 12, background: 'rgba(0,0,0,0.12)' }} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {/* Stats summary box — flex-grow to fill remaining card height */}
                  <div style={{
                    marginTop: 14, padding: '14px 14px',
                    background: 'rgba(232,145,67,0.08)', borderRadius: 10,
                    border: '1px solid rgba(232,145,67,0.20)',
                    flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: A.font, fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: A.mutedText, marginBottom: 4 }}>OVERALL CONVERSION</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6 }}>
                        <span style={{ fontFamily: A.font, fontWeight: 700, fontSize: 26, color: A.warning, letterSpacing: '-0.5px', lineHeight: 1 }}>{viewToOrderRate}%</span>
                        <span style={{ fontFamily: A.font, fontSize: 11, color: A.mutedText }}>visits to orders</span>
                      </div>
                    </div>
                    <div style={{ height: 1, background: 'rgba(232,145,67,0.20)', margin: '10px 6px' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-around', gap: 6 }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: A.font, fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.faintText, marginBottom: 2 }}>AR ITEM ORDERS</div>
                        <div style={{ fontFamily: A.font, fontWeight: 700, fontSize: 14, color: A.ink, letterSpacing: '-0.3px' }}>{arToOrderRate}%</div>
                      </div>
                      <div style={{ width: 1, background: 'rgba(232,145,67,0.20)' }} />
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: A.font, fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.faintText, marginBottom: 2 }}>AR ENGAGEMENT</div>
                        <div style={{ fontFamily: A.font, fontWeight: 700, fontSize: 14, color: A.ink, letterSpacing: '-0.3px' }}>{arRate}%</div>
                      </div>
                    </div>
                  </div>
                </BentoGlow>

                {/* Dish Performance — cinematic bento */}
                <BentoGlow style={{ ...card, padding: '20px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div style={secTitle}>Dish Performance</div>
                    {topDishes.length > 0 && <span style={{ fontSize: 10, color: 'rgba(38,52,49,0.35)', fontWeight: 500 }}>{bounds.labelShort} data</span>}
                  </div>
                  {topDishes.length > 0 ? (() => {
                    const rightCount = Math.min(topDishes.length - 1, 5);
                    const stockFoods = [
                      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=400&fit=crop&q=80',
                      'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400&h=400&fit=crop&q=80',
                      'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=400&fit=crop&q=80',
                      'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=400&h=400&fit=crop&q=80',
                      'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=400&h=400&fit=crop&q=80',
                      'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=400&h=400&fit=crop&q=80',
                    ];
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: rightCount > 0 ? '1fr 1fr' : '1fr', gridAutoRows: 'auto', gap: 12, alignItems: 'start' }}>
                        {/* Best seller — tall hero card */}
                        {bestSellerItem && (
                          <div style={{
                            gridRow: rightCount > 1 ? `1 / ${rightCount + 1}` : undefined, alignSelf: 'stretch', borderRadius: 16, overflow: 'hidden', position: 'relative',
                            minHeight: rightCount <= 1 ? 220 : 260, background: A.shellDarker,
                            boxShadow: '0 8px 24px rgba(38,52,49,0.12)',
                          }}>
                            <img src={bestSellerItem.imageURL || stockFoods[0]} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(28,40,37,0.9) 0%, rgba(28,40,37,0.3) 40%, rgba(0,0,0,0.05) 100%)' }} />
                            <div style={{ position: 'absolute', top: 12, left: 12 }}>
                              <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', color: A.shellDarker, background: A.warning, padding: '4px 10px', borderRadius: 6, textTransform: 'uppercase' }}>Best Seller</span>
                            </div>
                            <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16 }}>
                              <div style={{ fontFamily: A.fontDisplay, fontWeight: 700, fontSize: 18, color: '#fff', lineHeight: 1.25 }}>{bestSellerItem.name}</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                                <span style={{ fontSize: 11, color: A.warning, fontWeight: 700 }}>{bestSeller.qty}x ordered</span>
                                <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
                                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>₹{bestSeller.revenue.toFixed(0)}</span>
                              </div>
                            </div>
                          </div>
                        )}
                        {/* Other top dishes */}
                        {topDishes.slice(1, 6).map((dish, idx) => {
                          const menuItem = activeItems.find(m => m.name === dish.name);
                          const maxQty = topDishes[0]?.qty || 1;
                          const barPct = Math.max(8, Math.round((dish.qty / maxQty) * 100));
                          return (
                            <div key={dish.name} className="kpi-card" style={{
                              borderRadius: 12, padding: '12px 14px',
                              background: A.white, border: '1px solid rgba(38,52,49,0.06)',
                              display: 'flex', alignItems: 'center', gap: 10,
                              boxShadow: '0 1px 4px rgba(38,52,49,0.03)',
                            }}>
                              <div style={{ width: 42, height: 42, borderRadius: 10, overflow: 'hidden', flexShrink: 0, border: '1px solid rgba(38,52,49,0.06)' }}>
                                <img src={menuItem?.imageURL || stockFoods[(idx + 1) % stockFoods.length]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </div>
                              <div style={{ flex: 1, overflow: 'hidden' }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: A.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>{dish.name}</div>
                                <div style={{ height: 3, borderRadius: 2, background: 'rgba(38,52,49,0.05)', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', borderRadius: 2, background: `linear-gradient(90deg, ${A.warning}, #A08656)`, width: `${barPct}%`, transition: 'width 0.3s ease' }} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                                  <span style={{ fontSize: 10, color: 'rgba(38,52,49,0.4)', fontWeight: 600 }}>{dish.qty}x</span>
                                  <span style={{ fontSize: 10, color: '#1A1A1A', fontWeight: 700 }}>₹{dish.revenue.toFixed(0)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })() : <div style={{ textAlign: 'center', padding: '50px 0', color: 'rgba(38,52,49,0.3)', fontSize: 13 }}>No order data yet</div>}
                </BentoGlow>
              </div>

              {/* Waiter + Top Menu Items — grid default stretch so both columns equal height */}
              <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 14, marginBottom: 14 }}>
                {/* Left column: Waiter Summary + Busiest Day + Customer Mix */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
                  {/* Customer Mix — top card */}
                  {(() => {
                    const allPhones = new Set();
                    const phoneCounts = {};
                    ordersInRange.forEach(o => {
                      if (!o.customerPhone) return;
                      allPhones.add(o.customerPhone);
                      phoneCounts[o.customerPhone] = (phoneCounts[o.customerPhone] || 0) + 1;
                    });
                    const uniqueCount = allPhones.size;
                    if (uniqueCount === 0) return null;
                    const returning = Object.values(phoneCounts).filter(c => c > 1).length;
                    const returningPct = uniqueCount > 0 ? Math.round((returning / uniqueCount) * 100) : 0;
                    const newCount = uniqueCount - returning;
                    const newPct = 100 - returningPct;
                    return (
                      <BentoGlow style={{
                        background: '#FFFFFF', borderRadius: 14, padding: '18px 22px',
                        border: A.border, boxShadow: A.cardShadow,
                      }}>
                        <div style={{ fontFamily: A.font, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.faintText, marginBottom: 10 }}>Customer Mix</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: uniqueCount >= 3 ? 10 : 0 }}>
                          <span style={{ fontFamily: A.font, fontWeight: 700, fontSize: 22, color: A.ink, letterSpacing: '-0.3px' }}>{uniqueCount}</span>
                          <span style={{ fontFamily: A.font, fontSize: 12, color: A.mutedText }}>unique {uniqueCount === 1 ? 'customer' : 'customers'}</span>
                        </div>
                        {uniqueCount >= 3 && (
                          <>
                            <div style={{ display: 'flex', height: 6, borderRadius: 999, overflow: 'hidden', background: A.subtleBg, marginBottom: 8 }}>
                              <div style={{ width: `${returningPct}%`, background: A.warning }} />
                              <div style={{ width: `${newPct}%`, background: 'rgba(0,0,0,0.12)' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: A.font, fontSize: 11, fontWeight: 500 }}>
                              <span style={{ color: A.ink }}><span style={{ color: A.warning, fontWeight: 700 }}>{returning}</span> <span style={{ color: A.mutedText }}>returning ({returningPct}%)</span></span>
                              <span style={{ color: A.mutedText }}>{newCount} new</span>
                            </div>
                          </>
                        )}
                      </BentoGlow>
                    );
                  })()}

                  {/* Busiest Day mini card */}
                  {busiestDay && busiestDay.orders > 0 && (() => {
                    const totalDayOrders = dayData.reduce((s, d) => s + d.orders, 0);
                    const avgPerDay = totalDayOrders / 7;
                    const vsAvg = avgPerDay > 0 ? Math.max(-99, Math.min(99, Math.round(((busiestDay.orders - avgPerDay) / avgPerDay) * 100))) : 0;
                    const fullDayName = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' }[busiestDay.day];
                    return (
                      <BentoGlow style={{
                        background: '#FFFFFF', borderRadius: 14, padding: '18px 22px',
                        border: A.border, boxShadow: A.cardShadow,
                      }}>
                        <div style={{ fontFamily: A.font, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.faintText, marginBottom: 10 }}>Busiest Day</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                          <span style={{ fontFamily: A.font, fontWeight: 500, fontSize: 22, color: A.ink, letterSpacing: '-0.3px' }}>{fullDayName}</span>
                          <span style={{ fontFamily: A.font, fontWeight: 700, fontSize: 22, color: A.warning, letterSpacing: '-0.3px' }}>{busiestDay.orders}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontFamily: A.font, fontSize: 12, color: A.mutedText }}>orders</span>
                          {vsAvg !== 0 && (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                              fontFamily: A.font, fontSize: 11, fontWeight: 600,
                              color: vsAvg > 0 ? '#3F9E5A' : '#D9534F',
                              background: vsAvg > 0 ? 'rgba(63,158,90,0.10)' : 'rgba(217,83,79,0.10)',
                              padding: '3px 8px', borderRadius: 999, lineHeight: 1,
                            }}>{vsAvg > 0 ? '↗' : '↘'} {Math.abs(vsAvg)}% vs avg</span>
                          )}
                        </div>
                      </BentoGlow>
                    );
                  })()}

                  {/* Waiter Summary — bottom card, wrapperStyle.flex:1 fills remaining column height */}
                  <BentoGlow
                    wrapperStyle={{ flex: 1, display: 'flex' }}
                    style={{
                      background: '#FFFFFF',
                      borderRadius: 14, padding: '20px 22px',
                      border: A.border, boxShadow: A.cardShadow,
                      display: 'flex', flexDirection: 'column',
                      width: '100%',
                    }}
                  >
                  <div style={{ fontFamily: A.font, fontWeight: 500, fontSize: 18, color: A.ink, letterSpacing: '-0.2px', marginBottom: 16 }}>Waiter Summary</div>
                  {waiterStat ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {[
                        { label: 'Total Calls', value: waiterStat.total, color: A.ink, sub: `${bounds.labelShort} period` },
                        { label: 'Resolved', value: waiterStat.resolved, color: '#3F9E5A', sub: waiterStat.total > 0 ? `${Math.round((waiterStat.resolved / waiterStat.total) * 100)}% rate` : '—' },
                        { label: 'Avg Response', value: formatTime(waiterStat.avgResponseSeconds), color: A.warning, sub: 'call to resolve' },
                      ].map(s => (
                        <div key={s.label} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '14px 16px', background: A.subtleBg,
                          borderRadius: 10, border: '1px solid rgba(0,0,0,0.04)',
                        }}>
                          <div>
                            <div style={{ fontFamily: A.font, fontSize: 11, fontWeight: 600, color: A.mutedText, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{s.label}</div>
                            <div style={{ fontFamily: A.font, fontSize: 11, color: A.faintText, marginTop: 3 }}>{s.sub}</div>
                          </div>
                          <div style={{ fontFamily: A.font, fontWeight: 700, fontSize: 20, color: s.color, letterSpacing: '-0.3px', whiteSpace: 'nowrap' }}>{s.value}</div>
                        </div>
                      ))}
                    </div>
                  ) : <div style={{ textAlign: 'center', padding: '30px 0', color: A.faintText, fontSize: 14, fontFamily: A.font }}>No data</div>}
                  </BentoGlow>
                </div>
                {topItems.length > 0 && (() => {
                  // Option C — Spotify/App Store leaderboard: podium for top 3, dense list for 4-10
                  const maxV = topItems[0]?.views || 1;
                  const podium = topItems.slice(0, 3);
                  const rest = topItems.slice(3, 10);
                  // Podium tier styles — gold for #1, neutral grey for #2 (silver), bronze for #3
                  const tierStyle = (rank) => {
                    if (rank === 0) return { bg: 'rgba(196,168,109,0.10)', border: 'rgba(196,168,109,0.30)', badgeBg: '#C4A86D', badgeText: '#FFFFFF', valueColor: A.warning, label: 'BEST SELLER' };
                    if (rank === 1) return { bg: 'rgba(0,0,0,0.03)',         border: 'rgba(0,0,0,0.10)',         badgeBg: '#7A7A7A', badgeText: '#FFFFFF', valueColor: A.ink,    label: null };
                    return                  { bg: 'rgba(160,134,86,0.08)',  border: 'rgba(160,134,86,0.25)',   badgeBg: '#A08656', badgeText: '#FFFFFF', valueColor: '#A08656', label: null };
                  };
                  // Shared label style — used for both visible (#1) and invisible placeholder (#2/#3) so values align on the same baseline
                  const labelStyle = { fontFamily: A.font, fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', color: A.warning, marginBottom: 6, lineHeight: 1.2 };
                  return (
                  <BentoGlow style={{ ...card, padding: '20px 24px', display: 'flex', flexDirection: 'column' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <div style={secTitle}>Top Menu Items</div>
                      <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'rgba(38,52,49,0.4)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: A.warning }} />Views</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#A08656' }} />AR</span>
                      </div>
                    </div>
                    {/* Podium — top 3 mini cards side by side */}
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${podium.length}, 1fr)`, gap: 10, marginBottom: rest.length > 0 ? 18 : 0 }}>
                      {podium.map((item, i) => {
                        const t = tierStyle(i);
                        const vPct = Math.max(8, Math.round(((item.views || 0) / maxV) * 100));
                        const arViews = item.arViews || 0;
                        return (
                          <div key={item.name || i} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
                            padding: '16px 14px 14px', borderRadius: 12,
                            background: t.bg, border: `1px solid ${t.border}`,
                            position: 'relative', overflow: 'hidden',
                          }}>
                            {/* Rank badge */}
                            <div style={{
                              width: 32, height: 32, borderRadius: '50%',
                              background: t.badgeBg, color: t.badgeText,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontFamily: A.font, fontWeight: 700, fontSize: 14, lineHeight: 1,
                              boxShadow: i === 0 ? '0 2px 8px rgba(196,168,109,0.35)' : '0 1px 4px rgba(0,0,0,0.08)',
                              marginBottom: 10,
                            }}>{i + 1}</div>
                            {/* BEST SELLER label OR invisible placeholder — Fix 1: ensures values align on same baseline across all 3 cards */}
                            {t.label ? (
                              <div style={labelStyle}>{t.label}</div>
                            ) : (
                              <div style={{ ...labelStyle, visibility: 'hidden' }} aria-hidden="true">PLACEHOLDER</div>
                            )}
                            {/* Item name — wrap up to 2 lines, truncate beyond */}
                            <div style={{
                              fontFamily: A.font, fontSize: 13, fontWeight: 600, color: A.ink, lineHeight: 1.25,
                              minHeight: 32, marginBottom: 12,
                              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                              wordBreak: 'break-word',
                            }}>{item.name}</div>
                            {/* Big value */}
                            <div style={{ fontFamily: A.font, fontWeight: 700, fontSize: 28, color: t.valueColor, letterSpacing: '-0.5px', lineHeight: 1 }}>
                              <CountUp key={committedBounds} end={item.views || 0} duration={1.5} separator="," />
                            </div>
                            <div style={{ fontFamily: A.font, fontSize: 10, fontWeight: 500, color: A.faintText, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 3 }}>views</div>
                            {/* AR badge if relevant */}
                            {arViews > 0 && (
                              <div style={{ marginTop: 8, fontFamily: A.font, fontSize: 11, fontWeight: 600, color: '#A08656', background: 'rgba(160,134,86,0.10)', padding: '3px 9px', borderRadius: 999, border: '1px solid rgba(160,134,86,0.20)' }}>
                                {arViews} AR
                              </div>
                            )}
                            {/* Bar at the bottom — pushed down via marginTop:auto so all cards have bar at same Y position */}
                            <div style={{ width: '100%', marginTop: 'auto', paddingTop: 12, height: 6 + 12, borderRadius: 3, background: 'transparent', overflow: 'visible' }}>
                              <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                                <div style={{
                                  height: '100%', borderRadius: 3,
                                  background: i === 0 ? `linear-gradient(90deg, ${A.warning}, #A08656)` : t.badgeBg,
                                  width: `${vPct}%`, transition: 'width 0.4s ease',
                                }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Divider with HONORABLE MENTIONS label — only if rest tier exists */}
                    {rest.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.08)' }} />
                        <span style={{ fontFamily: A.font, fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: A.faintText, textTransform: 'uppercase' }}>Honorable Mentions</span>
                        <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.08)' }} />
                      </div>
                    )}
                    {/* Rest tier — compact rows for ranks 4-10 */}
                    {rest.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {rest.map((item, idx) => {
                          const i = idx + 3;
                          const vPct = Math.max(6, Math.round(((item.views || 0) / maxV) * 100));
                          const arViews = item.arViews || 0;
                          return (
                            <div key={item.name || i} style={{
                              display: 'grid', gridTemplateColumns: '24px 1fr 110px 60px',
                              alignItems: 'center', gap: 12,
                              padding: '8px 4px', borderRadius: 6,
                            }}>
                              <span style={{ fontFamily: A.font, fontSize: 11, fontWeight: 600, color: A.faintText, textAlign: 'right' }}>{i + 1}</span>
                              <span style={{ fontSize: 13, fontWeight: 500, color: A.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                              <div style={{ height: 5, borderRadius: 3, background: 'rgba(0,0,0,0.05)', overflow: 'hidden', display: 'flex', gap: 1 }}>
                                <div style={{ height: '100%', borderRadius: 3, background: A.warning, width: `${vPct}%`, transition: 'width 0.3s' }} />
                                {arViews > 0 && <div style={{ height: '100%', borderRadius: 3, background: '#A08656', width: `${Math.max(3, Math.round((arViews / maxV) * 100))}%` }} />}
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, fontSize: 12, fontWeight: 700 }}>
                                <span style={{ color: A.ink }}>{item.views || 0}</span>
                                {arViews > 0 && <span style={{ color: '#A08656' }}>{arViews}</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </BentoGlow>
                  );
                })()}
              </div>
              {/* ── Smart Insights (Aspire light) ── */}
              {insights.length > 0 && (
                <BentoGlow style={{
                  background: '#FFFFFF',
                  borderRadius: 14, padding: '18px 22px', marginBottom: 14,
                  border: A.border, boxShadow: A.cardShadow,
                  minHeight: 146,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <div style={{ fontFamily: A.font, fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: A.warning }}>SMART INSIGHTS</div>
                    <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.06)' }} />
                    <span style={{ fontFamily: A.font, fontSize: 11, color: A.faintText, fontWeight: 500 }}>Auto-analysed</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(4, 1fr)`, gap: 12 }}>
                    {insights.map((ins, i) => {
                      const icons = { success: '▲', warning: '◆', danger: '!', info: '→' };
                      const colors = { success: '#3F9E5A', warning: A.warning, danger: '#D9534F', info: '#1A1A1A' };
                      return (
                        <div key={i} style={{
                          padding: '14px 16px', borderRadius: 10,
                          background: A.subtleBg,
                          border: '1px solid rgba(0,0,0,0.04)',
                          borderLeft: `3px solid ${colors[ins.type]}`,
                          minHeight: 78,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                            <span style={{ fontSize: 9, fontWeight: 800, color: colors[ins.type], width: 16, height: 16, borderRadius: '50%', background: `${colors[ins.type]}22`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>{icons[ins.type]}</span>
                            <span style={{ fontFamily: A.font, fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: colors[ins.type] }}>
                              {ins.type === 'success' ? 'WIN' : ins.type === 'warning' ? 'OPPORTUNITY' : ins.type === 'danger' ? 'ACTION NEEDED' : 'INSIGHT'}
                            </span>
                          </div>
                          <div style={{ fontFamily: A.font, fontSize: 13, color: A.ink, fontWeight: 500, lineHeight: 1.5 }}>{ins.text}</div>
                        </div>
                      );
                    })}
                  </div>
                </BentoGlow>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {/* Peak Hours — Aspire-lite */}
                {(() => {
                  const aspireFont = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
                  const maxO = Math.max(...peakHourData.map(x => x.orders), 0);
                  return (
                    <BentoGlow style={{ ...card, padding: '22px 22px 18px', fontFamily: aspireFont }}
                         onMouseLeave={() => setPeakBarHover(null)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <div style={{ fontFamily: aspireFont, fontWeight: 500, fontSize: 18, color: A.ink, letterSpacing: '-0.2px' }}>Peak Hours</div>
                        {peakHour && (
                          <span style={{ fontFamily: aspireFont, fontSize: 12, fontWeight: 600, color: '#A08656', background: 'rgba(196,168,109,0.12)', padding: '5px 11px', borderRadius: 999 }}>Busiest: {peakHour.label}</span>
                        )}
                      </div>
                      {peakHourData.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(38,52,49,0.3)', fontSize: 13, fontFamily: aspireFont }}>No data</div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 130 }}>
                          {peakHourData.map((h, i) => {
                            const pct = maxO > 0 ? (h.orders / maxO) * 100 : 0;
                            const isPeak = h === peakHour;
                            const isHover = peakBarHover === i;
                            const dim = peakBarHover != null && !isHover;
                            return (
                              <div
                                key={h.hour}
                                onMouseEnter={() => setPeakBarHover(i)}
                                style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'default' }}
                              >
                                {/* Rail: fills the column minus the label at bottom. Bar is positioned at the rail's bottom. */}
                                <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
                                  <span style={{ fontFamily: aspireFont, fontSize: 10, fontWeight: 700, color: isPeak ? '#1A1A1A' : 'rgba(38,52,49,0.4)', transition: 'opacity 0.15s', opacity: dim ? 0.3 : 1, lineHeight: 1 }}>{h.orders}</span>
                                  <div style={{
                                    width: '100%', minHeight: 4, height: `${pct}%`, borderRadius: 3,
                                    background: isPeak ? '#A08656' : A.warning,
                                    opacity: dim ? 0.25 : (isPeak ? 1 : 0.55),
                                    boxShadow: isHover ? '0 4px 10px rgba(38,52,49,0.22)' : 'none',
                                    transition: 'opacity 0.15s, box-shadow 0.15s, transform 0.15s',
                                    transform: isHover ? 'translateY(-2px)' : 'none',
                                    flexShrink: 0,
                                  }} />
                                </div>
                                <span style={{ fontFamily: aspireFont, fontSize: 9, color: 'rgba(38,52,49,0.45)', transition: 'opacity 0.15s', opacity: dim ? 0.4 : 1, marginTop: 6 }}>{h.label}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </BentoGlow>
                  );
                })()}

                {/* Busiest Days — Aspire-lite */}
                {(() => {
                  const aspireFont = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
                  const maxD = Math.max(...dayData.map(x => x.orders), 0);
                  return (
                    <BentoGlow style={{ ...card, padding: '22px 22px 18px', fontFamily: aspireFont }}
                         onMouseLeave={() => setDayBarHover(null)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <div style={{ fontFamily: aspireFont, fontWeight: 500, fontSize: 18, color: A.ink, letterSpacing: '-0.2px' }}>Busiest Days</div>
                        {busiestDay && busiestDay.orders > 0 && (
                          <span style={{ fontFamily: aspireFont, fontSize: 12, fontWeight: 600, color: '#A08656', background: 'rgba(196,168,109,0.12)', padding: '5px 11px', borderRadius: 999 }}>Top: {busiestDay.day}</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 130 }}>
                        {dayData.map((d, i) => {
                          const pct = maxD > 0 ? (d.orders / maxD) * 100 : 0;
                          const isB = d === busiestDay;
                          const isHover = dayBarHover === i;
                          const dim = dayBarHover != null && !isHover;
                          return (
                            <div
                              key={d.day}
                              onMouseEnter={() => setDayBarHover(i)}
                              style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'default' }}
                            >
                              {/* Rail: fills the column minus the day label. Bar anchored to the rail's bottom. */}
                              <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
                                <span style={{ fontFamily: aspireFont, fontSize: 11, fontWeight: 700, color: isB ? '#1A1A1A' : 'rgba(38,52,49,0.4)', transition: 'opacity 0.15s', opacity: dim ? 0.3 : 1, lineHeight: 1 }}>{d.orders}</span>
                                <div style={{
                                  width: '100%', minHeight: 4, height: `${pct}%`, borderRadius: 4,
                                  background: '#C4A86D',
                                  opacity: dim ? 0.2 : (isB ? 1 : 0.45),
                                  boxShadow: isHover ? '0 4px 10px rgba(38,52,49,0.22)' : 'none',
                                  transition: 'opacity 0.15s, box-shadow 0.15s, transform 0.15s',
                                  transform: isHover ? 'translateY(-2px)' : 'none',
                                  flexShrink: 0,
                                }} />
                              </div>
                              <span style={{ fontFamily: aspireFont, fontSize: 11, color: 'rgba(38,52,49,0.5)', fontWeight: isB ? 600 : 500, transition: 'opacity 0.15s', opacity: dim ? 0.4 : 1, marginTop: 6 }}>{d.day}</span>
                            </div>
                          );
                        })}
                      </div>
                    </BentoGlow>
                  );
                })()}
              </div>

            </div>

          ) : (
            /* ═══ MENU PERFORMANCE ═══ */
            <div style={{ animation: 'fadeUp 0.2s ease' }}>

              {/* ── Card A: Item Performance — sort pill + Top 12/All toggle + search ── */}
              <BentoGlow style={{ ...card, padding: '22px 24px', marginBottom: 14 }}>
                {/* Header row: title + controls */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={secTitle}>Item Performance</div>
                    <div style={{ fontFamily: A.font, fontSize: 11, color: 'rgba(38,52,49,0.4)', marginTop: 3 }}>
                      {(() => {
                        const q = menuSearch.trim();
                        const total = itemIntelligence.length;
                        if (q) return `${visibleMenuItems.length} result${visibleMenuItems.length === 1 ? '' : 's'} for "${q}"`;
                        if (menuView === 'all') return `Showing all ${total} items, this range`;
                        return `Top ${Math.min(12, total)} of ${total} items, this range`;
                      })()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {/* Sort pill — Revenue / Orders / Views */}
                    <div style={{ display: 'inline-flex', background: '#FFFFFF', border: '1px solid rgba(38,52,49,0.12)', borderRadius: 8, padding: 2 }}>
                      {[
                        { k: 'revenue', label: 'Revenue' },
                        { k: 'orders', label: 'Orders' },
                        { k: 'views', label: 'Views' },
                      ].map(opt => {
                        const active = menuSort === opt.k;
                        return (
                          <button key={opt.k} onClick={() => setMenuSort(opt.k)} style={{
                            padding: '5px 12px', fontFamily: A.font, fontSize: 12, fontWeight: 600,
                            color: active ? '#FFFFFF' : 'rgba(38,52,49,0.55)',
                            background: active ? '#1A1A1A' : 'transparent',
                            border: 'none', borderRadius: 6, cursor: 'pointer',
                            letterSpacing: '0.02em',
                          }}>{opt.label}</button>
                        );
                      })}
                    </div>
                    {/* View pill — Top 12 / All */}
                    <div style={{ display: 'inline-flex', background: '#FFFFFF', border: '1px solid rgba(38,52,49,0.12)', borderRadius: 8, padding: 2 }}>
                      {[
                        { k: 'top12', label: 'Top 12' },
                        { k: 'all', label: 'All' },
                      ].map(opt => {
                        const active = menuView === opt.k;
                        return (
                          <button key={opt.k} onClick={() => setMenuView(opt.k)} style={{
                            padding: '5px 12px', fontFamily: A.font, fontSize: 12, fontWeight: 600,
                            color: active ? '#FFFFFF' : 'rgba(38,52,49,0.55)',
                            background: active ? '#1A1A1A' : 'transparent',
                            border: 'none', borderRadius: 6, cursor: 'pointer',
                            letterSpacing: '0.02em',
                          }}>{opt.label}</button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Search bar — always visible, case-insensitive across name + category. Typing bypasses Top 12 cap. */}
                <div style={{ position: 'relative', marginBottom: 14 }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'rgba(38,52,49,0.35)', pointerEvents: 'none' }}>🔍</span>
                  <input
                    type="text"
                    value={menuSearch}
                    onChange={(e) => setMenuSearch(e.target.value)}
                    placeholder="Search dishes or categories…"
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      padding: '8px 34px 8px 34px',
                      fontFamily: A.font, fontSize: 13, color: A.ink,
                      background: '#FFFFFF',
                      border: '1px solid rgba(38,52,49,0.12)',
                      borderRadius: 8,
                      outline: 'none',
                    }}
                  />
                  {menuSearch && (
                    <button
                      type="button"
                      onClick={() => setMenuSearch('')}
                      style={{
                        position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                        width: 20, height: 20, borderRadius: '50%',
                        background: 'rgba(38,52,49,0.08)',
                        border: 'none', cursor: 'pointer',
                        fontSize: 11, color: 'rgba(38,52,49,0.6)', fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                      }}
                      aria-label="Clear search"
                    >×</button>
                  )}
                </div>

                {visibleMenuItems.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: 'rgba(38,52,49,0.3)', fontSize: 13 }}>
                    {menuSearch.trim() ? `No items match "${menuSearch.trim()}"` : 'No data'}
                  </div>
                ) : (<>
                  <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 80px 70px 80px 120px', gap: 12, padding: '10px 6px 8px', borderBottom: '1px solid rgba(38,52,49,0.06)' }}>
                    <div />
                    <div style={{ ...labelSm, fontSize: 9 }}>Dish</div>
                    <div style={{ ...labelSm, fontSize: 9, textAlign: 'right' }}>Revenue</div>
                    <div style={{ ...labelSm, fontSize: 9, textAlign: 'right' }}>Orders</div>
                    <div style={{ ...labelSm, fontSize: 9, textAlign: 'right' }}>Views</div>
                    <div style={{ ...labelSm, fontSize: 9, textAlign: 'right' }}>Signal</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {visibleMenuItems.map((item, i) => {
                      const flagStyle = {
                        'top':       { bg: 'rgba(63,158,90,0.10)',   color: '#3F9E5A', label: '★ Top performer' },
                        'high-conv': { bg: 'rgba(196,168,109,0.14)', color: '#A08656', label: '↑ High conversion' },
                        'low-conv':  { bg: 'rgba(217,83,79,0.08)',   color: '#D9534F', label: '↓ Low conversion' },
                      }[item.signalType];
                      return (
                        <div key={item.id} className="row-hover" style={{
                          display: 'grid', gridTemplateColumns: '44px 1fr 80px 70px 80px 120px', gap: 12,
                          alignItems: 'center', padding: '10px 6px', borderRadius: 8,
                          transition: 'background 0.12s',
                        }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, overflow: 'hidden', background: A.cream }}>
                            {item.imageURL
                              ? <img src={item.imageURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'rgba(38,52,49,0.25)' }}>—</div>}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontFamily: A.font, fontSize: 13, fontWeight: 500, color: A.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                            <div style={{ fontFamily: A.font, fontSize: 10.5, color: 'rgba(38,52,49,0.4)', marginTop: 2 }}>{item.category || ''}</div>
                          </div>
                          <div style={{ fontFamily: A.font, fontSize: 13, fontWeight: 700, color: item.revenue > 0 ? '#C4A86D' : 'rgba(38,52,49,0.3)', letterSpacing: '-0.2px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{item.revenue > 0 ? formatRupee(Math.round(item.revenue)) : '—'}</div>
                          <div style={{ fontFamily: A.font, fontSize: 13, fontWeight: 600, color: item.ordered > 0 ? A.ink : 'rgba(38,52,49,0.3)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{item.ordered}</div>
                          <div style={{ fontFamily: A.font, fontSize: 13, fontWeight: 500, color: 'rgba(38,52,49,0.55)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{item.views}</div>
                          <div style={{ textAlign: 'right' }}>
                            {flagStyle ? (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center',
                                padding: '3px 9px', borderRadius: 999,
                                fontFamily: A.font, fontSize: 10.5, fontWeight: 600,
                                background: flagStyle.bg, color: flagStyle.color,
                                whiteSpace: 'nowrap',
                              }}>{flagStyle.label}</span>
                            ) : (
                              <span style={{ fontSize: 11, color: 'rgba(38,52,49,0.25)' }}>—</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>)}
              </BentoGlow>

              {/* ── Card B: AR Impact — 3 stat tiles + 2 insight cards ── */}
              {(() => {
                // Coverage: how many items have a 3D AR model ready.
                const itemsWithModel = activeItems.filter(i => i.modelURL).length;
                const totalMenuItems = activeItems.length;

                // "Working best" — item with the highest AR → order conversion, min 5 AR views for signal.
                // orderedCount comes from itemFreq (range-scoped orders).
                const arItems = activeItems.filter(i => (i.arViews || 0) >= 5);
                const arItemsWithConv = arItems.map(i => {
                  const ordered = itemFreq[i.name]?.qty || 0;
                  const convRate = i.arViews > 0 ? (ordered / i.arViews) : 0;
                  return { ...i, ordered, convRate };
                });
                const workingBest = arItemsWithConv.length > 0
                  ? [...arItemsWithConv].sort((a, b) => b.convRate - a.convRate || b.ordered - a.ordered)[0]
                  : null;

                // "Opportunity" — item with the most views that has no AR model yet.
                const noModelSorted = activeItems
                  .filter(i => !i.modelURL && (i.views || 0) > 0)
                  .sort((a, b) => (b.views || 0) - (a.views || 0));
                const opportunity = noModelSorted[0] || null;

                return (
                  <BentoGlow style={{ ...card, padding: '22px 24px', marginBottom: 14 }}>
                    <div style={{ marginBottom: 18 }}>
                      <div style={secTitle}>AR Impact</div>
                      <div style={{ fontFamily: A.font, fontSize: 11, color: 'rgba(38,52,49,0.4)', marginTop: 3 }}>Is the AR feature helping customers decide?</div>
                    </div>

                    {/* Top row: 3 stat tiles */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
                      <div style={{ padding: '14px 16px', background: 'rgba(0,0,0,0.025)', border: '1px solid rgba(0,0,0,0.05)', borderRadius: 10 }}>
                        <div style={{ fontFamily: A.font, fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(38,52,49,0.40)', marginBottom: 6 }}>AR tap-through</div>
                        <div style={{ fontFamily: A.font, fontWeight: 700, fontSize: 24, color: A.ink, letterSpacing: '-0.4px', lineHeight: 1 }}>
                          <CountUp end={Math.round(parseFloat(arRate))} duration={1.4} preserveValue key={committedBounds} /><span style={{ color: 'rgba(0,0,0,0.35)', fontSize: 14, fontWeight: 500, marginLeft: 1 }}>%</span>
                        </div>
                        <div style={{ fontFamily: A.font, fontSize: 11, color: 'rgba(38,52,49,0.5)', marginTop: 4 }}>of all item views</div>
                      </div>
                      <div style={{ padding: '14px 16px', background: 'rgba(0,0,0,0.025)', border: '1px solid rgba(0,0,0,0.05)', borderRadius: 10 }}>
                        <div style={{ fontFamily: A.font, fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(38,52,49,0.40)', marginBottom: 6 }}>AR → order</div>
                        <div style={{ fontFamily: A.font, fontWeight: 700, fontSize: 24, color: '#C4A86D', letterSpacing: '-0.4px', lineHeight: 1 }}>
                          <CountUp end={Math.round(parseFloat(arToOrderRate))} duration={1.4} preserveValue key={committedBounds} /><span style={{ color: 'rgba(0,0,0,0.35)', fontSize: 14, fontWeight: 500, marginLeft: 1 }}>%</span>
                        </div>
                        <div style={{ fontFamily: A.font, fontSize: 11, color: 'rgba(38,52,49,0.5)', marginTop: 4 }}>of orders saw AR first</div>
                      </div>
                      <div style={{ padding: '14px 16px', background: 'rgba(0,0,0,0.025)', border: '1px solid rgba(0,0,0,0.05)', borderRadius: 10 }}>
                        <div style={{ fontFamily: A.font, fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(38,52,49,0.40)', marginBottom: 6 }}>AR coverage</div>
                        <div style={{ fontFamily: A.font, fontWeight: 700, fontSize: 24, color: A.ink, letterSpacing: '-0.4px', lineHeight: 1 }}>
                          <CountUp end={itemsWithModel} duration={1.4} preserveValue /><span style={{ color: 'rgba(0,0,0,0.35)', fontSize: 14, fontWeight: 500, marginLeft: 3 }}>/ {totalMenuItems}</span>
                        </div>
                        <div style={{ fontFamily: A.font, fontSize: 11, color: 'rgba(38,52,49,0.5)', marginTop: 4 }}>items have a 3D model</div>
                      </div>
                    </div>

                    {/* Bottom row: 2 insight cards — positive + actionable */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {/* Working best */}
                      {workingBest ? (
                        <div style={{ padding: '14px 16px', background: 'rgba(63,158,90,0.05)', border: '1px solid rgba(63,158,90,0.18)', borderRadius: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div style={{ fontFamily: A.font, fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#3F9E5A' }}>Working best</div>
                            <div style={{ fontFamily: A.font, fontSize: 10, color: 'rgba(63,158,90,0.7)', letterSpacing: '0.04em' }}>AR → ORDER</div>
                          </div>
                          <div style={{ fontFamily: A.font, fontSize: 14, fontWeight: 600, color: A.ink, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{workingBest.name}</div>
                          <div style={{ fontFamily: A.font, fontSize: 11, color: 'rgba(38,52,49,0.55)', lineHeight: 1.45 }}>
                            <span style={{ fontWeight: 600, color: '#3F9E5A' }}>{Math.round(workingBest.convRate * 100)}%</span> of AR viewers ordered it<br />
                            <span style={{ color: 'rgba(38,52,49,0.4)' }}>{workingBest.arViews} AR views · {workingBest.ordered} order{workingBest.ordered !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                      ) : (
                        <div style={{ padding: '14px 16px', background: 'rgba(0,0,0,0.025)', border: '1px solid rgba(0,0,0,0.05)', borderRadius: 10 }}>
                          <div style={{ fontFamily: A.font, fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(38,52,49,0.4)', marginBottom: 8 }}>Working best</div>
                          <div style={{ fontFamily: A.font, fontSize: 13, color: 'rgba(38,52,49,0.5)', lineHeight: 1.5 }}>Not enough AR activity yet — items need at least 5 AR views to qualify.</div>
                        </div>
                      )}

                      {/* Opportunity */}
                      {opportunity ? (
                        <div style={{ padding: '14px 16px', background: 'rgba(196,168,109,0.06)', border: '1px solid rgba(196,168,109,0.22)', borderRadius: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div style={{ fontFamily: A.font, fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#A08656' }}>Opportunity</div>
                            <div style={{ fontFamily: A.font, fontSize: 10, color: 'rgba(160,134,86,0.7)', letterSpacing: '0.04em' }}>HIGH VIEWS · NO AR</div>
                          </div>
                          <div style={{ fontFamily: A.font, fontSize: 14, fontWeight: 600, color: A.ink, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opportunity.name}</div>
                          <div style={{ fontFamily: A.font, fontSize: 11, color: 'rgba(38,52,49,0.55)', lineHeight: 1.45 }}>
                            <span style={{ fontWeight: 600, color: '#A08656' }}>{opportunity.views} views</span>, no 3D model yet<br />
                            <span style={{ color: 'rgba(38,52,49,0.4)' }}>Could boost orders if added</span>
                          </div>
                        </div>
                      ) : (
                        <div style={{ padding: '14px 16px', background: 'rgba(0,0,0,0.025)', border: '1px solid rgba(0,0,0,0.05)', borderRadius: 10 }}>
                          <div style={{ fontFamily: A.font, fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(38,52,49,0.4)', marginBottom: 8 }}>Opportunity</div>
                          <div style={{ fontFamily: A.font, fontSize: 13, color: 'rgba(38,52,49,0.5)', lineHeight: 1.5 }}>Every viewed item already has a 3D model — well done.</div>
                        </div>
                      )}
                    </div>
                  </BentoGlow>
                );
              })()}

              {/* ── Card C: Category Performance — revenue-ranked horizontal bars + per-category rating ── */}
              {(() => {
                // Per-category rollup: revenue + orders + avg rating (weighted by ratingCount).
                const catRollup = {};
                activeItems.forEach(item => {
                  const raw = item.category || 'Uncategorised';
                  const cat = raw.charAt(0).toUpperCase() + raw.slice(1);
                  if (!catRollup[cat]) catRollup[cat] = { name: cat, items: 0, orders: 0, revenue: 0, ratingSum: 0, ratingCount: 0 };
                  catRollup[cat].items += 1;
                  const freq = itemFreq[item.name];
                  if (freq) {
                    catRollup[cat].orders += freq.qty;
                    catRollup[cat].revenue += freq.revenue;
                  }
                  if ((item.ratingCount || 0) > 0) {
                    catRollup[cat].ratingSum += (item.ratingAvg || 0) * item.ratingCount;
                    catRollup[cat].ratingCount += item.ratingCount;
                  }
                });
                const catRows = Object.values(catRollup)
                  .map(c => ({ ...c, rating: c.ratingCount > 0 ? c.ratingSum / c.ratingCount : 0 }))
                  .sort((a, b) => b.revenue - a.revenue);
                const maxRev = catRows[0]?.revenue || 1;
                const anyRev = catRows.some(c => c.revenue > 0);

                return (
                  <BentoGlow style={{ ...card, padding: '22px 24px' }}>
                    <div style={{ marginBottom: 18 }}>
                      <div style={secTitle}>Category Performance</div>
                      <div style={{ fontFamily: A.font, fontSize: 11, color: 'rgba(38,52,49,0.4)', marginTop: 3 }}>Which menu categories are pulling their weight</div>
                    </div>

                    {catRows.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '30px 0', color: 'rgba(38,52,49,0.3)', fontSize: 13 }}>No categories</div>
                    ) : !anyRev ? (
                      <div style={{ textAlign: 'center', padding: '30px 0', color: 'rgba(38,52,49,0.3)', fontSize: 13 }}>No orders in this range yet</div>
                    ) : (<>
                      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 60px 60px 70px', gap: 12, padding: '0 4px 8px', borderBottom: '1px solid rgba(38,52,49,0.06)', marginBottom: 4 }}>
                        <div style={{ ...labelSm, fontSize: 9 }}>Category</div>
                        <div style={{ ...labelSm, fontSize: 9 }}>Revenue share</div>
                        <div style={{ ...labelSm, fontSize: 9, textAlign: 'right' }}>Items</div>
                        <div style={{ ...labelSm, fontSize: 9, textAlign: 'right' }}>Orders</div>
                        <div style={{ ...labelSm, fontSize: 9, textAlign: 'right' }}>Rating</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {catRows.map((c, i) => {
                          const pct = maxRev > 0 ? (c.revenue / maxRev) * 100 : 0;
                          const active = c.revenue > 0 && pct >= 20;
                          return (
                            <div key={c.name} className="row-hover" style={{
                              display: 'grid', gridTemplateColumns: '140px 1fr 60px 60px 70px', gap: 12, alignItems: 'center',
                              padding: '10px 4px', borderRadius: 8, transition: 'background 0.12s',
                            }}>
                              <div style={{
                                fontFamily: A.font, fontSize: 13,
                                fontWeight: active ? 600 : 500,
                                color: active ? A.ink : 'rgba(38,52,49,0.75)',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>{c.name}</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ flex: 1, height: 8, background: 'rgba(0,0,0,0.04)', borderRadius: 4, overflow: 'hidden' }}>
                                  <div style={{
                                    height: '100%', borderRadius: 4,
                                    width: `${pct}%`,
                                    background: active ? A.ink : 'rgba(38,52,49,0.35)',
                                    transition: 'width 0.4s ease',
                                  }} />
                                </div>
                                <span style={{
                                  fontFamily: A.font, fontSize: 12.5, fontWeight: 700,
                                  color: active ? '#C4A86D' : 'rgba(38,52,49,0.5)',
                                  letterSpacing: '-0.2px',
                                  width: 56, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                                }}>{c.revenue > 0 ? formatRupee(Math.round(c.revenue)) : '—'}</span>
                              </div>
                              <div style={{ fontFamily: A.font, fontSize: 13, fontWeight: 500, color: 'rgba(38,52,49,0.55)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{c.items}</div>
                              <div style={{ fontFamily: A.font, fontSize: 13, fontWeight: 600, color: active ? A.ink : 'rgba(38,52,49,0.5)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{c.orders}</div>
                              <div style={{ textAlign: 'right', fontFamily: A.font, fontSize: 12, color: c.rating > 0 ? '#C4A86D' : 'rgba(38,52,49,0.3)', fontWeight: 600 }}>
                                {c.rating > 0 ? `★ ${c.rating.toFixed(1)}` : '—'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>)}
                  </BentoGlow>
                );
              })()}

            </div>
          )}

          {/* ── RESTAURANT HEALTH — Matte black signature card, bookend to LIVE TODAY ── */}
          {/*    Direction 3 split layout: diagnosis on the left, alerts feed on the right. ── */}
          {!loading && (
            <div style={{
              background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
              borderRadius: 14, padding: '22px 24px', marginTop: 14,
              border: A.forestBorder,
              boxShadow: '0 4px 16px rgba(38,52,49,0.15)',
            }}>
              {/* Top row: section label + thin rule (score ring moved into the left column below) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <div style={{ fontFamily: A.font, fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>RESTAURANT HEALTH</div>
                <div style={{ flex: 1, height: 1, background: 'rgba(234,231,227,0.08)' }} />
              </div>

              {(() => {
                // ── Alert rule builders ───────────────────────────────────────────
                // (1) Converting poorly — items in top 25% by lifetime views that have zero orders in the selected range.
                //     Replaces the old hardcoded "views > 10" threshold. Scales with restaurant size.
                const __viewCounts = activeItems.map(i => i.views || 0).filter(v => v > 0).sort((a, b) => b - a);
                const __topViewThresh = __viewCounts.length >= 4
                  ? __viewCounts[Math.max(0, Math.ceil(__viewCounts.length * 0.25) - 1)]
                  : Infinity; // too few viewed items to compute a meaningful percentile — skip the rule
                const convertingPoorly = __topViewThresh === Infinity ? [] : activeItems
                  .filter(i => (i.views || 0) >= __topViewThresh)
                  .filter(i => !itemFreq[i.name] || itemFreq[i.name].qty === 0)
                  .sort((a, b) => (b.views || 0) - (a.views || 0));

                // (2) Low rated — already filtered upstream (ratingAvg < 3.5 AND ratingCount >= 3)
                // (3) Stale zero-view — already filtered upstream (older than 7-day grace window)
                // (4) New unviewed — already filtered upstream (within 7-day grace)

                // Compose alerts with severity + UI formatters.
                const alerts = [];
                if (convertingPoorly.length > 0) alerts.push({
                  type: 'warning',
                  title: `${convertingPoorly.length} item${convertingPoorly.length > 1 ? 's' : ''} converting poorly`,
                  subtitle: 'Top-viewed, no orders this range',
                  items: convertingPoorly,
                  chipFmt: (i) => i.name,
                });
                if (lowRated.length > 0) alerts.push({
                  type: 'danger',
                  title: `${lowRated.length} item${lowRated.length > 1 ? 's' : ''} rated below 3.5`,
                  subtitle: 'Needs menu review',
                  items: lowRated,
                  chipFmt: (i) => `${i.name} · ${(i.ratingAvg || 0).toFixed(1)}`,
                });
                if (zeroView.length > 0) alerts.push({
                  type: 'danger',
                  title: `${zeroView.length} item${zeroView.length > 1 ? 's' : ''} with zero views`,
                  subtitle: 'Hidden from customers',
                  items: zeroView,
                  chipFmt: (i) => i.name,
                });
                if (newUnviewed.length > 0) alerts.push({
                  type: 'info',
                  title: `${newUnviewed.length} new item${newUnviewed.length > 1 ? 's' : ''} not viewed yet`,
                  subtitle: 'Added this week',
                  items: newUnviewed,
                  chipFmt: (i) => i.name,
                });

                // Sort: danger first, then warning, then info. Within severity, larger counts first.
                const __sevRank = { danger: 3, warning: 2, info: 1 };
                alerts.sort((a, b) => (__sevRank[b.type] - __sevRank[a.type]) || (b.items.length - a.items.length));

                // Section header colour reflects the HIGHEST severity present (not red by default).
                const __topSev = alerts[0]?.type;
                const sectionColor = __topSev === 'danger' ? '#F0A89A'
                  : __topSev === 'warning' ? '#D8BA80'
                  : __topSev === 'info' ? 'rgba(234,231,227,0.7)'
                  : '#C4A86D';
                const sectionLabel = alerts.length > 0 ? 'NEEDS ATTENTION' : 'ALL CLEAR';

                // Per-severity tile styling — matte-black-friendly tints.
                const sevStyle = {
                  danger:  { bg: 'rgba(217,83,79,0.10)',   border: '#D9534F',              title: '#F0A89A', sub: 'rgba(240,168,154,0.65)', chipBg: 'rgba(217,83,79,0.12)',   chipBorder: 'rgba(217,83,79,0.28)',   chipText: '#F0A89A' },
                  warning: { bg: 'rgba(196,168,109,0.09)', border: '#C4A86D',              title: '#D8BA80', sub: 'rgba(216,186,128,0.70)', chipBg: 'rgba(196,168,109,0.14)', chipBorder: 'rgba(196,168,109,0.28)', chipText: '#D8BA80' },
                  info:    { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.18)', title: '#EAE7E3', sub: 'rgba(234,231,227,0.50)', chipBg: 'rgba(255,255,255,0.06)', chipBorder: 'rgba(255,255,255,0.12)', chipText: 'rgba(234,231,227,0.80)' },
                };

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 0.9fr) minmax(280px, 1.1fr)', gap: 18 }}>
                    {/* ══ LEFT: diagnosis — score ring, motivational quote, 2x2 stat grid ══ */}
                    <div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 0 14px' }}>
                        <svg width="92" height="92" viewBox="0 0 32 32">
                          <circle cx="16" cy="16" r="13" fill="none" stroke="rgba(234,231,227,0.12)" strokeWidth="2.4" />
                          <circle cx="16" cy="16" r="13" fill="none" stroke={scoreColor} strokeWidth="2.4"
                            strokeDasharray={`${(healthScore / 100) * 81.7} 81.7`} strokeLinecap="round" transform="rotate(-90 16 16)" />
                        </svg>
                        <div style={{ marginTop: 10 }}>
                          <span style={{ fontFamily: A.font, fontWeight: 700, fontSize: 30, color: scoreColor, letterSpacing: '-0.5px' }}>
                            <CountUp end={healthScore} duration={1.2} key={committedBounds} preserveValue />
                          </span>
                          <span style={{ fontFamily: A.font, fontSize: 14, color: A.forestTextMuted, marginLeft: 5 }}>/100</span>
                        </div>
                        <div style={{ fontFamily: A.font, fontSize: 10, fontWeight: 600, color: A.forestTextFaint, marginTop: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Health Score</div>
                      </div>

                      {healthScore >= 70 && (
                        <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(196,168,109,0.08)', borderRadius: 10, border: '1px solid rgba(196,168,109,0.18)' }}>
                          <div style={{ fontFamily: A.font, fontStyle: 'italic', fontSize: 12.5, color: '#EAE7E3', lineHeight: 1.5 }}>
                            {healthScore >= 90 ? '"Your restaurant is performing exceptionally — keep this momentum going!"'
                              : healthScore >= 80 ? '"Great progress! Your menu and service are resonating with customers."'
                                : '"You\'re on the right track — a few tweaks and you\'ll be in the top tier!"'}
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {[
                          { label: 'VISITS → ORDERS', value: viewToOrderRate + '%', sub: 'conversion' },
                          { label: 'AR ITEM ORDERS', value: arToOrderRate + '%', sub: 'of all orders' },
                          { label: 'AR ENGAGEMENT', value: arRate + '%', sub: `${totalARViews} launches` },
                          { label: 'AVG RATING', value: avgRating > 0 ? `★ ${avgRating}` : '—', sub: `${activeItems.filter(i => (i.ratingCount || 0) > 0).length} rated` },
                        ].map(s => (
                          <div key={s.label} style={{ padding: '11px 13px', background: A.forestSubtleBg, borderRadius: 10, border: A.forestBorder }}>
                            <div style={{ fontFamily: A.font, fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 5 }}>{s.label}</div>
                            <div style={{ fontFamily: A.font, fontWeight: 700, fontSize: 17, color: A.warning, lineHeight: 1.1, letterSpacing: '-0.3px' }}>{s.value}</div>
                            <div style={{ fontFamily: A.font, fontSize: 10.5, color: A.forestTextMuted, marginTop: 3 }}>{s.sub}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ══ RIGHT: alerts feed — flex column so affirmation can anchor to bottom ══ */}
                    <div style={{ borderLeft: '1px solid rgba(234,231,227,0.08)', paddingLeft: 18, display: 'flex', flexDirection: 'column' }}>
                      {alerts.length > 0 ? (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <div style={{ fontFamily: A.font, fontSize: 11, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: sectionColor }}>{sectionLabel}</div>
                            <div style={{ fontFamily: A.font, fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', color: A.forestTextFaint }}>
                              {alerts.length} ALERT{alerts.length > 1 ? 'S' : ''}
                            </div>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {alerts.map((a, ai) => {
                              const st = sevStyle[a.type];
                              const alertKey = `${a.type}::${a.title}`;
                              const isExpanded = expandedAlerts.has(alertKey);
                              const visible = isExpanded ? a.items : a.items.slice(0, 3);
                              const hiddenCount = isExpanded ? 0 : (a.items.length - visible.length);
                              const hasOverflow = a.items.length > 3;
                              return (
                                <div key={ai} style={{
                                  padding: '11px 13px',
                                  background: st.bg,
                                  borderLeft: `2px solid ${st.border}`,
                                  borderRadius: '0 10px 10px 0',
                                }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 7 }}>
                                    <div style={{ fontFamily: A.font, fontSize: 13, fontWeight: 600, color: st.title }}>{a.title}</div>
                                    {a.subtitle && <div style={{ fontFamily: A.font, fontSize: 10.5, color: st.sub, whiteSpace: 'nowrap' }}>{a.subtitle}</div>}
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                    {visible.map((it, ci) => (
                                      <span key={it.id || it.name || ci} style={{
                                        fontFamily: A.font, fontSize: 11, fontWeight: 500,
                                        padding: '3px 8px', borderRadius: 6,
                                        background: st.chipBg, border: `1px solid ${st.chipBorder}`, color: st.chipText,
                                      }}>{a.chipFmt(it)}</span>
                                    ))}
                                    {hasOverflow && (
                                      <span
                                        onClick={() => toggleAlertExpand(alertKey)}
                                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(234,231,227,0.42)'; e.currentTarget.style.color = 'rgba(234,231,227,0.82)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(234,231,227,0.22)'; e.currentTarget.style.color = 'rgba(234,231,227,0.55)'; }}
                                        style={{
                                          fontFamily: A.font, fontSize: 11, fontWeight: 500,
                                          padding: '3px 8px', borderRadius: 6,
                                          background: 'transparent', border: '1px dashed rgba(234,231,227,0.22)',
                                          color: 'rgba(234,231,227,0.55)',
                                          cursor: 'pointer', userSelect: 'none',
                                          transition: 'border-color 0.15s, color 0.15s',
                                        }}>
                                        {isExpanded ? 'show less' : `+${hiddenCount} more`}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Bottom panel: Top Performers fills the empty column with the positive balance
                              to the alerts above. Falls back to the small affirmation if no range data. */}
                          {topPerformers.length > 0 ? (
                            <div style={{ marginTop: 'auto', paddingTop: 16 }}>
                              <div style={{
                                background: 'rgba(196,168,109,0.06)',
                                border: '1px solid rgba(196,168,109,0.14)',
                                borderRadius: 10,
                                padding: '12px 14px',
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                  <svg width="13" height="13" viewBox="0 0 64 64" fill="none" style={{ flexShrink: 0 }}>
                                    <path d="M32 16 L36 27 L48 29 L39 37 L42 49 L32 42 L22 49 L25 37 L16 29 L28 27 Z" fill="#C4A86D" />
                                  </svg>
                                  <div style={{ fontFamily: A.font, fontSize: 11, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#D8BA80' }}>TOP PERFORMERS</div>
                                  <div style={{ flex: 1, height: 1, background: 'rgba(196,168,109,0.10)' }} />
                                  <div style={{ fontFamily: A.font, fontSize: 9.5, fontWeight: 600, color: A.forestTextFaint, letterSpacing: '0.08em' }}>BY REVENUE</div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  {topPerformers.map((p, pi) => (
                                    <div key={p.name} style={{
                                      display: 'flex', alignItems: 'center', gap: 10,
                                      padding: '7px 2px',
                                      borderTop: pi > 0 ? '1px solid rgba(234,231,227,0.05)' : 'none',
                                    }}>
                                      <div style={{
                                        width: 20, height: 20, borderRadius: 5,
                                        background: 'rgba(196,168,109,0.14)',
                                        border: '1px solid rgba(196,168,109,0.24)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontFamily: A.font, fontSize: 10, fontWeight: 700, color: '#D8BA80',
                                        flexShrink: 0,
                                      }}>{pi + 1}</div>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                          fontFamily: A.font, fontSize: 12.5, fontWeight: 500, color: '#EAE7E3',
                                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>{p.name}</div>
                                        <div style={{ fontFamily: A.font, fontSize: 10.5, color: 'rgba(234,231,227,0.50)', marginTop: 1 }}>
                                          {p.qty} order{p.qty !== 1 ? 's' : ''}{p.ratingCount > 0 ? ` · ★${p.rating.toFixed(1)}` : ''}
                                        </div>
                                      </div>
                                      <div style={{
                                        fontFamily: A.font, fontSize: 13, fontWeight: 700,
                                        color: '#C4A86D', letterSpacing: '-0.3px',
                                        flexShrink: 0,
                                      }}>{formatRupee(p.revenue)}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ) : (
                            /* Fallback: no orders in range — keep the small affirmation pill */
                            <div style={{ marginTop: 'auto', paddingTop: 16, display: 'flex', justifyContent: 'center' }}>
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 14px',
                                background: 'rgba(196,168,109,0.06)',
                                border: '1px solid rgba(196,168,109,0.14)',
                                borderRadius: 10,
                              }}>
                                <svg width="22" height="22" viewBox="0 0 64 64" fill="none" style={{ flexShrink: 0 }}>
                                  <circle cx="11" cy="16" r="1.4" fill="rgba(196,168,109,0.55)" />
                                  <circle cx="53" cy="15" r="1.8" fill="rgba(196,168,109,0.80)" />
                                  <circle cx="56" cy="46" r="1.2" fill="rgba(196,168,109,0.50)" />
                                  <circle cx="9"  cy="46" r="1.6" fill="rgba(196,168,109,0.65)" />
                                  <path d="M32 16 L36 27 L48 29 L39 37 L42 49 L32 42 L22 49 L25 37 L16 29 L28 27 Z" fill="#C4A86D" />
                                </svg>
                                <div style={{ fontFamily: A.font, fontSize: 12, fontWeight: 500, color: 'rgba(234,231,227,0.75)', lineHeight: 1.4 }}>
                                  Nothing else is flagged right now
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        /* Celebration state — centered vertically when the grid stretches the right column */
                        <div style={{
                          margin: 'auto', textAlign: 'center', padding: '20px 16px',
                          display: 'flex', flexDirection: 'column', alignItems: 'center',
                        }}>
                          <svg width="64" height="64" viewBox="0 0 64 64" fill="none" style={{ marginBottom: 14 }}>
                            <circle cx="11" cy="16" r="1.6" fill="rgba(196,168,109,0.55)" />
                            <circle cx="53" cy="15" r="2.1" fill="rgba(196,168,109,0.80)" />
                            <circle cx="56" cy="46" r="1.4" fill="rgba(196,168,109,0.50)" />
                            <circle cx="9"  cy="46" r="1.8" fill="rgba(196,168,109,0.65)" />
                            <path d="M32 16 L36 27 L48 29 L39 37 L42 49 L32 42 L22 49 L25 37 L16 29 L28 27 Z" fill="#C4A86D" />
                          </svg>
                          <div style={{ fontFamily: A.font, fontSize: 11, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning, marginBottom: 10 }}>All clear</div>
                          <div style={{ fontFamily: A.font, fontSize: 14.5, fontWeight: 600, color: '#EAE7E3', marginBottom: 6, lineHeight: 1.4 }}>Nothing needs your attention right now</div>
                          <div style={{ fontFamily: A.font, fontSize: 12.5, color: 'rgba(234,231,227,0.55)', lineHeight: 1.5, maxWidth: 280 }}>Every menu item is performing well for the selected range.</div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

AdminAnalytics.getLayout = (page) => page;