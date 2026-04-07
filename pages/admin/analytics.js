import Head from 'next/head';
import { useEffect, useState, useCallback, useRef } from 'react';
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
} from 'recharts';
import gsap from 'gsap';

/* ── Tooltip ── */
const TIP = { backgroundColor: 'rgba(38,52,49,0.92)', backdropFilter: 'blur(12px)', border: 'none', borderRadius: 8, color: T.cream, fontSize: 12, fontFamily: T.font, padding: '8px 14px' };
const TIP_L = { color: T.cream, fontWeight: 600 };
const TIP_I = { color: 'rgba(234,231,227,0.75)' };
const CAT_COLORS = ['#263431', '#C4A86D', '#635F5A', 'rgba(38,52,49,0.6)', 'rgba(196,168,109,0.7)', 'rgba(99,95,90,0.6)'];

const PieTip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ ...TIP, padding: '8px 14px' }}>
      <div style={{ color: T.cream, fontWeight: 700, fontSize: 13 }}>{payload[0].name}</div>
      <div style={{ color: 'rgba(234,231,227,0.6)', fontSize: 12, marginTop: 2 }}>{payload[0].value} views</div>
    </div>
  );
};

/* ── Animated Number Hook (GSAP) ── */
function AnimNum({ value, prefix = '', suffix = '', style = {} }) {
  const ref = useRef(null);
  const hasAnimated = useRef(false);
  const numVal = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^\d.-]/g, '')) || 0;

  useEffect(() => {
    if (!ref.current || hasAnimated.current || numVal === 0) return;
    hasAnimated.current = true;
    const obj = { v: 0 };
    gsap.to(obj, {
      v: numVal,
      duration: 0.9,
      ease: 'power2.out',
      snap: { v: 1 },
      onUpdate: () => {
        if (ref.current) ref.current.textContent = prefix + obj.v.toLocaleString('en-IN') + suffix;
      },
    });
  }, [numVal, prefix, suffix]);

  return <span ref={ref} style={style}>{prefix}{typeof value === 'number' ? value.toLocaleString('en-IN') : value}{suffix}</span>;
}

function Trend({ val }) {
  if (!val) return null;
  const up = val > 0;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20,
      background: up ? 'rgba(74,122,94,0.1)' : 'rgba(138,74,66,0.08)',
      color: up ? '#2D6A4F' : '#9B5B53', marginLeft: 6, whiteSpace: 'nowrap' }}>
      {up ? '+' : ''}{val}%
    </span>
  );
}

function Stars({ avg, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ display: 'flex', gap: 1 }}>
        {[1, 2, 3, 4, 5].map(s => (
          <span key={s} style={{ fontSize: 11, color: s <= Math.round(avg || 0) ? T.warning : 'rgba(38,52,49,0.12)' }}>★</span>
        ))}
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: T.warning }}>{(avg || 0).toFixed(1)}</span>
      {count !== undefined && <span style={{ fontSize: 10, color: T.stone }}>({count})</span>}
    </div>
  );
}

function downloadCSV(rows, filename) {
  if (!rows.length) return;
  const header = Object.keys(rows[0]).join(',');
  const body = rows.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function formatTime(secs) {
  if (!secs) return '—';
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/* ── Card wrapper ── */
const CARD = { background: T.white, borderRadius: 16, boxShadow: '0 1px 2px rgba(38,52,49,0.04), 0 6px 20px rgba(38,52,49,0.03)' };
const CARD_DARK = { background: T.ink, borderRadius: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.1), 0 6px 20px rgba(0,0,0,0.08)' };
const CARD_ALERT = (color) => ({ ...CARD, borderLeft: `3px solid ${color}` });

/* ══════════════════════════════════════════════ */
export default function AdminAnalytics() {
  const { userData } = useAuth();
  const [analytics, setAnalytics] = useState([]);
  const [prevAnal, setPrevAnal] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [todayStat, setTodayStat] = useState(null);
  const [waiterStat, setWaiterStat] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(30);
  const [tab, setTab] = useState('overview');
  const [heatPage, setHeatPage] = useState(0);
  const rid = userData?.restaurantId;
  const kpiRef = useRef(null);
  const hasEntrance = useRef(false);

  const load = useCallback(async () => {
    if (!rid) return;
    setLoading(true);
    const [anal, allAnal, items, today, waiter, allOrders] = await Promise.all([
      getAnalytics(rid, range),
      getAnalytics(rid, range * 2),
      getAllMenuItems(rid),
      getTodayAnalytics(rid),
      getWaiterCallsCount(rid, range),
      getOrders(rid),
    ]);
    setAnalytics(anal);
    setPrevAnal(allAnal.slice(0, Math.max(0, allAnal.length - range)));
    setMenuItems(items);
    setTodayStat(today);
    setWaiterStat(waiter);
    setOrders(allOrders || []);
    setLoading(false);
  }, [rid, range]);

  useEffect(() => { load(); }, [load]);

  /* GSAP staggered entrance */
  useEffect(() => {
    if (loading || hasEntrance.current || !kpiRef.current) return;
    hasEntrance.current = true;
    const cards = kpiRef.current.querySelectorAll('.kpi-card');
    if (cards.length) {
      gsap.fromTo(cards, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.07, ease: 'power2.out' });
    }
  }, [loading]);

  const sum = (arr, k) => arr.reduce((s, d) => s + (d[k] || 0), 0);
  const delta = (curr, prev) => prev === 0 ? (curr > 0 ? null : 0) : Math.round(((curr - prev) / prev) * 100);

  const totalVisits = sum(analytics, 'totalVisits');
  const uniqueVisits = sum(analytics, 'uniqueVisitors');
  const repeatVisits = sum(analytics, 'repeatVisitors');
  const prevVisits = sum(prevAnal, 'totalVisits');
  const prevUnique = sum(prevAnal, 'uniqueVisitors');

  const chartData = analytics.map(d => ({
    date: d.date?.slice(5) || '',
    visits: d.totalVisits || 0,
    unique: d.uniqueVisitors || 0,
  }));

  const activeItems = menuItems.filter(i => i.isActive !== false);
  const totalViews = activeItems.reduce((s, i) => s + (i.views || 0), 0);
  const totalARViews = activeItems.reduce((s, i) => s + (i.arViews || 0), 0);
  const arRate = totalViews > 0 ? ((totalARViews / totalViews) * 100).toFixed(1) : '0.0';
  const avgRating = (() => {
    const rated = activeItems.filter(i => (i.ratingCount || 0) > 0);
    if (!rated.length) return 0;
    return (rated.reduce((s, i) => s + (i.ratingAvg || 0), 0) / rated.length).toFixed(1);
  })();

  const heatmapData = [...activeItems]
    .map(i => ({
      ...i,
      score: (i.views || 0) + (i.arViews || 0) * 2 + (i.ratingAvg || 0) * 10,
      arRate: i.views > 0 ? Math.round(((i.arViews || 0) / i.views) * 100) : 0,
    }))
    .sort((a, b) => b.score - a.score);

  const HEAT_PER_PAGE = 25;
  const heatPages = Math.ceil(heatmapData.length / HEAT_PER_PAGE);
  const heatSlice = heatmapData.slice(heatPage * HEAT_PER_PAGE, (heatPage + 1) * HEAT_PER_PAGE);
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
  const topItems = [...activeItems].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);

  const catMap = {};
  activeItems.forEach(i => {
    const raw = i.category || 'Uncategorised';
    const cat = raw.charAt(0).toUpperCase() + raw.slice(1);
    if (!catMap[cat]) catMap[cat] = { name: cat, views: 0, items: 0 };
    catMap[cat].views += (i.views || 0) + (i.arViews || 0);
    catMap[cat].items += 1;
  });
  const catData = Object.values(catMap).sort((a, b) => b.views - a.views);

  const funnelData = [
    { label: 'Menu Visits', value: totalVisits, pct: 100, color: T.ink },
    { label: 'Item Views', value: totalViews, pct: totalVisits > 0 ? Math.round((totalViews / totalVisits) * 100) : 0, color: 'rgba(38,52,49,0.6)' },
    { label: 'AR Launches', value: totalARViews, pct: totalViews > 0 ? Math.round((totalARViews / totalViews) * 100) : 0, color: T.warning },
  ];

  // ── Orders analytics ──
  const rangeStart = new Date(Date.now() - range * 24 * 60 * 60 * 1000);
  const ordersInRange = orders.filter(o => {
    if (!o.createdAt) return true;
    const d = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000) : new Date(o.createdAt || Date.now()));
    return d >= rangeStart;
  });
  const totalOrders = ordersInRange.length;
  const totalRevenue = ordersInRange.reduce((s, o) => s + (o.total || 0), 0);
  const avgOrderValue = totalOrders > 0 ? (totalRevenue / totalOrders) : 0;
  const completedOrders = ordersInRange.filter(o => o.status === 'served').length;
  const pendingOrders = ordersInRange.filter(o => o.status === 'pending').length;

  const revByDay = {};
  ordersInRange.forEach(o => {
    const d = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000) : new Date(o.createdAt || Date.now()));
    const key = d.toISOString().slice(5, 10);
    if (!revByDay[key]) revByDay[key] = { date: key, revenue: 0, orders: 0 };
    revByDay[key].revenue += o.total || 0;
    revByDay[key].orders += 1;
  });
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
  const hourlyRevenue = Array(24).fill(0);
  ordersInRange.forEach(o => {
    const d = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000) : new Date(o.createdAt || Date.now()));
    hourlyOrders[d.getHours()] += 1;
    hourlyRevenue[d.getHours()] += o.total || 0;
  });
  const peakHourData = hourlyOrders.map((count, h) => ({
    hour: h,
    label: `${h === 0 ? 12 : h > 12 ? h - 12 : h}${h < 12 ? 'AM' : 'PM'}`,
    orders: count, revenue: hourlyRevenue[h],
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

  const exportCSV = () => {
    if (tab === 'overview') downloadCSV(chartData.map(d => ({ date: d.date, visits: d.visits, unique_visitors: d.unique })), `analytics-${range}d.csv`);
    else if (tab === 'orders') downloadCSV(revenueChartData.map(d => ({ date: d.date, revenue: d.revenue, orders: d.orders })), `orders-revenue-${range}d.csv`);
    else downloadCSV(activeItems.map(i => ({ name: i.name, category: i.category || '', views: i.views || 0, ar_views: i.arViews || 0, rating_avg: i.ratingAvg || 0, rating_count: i.ratingCount || 0 })), 'menu-performance.csv');
  };

  const todayStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const TABS = [{ id: 'overview', label: 'Overview' }, { id: 'orders', label: 'Orders & Revenue' }, { id: 'menu', label: 'Menu Performance' }];

  /* ── Render helpers ── */
  const KPI = ({ label, value, numVal, prefix, suffix, trend, color, dark }) => (
    <div className="kpi-card" style={{ ...(dark ? CARD_DARK : CARD), padding: '22px 24px', opacity: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: dark ? 'rgba(234,231,227,0.5)' : T.stone, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 10 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 4 }}>
        <AnimNum value={numVal ?? 0} prefix={prefix || ''} suffix={suffix || ''} style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 36, color: dark ? (color || T.warning) : (color || T.ink), lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }} />
        {trend !== undefined && trend !== 0 && <Trend val={trend} />}
      </div>
      {value !== undefined && <div style={{ fontSize: 12, color: dark ? 'rgba(234,231,227,0.35)' : T.stone, marginTop: 8 }}>{value}</div>}
    </div>
  );

  const SectionHead = ({ children, right }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
      <span style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 18, color: T.ink }}>{children}</span>
      {right}
    </div>
  );

  const Empty = ({ text }) => (
    <div style={{ textAlign: 'center', padding: '48px 20px', color: T.stone, fontSize: 13 }}>{text}</div>
  );

  return (
    <AdminLayout>
      <Head><title>Analytics — Advert Radical</title></Head>
      <div style={{ background: T.cream, minHeight: '100vh', fontFamily: T.font }}>
        <style>{`
          @keyframes spin { to { transform:rotate(360deg) } }
          @keyframes ripple { 0% { box-shadow: 0 0 0 0 rgba(74,122,94,0.35) } 100% { box-shadow: 0 0 0 10px rgba(74,122,94,0) } }
          .card-lift { transition: transform 0.18s cubic-bezier(0.4,0,0.2,1), box-shadow 0.18s cubic-bezier(0.4,0,0.2,1); }
          .card-lift:hover { transform: translateY(-2px); box-shadow: 0 4px 8px rgba(38,52,49,0.06), 0 16px 40px rgba(38,52,49,0.05) !important; }
          .row-h { transition: background 0.1s; }
          .row-h:hover { background: rgba(38,52,49,0.025) !important; }
          @media (max-width:1024px) {
            .kpi-grid { grid-template-columns: repeat(2, 1fr) !important; }
            .two-col { grid-template-columns: 1fr !important; }
            .heat-grid { grid-template-columns: 24px 32px 1fr 50px 50px 50px !important; }
            .heat-rate-col { display: none !important; }
          }
          @media (max-width:768px) {
            .kpi-grid { grid-template-columns: 1fr !important; }
            .five-grid { grid-template-columns: repeat(2, 1fr) !important; }
            .chart-h { height: 160px !important; }
            .an-wrap { padding: 20px 16px 40px !important; }
            .heat-grid { grid-template-columns: 20px 28px 1fr 44px 44px !important; }
            .heat-rate-col, .heat-rating-col { display: none !important; }
          }
          @media (max-width:480px) {
            .an-wrap { padding: 16px 12px 32px !important; }
            .kpi-card span[style*="font-size: 36px"], .kpi-card span[style*="fontSize"] { font-size: 28px !important; }
          }
        `}</style>

        <div className="an-wrap" style={{ maxWidth: 1100, margin: '0 auto', padding: '36px 28px 60px' }}>

          {/* ── Header ── */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 28, color: T.ink, margin: 0 }}>{getGreeting()}</h1>
              <p style={{ fontSize: 13, color: T.stone, marginTop: 5 }}>{todayStr}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ display: 'flex', background: T.white, borderRadius: 10, padding: 3, boxShadow: '0 1px 3px rgba(38,52,49,0.06)' }}>
                {[7, 30, 90].map(d => (
                  <button key={d} onClick={() => setRange(d)} style={{
                    padding: '6px 16px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', fontFamily: T.font, transition: 'all 0.15s',
                    background: range === d ? T.ink : 'transparent', color: range === d ? T.cream : T.stone,
                  }}>{d}d</button>
                ))}
              </div>
              <button onClick={exportCSV} title="Export CSV" style={{
                padding: '7px 12px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: T.font, background: T.white, color: T.stone,
                boxShadow: '0 1px 3px rgba(38,52,49,0.06)', transition: 'color 0.12s',
              }}
                onMouseOver={e => e.currentTarget.style.color = T.ink}
                onMouseOut={e => e.currentTarget.style.color = T.stone}>
                ↓
              </button>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div style={{ display: 'flex', gap: 28, borderBottom: '1px solid rgba(38,52,49,0.08)', marginBottom: 28, marginTop: 16 }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => { setTab(t.id); setHeatPage(0); }} style={{
                padding: '12px 0', fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
                color: tab === t.id ? T.ink : T.stone, border: 'none', background: 'transparent',
                cursor: 'pointer', fontFamily: T.font, marginBottom: -1, transition: 'all 0.12s',
                borderBottom: tab === t.id ? `2px solid ${T.warning}` : '2px solid transparent',
              }}>{t.label}</button>
            ))}
          </div>

          {/* ── Loading ── */}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
              <div style={{ width: 28, height: 28, border: `2.5px solid ${T.sand}`, borderTopColor: T.ink, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            </div>

          ) : tab === 'overview' ? (
            /* ══════ OVERVIEW ══════ */
            <div>
              {/* Today live */}
              {todayStat && (
                <div className="card-lift" style={{ ...CARD_ALERT(T.success), padding: '16px 24px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4A7A5E', display: 'inline-block', animation: 'ripple 1.8s infinite' }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: T.stone, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Live today</span>
                  </div>
                  {[
                    { v: todayStat.totalVisits || 0, l: 'visits' },
                    { v: todayStat.uniqueVisitors || 0, l: 'unique' },
                    { v: todayStat.repeatVisitors || 0, l: 'returning' },
                  ].map(s => (
                    <div key={s.l} style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                      <span style={{ fontFamily: T.font, fontWeight: 800, fontSize: 20, color: T.ink }}>{s.v}</span>
                      <span style={{ fontSize: 12, color: T.stone }}>{s.l}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* KPI grid */}
              <div ref={kpiRef} className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                <KPI label="Total Visits" numVal={totalVisits} trend={delta(totalVisits, prevVisits)} color="#9B5B53" />
                <KPI label="Unique Visitors" numVal={uniqueVisits} trend={delta(uniqueVisits, prevUnique)} color="#5A8A9A" />
                <KPI label="Returning" numVal={repeatVisits} value={totalVisits > 0 ? `${Math.round((repeatVisits / totalVisits) * 100)}% of total` : ''} color="#8A7A6A" />
                <KPI label="Waiter Calls" numVal={waiterStat?.total || 0} value={waiterStat ? `${waiterStat.resolved} resolved · avg ${formatTime(waiterStat.avgResponseSeconds)}` : ''} color={T.warning} dark />
              </div>

              {/* Visits chart */}
              <div className="card-lift" style={{ ...CARD, padding: '24px 28px', marginBottom: 16 }}>
                <SectionHead right={
                  <div style={{ display: 'flex', gap: 16, fontSize: 11, color: T.stone }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 16, height: 2, background: T.ink, display: 'inline-block', borderRadius: 1 }} />Total</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 16, height: 2, background: T.warning, display: 'inline-block', borderRadius: 1 }} />Unique</span>
                  </div>
                }>Visits Over Time</SectionHead>
                {chartData.length > 1 ? (
                  <div className="chart-h" style={{ height: 240 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="gVisit" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={T.ink} stopOpacity={0.1} />
                            <stop offset="95%" stopColor={T.ink} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid horizontal={true} vertical={false} stroke="rgba(38,52,49,0.04)" />
                        <XAxis dataKey="date" tick={{ fill: T.stone, fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: T.stone, fontSize: 10 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={TIP} labelStyle={TIP_L} itemStyle={TIP_I} />
                        <Area type="monotone" dataKey="visits" stroke={T.ink} strokeWidth={2} fill="url(#gVisit)" name="Total" dot={false} />
                        <Area type="monotone" dataKey="unique" stroke={T.warning} strokeWidth={1.5} fill="transparent" name="Unique" strokeDasharray="4 3" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : <Empty text="No visit data yet for this period" />}
              </div>

              {/* Funnel + Waiter */}
              <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                {/* AR Funnel — prominent */}
                <div className="card-lift" style={{ ...CARD_ALERT(T.warning), padding: 28 }}>
                  <SectionHead>AR Conversion Funnel</SectionHead>
                  {funnelData.map((f, i) => (
                    <div key={f.label} style={{ marginBottom: i < funnelData.length - 1 ? 18 : 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>{f.label}</span>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 20, color: f.color }}>{f.value.toLocaleString()}</span>
                          {i > 0 && <span style={{ fontSize: 11, color: T.stone }}>{f.pct}%</span>}
                        </div>
                      </div>
                      <div style={{ height: 6, background: 'rgba(38,52,49,0.05)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${f.pct}%`, background: f.color, borderRadius: 99, transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
                      </div>
                    </div>
                  ))}
                  <div style={{ marginTop: 20, padding: '14px 16px', background: 'rgba(196,168,109,0.06)', borderRadius: 12 }}>
                    <div style={{ fontSize: 11, color: T.stone, marginBottom: 3 }}>AR Engagement Rate</div>
                    <AnimNum value={parseFloat(arRate)} suffix="%" style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 32, color: T.warning, lineHeight: 1 }} />
                  </div>
                </div>

                {/* Waiter summary */}
                <div className="card-lift" style={{ ...CARD, padding: 28 }}>
                  <SectionHead>Waiter Calls</SectionHead>
                  {waiterStat ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {[
                        { label: 'Total calls', value: waiterStat.total, color: T.ink, sub: `in last ${range} days` },
                        { label: 'Resolved', value: waiterStat.resolved, color: '#4A7A5E', sub: `${waiterStat.total > 0 ? Math.round((waiterStat.resolved / waiterStat.total) * 100) : 0}% rate` },
                        { label: 'Avg response', value: formatTime(waiterStat.avgResponseSeconds), color: '#5A8A9A', sub: 'call to resolve' },
                      ].map(s => (
                        <div key={s.label} style={{ padding: '12px 16px', background: 'rgba(38,52,49,0.02)', borderRadius: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: T.stone }}>{s.label}</span>
                            <span style={{ fontFamily: T.font, fontWeight: 700, fontSize: 18, color: s.color }}>{s.value}</span>
                          </div>
                          <div style={{ fontSize: 11, color: T.stone, marginTop: 2 }}>{s.sub}</div>
                        </div>
                      ))}
                    </div>
                  ) : <Empty text="No waiter call data" />}
                </div>
              </div>

              {/* Top items */}
              {topItems.length > 0 && (
                <div className="card-lift" style={{ ...CARD, padding: '24px 28px' }}>
                  <SectionHead>Top Menu Items</SectionHead>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {topItems.map((item, i) => (
                      <div key={item.id} className="row-h" style={{ display: 'grid', gridTemplateColumns: '20px 32px 1fr auto auto', gap: 12, alignItems: 'center', padding: '10px 6px', borderRadius: 8 }}>
                        <span style={{ fontSize: 11, color: T.stone, textAlign: 'right' }}>{i + 1}</span>
                        <div style={{ width: 32, height: 32, borderRadius: 8, overflow: 'hidden', background: T.cream, flexShrink: 0 }}>
                          {item.imageURL ? <img src={item.imageURL} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: T.stone }}>-</div>}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 500, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                        <span style={{ fontSize: 12, color: T.stone }}>{(item.views || 0).toLocaleString()} views</span>
                        <span style={{ fontSize: 12, color: T.warning, fontWeight: 600 }}>{(item.arViews || 0).toLocaleString()} AR</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

          ) : tab === 'orders' ? (
            /* ══════ ORDERS & REVENUE ══════ */
            <div>
              <div ref={kpiRef} className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                <KPI label="Total Revenue" numVal={totalRevenue} prefix="₹" color="#4A7A5E" />
                <KPI label="Total Orders" numVal={totalOrders} value={`${completedOrders} served`} color="#9B5B53" />
                <KPI label="Avg Order Value" numVal={Math.round(avgOrderValue)} prefix="₹" color="#5A8A9A" />
                <KPI label="Pending" numVal={pendingOrders} value="awaiting action" color={T.warning} dark />
              </div>

              <div className="card-lift" style={{ ...CARD, padding: '24px 28px', marginBottom: 16 }}>
                <SectionHead>Revenue Over Time</SectionHead>
                {revenueChartData.length > 0 ? (
                  <div className="chart-h" style={{ height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={revenueChartData}>
                        <defs>
                          <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4A7A5E" stopOpacity={0.12} />
                            <stop offset="95%" stopColor="#4A7A5E" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid horizontal={true} vertical={false} stroke="rgba(38,52,49,0.04)" />
                        <XAxis dataKey="date" tick={{ fill: T.stone, fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: T.stone, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v}`} />
                        <Tooltip contentStyle={TIP} labelStyle={TIP_L} itemStyle={TIP_I} formatter={v => [`₹${v}`, '']} />
                        <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#4A7A5E" strokeWidth={2} fill="url(#gRev)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : <Empty text="No orders in this period" />}
              </div>

              <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div className="card-lift" style={{ ...CARD, padding: 24 }}>
                  <SectionHead>Daily Orders</SectionHead>
                  {revenueChartData.length > 0 ? (
                    <div className="chart-h" style={{ height: 160 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={revenueChartData} barGap={2}>
                          <CartesianGrid horizontal={true} vertical={false} stroke="rgba(38,52,49,0.04)" />
                          <XAxis dataKey="date" tick={{ fill: T.stone, fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: T.stone, fontSize: 10 }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={TIP} labelStyle={TIP_L} itemStyle={TIP_I} />
                          <Bar dataKey="orders" name="Orders" radius={[4, 4, 0, 0]} barSize={28}>
                            {revenueChartData.map((entry, idx) => {
                              const maxO = Math.max(...revenueChartData.map(r => r.orders));
                              return <Cell key={idx} fill={entry.orders === maxO ? T.ink : 'rgba(38,52,49,0.15)'} />;
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : <Empty text="No data" />}
                </div>

                <div className="card-lift" style={{ ...CARD, padding: 24 }}>
                  <SectionHead>Most Ordered</SectionHead>
                  {topOrderedItems.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {topOrderedItems.map((item, i) => {
                        const maxQ = topOrderedItems[0]?.qty || 1;
                        return (
                          <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: T.stone, width: 16, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                <span style={{ fontSize: 12, fontWeight: 500, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{item.name}</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: T.ink, flexShrink: 0 }}>{item.qty}x</span>
                              </div>
                              <div style={{ height: 3, borderRadius: 2, background: 'rgba(38,52,49,0.05)', overflow: 'hidden' }}>
                                <div style={{ height: '100%', borderRadius: 2, background: T.ink, opacity: 0.2 + (item.qty / maxQ) * 0.8, width: `${(item.qty / maxQ) * 100}%`, transition: 'width 0.5s ease' }} />
                              </div>
                            </div>
                            <span style={{ fontSize: 11, color: T.stone, flexShrink: 0 }}>₹{item.revenue.toFixed(0)}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : <Empty text="No orders yet" />}
                </div>
              </div>

              {/* Peak + Busiest */}
              <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                <div className="card-lift" style={{ ...CARD, padding: '22px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <span style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 15, color: T.ink }}>Peak Hours</span>
                    {peakHour && <span style={{ fontSize: 11, fontWeight: 700, color: T.warning, background: 'rgba(196,168,109,0.1)', padding: '3px 10px', borderRadius: 20 }}>Busiest: {peakHour.label}</span>}
                  </div>
                  {peakHourData.length === 0 ? <Empty text="No data yet" /> : (
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 110 }}>
                      {peakHourData.map(h => {
                        const maxO = Math.max(...peakHourData.map(x => x.orders));
                        const pct = maxO > 0 ? (h.orders / maxO) * 100 : 0;
                        const isPeak = h === peakHour;
                        return (
                          <div key={h.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                            <span style={{ fontSize: 9, fontWeight: 600, color: isPeak ? T.warning : T.stone }}>{h.orders}</span>
                            <div style={{ width: '100%', minHeight: 3, height: `${pct}%`, borderRadius: 3, background: isPeak ? T.ink : 'rgba(38,52,49,0.15)', transition: 'height 0.3s' }} />
                            <span style={{ fontSize: 8, color: T.stone, fontWeight: isPeak ? 700 : 400 }}>{h.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="card-lift" style={{ ...CARD, padding: '22px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <span style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 15, color: T.ink }}>Busiest Days</span>
                    {busiestDay && busiestDay.orders > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: T.warning, background: 'rgba(196,168,109,0.1)', padding: '3px 10px', borderRadius: 20 }}>Busiest: {busiestDay.day}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 110 }}>
                    {dayData.map(d => {
                      const maxD = Math.max(...dayData.map(x => x.orders));
                      const pct = maxD > 0 ? (d.orders / maxD) * 100 : 0;
                      const isBusiest = d === busiestDay;
                      return (
                        <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: isBusiest ? T.warning : T.stone }}>{d.orders}</span>
                          <div style={{ width: '100%', minHeight: 3, height: `${pct}%`, borderRadius: 4, background: isBusiest ? T.ink : 'rgba(38,52,49,0.15)', transition: 'height 0.3s' }} />
                          <span style={{ fontSize: 10, color: T.stone, fontWeight: isBusiest ? 700 : 400 }}>{d.day}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

          ) : (
            /* ══════ MENU PERFORMANCE ══════ */
            <div>
              <div className="five-grid kpi-grid" ref={kpiRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
                {[
                  { label: 'Active Items', v: activeItems.length, c: T.ink },
                  { label: 'Item Views', v: totalViews, c: '#9B5B53' },
                  { label: 'AR Launches', v: totalARViews, c: T.warning },
                  { label: 'AR Rate', v: arRate, c: '#4A7A5E', suf: '%' },
                  { label: 'Avg Rating', v: avgRating > 0 ? avgRating : 0, c: T.warning, suf: avgRating > 0 ? ' ★' : '' },
                ].map(s => (
                  <div key={s.label} className="kpi-card card-lift" style={{ ...CARD, padding: '18px 20px', opacity: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.stone, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>{s.label}</div>
                    <AnimNum value={typeof s.v === 'number' ? s.v : parseFloat(s.v) || 0} suffix={s.suf || ''} style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 26, color: s.c, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }} />
                  </div>
                ))}
              </div>

              {/* Heatmap */}
              <div className="card-lift" style={{ ...CARD, padding: '24px 28px', marginBottom: 16 }}>
                <SectionHead right={
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: T.stone }}>
                    {[[T.warning, 'Hot'], ['#5A8A6E', 'Active'], ['rgba(38,52,49,0.2)', 'Cold']].map(([c, l]) => (
                      <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: c, display: 'inline-block' }} />{l}
                      </span>
                    ))}
                  </div>
                }>Dish Engagement</SectionHead>
                <div style={{ fontSize: 11, color: T.stone, marginTop: -10, marginBottom: 16 }}>Score = views + (AR × 2) + (rating × 10)</div>

                <div className="heat-grid" style={{ display: 'grid', gridTemplateColumns: '24px 36px 1fr 60px 60px 60px 70px', gap: 8, padding: '0 8px 8px', borderBottom: '1px solid rgba(38,52,49,0.05)', marginBottom: 4 }}>
                  {['', '', 'Dish', 'Views', 'AR', 'Rate', 'Rating'].map((h, i) => (
                    <div key={i} className={i === 5 ? 'heat-rate-col' : i === 6 ? 'heat-rating-col' : ''} style={{ fontSize: 10, fontWeight: 700, color: T.stone, letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: i >= 3 ? 'center' : 'left' }}>{h}</div>
                  ))}
                </div>

                {heatmapData.length === 0 ? <Empty text="No data yet — views appear as customers browse your menu" /> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {heatSlice.map((item, i) => {
                      const c = heatColor(item.score);
                      const pct = Math.max(2, Math.round((item.score / maxScore) * 100));
                      const rank = heatPage * HEAT_PER_PAGE + i + 1;
                      return (
                        <div key={item.id} className="row-h heat-grid" style={{ display: 'grid', gridTemplateColumns: '24px 36px 1fr 60px 60px 60px 70px', gap: 8, alignItems: 'center', padding: '8px 8px', borderRadius: 8 }}>
                          <span style={{ fontSize: 11, color: T.stone, textAlign: 'right' }}>{rank}</span>
                          <div style={{ width: 34, height: 34, borderRadius: 8, overflow: 'hidden', background: T.cream }}>
                            {item.imageURL ? <img src={item.imageURL} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: T.stone }}>-</div>}
                          </div>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 500, color: T.ink, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                            <div style={{ height: 3, background: 'rgba(38,52,49,0.04)', borderRadius: 99, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: c, borderRadius: 99, transition: 'width 0.5s ease' }} />
                            </div>
                          </div>
                          <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'rgba(38,52,49,0.65)' }}>{(item.views || 0).toLocaleString()}</div>
                          <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: T.warning }}>{(item.arViews || 0).toLocaleString()}</div>
                          <div className="heat-rate-col" style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: item.arRate >= 30 ? '#4A7A5E' : T.stone }}>{item.arRate}%</div>
                          <div className="heat-rating-col" style={{ textAlign: 'center' }}>
                            {(item.ratingCount || 0) > 0 ? <Stars avg={item.ratingAvg} count={item.ratingCount} /> : <span style={{ fontSize: 11, color: 'rgba(38,52,49,0.15)' }}>—</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Pagination */}
                {heatPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 16 }}>
                    <button disabled={heatPage === 0} onClick={() => setHeatPage(p => p - 1)} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: heatPage === 0 ? 'default' : 'pointer', fontFamily: T.font, background: heatPage === 0 ? 'transparent' : T.white, color: heatPage === 0 ? T.sand : T.ink, boxShadow: heatPage === 0 ? 'none' : '0 1px 3px rgba(38,52,49,0.06)' }}>Prev</button>
                    <span style={{ fontSize: 12, color: T.stone }}>{heatPage + 1} / {heatPages}</span>
                    <button disabled={heatPage >= heatPages - 1} onClick={() => setHeatPage(p => p + 1)} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: heatPage >= heatPages - 1 ? 'default' : 'pointer', fontFamily: T.font, background: heatPage >= heatPages - 1 ? 'transparent' : T.white, color: heatPage >= heatPages - 1 ? T.sand : T.ink, boxShadow: heatPage >= heatPages - 1 ? 'none' : '0 1px 3px rgba(38,52,49,0.06)' }}>Next</button>
                  </div>
                )}
              </div>

              {/* Category + Ratings */}
              <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div className="card-lift" style={{ ...CARD, padding: 24 }}>
                  <SectionHead>Category Breakdown</SectionHead>
                  {catData.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={170}>
                        <PieChart>
                          <Pie data={catData} dataKey="views" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={76} paddingAngle={2}>
                            {catData.map((_, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
                          </Pie>
                          <Tooltip content={<PieTip />} />
                          {/* Center label */}
                          <text x="50%" y="48%" textAnchor="middle" dominantBaseline="central" style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 20, fill: T.ink }}>{catData.reduce((s, c) => s + c.views, 0).toLocaleString()}</text>
                          <text x="50%" y="60%" textAnchor="middle" dominantBaseline="central" style={{ fontFamily: T.font, fontSize: 10, fill: T.stone }}>total views</text>
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                        {catData.slice(0, 6).map((cat, i) => (
                          <div key={cat.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                            <div style={{ width: 10, height: 10, borderRadius: 3, background: CAT_COLORS[i % CAT_COLORS.length], flexShrink: 0 }} />
                            <span style={{ flex: 1, color: T.ink, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.name}</span>
                            <span style={{ color: T.stone, fontSize: 11 }}>{cat.items} items</span>
                            <span style={{ color: T.ink, fontWeight: 600 }}>{cat.views}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : <Empty text="No category data yet" />}
                </div>

                <div className="card-lift" style={{ ...CARD, padding: 24 }}>
                  <SectionHead>Ratings</SectionHead>
                  {topRated.length === 0 ? <Empty text="No ratings yet" /> : (
                    <>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.stone, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Top rated</div>
                      <div style={{ marginBottom: 16 }}>
                        {topRated.map((item, i) => (
                          <div key={item.id} className="row-h" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderRadius: 8 }}>
                            <span style={{ fontSize: 11, color: T.stone, width: 16, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                            <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                            <Stars avg={item.ratingAvg} count={item.ratingCount} />
                          </div>
                        ))}
                      </div>
                      {lowRated.length > 0 && (
                        <>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#9B5B53', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Needs attention</div>
                          {lowRated.map(item => (
                            <div key={item.id} className="row-h" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderRadius: 8 }}>
                              <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: T.stone, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                              <Stars avg={item.ratingAvg} />
                            </div>
                          ))}
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Zero-view alert */}
              {zeroView.length > 0 && (
                <div style={{ ...CARD_ALERT(T.danger), padding: '20px 24px' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#9B5B53', marginBottom: 4 }}>
                    {zeroView.length} item{zeroView.length > 1 ? 's' : ''} with zero views
                  </div>
                  <div style={{ fontSize: 12, color: T.stone, marginBottom: 12 }}>
                    Consider updating photos, categories, or deactivating unused items.
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {zeroView.slice(0, 15).map(item => (
                      <span key={item.id} style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(155,91,83,0.06)', fontSize: 12, fontWeight: 500, color: '#9B5B53' }}>
                        {item.name}
                      </span>
                    ))}
                    {zeroView.length > 15 && <span style={{ padding: '4px 10px', fontSize: 12, color: T.stone }}>+{zeroView.length - 15} more</span>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

AdminAnalytics.getLayout = (page) => page;
