import Head from 'next/head';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import {
  getAnalytics, getTodayAnalytics, getAllMenuItems,
  getWaiterCallsCount, getOrders,
} from '../../lib/db';
import { T, ADMIN_STYLES } from '../../lib/utils';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie,
  LineChart, Line, ReferenceLine,
} from 'recharts';
import CountUp from 'react-countup';

const tip = { backgroundColor: T.ink, border: 'none', borderRadius: 10, color: T.cream, fontSize: 12, fontFamily: T.font, padding: '8px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.25)' };
const tipLabel = { color: T.cream, fontWeight: 600 };
const tipItem = { color: 'rgba(234,231,227,0.8)' };
const CAT_COLORS = ['#9B5B53', '#C4A86D', '#8A7A6A', '#5A8A6E', '#5A8A9A', '#7AAA8E', '#F4D070', '#A08060'];

const PieTip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: T.ink, borderRadius: 10, padding: '8px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}>
      <div style={{ color: T.cream, fontWeight: 700, fontSize: 13 }}>{payload[0].name}</div>
      <div style={{ color: 'rgba(234,231,227,0.65)', fontSize: 12, marginTop: 2 }}>{payload[0].value} views</div>
    </div>
  );
};

function Trend({ val }) {
  if (!val) return null;
  const up = val > 0;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: up ? 'rgba(90,138,110,0.18)' : 'rgba(155,91,83,0.12)', color: up ? '#5A8A6E' : '#9B5B53' }}>
      {up ? '▲' : '▼'} {Math.abs(val)}%
    </span>
  );
}

function Stars({ avg, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {[1, 2, 3, 4, 5].map(s => (
        <span key={s} style={{ fontSize: 11, color: s <= Math.round(avg || 0) ? T.warning : 'rgba(38,52,49,0.15)' }}>★</span>
      ))}
      <span style={{ fontSize: 11, fontWeight: 700, color: T.warning }}>{(avg || 0).toFixed(1)}</span>
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
  const [range, setRange] = useState(7);
  const [committedRange, setCommittedRange] = useState(7);
  const [tab, setTab] = useState('overview');
  const [chartMode, setChartMode] = useState({}); // { revenue: 'line'|'bar', orders: 'line'|'bar', visits: 'line'|'bar' }
  const [visitsRangeOpen, setVisitsRangeOpen] = useState(false);
  const [visitsBarHover, setVisitsBarHover] = useState(null);
  const [revRangeOpen, setRevRangeOpen] = useState(false);
  const [revBarHover, setRevBarHover] = useState(null);
  const [ordRangeOpen, setOrdRangeOpen] = useState(false);
  const [ordBarHover, setOrdBarHover] = useState(null);
  const [peakBarHover, setPeakBarHover] = useState(null);
  const [dayBarHover, setDayBarHover] = useState(null);
  const rid = userData?.restaurantId;
  const initialLoadDone = useRef(false);

  const load = useCallback(async () => {
    if (!rid) return;
    if (!initialLoadDone.current) setLoading(true);
    const [anal, allAnal, items, today, waiter, allOrders] = await Promise.all([
      getAnalytics(rid, range), getAnalytics(rid, range * 2), getAllMenuItems(rid),
      getTodayAnalytics(rid), getWaiterCallsCount(rid, range), getOrders(rid),
    ]);
    setAnalytics(anal);
    setPrevAnal(allAnal.slice(0, Math.max(0, allAnal.length - range)));
    setMenuItems(items); setTodayStat(today); setWaiterStat(waiter);
    setOrders(allOrders || []); setLoading(false);
    setCommittedRange(range);
    initialLoadDone.current = true;
  }, [rid, range]);

  useEffect(() => { load(); }, [load]);

  const sum = (arr, k) => arr.reduce((s, d) => s + (d[k] || 0), 0);
  const delta = (curr, prev) => prev === 0 ? (curr > 0 ? null : 0) : Math.round(((curr - prev) / prev) * 100);

  const totalVisits = sum(analytics, 'totalVisits');
  const uniqueVisits = sum(analytics, 'uniqueVisitors');
  const prevVisits = sum(prevAnal, 'totalVisits');
  const prevUnique = sum(prevAnal, 'uniqueVisitors');

  const activeItems = menuItems.filter(i => i.isActive !== false);
  const totalViews = activeItems.reduce((s, i) => s + (i.views || 0), 0);
  const totalARViews = activeItems.reduce((s, i) => s + (i.arViews || 0), 0);
  const arRate = totalViews > 0 ? ((totalARViews / totalViews) * 100).toFixed(1) : '0.0';
  const avgRating = (() => {
    const rated = activeItems.filter(i => (i.ratingCount || 0) > 0);
    if (!rated.length) return 0;
    return (rated.reduce((s, i) => s + (i.ratingAvg || 0), 0) / rated.length).toFixed(1);
  })();

  const rangeStart = new Date(Date.now() - committedRange * 24 * 60 * 60 * 1000);
  const ordersInRange = orders.filter(o => {
    if (!o.createdAt) return true;
    const d = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000) : new Date(o.createdAt || Date.now()));
    return d >= rangeStart;
  });
  const totalOrders = ordersInRange.length;
  const totalRevenue = ordersInRange.reduce((s, o) => s + (o.total || 0), 0);
  const avgOrderValue = totalOrders > 0 ? (totalRevenue / totalOrders) : 0;

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

  const revByDay = {};
  ordersInRange.forEach(o => {
    const d = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000) : new Date(o.createdAt || Date.now()));
    const key = d.toISOString().slice(5, 10);
    if (!revByDay[key]) revByDay[key] = { date: key, revenue: 0, orders: 0 };
    revByDay[key].revenue += o.total || 0; revByDay[key].orders += 1;
  });
  // Pad with zero-revenue days so the chart shows the full range consistently
  // (prevents "snapping" when range changes and avoids misleading skipped days).
  const __now = new Date();
  for (let i = 0; i < committedRange; i++) {
    const d = new Date(__now); d.setDate(__now.getDate() - i);
    const k = d.toISOString().slice(5, 10);
    if (!revByDay[k]) revByDay[k] = { date: k, revenue: 0, orders: 0 };
  }
  const revenueChartData = Object.values(revByDay).sort((a, b) => a.date.localeCompare(b.date));

  const itemFreq = {};
  ordersInRange.forEach(o => {
    (o.items || []).forEach(item => {
      if (!itemFreq[item.name]) itemFreq[item.name] = { name: item.name, qty: 0, revenue: 0 };
      itemFreq[item.name].qty += item.qty || 1;
      itemFreq[item.name].revenue += (item.price || 0) * (item.qty || 1);
    });
  });
  const topOrderedItems = Object.values(itemFreq).sort((a, b) => b.qty - a.qty).slice(0, 8);

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
    if (p >= 0.7) return T.warning;
    if (p >= 0.3) return '#5A8A6E';
    return 'rgba(38,52,49,0.18)';
  };

  const topRated = [...activeItems].filter(i => (i.ratingCount || 0) > 0).sort((a, b) => (b.ratingAvg || 0) - (a.ratingAvg || 0)).slice(0, 5);
  const lowRated = [...activeItems].filter(i => (i.ratingAvg || 0) < 3.5 && (i.ratingCount || 0) > 0).sort((a, b) => (a.ratingAvg || 0) - (b.ratingAvg || 0)).slice(0, 3);
  const zeroView = heatmapData.filter(i => (i.views || 0) === 0);
  const topItems = [...activeItems].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 8);

  const catMap = {};
  activeItems.forEach(i => {
    const raw = i.category || 'Uncategorised';
    const cat = raw.charAt(0).toUpperCase() + raw.slice(1);
    if (!catMap[cat]) catMap[cat] = { name: cat, views: 0, items: 0 };
    catMap[cat].views += (i.views || 0) + (i.arViews || 0); catMap[cat].items += 1;
  });
  const catData = Object.values(catMap).sort((a, b) => b.views - a.views);

  const funnelData = [
    { label: 'Menu Visits', value: totalVisits, pct: 100, color: '#5A8A9A' },
    { label: 'Item Views', value: totalViews, pct: totalVisits > 0 ? Math.min(100, Math.round((totalViews / totalVisits) * 100)) : 0, color: '#8A7A6A' },
    { label: 'AR Views', value: totalARViews, pct: totalViews > 0 ? Math.min(100, Math.round((totalARViews / totalViews) * 100)) : 0, color: T.warning },
  ];

  const insights = useMemo(() => {
    const list = [];
    if (topOrderedItems.length > 0) {
      const top = topOrderedItems[0];
      const revPct = totalRevenue > 0 ? Math.round((top.revenue / totalRevenue) * 100) : 0;
      if (revPct > 0) list.push({ text: `${top.name} drives ${revPct}% of revenue`, type: 'success' });
    }
    if (parseFloat(arRate) > 0) list.push({ text: `AR engagement at ${arRate}% — ${parseFloat(arRate) >= 15 ? 'strong' : 'room to grow'}`, type: parseFloat(arRate) >= 15 ? 'success' : 'warning' });
    if (peakHour) list.push({ text: `Peak ordering time: ${peakHour.label} with ${peakHour.orders} orders`, type: 'info' });
    const viewedNotOrdered = activeItems.filter(i => (i.views || 0) > 10).filter(i => !itemFreq[i.name] || itemFreq[i.name].qty === 0).sort((a, b) => (b.views || 0) - (a.views || 0));
    if (viewedNotOrdered.length > 0) list.push({ text: `${viewedNotOrdered[0].name}: ${viewedNotOrdered[0].views} views but 0 orders`, type: 'danger' });
    if (zeroView.length > 0) list.push({ text: `${zeroView.length} item${zeroView.length > 1 ? 's' : ''} with zero views — update photos`, type: 'danger' });
    return list.slice(0, 4);
  }, [topOrderedItems, totalRevenue, arRate, peakHour, activeItems, itemFreq, zeroView]);

  const healthScore = useMemo(() => {
    let score = 50;
    if (totalOrders > 0) score += Math.min(20, totalOrders / 2);
    if (parseFloat(avgRating) >= 4) score += 15; else if (parseFloat(avgRating) >= 3) score += 10; else if (parseFloat(avgRating) > 0) score += 5;
    if (parseFloat(arRate) >= 20) score += 10; else if (parseFloat(arRate) >= 10) score += 7; else if (parseFloat(arRate) > 0) score += 3;
    if (totalVisits > 100) score += 5; else if (totalVisits > 20) score += 3;
    return Math.min(100, Math.round(score));
  }, [totalOrders, avgRating, arRate, totalVisits]);
  const scoreColor = healthScore >= 80 ? '#5A8A6E' : healthScore >= 60 ? T.warning : '#9B5B53';

  const viewToOrderRate = totalVisits > 0 && totalOrders > 0 ? ((totalOrders / totalVisits) * 100).toFixed(1) : '0.0';
  const itemsWithAR = activeItems.filter(i => (i.arViews || 0) > 0);
  const arItemNames = new Set(itemsWithAR.map(i => i.name));
  const ordersFromARItems = ordersInRange.filter(o => (o.items || []).some(item => arItemNames.has(item.name))).length;
  const arToOrderRate = totalARViews > 0 && ordersFromARItems > 0 ? Math.min(100, ((ordersFromARItems / totalARViews) * 100)).toFixed(1) : '0.0';

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

  const itemIntelligence = useMemo(() => {
    return activeItems.map(item => {
      const freq = itemFreq[item.name];
      const views = item.views || 0, arViews = item.arViews || 0, ordered = freq?.qty || 0, revenue = freq?.revenue || 0;
      const rating = item.ratingAvg || 0, ratingCount = item.ratingCount || 0;
      let suggestion = '', sColor = 'rgba(38,52,49,0.5)';
      if (views > 20 && ordered === 0) { suggestion = 'High views, no orders'; sColor = '#9B5B53'; }
      else if (views === 0) { suggestion = 'No views — update photo'; sColor = '#9B5B53'; }
      else if (rating > 0 && rating < 3) { suggestion = 'Low rating — improve'; sColor = '#9B5B53'; }
      else if (ordered > 5 && rating >= 4) { suggestion = 'Star performer'; sColor = '#5A8A6E'; }
      else if (arViews > 0 && arViews / Math.max(views, 1) > 0.3) { suggestion = 'High AR interest'; sColor = T.warning; }
      else if (ordered > 0) { suggestion = 'Performing well'; sColor = 'rgba(38,52,49,0.35)'; }
      else { suggestion = 'Needs attention'; sColor = 'rgba(38,52,49,0.4)'; }
      return { ...item, ordered, revenue, suggestion, sColor, views, arViews, rating, ratingCount };
    }).sort((a, b) => b.revenue - a.revenue || b.views - a.views).slice(0, 12);
  }, [activeItems, itemFreq]);

  const exportCSV = () => {
    if (tab === 'overview') downloadCSV(chartData.map(d => ({ date: d.date, visits: d.visits, unique_visitors: d.unique })), `analytics-${range}d.csv`);
    else if (tab === 'orders') downloadCSV(revenueChartData.map(d => ({ date: d.date, revenue: d.revenue, orders: d.orders })), `orders-revenue-${range}d.csv`);
    else downloadCSV(activeItems.map(i => ({ name: i.name, category: i.category || '', views: i.views || 0, ar_views: i.arViews || 0, rating_avg: i.ratingAvg || 0 })), 'menu-performance.csv');
  };

  const bestSeller = topOrderedItems[0] || null;
  const bestSellerItem = bestSeller ? activeItems.find(i => i.name === bestSeller.name) : null;
  const topDishes = topOrderedItems.slice(0, 6);
  const restaurantName = userData?.restaurantName || 'Your Restaurant';

  // Card + section shared styles
  const card = { background: T.white, borderRadius: 16, border: '1px solid rgba(38,52,49,0.06)', boxShadow: '0 2px 10px rgba(38,52,49,0.03)' };
  const secTitle = { fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 22, color: T.ink, letterSpacing: '-0.3px' };
  const labelSm = { fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(38,52,49,0.35)' };

  // Date range label + today key for charts
  const dateRangeLabel = (() => {
    const end = new Date();
    const start = new Date(Date.now() - range * 24 * 60 * 60 * 1000);
    const fmt = d => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
    return `${fmt(start)} — ${fmt(end)}`;
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
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 14, border: '1px solid rgba(196,168,109,0.5)', background: 'rgba(196,168,109,0.08)', cursor: 'pointer', fontFamily: T.font, fontSize: 10, fontWeight: 600, color: '#A08050', transition: 'all 0.15s', verticalAlign: 'middle', lineHeight: 1 }}>
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
      <div style={{ background: T.cream, minHeight: '100vh', fontFamily: T.font }}>
        <style>{`
          @keyframes spin{to{transform:rotate(360deg)}}
          @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
          @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
          .row-hover:hover{background:rgba(196,168,109,0.04)!important}
          .kpi-card{transition:transform 0.12s ease,box-shadow 0.12s ease}
          .kpi-card:hover{transform:translateY(-1px);box-shadow:0 4px 18px rgba(38,52,49,0.07)!important}
        `}</style>

        {/* ═══ HERO BANNER ═══ */}
        <div style={{
          background: `linear-gradient(135deg, ${T.shell} 0%, ${T.shellDarker} 60%, #1A2420 100%)`,
          padding: '28px 32px 24px', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.warning}, transparent)` }} />
          <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative', zIndex: 1 }}>
            {/* Title row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: T.fontDisplay, fontWeight: 800, fontSize: 30, color: T.shellText, letterSpacing: '-0.3px', whiteSpace: 'nowrap' }}>
                  {restaurantName} <span style={{ color: T.warning, fontWeight: 400, fontStyle: 'italic', fontSize: 24 }}>Analytics</span>
                </div>
                <div style={{ fontSize: 13, color: 'rgba(234,231,227,0.45)', marginTop: 5 }}>Performance dashboard — last {range} days</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[7, 30, 90].map(d => (
                  <button key={d} onClick={() => setRange(d)} style={{
                    padding: '6px 16px', borderRadius: 20,
                    border: range === d ? `1.5px solid ${T.warning}` : '1.5px solid rgba(234,231,227,0.12)',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: T.font,
                    background: range === d ? 'rgba(196,168,109,0.2)' : 'transparent',
                    color: range === d ? T.warning : 'rgba(234,231,227,0.45)', transition: 'all 0.15s',
                  }}>{d}d</button>
                ))}
                <button onClick={exportCSV} style={{
                  padding: '6px 14px', borderRadius: 20, border: '1.5px solid rgba(234,231,227,0.12)',
                  background: 'transparent', color: 'rgba(234,231,227,0.45)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: T.font,
                }}>Export</button>
              </div>
            </div>

            {/* Hero stats — ALL use selected range */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'VISITORS', value: totalVisits, prefix: '', d: delta(totalVisits, prevVisits) },
                { label: 'ORDERS', value: totalOrders, prefix: '' },
                { label: 'REVENUE', value: totalRevenue, prefix: '₹', highlight: true },
                { label: 'AVG ORDER', value: Math.round(avgOrderValue), prefix: '₹' },
              ].map(s => (
                <div key={s.label} style={{ padding: '14px 18px', background: 'rgba(234,231,227,0.06)', borderRadius: 12, border: '1px solid rgba(234,231,227,0.08)', minHeight: 74 }}>
                  <div style={{ ...labelSm, color: 'rgba(234,231,227,0.3)', marginBottom: 6 }}>{s.label}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minHeight: 26 }}>
                    <span style={{ fontFamily: T.font, fontWeight: 800, fontSize: 26, color: s.highlight ? T.warning : T.shellText, lineHeight: 1 }}>
                      <CountUp end={s.value} duration={1.5} separator="," prefix={s.prefix} preserveValue redraw />
                    </span>
                    {s.d !== undefined && s.d !== 0 && <Trend val={s.d} />}
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>

        {/* ═══ MAIN CONTENT ═══ */}
        <div style={{ maxWidth: 1164, margin: '0 auto', padding: '14px 32px 40px' }}>

          {/* ── TODAY'S LIVE DATA — big card ── */}
          <div style={{ ...card, padding: '20px 24px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#5A8A6E', animation: 'pulse 2s ease infinite' }} />
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#5A8A6E' }}>LIVE TODAY</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(38,52,49,0.06)' }} />
              <span style={{ fontSize: 10, color: 'rgba(38,52,49,0.25)', fontWeight: 500 }}>{todayDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'VISITORS', value: todayVisits, color: '#5A8A9A', bg: 'rgba(90,138,154,0.1)', border: 'rgba(90,138,154,0.2)', prefix: '' },
                { label: 'ORDERS', value: todayOrderCount, color: '#9B5B53', bg: 'rgba(155,91,83,0.08)', border: 'rgba(155,91,83,0.18)', prefix: '' },
                { label: 'REVENUE', value: todayRevenue, color: '#5A8A6E', bg: 'rgba(90,138,110,0.08)', border: 'rgba(90,138,110,0.18)', prefix: '₹' },
                { label: 'WAITER CALLS', value: todayWaiterCalls, color: T.warning, bg: 'rgba(196,168,109,0.08)', border: 'rgba(196,168,109,0.18)', prefix: '' },
              ].map(s => (
                <div key={s.label} style={{
                  padding: '16px 18px', borderRadius: 12,
                  background: s.bg,
                  border: `1px solid ${s.border}`,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: s.color, marginBottom: 8 }}>{s.label}</div>
                  <div style={{ fontFamily: T.font, fontWeight: 800, fontSize: 30, color: T.ink, lineHeight: 1 }}>
                    <CountUp end={s.value} duration={1.5} separator="," prefix={s.prefix} preserveValue redraw />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Insights — green background (fixed height; empty slots omitted) ── */}
          {insights.length > 0 && (
            <div style={{
              background: `linear-gradient(135deg, ${T.shell} 0%, ${T.shellDarker} 100%)`,
              borderRadius: 16, padding: '18px 24px', marginBottom: 14,
              border: '1px solid rgba(234,231,227,0.06)',
              minHeight: 146,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.warning }}>SMART INSIGHTS</div>
                <div style={{ flex: 1, height: 1, background: 'rgba(234,231,227,0.06)' }} />
                <span style={{ fontSize: 11, color: 'rgba(234,231,227,0.45)', fontWeight: 500 }}>Auto-analysed</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(insights.length, 4)}, 1fr)`, gap: 12 }}>
                {insights.map((ins, i) => {
                  const icons = { success: '▲', warning: '◆', danger: '!', info: '→' };
                  const colors = { success: '#7AAA8E', warning: T.warning, danger: '#E8907E', info: '#7ABAC8' };
                  return (
                    <div key={i} style={{
                      padding: '14px 16px', borderRadius: 10,
                      background: 'rgba(234,231,227,0.06)',
                      border: '1px solid rgba(234,231,227,0.08)',
                      borderLeft: `3px solid ${colors[ins.type]}`,
                      minHeight: 78,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                        <span style={{ fontSize: 9, fontWeight: 800, color: colors[ins.type], width: 16, height: 16, borderRadius: '50%', background: `${colors[ins.type]}30`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>{icons[ins.type]}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors[ins.type] }}>
                          {ins.type === 'success' ? 'WIN' : ins.type === 'warning' ? 'OPPORTUNITY' : ins.type === 'danger' ? 'ACTION NEEDED' : 'INSIGHT'}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: '#fff', fontWeight: 600, lineHeight: 1.5 }}>{ins.text}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Sticky tabs + range selector bar ── */}
          <div style={{ position: 'sticky', top: 0, zIndex: 10, background: T.cream, marginLeft: -32, marginRight: -32, padding: '0 32px', borderBottom: '2px solid rgba(38,52,49,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 0 }}>
                {[['overview', 'Overview'], ['orders', 'Orders & Revenue'], ['menu', 'Menu Performance']].map(([id, label]) => (
                  <button key={id} onClick={() => setTab(id)} style={{
                    padding: '10px 24px', border: 'none', cursor: 'pointer', fontFamily: T.font,
                    fontSize: 13, fontWeight: tab === id ? 700 : 500,
                    color: tab === id ? T.ink : 'rgba(38,52,49,0.4)',
                    background: 'transparent',
                    borderBottom: tab === id ? `2.5px solid ${T.warning}` : '2.5px solid transparent',
                    marginBottom: -2, transition: 'all 0.15s',
                  }}>{label}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[7, 30, 90].map(d => (
                  <button key={d} onClick={() => setRange(d)} style={{
                    padding: '4px 12px', borderRadius: 16,
                    border: range === d ? `1.5px solid ${T.warning}` : '1.5px solid rgba(38,52,49,0.1)',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: T.font,
                    background: range === d ? 'rgba(196,168,109,0.12)' : 'transparent',
                    color: range === d ? T.warning : 'rgba(38,52,49,0.35)', transition: 'all 0.15s',
                  }}>{d}d</button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ height: 14 }} />

          {/* Spinner */}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
              <div style={{ width: 28, height: 28, border: `3px solid ${T.warning}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>

          ) : tab === 'orders' ? (
            /* ═══ ORDERS & REVENUE ═══ */
            <div style={{ animation: 'fadeUp 0.2s ease' }}>
              {/* Revenue Over Time — Aspire treatment (mirrors Visits pattern) */}
              {(() => {
                const aspireFont = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
                const revMode = getMode('revenue', 'line');
                let trendUp = true;
                if (revenueChartData.length >= 2) {
                  const half = Math.max(1, Math.floor(revenueChartData.length / 2));
                  const first = revenueChartData.slice(0, half).map(d => d.revenue || 0);
                  const last = revenueChartData.slice(-half).map(d => d.revenue || 0);
                  const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
                  trendUp = avg(last) >= avg(first);
                }
                const gStart = trendUp ? '#E89143' : '#4A9A5E';
                const gEnd = trendUp ? '#4A9A5E' : '#E89143';
                const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                const parseKey = v => {
                  if (!v) return null;
                  const p = String(v).split('-').map(Number);
                  let yy, mm, dd;
                  if (p.length === 2) { mm = p[0]; dd = p[1]; yy = new Date().getFullYear(); }
                  else if (p.length === 3) { yy = p[0]; mm = p[1]; dd = p[2]; } else return null;
                  if (!mm || !dd || mm < 1 || mm > 12) return null;
                  return { yy, mm, dd };
                };
                const fmtDayFirst = v => { const p = parseKey(v); return p ? `${p.dd} ${months[p.mm - 1]}` : ''; };
                const fmtFullDate = v => { const p = parseKey(v); return p ? `${p.dd} ${months[p.mm - 1]} ${p.yy}` : ''; };
                const chipTxt = revenueChartData.length
                  ? `${fmtDayFirst(revenueChartData[0].date)} - ${fmtFullDate(revenueChartData[revenueChartData.length - 1].date)}`
                  : '';
                const RevTip = ({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const v = Number(payload[0].value) || 0;
                  const idx = revenueChartData.findIndex(d => d.date === label);
                  let pct = null;
                  if (idx > 0) {
                    const prev = Number(revenueChartData[idx - 1].revenue) || 0;
                    if (prev > 0) pct = ((v - prev) / prev) * 100;
                    else if (v > 0) pct = 'new';
                  }
                  const isNew = pct === 'new';
                  const up = isNew ? true : (pct == null ? null : pct >= 0);
                  return (
                    <div style={{ background: '#FFFFFF', border: '1px solid rgba(38,52,49,0.08)', borderRadius: 10, padding: '10px 14px', boxShadow: '0 8px 24px rgba(38,52,49,0.10)', fontFamily: aspireFont, minWidth: 110 }}>
                      <div style={{ fontSize: 12, color: 'rgba(38,52,49,0.55)', fontWeight: 500, marginBottom: 4 }}>{fmtFullDate(label)}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: T.ink, letterSpacing: '-0.3px' }}>₹{v.toLocaleString('en-IN')}</span>
                        {up !== null && (<span style={{ fontSize: 11, fontWeight: 700, color: up ? '#4A9A5E' : '#9B5B53' }}>{isNew ? 'new' : `${up ? '↗' : '↘'} ${Math.abs(Math.round(pct))}%`}</span>)}
                      </div>
                    </div>
                  );
                };
                return (
                  <div style={{ ...card, padding: '22px 22px 18px', marginBottom: 14, fontFamily: aspireFont }}>
                    <Head>
                      <link rel="preconnect" href="https://fonts.googleapis.com" />
                      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
                    </Head>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ fontFamily: aspireFont, fontWeight: 500, fontSize: 18, color: T.ink, letterSpacing: '-0.2px' }}>Revenue Over Time</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ display: 'inline-flex', background: '#FFFFFF', border: '1px solid rgba(38,52,49,0.12)', borderRadius: 8, padding: 2 }}>
                          {[{ k: 'line', label: 'Line', icon: '📈' }, { k: 'bar', label: 'Bar', icon: '📊' }].map(opt => {
                            const active = revMode === opt.k;
                            return (
                              <button key={opt.k} onClick={() => setChartMode(prev => ({ ...prev, revenue: opt.k }))} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontFamily: aspireFont, fontSize: 13, fontWeight: 500, color: active ? T.ink : 'rgba(38,52,49,0.55)', background: active ? 'rgba(38,52,49,0.06)' : 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                                <span style={{ fontSize: 12 }}>{opt.icon}</span>{opt.label}
                              </button>
                            );
                          })}
                        </div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: '#FFFFFF', border: '1px solid rgba(38,52,49,0.12)', borderRadius: 8, fontFamily: aspireFont, fontSize: 13, fontWeight: 500, color: T.ink }}>
                          <span style={{ fontSize: 13, opacity: 0.55 }}>📅</span>{chipTxt}
                        </div>
                        <div style={{ position: 'relative' }}>
                          <button type="button" onClick={() => setRevRangeOpen(o => !o)} onBlur={() => setTimeout(() => setRevRangeOpen(false), 150)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: aspireFont, fontSize: 13, fontWeight: 500, color: T.ink, padding: '7px 12px', background: '#FFFFFF', border: '1px solid rgba(38,52,49,0.12)', borderRadius: 8, cursor: 'pointer', outline: 'none', boxShadow: revRangeOpen ? '0 0 0 3px rgba(38,52,49,0.06)' : 'none' }}>
                            Last {range} days
                            <span style={{ fontSize: 9, color: 'rgba(38,52,49,0.5)', transition: 'transform 0.18s', transform: revRangeOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                          </button>
                          {revRangeOpen && (
                            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 140, background: '#FFFFFF', border: '1px solid rgba(38,52,49,0.10)', borderRadius: 10, boxShadow: '0 12px 32px rgba(38,52,49,0.12)', padding: 4, zIndex: 50 }}>
                              {[7, 14, 30, 90].map(d => {
                                const active = range === d;
                                return (
                                  <button key={d} type="button" onMouseDown={(e) => { e.preventDefault(); setRange(d); setRevRangeOpen(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontFamily: aspireFont, fontSize: 13, fontWeight: active ? 600 : 500, color: active ? T.ink : 'rgba(38,52,49,0.75)', background: active ? 'rgba(38,52,49,0.06)' : 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Last {d} days</button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {(() => {
                      // Sane trend: day-over-day, cap ±99%, show 'new' when prev=0.
                      const pts = revenueChartData.filter(d => (d.revenue || 0) > 0);
                      if (!pts.length) return null;
                      const i = revenueChartData.length - 1;
                      const v = Number(revenueChartData[i]?.revenue) || 0;
                      const prev = i > 0 ? (Number(revenueChartData[i - 1]?.revenue) || 0) : 0;
                      let trendPct = null, isNew = false;
                      if (prev > 0) trendPct = Math.max(-99, Math.min(99, ((v - prev) / prev) * 100));
                      else if (v > 0) isNew = true;
                      const up = isNew ? true : (trendPct == null ? null : trendPct >= 0);
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                          <span style={{ fontFamily: aspireFont, fontWeight: 700, fontSize: 22, color: T.ink, letterSpacing: '-0.3px', lineHeight: 1 }}><CountUp end={v} duration={1.5} separator="," prefix="₹" preserveValue redraw /></span>
                          {up !== null && (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                              fontFamily: aspireFont, fontSize: 12, fontWeight: 700,
                              color: up ? '#4A9A5E' : '#9B5B53',
                              background: up ? 'rgba(74,154,94,0.12)' : 'rgba(155,91,83,0.12)',
                              padding: '3px 9px', borderRadius: 999, lineHeight: 1,
                            }}>{isNew ? 'new' : `${up ? '↗' : '↘'} ${Math.abs(Math.round(trendPct))}%`}</span>
                          )}
                          <span style={{ fontFamily: aspireFont, fontSize: 12, color: 'rgba(38,52,49,0.5)', lineHeight: 1 }}>latest</span>
                        </div>
                      );
                    })()}
                    {revenueChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={260}>
                        {revMode === 'line' ? (
                          <AreaChart data={revenueChartData} margin={{ top: 12, right: 22, left: 4, bottom: 8 }}>
                            <defs>
                              <linearGradient id="revAspireStroke" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor={gStart} /><stop offset="100%" stopColor={gEnd} /></linearGradient>
                              <linearGradient id="revAspireFill" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor={gEnd} stopOpacity={0.28} />
                                <stop offset="50%" stopColor={gStart} stopOpacity={0.12} />
                                <stop offset="100%" stopColor={gStart} stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid stroke="rgba(38,52,49,0.06)" strokeDasharray="0" vertical={false} />
                            <XAxis dataKey="date" tick={{ fill: 'rgba(38,52,49,0.55)', fontSize: 12, fontFamily: aspireFont, fontWeight: 400 }} axisLine={false} tickLine={false} tickFormatter={fmtDayFirst} tickMargin={10} minTickGap={20} padding={{ left: 18, right: 18 }} />
                            <YAxis tick={{ fill: 'rgba(38,52,49,0.55)', fontSize: 12, fontFamily: aspireFont, fontWeight: 400 }} axisLine={false} tickLine={false} width={46} tickFormatter={formatRupee} tickMargin={8} />
                            <Tooltip content={<RevTip />} cursor={{ stroke: 'rgba(38,52,49,0.20)', strokeDasharray: '3 3' }} wrapperStyle={{ outline: 'none' }} />
                            <Area type="monotone" dataKey="revenue" stroke="url(#revAspireStroke)" strokeWidth={2.5} fill="url(#revAspireFill)" dot={false} activeDot={{ r: 5, fill: '#FFFFFF', stroke: gEnd, strokeWidth: 2.5 }} name="Revenue" animationDuration={1500} />
                          </AreaChart>
                        ) : (
                          <BarChart data={revenueChartData} margin={{ top: 12, right: 22, left: 4, bottom: 8 }} onMouseMove={(s) => { if (s && typeof s.activeTooltipIndex === 'number') setRevBarHover(s.activeTooltipIndex); else setRevBarHover(null); }} onMouseLeave={() => setRevBarHover(null)}>
                            <defs>
                              <filter id="revBarShadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#263431" floodOpacity="0.22" /></filter>
                            </defs>
                            <CartesianGrid stroke="rgba(38,52,49,0.06)" strokeDasharray="0" vertical={false} />
                            <XAxis dataKey="date" tick={{ fill: 'rgba(38,52,49,0.55)', fontSize: 12, fontFamily: aspireFont, fontWeight: 400 }} axisLine={false} tickLine={false} tickFormatter={fmtDayFirst} tickMargin={10} minTickGap={20} padding={{ left: 18, right: 18 }} />
                            <YAxis tick={{ fill: 'rgba(38,52,49,0.55)', fontSize: 12, fontFamily: aspireFont, fontWeight: 400 }} axisLine={false} tickLine={false} width={46} tickFormatter={formatRupee} tickMargin={8} />
                            <Tooltip content={<RevTip />} cursor={false} wrapperStyle={{ outline: 'none' }} />
                            <Bar dataKey="revenue" name="Revenue" fill={gEnd} radius={[6, 6, 0, 0]} maxBarSize={32} animationDuration={1500} shape={(props) => {
                              const { x, y, width, height, index, fill } = props;
                              const active = revBarHover === index;
                              const r = 6;
                              const path = `M${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height} L${x},${y + height} Z`;
                              return (<g><path d={path} fill={fill} filter={active ? 'url(#revBarShadow)' : undefined} style={{ transition: 'opacity 0.18s', opacity: revBarHover == null || active ? 1 : 0.55 }} /></g>);
                            }} />
                          </BarChart>
                        )}
                      </ResponsiveContainer>
                    ) : <div style={{ textAlign: 'center', padding: '50px 0', color: 'rgba(38,52,49,0.3)', fontSize: 13, fontFamily: aspireFont }}>No order data in this period</div>}
                  </div>
                );
              })()}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                {/* Orders Per Day — Aspire (compact) */}
                {(() => {
                  const aspireFont = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
                  const ordMode = getMode('orders', 'bar');
                  let trendUp = true;
                  if (revenueChartData.length >= 2) {
                    const half = Math.max(1, Math.floor(revenueChartData.length / 2));
                    const first = revenueChartData.slice(0, half).map(d => d.orders || 0);
                    const last = revenueChartData.slice(-half).map(d => d.orders || 0);
                    const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
                    trendUp = avg(last) >= avg(first);
                  }
                  const gStart = trendUp ? '#E89143' : '#4A9A5E';
                  const gEnd = trendUp ? '#4A9A5E' : '#E89143';
                  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                  const parseKey = v => {
                    if (!v) return null;
                    const p = String(v).split('-').map(Number);
                    let yy, mm, dd;
                    if (p.length === 2) { mm = p[0]; dd = p[1]; yy = new Date().getFullYear(); }
                    else if (p.length === 3) { yy = p[0]; mm = p[1]; dd = p[2]; } else return null;
                    if (!mm || !dd || mm < 1 || mm > 12) return null;
                    return { yy, mm, dd };
                  };
                  const fmtDayFirst = v => { const p = parseKey(v); return p ? `${p.dd} ${months[p.mm - 1]}` : ''; };
                  const fmtFullDate = v => { const p = parseKey(v); return p ? `${p.dd} ${months[p.mm - 1]} ${p.yy}` : ''; };
                  const OrdTip = ({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const v = Number(payload[0].value) || 0;
                    const idx = revenueChartData.findIndex(d => d.date === label);
                    let pct = null;
                    if (idx > 0) {
                      const prev = Number(revenueChartData[idx - 1].orders) || 0;
                      if (prev > 0) pct = ((v - prev) / prev) * 100;
                      else if (v > 0) pct = 'new';
                    }
                    const isNew = pct === 'new';
                    const up = isNew ? true : (pct == null ? null : pct >= 0);
                    return (
                      <div style={{ background: '#FFFFFF', border: '1px solid rgba(38,52,49,0.08)', borderRadius: 10, padding: '10px 14px', boxShadow: '0 8px 24px rgba(38,52,49,0.10)', fontFamily: aspireFont, minWidth: 100 }}>
                        <div style={{ fontSize: 12, color: 'rgba(38,52,49,0.55)', fontWeight: 500, marginBottom: 4 }}>{fmtFullDate(label)}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 18, fontWeight: 700, color: T.ink, letterSpacing: '-0.3px' }}>{v.toLocaleString()}</span>
                          {up !== null && (<span style={{ fontSize: 11, fontWeight: 700, color: up ? '#4A9A5E' : '#9B5B53' }}>{isNew ? 'new' : `${up ? '↗' : '↘'} ${Math.abs(Math.round(pct))}%`}</span>)}
                        </div>
                      </div>
                    );
                  };
                  return (
                    <div style={{ ...card, padding: '22px 22px 18px', fontFamily: aspireFont }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ fontFamily: aspireFont, fontWeight: 500, fontSize: 18, color: T.ink, letterSpacing: '-0.2px' }}>Orders Per Day</div>
                        <div style={{ display: 'inline-flex', background: '#FFFFFF', border: '1px solid rgba(38,52,49,0.12)', borderRadius: 8, padding: 2 }}>
                          {[{ k: 'line', label: 'Line', icon: '📈' }, { k: 'bar', label: 'Bar', icon: '📊' }].map(opt => {
                            const active = ordMode === opt.k;
                            return (
                              <button key={opt.k} onClick={() => setChartMode(prev => ({ ...prev, orders: opt.k }))} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontFamily: aspireFont, fontSize: 13, fontWeight: 500, color: active ? T.ink : 'rgba(38,52,49,0.55)', background: active ? 'rgba(38,52,49,0.06)' : 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                                <span style={{ fontSize: 12 }}>{opt.icon}</span>{opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {(() => {
                        const pts = revenueChartData.filter(d => (d.orders || 0) > 0);
                        if (!pts.length) return null;
                        const i = revenueChartData.length - 1;
                        const v = Number(revenueChartData[i]?.orders) || 0;
                        const prev = i > 0 ? (Number(revenueChartData[i - 1]?.orders) || 0) : 0;
                        let trendPct = null, isNew = false;
                        if (prev > 0) trendPct = Math.max(-99, Math.min(99, ((v - prev) / prev) * 100));
                        else if (v > 0) isNew = true;
                        const up = isNew ? true : (trendPct == null ? null : trendPct >= 0);
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                            <span style={{ fontFamily: aspireFont, fontWeight: 700, fontSize: 22, color: T.ink, letterSpacing: '-0.3px', lineHeight: 1 }}><CountUp end={v} duration={1.5} separator="," preserveValue redraw /></span>
                            {up !== null && (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                                fontFamily: aspireFont, fontSize: 12, fontWeight: 700,
                                color: up ? '#4A9A5E' : '#9B5B53',
                                background: up ? 'rgba(74,154,94,0.12)' : 'rgba(155,91,83,0.12)',
                                padding: '3px 9px', borderRadius: 999, lineHeight: 1,
                              }}>{isNew ? 'new' : `${up ? '↗' : '↘'} ${Math.abs(Math.round(trendPct))}%`}</span>
                            )}
                            <span style={{ fontFamily: aspireFont, fontSize: 12, color: 'rgba(38,52,49,0.5)', lineHeight: 1 }}>latest</span>
                          </div>
                        );
                      })()}
                      {revenueChartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={220}>
                          {ordMode === 'bar' ? (
                            <BarChart data={revenueChartData} margin={{ top: 12, right: 22, left: 4, bottom: 8 }} onMouseMove={(s) => { if (s && typeof s.activeTooltipIndex === 'number') setOrdBarHover(s.activeTooltipIndex); else setOrdBarHover(null); }} onMouseLeave={() => setOrdBarHover(null)}>
                              <defs>
                                <filter id="ordBarShadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#263431" floodOpacity="0.22" /></filter>
                              </defs>
                              <CartesianGrid stroke="rgba(38,52,49,0.06)" strokeDasharray="0" vertical={false} />
                              <XAxis dataKey="date" tick={{ fill: 'rgba(38,52,49,0.55)', fontSize: 12, fontFamily: aspireFont, fontWeight: 400 }} axisLine={false} tickLine={false} tickFormatter={fmtDayFirst} tickMargin={10} minTickGap={20} padding={{ left: 18, right: 18 }} />
                              <YAxis tick={{ fill: 'rgba(38,52,49,0.55)', fontSize: 12, fontFamily: aspireFont, fontWeight: 400 }} axisLine={false} tickLine={false} width={32} allowDecimals={false} tickMargin={8} />
                              <Tooltip content={<OrdTip />} cursor={false} wrapperStyle={{ outline: 'none' }} />
                              <Bar dataKey="orders" name="Orders" fill={gEnd} radius={[6, 6, 0, 0]} maxBarSize={32} animationDuration={1500} shape={(props) => {
                                const { x, y, width, height, index, fill } = props;
                                const active = ordBarHover === index;
                                const r = 6;
                                const path = `M${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height} L${x},${y + height} Z`;
                                return (<g><path d={path} fill={fill} filter={active ? 'url(#ordBarShadow)' : undefined} style={{ transition: 'opacity 0.18s', opacity: ordBarHover == null || active ? 1 : 0.55 }} /></g>);
                              }} />
                            </BarChart>
                          ) : (
                            <AreaChart data={revenueChartData} margin={{ top: 12, right: 22, left: 4, bottom: 8 }}>
                              <defs>
                                <linearGradient id="ordAspireStroke" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor={gStart} /><stop offset="100%" stopColor={gEnd} /></linearGradient>
                                <linearGradient id="ordAspireFill" x1="0%" y1="0%" x2="0%" y2="100%">
                                  <stop offset="0%" stopColor={gEnd} stopOpacity={0.28} />
                                  <stop offset="50%" stopColor={gStart} stopOpacity={0.12} />
                                  <stop offset="100%" stopColor={gStart} stopOpacity={0} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid stroke="rgba(38,52,49,0.06)" strokeDasharray="0" vertical={false} />
                              <XAxis dataKey="date" tick={{ fill: 'rgba(38,52,49,0.55)', fontSize: 12, fontFamily: aspireFont, fontWeight: 400 }} axisLine={false} tickLine={false} tickFormatter={fmtDayFirst} tickMargin={10} minTickGap={20} padding={{ left: 18, right: 18 }} />
                              <YAxis tick={{ fill: 'rgba(38,52,49,0.55)', fontSize: 12, fontFamily: aspireFont, fontWeight: 400 }} axisLine={false} tickLine={false} width={32} allowDecimals={false} tickMargin={8} />
                              <Tooltip content={<OrdTip />} cursor={{ stroke: 'rgba(38,52,49,0.20)', strokeDasharray: '3 3' }} wrapperStyle={{ outline: 'none' }} />
                              <Area type="monotone" dataKey="orders" stroke="url(#ordAspireStroke)" strokeWidth={2.5} fill="url(#ordAspireFill)" dot={false} activeDot={{ r: 5, fill: '#FFFFFF', stroke: gEnd, strokeWidth: 2.5 }} name="Orders" animationDuration={1500} />
                            </AreaChart>
                          )}
                        </ResponsiveContainer>
                      ) : <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(38,52,49,0.3)', fontSize: 13, fontFamily: aspireFont }}>No data</div>}
                    </div>
                  );
                })()}
                <div style={{ ...card, padding: '20px 24px' }}>
                  <div style={secTitle}>Most Ordered</div>
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {topOrderedItems.length > 0 ? topOrderedItems.map((item, i) => {
                      const maxQ = topOrderedItems[0]?.qty || 1;
                      return (
                        <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(38,52,49,0.25)', width: 14, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: T.ink, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#9B5B53', flexShrink: 0 }}>{item.qty}x</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(38,52,49,0.06)', overflow: 'hidden' }}>
                              <div style={{ height: '100%', borderRadius: 2, background: '#9B5B53', width: `${(item.qty / maxQ) * 100}%` }} />
                            </div>
                          </div>
                          <span style={{ fontSize: 11, color: 'rgba(38,52,49,0.4)', flexShrink: 0 }}>₹{item.revenue.toFixed(0)}</span>
                        </div>
                      );
                    }) : <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(38,52,49,0.3)', fontSize: 13 }}>No orders yet</div>}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {/* Peak Hours — Aspire-lite */}
                {(() => {
                  const aspireFont = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
                  const maxO = Math.max(...peakHourData.map(x => x.orders), 0);
                  return (
                    <div style={{ ...card, padding: '22px 22px 18px', fontFamily: aspireFont }}
                         onMouseLeave={() => setPeakBarHover(null)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <div style={{ fontFamily: aspireFont, fontWeight: 500, fontSize: 18, color: T.ink, letterSpacing: '-0.2px' }}>Peak Hours</div>
                        {peakHour && (
                          <span style={{ fontFamily: aspireFont, fontSize: 12, fontWeight: 600, color: '#9B5B53', background: 'rgba(155,91,83,0.10)', padding: '5px 11px', borderRadius: 999 }}>Busiest: {peakHour.label}</span>
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
                                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'default' }}
                              >
                                <span style={{ fontFamily: aspireFont, fontSize: 10, fontWeight: 700, color: isPeak ? '#9B5B53' : 'rgba(38,52,49,0.4)', transition: 'opacity 0.15s', opacity: dim ? 0.3 : 1 }}>{h.orders}</span>
                                <div style={{
                                  width: '100%', minHeight: 4, height: `${pct}%`, borderRadius: 3,
                                  background: isPeak ? '#9B5B53' : T.warning,
                                  opacity: dim ? 0.25 : (isPeak ? 1 : 0.55),
                                  boxShadow: isHover ? '0 4px 10px rgba(38,52,49,0.22)' : 'none',
                                  transition: 'opacity 0.15s, box-shadow 0.15s, transform 0.15s',
                                  transform: isHover ? 'translateY(-2px)' : 'none',
                                }} />
                                <span style={{ fontFamily: aspireFont, fontSize: 9, color: 'rgba(38,52,49,0.45)', transition: 'opacity 0.15s', opacity: dim ? 0.4 : 1 }}>{h.label}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Busiest Days — Aspire-lite */}
                {(() => {
                  const aspireFont = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
                  const maxD = Math.max(...dayData.map(x => x.orders), 0);
                  return (
                    <div style={{ ...card, padding: '22px 22px 18px', fontFamily: aspireFont }}
                         onMouseLeave={() => setDayBarHover(null)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <div style={{ fontFamily: aspireFont, fontWeight: 500, fontSize: 18, color: T.ink, letterSpacing: '-0.2px' }}>Busiest Days</div>
                        {busiestDay && busiestDay.orders > 0 && (
                          <span style={{ fontFamily: aspireFont, fontSize: 12, fontWeight: 600, color: '#5A8A6E', background: 'rgba(90,138,110,0.10)', padding: '5px 11px', borderRadius: 999 }}>Top: {busiestDay.day}</span>
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
                              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'default' }}
                            >
                              <span style={{ fontFamily: aspireFont, fontSize: 11, fontWeight: 700, color: isB ? '#5A8A6E' : 'rgba(38,52,49,0.4)', transition: 'opacity 0.15s', opacity: dim ? 0.3 : 1 }}>{d.orders}</span>
                              <div style={{
                                width: '100%', minHeight: 4, height: `${pct}%`, borderRadius: 4,
                                background: '#5A8A6E',
                                opacity: dim ? 0.2 : (isB ? 1 : 0.45),
                                boxShadow: isHover ? '0 4px 10px rgba(38,52,49,0.22)' : 'none',
                                transition: 'opacity 0.15s, box-shadow 0.15s, transform 0.15s',
                                transform: isHover ? 'translateY(-2px)' : 'none',
                              }} />
                              <span style={{ fontFamily: aspireFont, fontSize: 11, color: 'rgba(38,52,49,0.5)', fontWeight: isB ? 600 : 500, transition: 'opacity 0.15s', opacity: dim ? 0.4 : 1 }}>{d.day}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

          ) : tab === 'overview' ? (
            <div style={{ animation: 'fadeUp 0.2s ease' }}>
              {/* Journey + Dish Performance */}
              <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 14, marginBottom: 14 }}>
                {/* Journey — vertical funnel */}
                <div style={{
                  background: `linear-gradient(180deg, ${T.shell} 0%, ${T.shellDarker} 100%)`,
                  borderRadius: 16, padding: '20px 24px',
                  border: '1px solid rgba(234,231,227,0.06)',
                }}>
                  <div style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 22, color: '#fff', letterSpacing: '-0.3px' }}>Customer Journey</div>
                  <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {funnelData.map((f, i) => {
                      const widthPct = [100, 75, 58][i];
                      return (
                        <div key={f.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{
                            width: `${widthPct}%`, padding: '16px 20px', borderRadius: 12,
                            background: i === 2 ? 'rgba(196,168,109,0.18)' : `rgba(234,231,227,${0.06 + i * 0.02})`,
                            border: `1px solid ${i === 2 ? 'rgba(196,168,109,0.35)' : 'rgba(234,231,227,0.1)'}`,
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(234,231,227,0.8)' }}>{f.label}</span>
                            <span style={{ fontFamily: T.font, fontWeight: 800, fontSize: 24, color: i === 2 ? T.warning : '#fff' }}>{f.value.toLocaleString()}</span>
                          </div>
                          {i < funnelData.length - 1 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0' }}>
                              <div style={{ width: 1, height: 12, background: 'rgba(234,231,227,0.15)' }} />
                              <span style={{ fontSize: 11, fontWeight: 700, color: T.warning, background: 'rgba(196,168,109,0.15)', padding: '3px 10px', borderRadius: 10 }}>{funnelData[i + 1].pct}%</span>
                              <div style={{ width: 1, height: 12, background: 'rgba(234,231,227,0.15)' }} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 18, padding: '16px 18px', background: 'rgba(196,168,109,0.1)', borderRadius: 12, border: '1px solid rgba(196,168,109,0.2)', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(234,231,227,0.5)', marginBottom: 6 }}>OVERALL CONVERSION</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6 }}>
                      <span style={{ fontFamily: T.font, fontWeight: 800, fontSize: 32, color: T.warning }}>{viewToOrderRate}%</span>
                      <span style={{ fontSize: 13, color: 'rgba(234,231,227,0.45)' }}>visits to orders</span>
                    </div>
                  </div>
                </div>

                {/* Dish Performance — cinematic bento */}
                <div style={{ ...card, padding: '20px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div style={secTitle}>Dish Performance</div>
                    {topDishes.length > 0 && <span style={{ fontSize: 10, color: 'rgba(38,52,49,0.35)', fontWeight: 500 }}>{range}d data</span>}
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
                            minHeight: rightCount <= 1 ? 220 : 260, background: T.shellDarker,
                            boxShadow: '0 8px 24px rgba(38,52,49,0.12)',
                          }}>
                            <img src={bestSellerItem.imageURL || stockFoods[0]} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(28,40,37,0.9) 0%, rgba(28,40,37,0.3) 40%, rgba(0,0,0,0.05) 100%)' }} />
                            <div style={{ position: 'absolute', top: 12, left: 12 }}>
                              <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', color: T.shellDarker, background: T.warning, padding: '4px 10px', borderRadius: 6, textTransform: 'uppercase' }}>Best Seller</span>
                            </div>
                            <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16 }}>
                              <div style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 18, color: '#fff', lineHeight: 1.25 }}>{bestSellerItem.name}</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                                <span style={{ fontSize: 11, color: T.warning, fontWeight: 700 }}>{bestSeller.qty}x ordered</span>
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
                              background: T.white, border: '1px solid rgba(38,52,49,0.06)',
                              display: 'flex', alignItems: 'center', gap: 10,
                              boxShadow: '0 1px 4px rgba(38,52,49,0.03)',
                            }}>
                              <div style={{ width: 42, height: 42, borderRadius: 10, overflow: 'hidden', flexShrink: 0, border: '1px solid rgba(38,52,49,0.06)' }}>
                                <img src={menuItem?.imageURL || stockFoods[(idx + 1) % stockFoods.length]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </div>
                              <div style={{ flex: 1, overflow: 'hidden' }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>{dish.name}</div>
                                <div style={{ height: 3, borderRadius: 2, background: 'rgba(38,52,49,0.05)', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', borderRadius: 2, background: `linear-gradient(90deg, ${T.warning}, #D4A85A)`, width: `${barPct}%`, transition: 'width 0.3s ease' }} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                                  <span style={{ fontSize: 10, color: 'rgba(38,52,49,0.4)', fontWeight: 600 }}>{dish.qty}x</span>
                                  <span style={{ fontSize: 10, color: '#5A8A6E', fontWeight: 700 }}>₹{dish.revenue.toFixed(0)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })() : <div style={{ textAlign: 'center', padding: '50px 0', color: 'rgba(38,52,49,0.3)', fontSize: 13 }}>No order data yet</div>}
                </div>
              </div>

              {/* Visits Over Time — Aspire-exact (scoped Inter font, conditional gradient) */}
              {(() => {
                const aspireFont = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
                const visitsMode = getMode('visits', 'line');

                // Trend direction: compare last 3 days avg vs first 3 days avg
                let trendUp = true;
                if (chartData.length >= 2) {
                  const half = Math.max(1, Math.floor(chartData.length / 2));
                  const firstHalf = chartData.slice(0, half).map(d => d.visits || 0);
                  const lastHalf = chartData.slice(-half).map(d => d.visits || 0);
                  const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
                  trendUp = avg(lastHalf) >= avg(firstHalf);
                }
                const gradStart = trendUp ? '#E89143' : '#4A9A5E';
                const gradEnd = trendUp ? '#4A9A5E' : '#E89143';

                // chartData.date is "MM-DD" (e.g. "04-15"). Parse robustly.
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const parseKey = (val) => {
                  if (!val) return null;
                  const parts = String(val).split('-').map(Number);
                  // Either ["MM","DD"] or ["YYYY","MM","DD"]
                  let yy, mm, dd;
                  if (parts.length === 2) { mm = parts[0]; dd = parts[1]; yy = new Date().getFullYear(); }
                  else if (parts.length === 3) { yy = parts[0]; mm = parts[1]; dd = parts[2]; }
                  else return null;
                  if (!mm || !dd || mm < 1 || mm > 12) return null;
                  return { yy, mm, dd };
                };
                const fmtDayFirst = (val) => {
                  const p = parseKey(val); if (!p) return '';
                  return `${p.dd} ${months[p.mm - 1]}`;
                };
                const fmtFullDate = (val) => {
                  const p = parseKey(val); if (!p) return '';
                  return `${p.dd} ${months[p.mm - 1]} ${p.yy}`;
                };

                // Date range chip text (day-first)
                const aspireRangeChip = (() => {
                  if (!chartData.length) return '';
                  const first = chartData[0].date;
                  const last = chartData[chartData.length - 1].date;
                  return `${fmtDayFirst(first)} - ${fmtFullDate(last)}`;
                })();

                // Custom tooltip — Aspire-style floating card
                // Trend = day-over-day vs previous data point (matches Aspire reference)
                const AspireTip = ({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const v = Number(payload[0].value) || 0;
                  const idx = chartData.findIndex(d => d.date === label);
                  let trendPct = null;
                  if (idx > 0) {
                    const prev = Number(chartData[idx - 1].visits) || 0;
                    if (prev > 0) {
                      trendPct = ((v - prev) / prev) * 100;
                    } else if (v > 0) {
                      // Previous day was zero — show "new" badge instead of infinity
                      trendPct = 'new';
                    }
                  }
                  const isNew = trendPct === 'new';
                  const up = isNew ? true : (trendPct == null ? null : trendPct >= 0);
                  return (
                    <div style={{
                      background: '#FFFFFF',
                      border: '1px solid rgba(38,52,49,0.08)',
                      borderRadius: 10,
                      padding: '10px 14px',
                      boxShadow: '0 8px 24px rgba(38,52,49,0.10)',
                      fontFamily: aspireFont,
                      minWidth: 110,
                    }}>
                      <div style={{ fontSize: 12, color: 'rgba(38,52,49,0.55)', fontWeight: 500, marginBottom: 4 }}>{fmtFullDate(label)}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: T.ink, letterSpacing: '-0.3px' }}>{v.toLocaleString()}</span>
                        {up !== null && (
                          <span style={{
                            fontSize: 11, fontWeight: 700,
                            color: up ? '#4A9A5E' : '#9B5B53',
                          }}>
                            {isNew ? 'new' : `${up ? '↗' : '↘'} ${Math.abs(Math.round(trendPct))}%`}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                };

                return (
                  <div style={{ ...card, padding: '22px 22px 18px', marginBottom: 14, fontFamily: aspireFont }}>
                    <Head>
                      <link rel="preconnect" href="https://fonts.googleapis.com" />
                      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
                    </Head>

                    {/* Header: title left · controls right */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                      <div style={{ fontFamily: aspireFont, fontWeight: 500, fontSize: 18, color: T.ink, letterSpacing: '-0.2px', paddingLeft: 8 }}>
                        Visits Over Time
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {/* Bar/Line toggle — same shape as date dropdown */}
                        <div style={{
                          display: 'inline-flex',
                          background: '#FFFFFF',
                          border: '1px solid rgba(38,52,49,0.12)',
                          borderRadius: 8,
                          padding: 2,
                          fontFamily: aspireFont,
                        }}>
                          {[
                            { k: 'line', label: 'Line', icon: '📈' },
                            { k: 'bar', label: 'Bar', icon: '📊' },
                          ].map(opt => {
                            const active = visitsMode === opt.k;
                            return (
                              <button
                                key={opt.k}
                                onClick={() => setChartMode(prev => ({ ...prev, visits: opt.k }))}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  padding: '5px 10px',
                                  fontFamily: aspireFont, fontSize: 13, fontWeight: 500,
                                  color: active ? T.ink : 'rgba(38,52,49,0.55)',
                                  background: active ? 'rgba(38,52,49,0.06)' : 'transparent',
                                  border: 'none', borderRadius: 6, cursor: 'pointer',
                                  transition: 'all 0.15s',
                                }}
                              >
                                <span style={{ fontSize: 12 }}>{opt.icon}</span>
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>

                        {/* Date range chip — read-only badge showing actual range */}
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '7px 12px',
                          background: '#FFFFFF',
                          border: '1px solid rgba(38,52,49,0.12)',
                          borderRadius: 8,
                          fontFamily: aspireFont, fontSize: 13, fontWeight: 500, color: T.ink,
                        }}>
                          <span style={{ fontSize: 13, opacity: 0.55 }}>📅</span>
                          {aspireRangeChip}
                        </div>

                        {/* Days dropdown — custom Aspire-style */}
                        <div style={{ position: 'relative' }}>
                          <button
                            type="button"
                            onClick={() => setVisitsRangeOpen(o => !o)}
                            onBlur={() => setTimeout(() => setVisitsRangeOpen(false), 150)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 8,
                              fontFamily: aspireFont, fontSize: 13, fontWeight: 500, color: T.ink,
                              padding: '7px 12px',
                              background: '#FFFFFF',
                              border: '1px solid rgba(38,52,49,0.12)',
                              borderRadius: 8,
                              cursor: 'pointer', outline: 'none',
                              transition: 'border-color 0.15s, box-shadow 0.15s',
                              boxShadow: visitsRangeOpen ? '0 0 0 3px rgba(38,52,49,0.06)' : 'none',
                            }}
                          >
                            Last {range} days
                            <span style={{
                              fontSize: 9, color: 'rgba(38,52,49,0.5)',
                              transition: 'transform 0.18s',
                              transform: visitsRangeOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                            }}>▼</span>
                          </button>
                          {visitsRangeOpen && (
                            <div style={{
                              position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                              minWidth: 140,
                              background: '#FFFFFF',
                              border: '1px solid rgba(38,52,49,0.10)',
                              borderRadius: 10,
                              boxShadow: '0 12px 32px rgba(38,52,49,0.12)',
                              padding: 4,
                              zIndex: 50,
                              fontFamily: aspireFont,
                            }}>
                              {[7, 14, 30, 90].map(d => {
                                const active = range === d;
                                return (
                                  <button
                                    key={d}
                                    type="button"
                                    onMouseDown={(e) => { e.preventDefault(); setRange(d); setVisitsRangeOpen(false); }}
                                    style={{
                                      display: 'block', width: '100%', textAlign: 'left',
                                      padding: '8px 12px',
                                      fontFamily: aspireFont, fontSize: 13, fontWeight: active ? 600 : 500,
                                      color: active ? T.ink : 'rgba(38,52,49,0.75)',
                                      background: active ? 'rgba(38,52,49,0.06)' : 'transparent',
                                      border: 'none', borderRadius: 6, cursor: 'pointer',
                                      transition: 'background 0.12s',
                                    }}
                                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(38,52,49,0.04)'; }}
                                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                                  >
                                    Last {d} days
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Chart */}
                    {chartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={260}>
                        {visitsMode === 'line' ? (
                          <AreaChart data={chartData} margin={{ top: 12, right: 22, left: 4, bottom: 8 }}>
                            <defs>
                              <linearGradient id="visitsAspireStroke" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor={gradStart} />
                                <stop offset="100%" stopColor={gradEnd} />
                              </linearGradient>
                              <linearGradient id="visitsAspireFill" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor={gradEnd} stopOpacity={0.28} />
                                <stop offset="50%" stopColor={gradStart} stopOpacity={0.12} />
                                <stop offset="100%" stopColor={gradStart} stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid stroke="rgba(38,52,49,0.06)" strokeDasharray="0" vertical={false} />
                            <XAxis
                              dataKey="date"
                              tick={{ fill: 'rgba(38,52,49,0.55)', fontSize: 12, fontFamily: aspireFont, fontWeight: 400 }}
                              axisLine={false} tickLine={false}
                              tickFormatter={fmtDayFirst}
                              tickMargin={10}
                              minTickGap={20}
                              padding={{ left: 18, right: 18 }}
                            />
                            <YAxis
                              tick={{ fill: 'rgba(38,52,49,0.55)', fontSize: 12, fontFamily: aspireFont, fontWeight: 400 }}
                              axisLine={false} tickLine={false}
                              width={32}
                              allowDecimals={false}
                              tickMargin={8}
                            />
                            <Tooltip
                              content={<AspireTip />}
                              cursor={{ stroke: 'rgba(38,52,49,0.20)', strokeDasharray: '3 3' }}
                              wrapperStyle={{ outline: 'none' }}
                            />
                            <Area
                              type="monotone"
                              dataKey="visits"
                              stroke="url(#visitsAspireStroke)"
                              strokeWidth={2.5}
                              fill="url(#visitsAspireFill)"
                              dot={false}
                              activeDot={{ r: 5, fill: '#FFFFFF', stroke: gradEnd, strokeWidth: 2.5 }}
                              name="Visits" animationDuration={1500}
                            />
                          </AreaChart>
                        ) : (
                          <BarChart
                            data={chartData}
                            margin={{ top: 12, right: 22, left: 4, bottom: 8 }}
                            onMouseMove={(s) => {
                              if (s && typeof s.activeTooltipIndex === 'number') setVisitsBarHover(s.activeTooltipIndex);
                              else setVisitsBarHover(null);
                            }}
                            onMouseLeave={() => setVisitsBarHover(null)}
                          >
                            <defs>
                              <filter id="visitsBarShadow" x="-50%" y="-50%" width="200%" height="200%">
                                <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#263431" floodOpacity="0.22" />
                              </filter>
                            </defs>
                            <CartesianGrid stroke="rgba(38,52,49,0.06)" strokeDasharray="0" vertical={false} />
                            <XAxis
                              dataKey="date"
                              tick={{ fill: 'rgba(38,52,49,0.55)', fontSize: 12, fontFamily: aspireFont, fontWeight: 400 }}
                              axisLine={false} tickLine={false}
                              tickFormatter={fmtDayFirst}
                              tickMargin={10}
                              minTickGap={20}
                              padding={{ left: 18, right: 18 }}
                            />
                            <YAxis
                              tick={{ fill: 'rgba(38,52,49,0.55)', fontSize: 12, fontFamily: aspireFont, fontWeight: 400 }}
                              axisLine={false} tickLine={false}
                              width={32}
                              allowDecimals={false}
                              tickMargin={8}
                            />
                            <Tooltip
                              content={<AspireTip />}
                              cursor={false}
                              wrapperStyle={{ outline: 'none' }}
                            />
                            <Bar
                              dataKey="visits"
                              name="Visits" animationDuration={1500}
                              fill={gradEnd}
                              radius={[6, 6, 0, 0]}
                              maxBarSize={32}
                              shape={(props) => {
                                const { x, y, width, height, index, fill } = props;
                                const active = visitsBarHover === index;
                                const r = 6;
                                // Build a path with rounded top corners for clean radius rendering
                                const path = `M${x},${y + r}
                                              Q${x},${y} ${x + r},${y}
                                              L${x + width - r},${y}
                                              Q${x + width},${y} ${x + width},${y + r}
                                              L${x + width},${y + height}
                                              L${x},${y + height} Z`;
                                return (
                                  <g>
                                    <path
                                      d={path}
                                      fill={fill}
                                      filter={active ? 'url(#visitsBarShadow)' : undefined}
                                      style={{
                                        transition: 'opacity 0.18s',
                                        opacity: visitsBarHover == null || active ? 1 : 0.55,
                                      }}
                                    />
                                  </g>
                                );
                              }}
                            />
                          </BarChart>
                        )}
                      </ResponsiveContainer>
                    ) : (
                      <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(38,52,49,0.3)', fontSize: 14, fontFamily: aspireFont }}>
                        No visit data yet
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Waiter + Top Menu Items — refined */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{
                  background: `linear-gradient(135deg, ${T.shell} 0%, ${T.shellDarker} 100%)`,
                  borderRadius: 16, padding: '20px 24px',
                  border: '1px solid rgba(234,231,227,0.06)',
                }}>
                  <div style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 22, color: '#fff', letterSpacing: '-0.3px', marginBottom: 16 }}>Waiter Summary</div>
                  {waiterStat ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {[
                        { label: 'Total Calls', value: waiterStat.total, color: '#fff', sub: `${range}d period` },
                        { label: 'Resolved', value: waiterStat.resolved, color: '#7AAA8E', sub: waiterStat.total > 0 ? `${Math.round((waiterStat.resolved / waiterStat.total) * 100)}% rate` : '—' },
                        { label: 'Avg Response', value: formatTime(waiterStat.avgResponseSeconds), color: T.warning, sub: 'call to resolve' },
                      ].map(s => (
                        <div key={s.label} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '14px 18px', background: 'rgba(234,231,227,0.06)',
                          borderRadius: 10, border: '1px solid rgba(234,231,227,0.1)',
                        }}>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(234,231,227,0.7)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{s.label}</div>
                            <div style={{ fontSize: 11, color: 'rgba(234,231,227,0.4)', marginTop: 3 }}>{s.sub}</div>
                          </div>
                          <div style={{ fontFamily: T.font, fontWeight: 800, fontSize: 26, color: s.color }}>{s.value}</div>
                        </div>
                      ))}
                    </div>
                  ) : <div style={{ textAlign: 'center', padding: '30px 0', color: 'rgba(234,231,227,0.4)', fontSize: 14 }}>No data</div>}
                </div>
                {topItems.length > 0 && (
                  <div style={{ ...card, padding: '20px 24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <div style={secTitle}>Top Menu Items</div>
                      <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'rgba(38,52,49,0.4)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: T.warning }} />Views</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#5A8A6E' }} />AR</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                      {topItems.slice(0, 8).map((item, i) => {
                        const maxV = topItems[0]?.views || 1;
                        const vPct = Math.max(6, Math.round(((item.views || 0) / maxV) * 100));
                        const arViews = item.arViews || 0;
                        return (
                          <div key={item.name || i} style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 10px', borderRadius: 8,
                            background: i === 0 ? 'rgba(196,168,109,0.06)' : 'transparent',
                            border: i === 0 ? '1px solid rgba(196,168,109,0.12)' : '1px solid transparent',
                          }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: i === 0 ? T.warning : 'rgba(38,52,49,0.25)', width: 16, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{item.views || 0}</span>
                                  {arViews > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: '#5A8A6E' }}>{arViews}</span>}
                                </div>
                              </div>
                              <div style={{ height: 5, borderRadius: 3, background: 'rgba(38,52,49,0.05)', overflow: 'hidden', display: 'flex', gap: 1 }}>
                                <div style={{ height: '100%', borderRadius: 3, background: T.warning, width: `${vPct}%`, transition: 'width 0.3s' }} />
                                {arViews > 0 && <div style={{ height: '100%', borderRadius: 3, background: '#5A8A6E', width: `${Math.max(3, Math.round((arViews / maxV) * 100))}%` }} />}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

          ) : (
            /* ═══ MENU PERFORMANCE ═══ */
            <div style={{ animation: 'fadeUp 0.2s ease' }}>
              <div style={{ ...card, padding: '20px 24px', marginBottom: 14 }}>
                <div style={secTitle}>Item Intelligence</div>
                <div style={{ fontSize: 11, color: 'rgba(38,52,49,0.4)', marginTop: 2, marginBottom: 14 }}>Performance breakdown with actionable suggestions</div>
                <div style={{ display: 'grid', gridTemplateColumns: '28px 36px 1fr 55px 55px 55px 60px 70px 150px', gap: 5, padding: '0 6px 8px', borderBottom: '1px solid rgba(38,52,49,0.06)' }}>
                  {['', '', 'Dish', 'Views', 'AR', 'Orders', 'Rev', 'Rating', 'Suggestion'].map((h, i) => (
                    <div key={i} style={{ ...labelSm, textAlign: i >= 3 && i <= 6 ? 'center' : 'left', fontSize: 9 }}>{h}</div>
                  ))}
                </div>
                {itemIntelligence.length === 0 ? <div style={{ textAlign: 'center', padding: '30px 0', color: 'rgba(38,52,49,0.3)', fontSize: 13 }}>No data</div> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {itemIntelligence.map((item, i) => (
                      <div key={item.id} className="row-hover" style={{ display: 'grid', gridTemplateColumns: '28px 36px 1fr 55px 55px 55px 60px 70px 150px', gap: 5, alignItems: 'center', padding: '7px 6px', borderRadius: 8, transition: 'background 0.12s' }}>
                        <span style={{ fontSize: 10, color: 'rgba(38,52,49,0.2)', textAlign: 'right' }}>#{i + 1}</span>
                        <div style={{ width: 32, height: 32, borderRadius: 8, overflow: 'hidden', background: T.cream }}>
                          {item.imageURL ? <img src={item.imageURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'rgba(38,52,49,0.2)' }}>—</div>}
                        </div>
                        <div style={{ overflow: 'hidden' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                          <div style={{ fontSize: 10, color: 'rgba(38,52,49,0.3)' }}>{item.category || ''}</div>
                        </div>
                        <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'rgba(38,52,49,0.6)' }}>{item.views}</div>
                        <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: T.warning }}>{item.arViews}</div>
                        <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#9B5B53' }}>{item.ordered}</div>
                        <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#5A8A6E' }}>₹{item.revenue.toFixed(0)}</div>
                        <div style={{ textAlign: 'center' }}>{item.ratingCount > 0 ? <Stars avg={item.rating} /> : <span style={{ fontSize: 10, color: 'rgba(38,52,49,0.2)' }}>—</span>}</div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: item.sColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.suggestion}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ ...card, padding: '20px 24px', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div>
                    <div style={secTitle}>Engagement Heatmap</div>
                    <div style={{ fontSize: 11, color: 'rgba(38,52,49,0.4)', marginTop: 2 }}>Score = views + (AR x2) + (rating x10)</div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'rgba(38,52,49,0.4)' }}>
                    {[[T.warning, 'Hot'], ['#5A8A6E', 'Active'], ['rgba(38,52,49,0.2)', 'Cold']].map(([c, l]) => (
                      <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />{l}</span>
                    ))}
                  </div>
                </div>
                {heatmapData.length === 0 ? <div style={{ textAlign: 'center', padding: '30px 0', color: 'rgba(38,52,49,0.3)', fontSize: 13 }}>No data</div> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {heatmapData.slice(0, 10).map((item, i) => {
                      const c = heatColor(item.score); const pct = Math.max(2, Math.round((item.score / maxScore) * 100));
                      return (
                        <div key={item.id} className="row-hover" style={{ display: 'grid', gridTemplateColumns: '28px 34px 1fr 55px 55px 55px 70px', gap: 5, alignItems: 'center', padding: '6px 6px', borderRadius: 8 }}>
                          <span style={{ fontSize: 10, color: 'rgba(38,52,49,0.2)', textAlign: 'right' }}>#{i + 1}</span>
                          <div style={{ width: 32, height: 32, borderRadius: 8, overflow: 'hidden', background: T.cream }}>
                            {item.imageURL ? <img src={item.imageURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'rgba(38,52,49,0.2)' }}>—</div>}
                          </div>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: T.ink, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                            <div style={{ height: 4, background: 'rgba(38,52,49,0.05)', borderRadius: 99, overflow: 'hidden' }}><div style={{ height: '100%', width: `${pct}%`, background: c, borderRadius: 99 }} /></div>
                          </div>
                          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(38,52,49,0.6)' }}>{(item.views || 0).toLocaleString()}</div><div style={{ fontSize: 9, color: 'rgba(38,52,49,0.3)' }}>views</div></div>
                          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 12, fontWeight: 700, color: T.warning }}>{(item.arViews || 0).toLocaleString()}</div><div style={{ fontSize: 9, color: 'rgba(38,52,49,0.3)' }}>AR</div></div>
                          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 12, fontWeight: 700, color: item.arRate >= 30 ? '#5A8A6E' : 'rgba(38,52,49,0.45)' }}>{item.arRate}%</div><div style={{ fontSize: 9, color: 'rgba(38,52,49,0.3)' }}>rate</div></div>
                          <div style={{ textAlign: 'center' }}>{(item.ratingCount || 0) > 0 ? <Stars avg={item.ratingAvg} count={item.ratingCount} /> : <span style={{ fontSize: 10, color: 'rgba(38,52,49,0.2)' }}>—</span>}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ ...card, padding: '20px 24px' }}>
                  <div style={secTitle}>Category Breakdown</div>
                  {catData.length > 0 ? (<>
                    <div style={{ marginTop: 10 }}><ResponsiveContainer width="100%" height={150}><PieChart><Pie data={catData} dataKey="views" nameKey="name" cx="50%" cy="50%" outerRadius={60} innerRadius={32} paddingAngle={3}>{catData.map((_, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}</Pie><Tooltip content={<PieTip />} /></PieChart></ResponsiveContainer></div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {catData.slice(0, 5).map((cat, i) => (
                        <div key={cat.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                          <div style={{ width: 9, height: 9, borderRadius: 2, background: CAT_COLORS[i % CAT_COLORS.length], flexShrink: 0 }} />
                          <span style={{ flex: 1, color: T.ink, fontWeight: 600 }}>{cat.name}</span>
                          <span style={{ color: 'rgba(38,52,49,0.4)', fontSize: 11 }}>{cat.items}</span>
                          <span style={{ color: T.ink, fontWeight: 700 }}>{cat.views}</span>
                        </div>
                      ))}
                    </div>
                  </>) : <div style={{ textAlign: 'center', padding: '30px 0', color: 'rgba(38,52,49,0.3)', fontSize: 13 }}>No data</div>}
                </div>
                <div style={{ ...card, padding: '20px 24px' }}>
                  <div style={secTitle}>Ratings Leaderboard</div>
                  {topRated.length === 0 ? <div style={{ textAlign: 'center', padding: '30px 0', color: 'rgba(38,52,49,0.3)', fontSize: 13 }}>No ratings</div> : (<>
                    <div style={{ ...labelSm, marginTop: 12 }}>TOP RATED</div>
                    <div style={{ marginTop: 8, marginBottom: lowRated.length > 0 ? 12 : 0 }}>
                      {topRated.map((item, i) => (
                        <div key={item.id} className="row-hover" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px', borderRadius: 8 }}>
                          <span style={{ fontSize: 10, color: 'rgba(38,52,49,0.2)', width: 14, textAlign: 'right' }}>#{i + 1}</span>
                          <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                          <Stars avg={item.ratingAvg} count={item.ratingCount} />
                        </div>
                      ))}
                    </div>
                    {lowRated.length > 0 && (<>
                      <div style={{ ...labelSm, color: '#9B5B53' }}>NEEDS ATTENTION</div>
                      <div style={{ marginTop: 8 }}>
                        {lowRated.map(item => (
                          <div key={item.id} className="row-hover" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px', borderRadius: 8 }}>
                            <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: 'rgba(38,52,49,0.5)' }}>{item.name}</span>
                            <Stars avg={item.ratingAvg} />
                          </div>
                        ))}
                      </div>
                    </>)}
                  </>)}
                </div>
              </div>
            </div>
          )}

          {/* ── Restaurant Health — bottom of page ── */}
          {!loading && (
            <div style={{
              background: `linear-gradient(135deg, ${T.shell} 0%, ${T.shellDarker} 100%)`,
              borderRadius: 16, padding: '20px 24px', marginTop: 14,
              border: '1px solid rgba(234,231,227,0.06)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.warning }}>RESTAURANT HEALTH</div>
                <div style={{ flex: 1, height: 1, background: 'rgba(234,231,227,0.08)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="32" height="32" viewBox="0 0 32 32">
                    <circle cx="16" cy="16" r="13" fill="none" stroke="rgba(234,231,227,0.1)" strokeWidth="3" />
                    <circle cx="16" cy="16" r="13" fill="none" stroke={scoreColor} strokeWidth="3"
                      strokeDasharray={`${(healthScore / 100) * 81.7} 81.7`} strokeLinecap="round" transform="rotate(-90 16 16)" />
                  </svg>
                  <span style={{ fontFamily: T.font, fontWeight: 800, fontSize: 22, color: scoreColor }}>{healthScore}</span>
                  <span style={{ fontSize: 13, color: 'rgba(234,231,227,0.5)' }}>/100</span>
                </div>
              </div>
              {/* Motivation quote */}
              {healthScore >= 70 && (
                <div style={{ marginBottom: 14, padding: '12px 16px', background: 'rgba(90,138,110,0.1)', borderRadius: 10, border: '1px solid rgba(90,138,110,0.18)' }}>
                  <div style={{ fontFamily: T.fontDisplay, fontStyle: 'italic', fontSize: 14, color: '#7AAA8E', lineHeight: 1.6 }}>
                    {healthScore >= 90 ? '"Your restaurant is performing exceptionally — keep this momentum going!"'
                      : healthScore >= 80 ? '"Great progress! Your menu and service are resonating with customers."'
                        : '"You\'re on the right track — a few tweaks and you\'ll be in the top tier!"'}
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {[
                  { label: 'VISITS → ORDERS', value: viewToOrderRate + '%', sub: 'conversion' },
                  { label: 'AR → ORDERS', value: arToOrderRate + '%', sub: 'AR conversion' },
                  { label: 'AR ENGAGEMENT', value: arRate + '%', sub: `${totalARViews} launches` },
                  { label: 'AVG RATING', value: avgRating > 0 ? `★ ${avgRating}` : '—', sub: `${activeItems.filter(i => (i.ratingCount || 0) > 0).length} rated items` },
                ].map(s => (
                  <div key={s.label} style={{ padding: '14px 16px', background: 'rgba(234,231,227,0.06)', borderRadius: 10, border: '1px solid rgba(234,231,227,0.08)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(234,231,227,0.5)', marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontFamily: T.font, fontWeight: 800, fontSize: 24, color: T.warning, lineHeight: 1 }}>{s.value}</div>
                    <div style={{ fontSize: 12, color: 'rgba(234,231,227,0.4)', marginTop: 4 }}>{s.sub}</div>
                  </div>
                ))}
              </div>
              {/* ── Needs Attention / Status ── */}
              {(() => {
                const alerts = [];
                if (zeroView.length > 0) alerts.push({ type: 'danger', text: `${zeroView.length} item${zeroView.length > 1 ? 's' : ''} with zero views: ${zeroView.map(i => i.name).join(', ')}` });
                const viewedNotBought = activeItems.filter(i => (i.views || 0) > 10).filter(i => !itemFreq[i.name] || itemFreq[i.name].qty === 0);
                if (viewedNotBought.length > 0) alerts.push({ type: 'warning', text: `${viewedNotBought.length} item${viewedNotBought.length > 1 ? 's' : ''} viewed but never ordered: ${viewedNotBought.slice(0, 3).map(i => i.name).join(', ')}` });
                if (lowRated.length > 0) alerts.push({ type: 'danger', text: `${lowRated.length} item${lowRated.length > 1 ? 's' : ''} rated below 3.5: ${lowRated.map(i => `${i.name} (${(i.ratingAvg || 0).toFixed(1)})`).join(', ')}` });
                const noRating = activeItems.filter(i => (i.ratingCount || 0) === 0);
                if (noRating.length > 0 && noRating.length < activeItems.length) alerts.push({ type: 'info', text: `${noRating.length} item${noRating.length > 1 ? 's' : ''} have no ratings yet` });

                return (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: alerts.length > 0 ? '#E8907E' : '#7AAA8E', marginBottom: 8 }}>
                      {alerts.length > 0 ? 'NEEDS ATTENTION' : 'ALL CLEAR'}
                    </div>
                    {alerts.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {alerts.map((a, i) => {
                          const colors = { danger: { bg: 'rgba(155,91,83,0.1)', border: 'rgba(155,91,83,0.18)', text: '#E8907E' }, warning: { bg: 'rgba(196,168,109,0.08)', border: 'rgba(196,168,109,0.15)', text: T.warning }, info: { bg: 'rgba(90,138,154,0.08)', border: 'rgba(90,138,154,0.12)', text: '#7ABAC8' } };
                          const c = colors[a.type] || colors.info;
                          return (
                            <div key={i} style={{ padding: '10px 14px', background: c.bg, borderRadius: 8, border: `1px solid ${c.border}` }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{a.text}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ padding: '10px 14px', background: 'rgba(90,138,110,0.08)', borderRadius: 8, border: '1px solid rgba(90,138,110,0.15)' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#7AAA8E' }}>All menu items are performing well — no issues detected</span>
                      </div>
                    )}
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