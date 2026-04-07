import Head from 'next/head';
import { useEffect, useState, useCallback } from 'react';
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

/* ── Tooltip ── */
const tip = { backgroundColor: T.ink, border: 'none', borderRadius: 8, color: T.cream, fontSize: 12, fontFamily: T.font, padding: '8px 14px' };
const tipLabel = { color: T.cream, fontWeight: 600 };
const tipItem = { color: 'rgba(234,231,227,0.8)' };
const CAT_COLORS = ['#9B5B53', '#C4A86D', '#8A7A6A', '#5A8A6E', '#5A8A9A', '#9B5B53', '#7AAA8E', '#F4D070'];

const PieTip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: T.ink, borderRadius: 8, padding: '8px 14px' }}>
      <div style={{ color: T.cream, fontWeight: 700, fontSize: 13 }}>{payload[0].name}</div>
      <div style={{ color: 'rgba(234,231,227,0.65)', fontSize: 12, marginTop: 2 }}>{payload[0].value} views</div>
    </div>
  );
};

/* ── Sparkline ── */
function Spark({ data, dataKey, color, h = 36 }) {
  if (!data || data.length < 2) return null;
  return (
    <ResponsiveContainer width="100%" height={h}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`sp-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.18} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} fill={`url(#sp-${dataKey})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function Trend({ val }) {
  if (!val) return null;
  const up = val > 0;
  return <span style={{ fontSize: 12, fontWeight: 600, color: up ? '#3D7A5A' : '#9B5B53' }}>{up ? '+' : ''}{val}%</span>;
}

function Stars({ avg, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ display: 'flex', gap: 1 }}>
        {[1, 2, 3, 4, 5].map(s => (
          <span key={s} style={{ fontSize: 11, color: s <= Math.round(avg || 0) ? T.warning : 'rgba(38,52,49,0.15)' }}>★</span>
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
  const rid = userData?.restaurantId;

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

  const maxScore = heatmapData[0]?.score || 1;

  const heatColor = score => {
    const p = score / maxScore;
    if (p >= 0.7) return { bar: T.warning, bg: 'rgba(196,168,109,0.08)' };
    if (p >= 0.3) return { bar: '#5A8A6E', bg: 'rgba(90,138,110,0.07)' };
    return { bar: 'rgba(38,52,49,0.18)', bg: 'rgba(38,52,49,0.03)' };
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
    catMap[cat].views += (i.views || 0) + (i.arViews || 0);
    catMap[cat].items += 1;
  });
  const catData = Object.values(catMap).sort((a, b) => b.views - a.views);

  const funnelData = [
    { label: 'Menu Visits', value: totalVisits, pct: 100, color: '#5A8A9A' },
    { label: 'Item Views', value: totalViews, pct: totalVisits > 0 ? Math.round((totalViews / totalVisits) * 100) : 0, color: '#8A7A6A' },
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
    const hour = d.getHours();
    hourlyOrders[hour] += 1;
    hourlyRevenue[hour] += o.total || 0;
  });
  const peakHourData = hourlyOrders.map((count, h) => ({
    hour: h,
    label: `${h === 0 ? 12 : h > 12 ? h - 12 : h}${h < 12 ? 'AM' : 'PM'}`,
    orders: count,
    revenue: hourlyRevenue[h],
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
    if (tab === 'overview') {
      downloadCSV(chartData.map(d => ({ date: d.date, visits: d.visits, unique_visitors: d.unique })), `analytics-${range}d.csv`);
    } else if (tab === 'orders') {
      downloadCSV(revenueChartData.map(d => ({ date: d.date, revenue: d.revenue, orders: d.orders })), `orders-revenue-${range}d.csv`);
    } else {
      downloadCSV(activeItems.map(i => ({
        name: i.name, category: i.category || '', views: i.views || 0,
        ar_views: i.arViews || 0, rating_avg: i.ratingAvg || 0, rating_count: i.ratingCount || 0,
      })), 'menu-performance.csv');
    }
  };

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'orders', label: 'Revenue' },
    { id: 'menu', label: 'Menu' },
  ];

  /* ── Cell style helper ── */
  const cell = (span = 1, bg = 'transparent') => ({
    gridColumn: `span ${span}`,
    background: bg,
    borderRadius: 16,
    padding: '24px 28px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: 0,
  });

  return (
    <AdminLayout>
      <Head><title>Analytics — Advert Radical</title></Head>
      <div style={{ background: T.cream, minHeight: '100vh', fontFamily: T.font }}>
        <style>{`
          @keyframes spin { to { transform:rotate(360deg) } }
          @keyframes fadeIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:none } }
          @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }
          .bento-cell { transition: transform 0.15s, box-shadow 0.15s; }
          .bento-cell:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(38,52,49,0.08) !important; }
          .row-h:hover { background: rgba(38,52,49,0.03) !important; }
        `}</style>

        <div style={{ maxWidth: 1060, margin: '0 auto', padding: '32px 28px 60px' }}>

          {/* ── Header ── */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 28, color: T.ink, margin: 0, lineHeight: 1.1 }}>
                {getGreeting()}
              </h1>
              <p style={{ fontSize: 13, color: T.stone, marginTop: 6, fontWeight: 400 }}>{today}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {[7, 30, 90].map(d => (
                <button key={d} onClick={() => setRange(d)} style={{
                  padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: T.font, transition: 'all 0.12s',
                  background: range === d ? T.ink : 'transparent',
                  color: range === d ? T.cream : T.stone,
                }}>
                  {d}d
                </button>
              ))}
              <button onClick={exportCSV} style={{
                padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 500,
                cursor: 'pointer', fontFamily: T.font, background: 'transparent', color: T.stone,
                transition: 'color 0.12s',
              }}
                onMouseOver={e => e.currentTarget.style.color = T.ink}
                onMouseOut={e => e.currentTarget.style.color = T.stone}>
                Export ↓
              </button>
            </div>
          </div>

          {/* ── Tabs — underline ── */}
          <div style={{ display: 'flex', gap: 28, borderBottom: '1px solid rgba(38,52,49,0.08)', marginBottom: 28 }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: '12px 0', fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
                color: tab === t.id ? T.ink : T.stone, border: 'none', background: 'transparent',
                cursor: 'pointer', fontFamily: T.font,
                borderBottom: tab === t.id ? `2px solid ${T.ink}` : '2px solid transparent',
                marginBottom: -1, transition: 'all 0.12s',
              }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Spinner ── */}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
              <div style={{ width: 28, height: 28, border: `2.5px solid ${T.sand}`, borderTopColor: T.ink, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            </div>

          ) : tab === 'overview' ? (
            /* ══════════ OVERVIEW ══════════ */
            <div style={{ animation: 'fadeIn 0.3s ease' }}>

              {/* Bento grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>

                {/* Hero — Total Visits (span 2) */}
                <div className="bento-cell" style={{ ...cell(2, T.white), minHeight: 170, boxShadow: '0 1px 3px rgba(38,52,49,0.04)' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: T.stone, letterSpacing: '0.03em', marginBottom: 12 }}>Total Visits</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <span style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 52, color: T.ink, lineHeight: 1, letterSpacing: '-1px' }}>
                        {totalVisits.toLocaleString()}
                      </span>
                      <Trend val={delta(totalVisits, prevVisits)} />
                    </div>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <Spark data={chartData} dataKey="visits" color="#9B5B53" h={44} />
                  </div>
                </div>

                {/* Unique Visitors */}
                <div className="bento-cell" style={{ ...cell(1, T.white), boxShadow: '0 1px 3px rgba(38,52,49,0.04)' }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: T.stone, letterSpacing: '0.03em', marginBottom: 10 }}>Unique</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 34, color: T.ink, lineHeight: 1 }}>
                      {uniqueVisits.toLocaleString()}
                    </span>
                    <Trend val={delta(uniqueVisits, prevUnique)} />
                  </div>
                  <div style={{ marginTop: 'auto', paddingTop: 12 }}>
                    <Spark data={chartData} dataKey="unique" color="#5A8A9A" h={32} />
                  </div>
                </div>

                {/* Returning */}
                <div className="bento-cell" style={{ ...cell(1, T.white), boxShadow: '0 1px 3px rgba(38,52,49,0.04)' }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: T.stone, letterSpacing: '0.03em', marginBottom: 10 }}>Returning</div>
                  <span style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 34, color: T.ink, lineHeight: 1 }}>
                    {repeatVisits.toLocaleString()}
                  </span>
                  <div style={{ fontSize: 12, color: T.stone, marginTop: 'auto', paddingTop: 12 }}>
                    {totalVisits > 0 ? Math.round((repeatVisits / totalVisits) * 100) : 0}% of total
                  </div>
                </div>

                {/* Waiter Calls */}
                <div className="bento-cell" style={{ ...cell(1, T.ink), boxShadow: '0 1px 3px rgba(38,52,49,0.04)' }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(234,231,227,0.55)', letterSpacing: '0.03em', marginBottom: 10 }}>Waiter Calls</div>
                  <span style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 34, color: T.warning, lineHeight: 1 }}>
                    {waiterStat?.total || 0}
                  </span>
                  {waiterStat && (
                    <div style={{ fontSize: 11, color: 'rgba(234,231,227,0.45)', marginTop: 'auto', paddingTop: 10 }}>
                      {waiterStat.resolved} resolved · avg {formatTime(waiterStat.avgResponseSeconds)}
                    </div>
                  )}
                </div>

                {/* AR Rate */}
                <div className="bento-cell" style={{ ...cell(1, 'rgba(196,168,109,0.08)'), border: '1px solid rgba(196,168,109,0.15)' }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: T.stone, letterSpacing: '0.03em', marginBottom: 10 }}>AR Rate</div>
                  <span style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 34, color: '#8A6A30', lineHeight: 1 }}>
                    {arRate}%
                  </span>
                  <div style={{ fontSize: 11, color: T.stone, marginTop: 'auto', paddingTop: 8 }}>of views launch AR</div>
                </div>

                {/* Live Now (span 2) */}
                {todayStat && (
                  <div className="bento-cell" style={{ ...cell(2, T.white), flexDirection: 'row', alignItems: 'center', gap: 28, flexWrap: 'wrap', boxShadow: '0 1px 3px rgba(38,52,49,0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#5A8A6E', display: 'inline-block', animation: 'pulse 2s infinite', boxShadow: '0 0 8px rgba(90,138,110,0.4)' }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.stone, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Live now</span>
                    </div>
                    {[
                      { v: todayStat.totalVisits || 0, l: 'visits' },
                      { v: todayStat.uniqueVisitors || 0, l: 'unique' },
                      { v: todayStat.repeatVisitors || 0, l: 'returning' },
                    ].map(s => (
                      <div key={s.l} style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                        <span style={{ fontFamily: T.font, fontWeight: 800, fontSize: 22, color: T.ink }}>{s.v}</span>
                        <span style={{ fontSize: 12, color: T.stone }}>{s.l}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Avg Rating */}
                <div className="bento-cell" style={{ ...cell(1, T.white), boxShadow: '0 1px 3px rgba(38,52,49,0.04)' }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: T.stone, letterSpacing: '0.03em', marginBottom: 10 }}>Avg Rating</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 28, color: T.ink, lineHeight: 1 }}>
                      {avgRating > 0 ? avgRating : '—'}
                    </span>
                    {avgRating > 0 && <span style={{ fontSize: 16, color: T.warning }}>★</span>}
                  </div>
                </div>
              </div>

              {/* ── Visits chart (no card wrapper) ── */}
              <div style={{ marginBottom: 32, marginTop: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>Visits over time</span>
                  <div style={{ display: 'flex', gap: 14, fontSize: 11, color: T.stone }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 16, height: 2, background: '#9B5B53', display: 'inline-block', borderRadius: 1 }} />Total</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 16, height: 2, background: '#7AAA8E', display: 'inline-block', borderRadius: 1, opacity: 0.7 }} />Unique</span>
                  </div>
                </div>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#9B5B53" stopOpacity={0.12} />
                          <stop offset="95%" stopColor="#9B5B53" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(38,52,49,0.04)" />
                      <XAxis dataKey="date" tick={{ fill: T.stone, fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: T.stone, fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tip} labelStyle={tipLabel} itemStyle={tipItem} />
                      <Area type="monotone" dataKey="visits" stroke="#9B5B53" strokeWidth={2} fill="url(#g1)" name="Total" dot={false} />
                      <Area type="monotone" dataKey="unique" stroke="#7AAA8E" strokeWidth={1.5} fill="transparent" name="Unique" strokeDasharray="4 3" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.stone, fontSize: 13 }}>No visit data yet</div>
                )}
              </div>

              {/* ── Funnel + Waiter ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div style={{ background: T.white, borderRadius: 16, padding: 28, boxShadow: '0 1px 3px rgba(38,52,49,0.04)' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, marginBottom: 20 }}>AR Conversion Funnel</div>
                  {funnelData.map((f, i) => (
                    <div key={f.label} style={{ marginBottom: i < funnelData.length - 1 ? 16 : 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: T.stone }}>{f.label}</span>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 16, color: f.color }}>{f.value.toLocaleString()}</span>
                          {i > 0 && <span style={{ fontSize: 11, color: T.stone }}>{f.pct}%</span>}
                        </div>
                      </div>
                      <div style={{ height: 6, background: 'rgba(38,52,49,0.05)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${f.pct}%`, background: f.color, borderRadius: 99, transition: 'width 0.6s ease' }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ background: T.white, borderRadius: 16, padding: 28, boxShadow: '0 1px 3px rgba(38,52,49,0.04)' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, marginBottom: 20 }}>Waiter Calls</div>
                  {waiterStat ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {[
                        { label: 'Total calls', value: waiterStat.total, color: T.ink, sub: `in last ${range} days` },
                        { label: 'Resolved', value: waiterStat.resolved, color: '#5A8A6E', sub: `${waiterStat.total > 0 ? Math.round((waiterStat.resolved / waiterStat.total) * 100) : 0}% rate` },
                        { label: 'Avg response', value: formatTime(waiterStat.avgResponseSeconds), color: '#5A8A9A', sub: 'call to resolve' },
                      ].map(s => (
                        <div key={s.label} style={{ padding: '12px 16px', background: 'rgba(38,52,49,0.02)', borderRadius: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: T.stone }}>{s.label}</span>
                            <span style={{ fontWeight: 700, fontSize: 18, color: s.color }}>{s.value}</span>
                          </div>
                          <div style={{ fontSize: 11, color: T.stone, marginTop: 2 }}>{s.sub}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: T.stone, fontSize: 13 }}>No waiter call data</div>
                  )}
                </div>
              </div>

              {/* ── Top items ── */}
              {topItems.length > 0 && (
                <div style={{ background: T.white, borderRadius: 16, padding: 28, boxShadow: '0 1px 3px rgba(38,52,49,0.04)' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, marginBottom: 16 }}>Top Menu Items</div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {topItems.map((item, i) => (
                      <div key={item.id} className="row-h" style={{ display: 'grid', gridTemplateColumns: '24px 32px 1fr auto auto', gap: 12, alignItems: 'center', padding: '10px 6px', borderRadius: 8, transition: 'background 0.1s' }}>
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
            /* ══════════ ORDERS & REVENUE ══════════ */
            <div style={{ animation: 'fadeIn 0.3s ease' }}>

              {/* Bento grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                {/* Hero — Revenue (span 2) */}
                <div className="bento-cell" style={{ ...cell(2, T.white), minHeight: 150, boxShadow: '0 1px 3px rgba(38,52,49,0.04)' }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: T.stone, letterSpacing: '0.03em', marginBottom: 12 }}>Total Revenue</div>
                  <span style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 48, color: T.ink, lineHeight: 1, letterSpacing: '-1px' }}>
                    <span style={{ fontFamily: T.font }}>₹</span>{totalRevenue.toLocaleString('en-IN')}
                  </span>
                  <div style={{ marginTop: 12 }}>
                    <Spark data={revenueChartData} dataKey="revenue" color="#5A8A6E" h={36} />
                  </div>
                </div>

                <div className="bento-cell" style={{ ...cell(1, T.white), boxShadow: '0 1px 3px rgba(38,52,49,0.04)' }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: T.stone, letterSpacing: '0.03em', marginBottom: 10 }}>Orders</div>
                  <span style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 34, color: T.ink, lineHeight: 1 }}>{totalOrders}</span>
                  <div style={{ fontSize: 11, color: T.stone, marginTop: 'auto', paddingTop: 8 }}>{completedOrders} served</div>
                </div>

                <div className="bento-cell" style={{ ...cell(1, T.ink), boxShadow: '0 1px 3px rgba(38,52,49,0.04)' }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(234,231,227,0.55)', letterSpacing: '0.03em', marginBottom: 10 }}>Avg Value</div>
                  <span style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 30, color: T.warning, lineHeight: 1 }}>
                    <span style={{ fontFamily: T.font, fontSize: 20 }}>₹</span>{avgOrderValue.toFixed(0)}
                  </span>
                  <div style={{ fontSize: 11, color: 'rgba(234,231,227,0.4)', marginTop: 'auto', paddingTop: 8 }}>{pendingOrders} pending</div>
                </div>
              </div>

              {/* Revenue chart */}
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, marginBottom: 16 }}>Revenue over time</div>
                {revenueChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={revenueChartData}>
                      <defs>
                        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#5A8A6E" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#5A8A6E" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(38,52,49,0.04)" />
                      <XAxis dataKey="date" tick={{ fill: T.stone, fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: T.stone, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v}`} />
                      <Tooltip contentStyle={tip} labelStyle={tipLabel} itemStyle={tipItem} formatter={v => [`₹${v}`, '']} />
                      <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#5A8A6E" strokeWidth={2} fill="url(#revGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.stone, fontSize: 13 }}>No orders in this period</div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                {/* Orders per day */}
                <div style={{ background: T.white, borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(38,52,49,0.04)' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, marginBottom: 16 }}>Daily orders</div>
                  {revenueChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={140}>
                      <BarChart data={revenueChartData} barGap={2}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(38,52,49,0.04)" />
                        <XAxis dataKey="date" tick={{ fill: T.stone, fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: T.stone, fontSize: 10 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={tip} labelStyle={tipLabel} itemStyle={tipItem} />
                        <Bar dataKey="orders" name="Orders" fill="#9B5B53" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <div style={{ textAlign: 'center', padding: '40px 0', color: T.stone, fontSize: 13 }}>No data</div>}
                </div>

                {/* Most ordered */}
                <div style={{ background: T.white, borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(38,52,49,0.04)' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, marginBottom: 16 }}>Most ordered</div>
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
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#9B5B53', flexShrink: 0 }}>{item.qty}x</span>
                              </div>
                              <div style={{ height: 3, borderRadius: 2, background: 'rgba(38,52,49,0.05)', overflow: 'hidden' }}>
                                <div style={{ height: '100%', borderRadius: 2, background: '#9B5B53', width: `${(item.qty / maxQ) * 100}%`, transition: 'width 0.5s ease' }} />
                              </div>
                            </div>
                            <span style={{ fontSize: 11, color: T.stone, flexShrink: 0 }}>₹{item.revenue.toFixed(0)}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : <div style={{ textAlign: 'center', padding: '40px 0', color: T.stone, fontSize: 13 }}>No orders yet</div>}
                </div>
              </div>

              {/* Peak Hours & Busiest Day */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                <div style={{ background: T.white, borderRadius: 16, padding: '22px 24px', boxShadow: '0 1px 3px rgba(38,52,49,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>Peak hours</span>
                    {peakHour && <span style={{ fontSize: 11, fontWeight: 600, color: '#9B5B53' }}>Busiest: {peakHour.label}</span>}
                  </div>
                  {peakHourData.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: T.stone, fontSize: 13 }}>No data yet</div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 100 }}>
                      {peakHourData.map(h => {
                        const maxO = Math.max(...peakHourData.map(x => x.orders));
                        const pct = maxO > 0 ? (h.orders / maxO) * 100 : 0;
                        const isPeak = h === peakHour;
                        return (
                          <div key={h.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                            <span style={{ fontSize: 9, fontWeight: 600, color: isPeak ? '#9B5B53' : T.stone }}>{h.orders}</span>
                            <div style={{ width: '100%', minHeight: 3, height: `${pct}%`, borderRadius: 3, background: isPeak ? '#9B5B53' : T.warning, opacity: isPeak ? 1 : 0.5, transition: 'height 0.3s' }} />
                            <span style={{ fontSize: 8, color: T.stone, fontWeight: isPeak ? 700 : 400 }}>{h.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div style={{ background: T.white, borderRadius: 16, padding: '22px 24px', boxShadow: '0 1px 3px rgba(38,52,49,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>Busiest days</span>
                    {busiestDay && busiestDay.orders > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: '#5A8A6E' }}>Busiest: {busiestDay.day}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 100 }}>
                    {dayData.map(d => {
                      const maxD = Math.max(...dayData.map(x => x.orders));
                      const pct = maxD > 0 ? (d.orders / maxD) * 100 : 0;
                      const isBusiest = d === busiestDay;
                      return (
                        <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: isBusiest ? '#5A8A6E' : T.stone }}>{d.orders}</span>
                          <div style={{ width: '100%', minHeight: 3, height: `${pct}%`, borderRadius: 4, background: '#5A8A6E', opacity: isBusiest ? 1 : 0.4, transition: 'height 0.3s' }} />
                          <span style={{ fontSize: 10, color: T.stone, fontWeight: isBusiest ? 700 : 400 }}>{d.day}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

          ) : (
            /* ══════════ MENU PERFORMANCE ══════════ */
            <div style={{ animation: 'fadeIn 0.3s ease' }}>

              {/* Bento KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
                {[
                  { label: 'Active Items', value: activeItems.length, color: T.ink },
                  { label: 'Item Views', value: totalViews.toLocaleString(), color: '#9B5B53' },
                  { label: 'AR Launches', value: totalARViews.toLocaleString(), color: T.warning },
                  { label: 'AR Rate', value: arRate + '%', color: '#5A8A6E' },
                  { label: 'Avg Rating', value: avgRating > 0 ? `${avgRating} ★` : '—', color: T.warning },
                ].map(s => (
                  <div key={s.label} className="bento-cell" style={{ background: T.white, borderRadius: 14, padding: '20px 22px', boxShadow: '0 1px 3px rgba(38,52,49,0.04)' }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: T.stone, letterSpacing: '0.03em', marginBottom: 8 }}>{s.label}</div>
                    <span style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 24, color: s.color, lineHeight: 1 }}>{s.value}</span>
                  </div>
                ))}
              </div>

              {/* Heatmap */}
              <div style={{ background: T.white, borderRadius: 16, padding: 28, marginBottom: 16, boxShadow: '0 1px 3px rgba(38,52,49,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>Dish Engagement</div>
                    <div style={{ fontSize: 11, color: T.stone, marginTop: 3 }}>Score = views + (AR × 2) + (rating × 10)</div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: T.stone }}>
                    {[[T.warning, 'Hot'], ['#5A8A6E', 'Active'], ['rgba(38,52,49,0.2)', 'Cold']].map(([c, l]) => (
                      <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: c, display: 'inline-block' }} />{l}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '24px 36px 1fr 60px 60px 60px 70px', gap: 8, padding: '0 8px 8px', borderBottom: '1px solid rgba(38,52,49,0.05)', marginBottom: 4 }}>
                  {['', '', 'Dish', 'Views', 'AR', 'Rate', 'Rating'].map((h, i) => (
                    <div key={i} style={{ fontSize: 10, fontWeight: 600, color: T.stone, letterSpacing: '0.05em', textTransform: 'uppercase', textAlign: i >= 3 ? 'center' : 'left' }}>{h}</div>
                  ))}
                </div>

                {heatmapData.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: T.stone, fontSize: 13 }}>No data yet</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {heatmapData.map((item, i) => {
                      const c = heatColor(item.score);
                      const pct = Math.max(2, Math.round((item.score / maxScore) * 100));
                      return (
                        <div key={item.id} className="row-h" style={{ display: 'grid', gridTemplateColumns: '24px 36px 1fr 60px 60px 60px 70px', gap: 8, alignItems: 'center', padding: '8px 8px', borderRadius: 8, transition: 'background 0.1s' }}>
                          <span style={{ fontSize: 11, color: T.stone, textAlign: 'right' }}>{i + 1}</span>
                          <div style={{ width: 34, height: 34, borderRadius: 8, overflow: 'hidden', background: T.cream }}>
                            {item.imageURL ? <img src={item.imageURL} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: T.stone }}>-</div>}
                          </div>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 500, color: T.ink, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                            <div style={{ height: 4, background: 'rgba(38,52,49,0.05)', borderRadius: 99, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: c.bar, borderRadius: 99, transition: 'width 0.5s ease' }} />
                            </div>
                          </div>
                          <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'rgba(38,52,49,0.65)' }}>{(item.views || 0).toLocaleString()}</div>
                          <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: T.warning }}>{(item.arViews || 0).toLocaleString()}</div>
                          <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: item.arRate >= 30 ? '#5A8A6E' : T.stone }}>{item.arRate}%</div>
                          <div style={{ textAlign: 'center' }}>
                            {(item.ratingCount || 0) > 0 ? <Stars avg={item.ratingAvg} count={item.ratingCount} /> : <span style={{ fontSize: 11, color: 'rgba(38,52,49,0.2)' }}>—</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Category + Ratings */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div style={{ background: T.white, borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(38,52,49,0.04)' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, marginBottom: 16 }}>Category breakdown</div>
                  {catData.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                          <Pie data={catData} dataKey="views" nameKey="name" cx="50%" cy="50%" outerRadius={68} paddingAngle={3}>
                            {catData.map((_, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
                          </Pie>
                          <Tooltip content={<PieTip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
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
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: T.stone, fontSize: 13 }}>No data yet</div>
                  )}
                </div>

                <div style={{ background: T.white, borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(38,52,49,0.04)' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, marginBottom: 16 }}>Ratings</div>
                  {topRated.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: T.stone, fontSize: 13 }}>No ratings yet</div>
                  ) : (
                    <>
                      <div style={{ fontSize: 10, fontWeight: 600, color: T.stone, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Top rated</div>
                      <div style={{ marginBottom: 16 }}>
                        {topRated.map((item, i) => (
                          <div key={item.id} className="row-h" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderRadius: 8, transition: 'background 0.1s' }}>
                            <span style={{ fontSize: 11, color: T.stone, width: 16, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                            <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                            <Stars avg={item.ratingAvg} count={item.ratingCount} />
                          </div>
                        ))}
                      </div>
                      {lowRated.length > 0 && (
                        <>
                          <div style={{ fontSize: 10, fontWeight: 600, color: '#9B5B53', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Needs attention</div>
                          {lowRated.map(item => (
                            <div key={item.id} className="row-h" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderRadius: 8, transition: 'background 0.1s' }}>
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
                <div style={{ padding: '20px 24px', borderRadius: 14, border: '1px solid rgba(155,91,83,0.15)', background: 'rgba(155,91,83,0.03)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#9B5B53', marginBottom: 4 }}>
                    {zeroView.length} item{zeroView.length > 1 ? 's' : ''} with zero views
                  </div>
                  <div style={{ fontSize: 12, color: T.stone, marginBottom: 12 }}>
                    Consider updating photos, categories, or deactivating unused items.
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {zeroView.map(item => (
                      <span key={item.id} style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(155,91,83,0.06)', fontSize: 12, fontWeight: 500, color: '#9B5B53' }}>
                        {item.name}
                      </span>
                    ))}
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
