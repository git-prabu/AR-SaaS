import Head from 'next/head';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import {
  getAnalytics, getTodayAnalytics, getAllMenuItems,
  getWaiterCallsCount, getOrders,
} from '../../lib/db';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie,
} from 'recharts';

/* ── Design tokens ── */
const S = {
  card: { background: '#FFFFFF', border: '1px solid rgba(42,31,16,0.07)', borderRadius: 20, boxShadow: '0 2px 14px rgba(42,31,16,0.05)' },
  h1: { fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 22, color: '#1E1B18', margin: 0 },
  sub: { fontSize: 13, color: 'rgba(42,31,16,0.45)', marginTop: 4 },
  label: { fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(42,31,16,0.38)' },
};
const tip = { backgroundColor: '#1E1B18', border: 'none', borderRadius: 10, color: '#FFF5E8', fontSize: 12, fontFamily: 'Inter,sans-serif', padding: '8px 14px' };
const tipLabel = { color: '#FFF5E8', fontWeight: 600 };
const tipItem = { color: 'rgba(255,245,232,0.8)' };
const CAT_COLORS = ['#E05A3A', '#F79B3D', '#8A70B0', '#5A9A78', '#4A80C0', '#C04A28', '#8FC4A8', '#F4D070'];

const PieTip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1E1B18', borderRadius: 10, padding: '8px 14px' }}>
      <div style={{ color: '#FFF5E8', fontWeight: 700, fontSize: 13 }}>{payload[0].name}</div>
      <div style={{ color: 'rgba(255,245,232,0.65)', fontSize: 12, marginTop: 2 }}>{payload[0].value} views</div>
    </div>
  );
};

function Trend({ val }) {
  if (!val) return <span style={{ fontSize: 10, color: 'rgba(42,31,16,0.3)', padding: '2px 7px', borderRadius: 20, background: 'rgba(42,31,16,0.05)' }}>—</span>;
  const up = val > 0;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: up ? 'rgba(90,154,120,0.12)' : 'rgba(224,90,58,0.1)', color: up ? '#1A6040' : '#C04A28' }}>
      {up ? '▲' : '▼'} {Math.abs(val)}%
    </span>
  );
}

function Stars({ avg, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ display: 'flex', gap: 1 }}>
        {[1, 2, 3, 4, 5].map(s => (
          <span key={s} style={{ fontSize: 11, color: s <= Math.round(avg || 0) ? '#F79B3D' : 'rgba(42,31,16,0.15)' }}>★</span>
        ))}
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#F79B3D' }}>{(avg || 0).toFixed(1)}</span>
      {count !== undefined && <span style={{ fontSize: 10, color: 'rgba(42,31,16,0.35)' }}>({count})</span>}
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
    // allAnal is sorted oldest→newest. Current period = last N items, previous = the ones before that
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
    if (p >= 0.7) return { bar: '#F79B3D', bg: 'rgba(247,155,61,0.08)' };
    if (p >= 0.3) return { bar: '#5A9A78', bg: 'rgba(90,154,120,0.07)' };
    return { bar: 'rgba(42,31,16,0.18)', bg: 'rgba(42,31,16,0.03)' };
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
    { label: 'Menu Visits', value: totalVisits, pct: 100, color: '#4A80C0' },
    { label: 'Item Views', value: totalViews, pct: totalVisits > 0 ? Math.round((totalViews / totalVisits) * 100) : 0, color: '#8A70B0' },
    { label: 'AR Launches', value: totalARViews, pct: totalViews > 0 ? Math.round((totalARViews / totalViews) * 100) : 0, color: '#F79B3D' },
  ];

  // ── Orders analytics ──────────────────────────────────────────────
  // Filter to orders within selected range
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

  // Revenue by day chart
  const revByDay = {};
  ordersInRange.forEach(o => {
    const d = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000) : new Date(o.createdAt || Date.now()));
    const key = d.toISOString().slice(5, 10); // MM-DD
    if (!revByDay[key]) revByDay[key] = { date: key, revenue: 0, orders: 0 };
    revByDay[key].revenue += o.total || 0;
    revByDay[key].orders += 1;
  });
  const revenueChartData = Object.values(revByDay).sort((a, b) => a.date.localeCompare(b.date));

  // Top items by order frequency
  const itemFreq = {};
  ordersInRange.forEach(o => {
    (o.items || []).forEach(item => {
      if (!itemFreq[item.name]) itemFreq[item.name] = { name: item.name, qty: 0, revenue: 0 };
      itemFreq[item.name].qty += item.qty || 1;
      itemFreq[item.name].revenue += (item.price || 0) * (item.qty || 1);
    });
  });
  const topOrderedItems = Object.values(itemFreq).sort((a, b) => b.qty - a.qty).slice(0, 8);

  // Peak hours analysis
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

  // Day of week analysis
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

  return (
    <AdminLayout>
      <Head><title>Analytics — Advert Radical</title></Head>
      <div style={{ background: '#F2F0EC', minHeight: '100vh', padding: 32 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', fontFamily: 'Inter,sans-serif' }}>
          <style>{`
            @keyframes spin  { to { transform:rotate(360deg) } }
            @keyframes fadeUp{ from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
            @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
            .row-hover:hover { background:rgba(247,155,61,0.05) !important; }
          `}</style>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={S.h1}>Analytics</h1>
              <p style={S.sub}>Customer engagement, menu performance and AR insights</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {[7, 30, 90].map(d => (
                <button key={d} onClick={() => setRange(d)} style={{ padding: '8px 18px', borderRadius: 30, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif', transition: 'all 0.15s', background: range === d ? '#1E1B18' : '#fff', color: range === d ? '#FFF5E8' : 'rgba(42,31,16,0.55)', boxShadow: range === d ? '0 2px 8px rgba(30,27,24,0.2)' : '0 1px 4px rgba(42,31,16,0.06)' }}>
                  {d}d
                </button>
              ))}
              <button onClick={exportCSV} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, border: '1px solid rgba(42,31,16,0.1)', background: '#fff', color: 'rgba(42,31,16,0.6)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif', transition: 'all 0.15s' }}
                onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(42,31,16,0.2)'; e.currentTarget.style.color = '#1E1B18'; }}
                onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(42,31,16,0.1)'; e.currentTarget.style.color = 'rgba(42,31,16,0.6)'; }}>
                ↓ Export CSV
              </button>
            </div>
          </div>

          {/* Today live */}
          {todayStat && (
            <div style={{ ...S.card, padding: '16px 24px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap', borderLeft: '4px solid #F79B3D' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4CD964', display: 'inline-block', animation: 'pulse 1.8s infinite' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(42,31,16,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Today Live</span>
              </div>
              {[
                { label: 'Visits', value: todayStat.totalVisits || 0 },
                { label: 'Unique', value: todayStat.uniqueVisitors || 0 },
                { label: 'Returning', value: todayStat.repeatVisitors || 0 },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                  <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 22, color: '#1E1B18' }}>{s.value}</span>
                  <span style={{ fontSize: 12, color: 'rgba(42,31,16,0.45)' }}>{s.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            {[['overview', '📊 Overview'], ['orders', '🛒 Orders & Revenue'], ['menu', '🔥 Menu Performance']].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} style={{ padding: '10px 22px', borderRadius: 30, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif', transition: 'all 0.15s', background: tab === id ? '#1E1B18' : '#fff', color: tab === id ? '#FFF5E8' : 'rgba(42,31,16,0.55)', boxShadow: tab === id ? '0 2px 8px rgba(30,27,24,0.18)' : '0 1px 4px rgba(42,31,16,0.06)' }}>
                {label}
              </button>
            ))}
          </div>

          {/* Spinner */}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 240 }}>
              <div style={{ width: 32, height: 32, border: '3px solid #E05A3A', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>

          ) : tab === 'orders' ? (
            /* ══ ORDERS & REVENUE ══ */
            <div style={{ animation: 'fadeUp 0.25s ease' }}>
              {/* KPI row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
                {[
                  { label: 'Total Orders', value: totalOrders, icon: '🛒', accent: '#E05A3A', bg: 'rgba(224,90,58,0.07)' },
                  { label: 'Total Revenue', value: `₹${totalRevenue.toLocaleString('en-IN')}`, icon: '💰', accent: '#2D8B4E', bg: 'rgba(45,139,78,0.08)' },
                  { label: 'Avg Order Value', value: `₹${avgOrderValue.toFixed(0)}`, icon: '📊', accent: '#4A80C0', bg: 'rgba(74,128,192,0.08)' },
                  { label: 'Pending Orders', value: pendingOrders, icon: '⏳', accent: '#F79B3D', bg: 'rgba(247,155,61,0.1)' },
                ].map(s => (
                  <div key={s.label} style={{ ...S.card, padding: 22, background: s.bg }}>
                    <div style={{ fontSize: 20, marginBottom: 10 }}>{s.icon}</div>
                    <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 28, color: s.accent, lineHeight: 1, marginBottom: 4 }}>{typeof s.value === 'number' ? s.value.toLocaleString() : s.value}</div>
                    <div style={{ fontSize: 11, color: 'rgba(42,31,16,0.5)', fontWeight: 500 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Revenue chart */}
              <div style={{ ...S.card, padding: 28, marginBottom: 16 }}>
                <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 15, color: '#1E1B18', marginBottom: 20 }}>Revenue Over Time</div>
                {revenueChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={revenueChartData}>
                      <defs>
                        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2D8B4E" stopOpacity={0.18} />
                          <stop offset="95%" stopColor="#2D8B4E" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,31,16,0.05)" />
                      <XAxis dataKey="date" tick={{ fill: 'rgba(42,31,16,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'rgba(42,31,16,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v}`} />
                      <Tooltip contentStyle={tip} labelStyle={tipLabel} itemStyle={tipItem} formatter={v => [`₹${v}`, '']} />
                      <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#2D8B4E" strokeWidth={2} fill="url(#revGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(42,31,16,0.3)', fontSize: 13 }}>No orders data in this period</div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* Orders per day */}
                <div style={{ ...S.card, padding: 24 }}>
                  <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 14, color: '#1E1B18', marginBottom: 16 }}>Orders Per Day</div>
                  {revenueChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={revenueChartData} barGap={2}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,31,16,0.05)" />
                        <XAxis dataKey="date" tick={{ fill: 'rgba(42,31,16,0.35)', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: 'rgba(42,31,16,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={tip} labelStyle={tipLabel} itemStyle={tipItem} />
                        <Bar dataKey="orders" name="Orders" fill="#E05A3A" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(42,31,16,0.3)', fontSize: 13 }}>No data</div>}
                </div>

                {/* Top ordered items */}
                <div style={{ ...S.card, padding: 24 }}>
                  <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 14, color: '#1E1B18', marginBottom: 16 }}>Most Ordered Items</div>
                  {topOrderedItems.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {topOrderedItems.map((item, i) => {
                        const maxQ = topOrderedItems[0]?.qty || 1;
                        return (
                          <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(42,31,16,0.35)', width: 16, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#1E1B18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{item.name}</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#E05A3A', flexShrink: 0 }}>{item.qty}x</span>
                              </div>
                              <div style={{ height: 4, borderRadius: 2, background: 'rgba(42,31,16,0.07)', overflow: 'hidden' }}>
                                <div style={{ height: '100%', borderRadius: 2, background: '#E05A3A', width: `${(item.qty / maxQ) * 100}%`, transition: 'width 0.5s ease' }} />
                              </div>
                            </div>
                            <span style={{ fontSize: 11, color: 'rgba(42,31,16,0.45)', flexShrink: 0 }}>₹{item.revenue.toFixed(0)}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(42,31,16,0.3)', fontSize: 13 }}>No orders yet</div>}
                </div>
              </div>

              {/* Peak Hours & Busiest Day */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
                {/* Peak Hours */}
                <div style={{ ...S.card, padding: '22px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div>
                      <div style={S.label}>⏰ Peak Hours</div>
                      <div style={{ fontSize: 12, color: 'rgba(42,31,16,0.4)', marginTop: 2 }}>When your orders come in</div>
                    </div>
                    {peakHour && <div style={{ fontSize: 12, fontWeight: 700, color: '#E05A3A', background: 'rgba(224,90,58,0.08)', padding: '4px 12px', borderRadius: 20 }}>Busiest: {peakHour.label}</div>}
                  </div>
                  {peakHourData.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(42,31,16,0.3)', fontSize: 13 }}>No order data yet</div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120 }}>
                      {peakHourData.map(h => {
                        const maxO = Math.max(...peakHourData.map(x => x.orders));
                        const pct = maxO > 0 ? (h.orders / maxO) * 100 : 0;
                        const isPeak = h === peakHour;
                        return (
                          <div key={h.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: isPeak ? '#E05A3A' : 'rgba(42,31,16,0.4)' }}>{h.orders}</span>
                            <div style={{ width: '100%', minHeight: 4, height: `${pct}%`, borderRadius: 4, background: isPeak ? '#E05A3A' : '#F79B3D', opacity: isPeak ? 1 : 0.5, transition: 'height 0.3s' }} />
                            <span style={{ fontSize: 8, color: 'rgba(42,31,16,0.4)', fontWeight: isPeak ? 700 : 400 }}>{h.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Busiest Days */}
                <div style={{ ...S.card, padding: '22px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div>
                      <div style={S.label}>📅 Busiest Days</div>
                      <div style={{ fontSize: 12, color: 'rgba(42,31,16,0.4)', marginTop: 2 }}>Orders by day of week</div>
                    </div>
                    {busiestDay && busiestDay.orders > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: '#2D8B4E', background: 'rgba(45,139,78,0.08)', padding: '4px 12px', borderRadius: 20 }}>Busiest: {busiestDay.day}</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
                    {dayData.map(d => {
                      const maxD = Math.max(...dayData.map(x => x.orders));
                      const pct = maxD > 0 ? (d.orders / maxD) * 100 : 0;
                      const isBusiest = d === busiestDay;
                      return (
                        <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: isBusiest ? '#2D8B4E' : 'rgba(42,31,16,0.4)' }}>{d.orders}</span>
                          <div style={{ width: '100%', minHeight: 4, height: `${pct}%`, borderRadius: 6, background: isBusiest ? '#2D8B4E' : '#5A9A78', opacity: isBusiest ? 1 : 0.45, transition: 'height 0.3s' }} />
                          <span style={{ fontSize: 10, color: 'rgba(42,31,16,0.45)', fontWeight: isBusiest ? 700 : 500 }}>{d.day}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

          ) : tab === 'overview' ? (
            <div style={{ animation: 'fadeUp 0.25s ease' }}>

              {/* KPI row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
                {[
                  { label: 'Total Visits', value: totalVisits, d: delta(totalVisits, prevVisits), icon: '👁️', accent: '#E05A3A', bg: 'rgba(224,90,58,0.07)' },
                  { label: 'Unique Visitors', value: uniqueVisits, d: delta(uniqueVisits, prevUnique), icon: '👤', accent: '#4A80C0', bg: 'rgba(74,128,192,0.08)' },
                  { label: 'Returning', value: repeatVisits, d: 0, icon: '🔄', accent: '#8A70B0', bg: 'rgba(138,112,176,0.1)' },
                  { label: 'Waiter Calls', value: waiterStat?.total || 0, d: 0, icon: '🔔', accent: '#F79B3D', bg: 'rgba(247,155,61,0.1)' },
                ].map(s => (
                  <div key={s.label} style={{ ...S.card, padding: 22, background: s.bg }}>
                    <div style={{ fontSize: 20, marginBottom: 10 }}>{s.icon}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 28, color: s.accent, lineHeight: 1 }}>{s.value.toLocaleString()}</span>
                      {s.d !== 0 && <Trend val={s.d} />}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(42,31,16,0.5)', fontWeight: 500 }}>{s.label}</div>
                    {s.label === 'Waiter Calls' && waiterStat && (
                      <div style={{ fontSize: 10, color: 'rgba(42,31,16,0.38)', marginTop: 4 }}>
                        {waiterStat.resolved} resolved · avg {formatTime(waiterStat.avgResponseSeconds)}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Visits chart */}
              <div style={{ ...S.card, padding: 28, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22, flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 15, color: '#1E1B18' }}>Visits Over Time</div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'rgba(42,31,16,0.45)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 24, height: 2, background: '#E05A3A', display: 'inline-block', borderRadius: 1 }} />Total</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 24, height: 2, background: '#8FC4A8', display: 'inline-block', borderRadius: 1 }} />Unique</span>
                  </div>
                </div>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#E05A3A" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#E05A3A" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,31,16,0.05)" />
                      <XAxis dataKey="date" tick={{ fill: 'rgba(42,31,16,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'rgba(42,31,16,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tip} labelStyle={tipLabel} itemStyle={tipItem} />
                      <Area type="monotone" dataKey="visits" stroke="#E05A3A" strokeWidth={2.5} fill="url(#g1)" name="Total Visits" />
                      <Area type="monotone" dataKey="unique" stroke="#8FC4A8" strokeWidth={2} fill="transparent" name="Unique" strokeDasharray="5 3" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(42,31,16,0.3)', fontSize: 13 }}>No visit data yet for this period</div>
                )}
              </div>

              {/* Funnel + Waiter */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

                <div style={{ ...S.card, padding: 28 }}>
                  <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 15, color: '#1E1B18', marginBottom: 24 }}>AR Conversion Funnel</div>
                  {funnelData.map((f, i) => (
                    <div key={f.label} style={{ marginBottom: i < funnelData.length - 1 ? 18 : 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#1E1B18' }}>{f.label}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 16, color: f.color }}>{f.value.toLocaleString()}</span>
                          {i > 0 && (
                            <span style={{ fontSize: 11, color: 'rgba(42,31,16,0.45)', background: 'rgba(42,31,16,0.05)', padding: '2px 8px', borderRadius: 20 }}>
                              {f.pct}% of above
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ height: 8, background: 'rgba(42,31,16,0.07)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${f.pct}%`, background: f.color, borderRadius: 99, transition: 'width 0.6s ease' }} />
                      </div>
                    </div>
                  ))}
                  <div style={{ marginTop: 22, padding: '14px 18px', background: 'rgba(247,155,61,0.07)', borderRadius: 14, border: '1px solid rgba(247,155,61,0.2)' }}>
                    <div style={{ fontSize: 11, color: 'rgba(42,31,16,0.5)', marginBottom: 4 }}>AR Engagement Rate</div>
                    <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 26, color: '#F79B3D', lineHeight: 1 }}>{arRate}%</div>
                    <div style={{ fontSize: 11, color: 'rgba(42,31,16,0.4)', marginTop: 4 }}>of item views launch AR</div>
                  </div>
                </div>

                <div style={{ ...S.card, padding: 28 }}>
                  <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 15, color: '#1E1B18', marginBottom: 20 }}>🔔 Waiter Call Summary</div>
                  {waiterStat ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {[
                        { label: 'Total calls', value: waiterStat.total, color: '#1E1B18', sub: `in last ${range} days` },
                        { label: 'Resolved', value: waiterStat.resolved, color: '#5A9A78', sub: `${waiterStat.total > 0 ? Math.round((waiterStat.resolved / waiterStat.total) * 100) : 0}% resolution rate` },
                        { label: 'Avg response time', value: formatTime(waiterStat.avgResponseSeconds), color: '#4A80C0', sub: 'call to resolve' },
                      ].map(s => (
                        <div key={s.label} style={{ padding: '14px 18px', background: 'rgba(42,31,16,0.03)', borderRadius: 14, border: '1px solid rgba(42,31,16,0.06)' }}>
                          <div style={{ fontSize: 11, color: 'rgba(42,31,16,0.45)', marginBottom: 5, fontWeight: 500 }}>{s.label}</div>
                          <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 24, color: s.color, lineHeight: 1, marginBottom: 4 }}>{s.value}</div>
                          <div style={{ fontSize: 11, color: 'rgba(42,31,16,0.38)' }}>{s.sub}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(42,31,16,0.3)', fontSize: 13 }}>No waiter call data</div>
                  )}
                </div>
              </div>

              {/* Top items */}
              {topItems.length > 0 && (
                <div style={{ ...S.card, padding: 28 }}>
                  <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 15, color: '#1E1B18', marginBottom: 20 }}>Top Menu Items</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={topItems.map(i => ({ name: i.name.length > 12 ? i.name.slice(0, 12) + '…' : i.name, views: i.views || 0, ar: i.arViews || 0 }))} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,31,16,0.05)" />
                      <XAxis dataKey="name" tick={{ fill: 'rgba(42,31,16,0.35)', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'rgba(42,31,16,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tip} labelStyle={tipLabel} itemStyle={tipItem} />
                      <Bar dataKey="views" name="Views" fill="#E05A3A" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="ar" name="AR Views" fill="#8FC4A8" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column' }}>
                    {topItems.map((item, i) => (
                      <div key={item.id} className="row-hover" style={{ display: 'grid', gridTemplateColumns: '28px 36px 1fr auto auto', gap: 12, alignItems: 'center', padding: '10px 8px', borderRadius: 10, transition: 'background 0.12s' }}>
                        <span style={{ fontSize: 11, color: 'rgba(42,31,16,0.3)', textAlign: 'right' }}>#{i + 1}</span>
                        <div style={{ width: 36, height: 36, borderRadius: 10, overflow: 'hidden', background: '#F2F0EC', flexShrink: 0 }}>
                          {item.imageURL ? <img src={item.imageURL} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🍽️</div>}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#1E1B18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                        <span style={{ fontSize: 12, color: 'rgba(42,31,16,0.45)', whiteSpace: 'nowrap' }}>{(item.views || 0).toLocaleString()} views</span>
                        <span style={{ fontSize: 12, color: '#F79B3D', fontWeight: 700, whiteSpace: 'nowrap' }}>{(item.arViews || 0).toLocaleString()} AR</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

          ) : (
            /* ══ MENU PERFORMANCE ══ */
            <div style={{ animation: 'fadeUp 0.25s ease' }}>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14, marginBottom: 20 }}>
                {[
                  { label: 'Active Items', value: activeItems.length, icon: '🍽️', accent: '#1E1B18', bg: '#fff' },
                  { label: 'Total Item Views', value: totalViews.toLocaleString(), icon: '👁️', accent: '#E05A3A', bg: 'rgba(224,90,58,0.07)' },
                  { label: 'AR Launches', value: totalARViews.toLocaleString(), icon: '🥽', accent: '#F79B3D', bg: 'rgba(247,155,61,0.1)' },
                  { label: 'AR Rate', value: arRate + '%', icon: '📈', accent: '#5A9A78', bg: 'rgba(90,154,120,0.1)' },
                  { label: 'Avg Rating', value: avgRating > 0 ? `★ ${avgRating}` : '—', icon: '⭐', accent: '#F79B3D', bg: 'rgba(247,155,61,0.07)' },
                ].map(s => (
                  <div key={s.label} style={{ ...S.card, padding: 20, background: s.bg }}>
                    <div style={{ fontSize: 18, marginBottom: 8 }}>{s.icon}</div>
                    <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 22, color: s.accent, marginBottom: 4, lineHeight: 1 }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: 'rgba(42,31,16,0.5)', fontWeight: 500 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Heatmap */}
              <div style={{ ...S.card, padding: 28, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 15, color: '#1E1B18' }}>🔥 Dish Engagement Heatmap</div>
                    <div style={{ fontSize: 12, color: 'rgba(42,31,16,0.4)', marginTop: 3 }}>Score = views + (AR views × 2) + (rating × 10)</div>
                  </div>
                  <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'rgba(42,31,16,0.45)', alignItems: 'center' }}>
                    {[['#F79B3D', 'Hot'], ['#5A9A78', 'Active'], ['rgba(42,31,16,0.2)', 'Cold']].map(([c, l]) => (
                      <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: c, display: 'inline-block' }} />{l}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '28px 40px 1fr 70px 70px 70px 80px', gap: 8, padding: '0 10px 10px', borderBottom: '1px solid rgba(42,31,16,0.06)', marginBottom: 4 }}>
                  {['', '', 'Dish', 'Views', 'AR', 'AR Rate', 'Rating'].map((h, i) => (
                    <div key={i} style={{ ...S.label, textAlign: i >= 3 ? 'center' : 'left', fontSize: 10 }}>{h}</div>
                  ))}
                </div>

                {heatmapData.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(42,31,16,0.3)', fontSize: 13 }}>No data yet — views appear as customers browse your menu</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {heatmapData.map((item, i) => {
                      const c = heatColor(item.score);
                      const pct = Math.max(2, Math.round((item.score / maxScore) * 100));
                      return (
                        <div key={item.id} className="row-hover" style={{ display: 'grid', gridTemplateColumns: '28px 40px 1fr 70px 70px 70px 80px', gap: 8, alignItems: 'center', padding: '9px 10px', borderRadius: 10, transition: 'background 0.12s' }}>
                          <span style={{ fontSize: 11, color: 'rgba(42,31,16,0.3)', textAlign: 'right' }}>#{i + 1}</span>
                          <div style={{ width: 38, height: 38, borderRadius: 10, overflow: 'hidden', background: '#F2F0EC' }}>
                            {item.imageURL ? <img src={item.imageURL} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🍽️</div>}
                          </div>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#1E1B18', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                            <div style={{ height: 5, background: 'rgba(42,31,16,0.07)', borderRadius: 99, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: c.bar, borderRadius: 99, transition: 'width 0.5s ease' }} />
                            </div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(42,31,16,0.75)' }}>{(item.views || 0).toLocaleString()}</div>
                            <div style={{ fontSize: 10, color: 'rgba(42,31,16,0.35)' }}>views</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#F79B3D' }}>{(item.arViews || 0).toLocaleString()}</div>
                            <div style={{ fontSize: 10, color: 'rgba(42,31,16,0.35)' }}>AR</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: item.arRate >= 30 ? '#5A9A78' : 'rgba(42,31,16,0.5)' }}>{item.arRate}%</div>
                            <div style={{ fontSize: 10, color: 'rgba(42,31,16,0.35)' }}>rate</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            {(item.ratingCount || 0) > 0
                              ? <Stars avg={item.ratingAvg} count={item.ratingCount} />
                              : <span style={{ fontSize: 11, color: 'rgba(42,31,16,0.2)' }}>—</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Category + Ratings */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div style={{ ...S.card, padding: 24 }}>
                  <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 14, color: '#1E1B18', marginBottom: 16 }}>📂 Category Breakdown</div>
                  {catData.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie data={catData} dataKey="views" nameKey="name" cx="50%" cy="50%" outerRadius={74} paddingAngle={3}>
                            {catData.map((_, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
                          </Pie>
                          <Tooltip content={<PieTip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                        {catData.slice(0, 6).map((cat, i) => (
                          <div key={cat.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                            <div style={{ width: 11, height: 11, borderRadius: 3, background: CAT_COLORS[i % CAT_COLORS.length], flexShrink: 0 }} />
                            <span style={{ flex: 1, color: '#1E1B18', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.name}</span>
                            <span style={{ color: 'rgba(42,31,16,0.45)', fontSize: 12 }}>{cat.items} items</span>
                            <span style={{ color: '#1E1B18', fontWeight: 700 }}>{cat.views}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(42,31,16,0.3)', fontSize: 13 }}>No category data yet</div>
                  )}
                </div>

                <div style={{ ...S.card, padding: 24 }}>
                  <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 14, color: '#1E1B18', marginBottom: 16 }}>⭐ Ratings Leaderboard</div>
                  {topRated.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(42,31,16,0.3)', fontSize: 13 }}>No ratings yet — customers rate dishes from the menu</div>
                  ) : (
                    <>
                      <div style={S.label}>Top Rated</div>
                      <div style={{ marginTop: 10, marginBottom: 16 }}>
                        {topRated.map((item, i) => (
                          <div key={item.id} className="row-hover" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', borderRadius: 10, transition: 'background 0.12s' }}>
                            <span style={{ fontSize: 11, color: 'rgba(42,31,16,0.3)', width: 18, textAlign: 'right', flexShrink: 0 }}>#{i + 1}</span>
                            <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#1E1B18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                            <Stars avg={item.ratingAvg} count={item.ratingCount} />
                          </div>
                        ))}
                      </div>
                      {lowRated.length > 0 && (
                        <>
                          <div style={{ ...S.label, color: '#C04A28' }}>⚠ Needs Attention</div>
                          <div style={{ marginTop: 10 }}>
                            {lowRated.map(item => (
                              <div key={item.id} className="row-hover" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', borderRadius: 10, transition: 'background 0.12s' }}>
                                <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'rgba(42,31,16,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                                <Stars avg={item.ratingAvg} />
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Zero-view alert */}
              {zeroView.length > 0 && (
                <div style={{ ...S.card, padding: 24, border: '1.5px solid rgba(224,90,58,0.2)', background: 'rgba(224,90,58,0.04)' }}>
                  <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 14, color: '#C04A28', marginBottom: 4 }}>
                    ⚠️ {zeroView.length} item{zeroView.length > 1 ? 's' : ''} with zero views
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(42,31,16,0.5)', marginBottom: 14 }}>
                    These dishes have never been viewed. Consider updating the photo, changing the category, or deactivating them.
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {zeroView.map(item => (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 10, background: 'rgba(224,90,58,0.08)', border: '1px solid rgba(224,90,58,0.18)' }}>
                        <div style={{ width: 24, height: 24, borderRadius: 6, overflow: 'hidden', background: '#F2F0EC', flexShrink: 0 }}>
                          {item.imageURL ? <img src={item.imageURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 12, lineHeight: '24px', display: 'block', textAlign: 'center' }}>🍽️</span>}
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#C04A28' }}>{item.name}</span>
                        <span style={{ fontSize: 11, color: 'rgba(42,31,16,0.4)' }}>{item.category || 'no category'}</span>
                      </div>
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