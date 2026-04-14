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
  LineChart, Line,
} from 'recharts';

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
  const [tab, setTab] = useState('overview');
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
    initialLoadDone.current = true;
  }, [rid, range]);

  useEffect(() => { load(); }, [load]);

  const sum = (arr, k) => arr.reduce((s, d) => s + (d[k] || 0), 0);
  const delta = (curr, prev) => prev === 0 ? (curr > 0 ? null : 0) : Math.round(((curr - prev) / prev) * 100);

  const totalVisits = sum(analytics, 'totalVisits');
  const uniqueVisits = sum(analytics, 'uniqueVisitors');
  const prevVisits = sum(prevAnal, 'totalVisits');
  const prevUnique = sum(prevAnal, 'uniqueVisitors');
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

  const activeItems = menuItems.filter(i => i.isActive !== false);
  const totalViews = activeItems.reduce((s, i) => s + (i.views || 0), 0);
  const totalARViews = activeItems.reduce((s, i) => s + (i.arViews || 0), 0);
  const arRate = totalViews > 0 ? ((totalARViews / totalViews) * 100).toFixed(1) : '0.0';
  const avgRating = (() => {
    const rated = activeItems.filter(i => (i.ratingCount || 0) > 0);
    if (!rated.length) return 0;
    return (rated.reduce((s, i) => s + (i.ratingAvg || 0), 0) / rated.length).toFixed(1);
  })();

  const rangeStart = new Date(Date.now() - range * 24 * 60 * 60 * 1000);
  const ordersInRange = orders.filter(o => {
    if (!o.createdAt) return true;
    const d = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000) : new Date(o.createdAt || Date.now()));
    return d >= rangeStart;
  });
  const totalOrders = ordersInRange.length;
  const totalRevenue = ordersInRange.reduce((s, o) => s + (o.total || 0), 0);
  const avgOrderValue = totalOrders > 0 ? (totalRevenue / totalOrders) : 0;

  const revByDay = {};
  ordersInRange.forEach(o => {
    const d = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000) : new Date(o.createdAt || Date.now()));
    const key = d.toISOString().slice(5, 10);
    if (!revByDay[key]) revByDay[key] = { date: key, revenue: 0, orders: 0 };
    revByDay[key].revenue += o.total || 0; revByDay[key].orders += 1;
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
                { label: 'VISITORS', value: totalVisits.toLocaleString(), d: delta(totalVisits, prevVisits) },
                { label: 'ORDERS', value: totalOrders.toLocaleString() },
                { label: 'REVENUE', value: `₹${totalRevenue.toLocaleString('en-IN')}`, highlight: true },
                { label: 'AVG ORDER', value: `₹${avgOrderValue.toFixed(0)}` },
              ].map(s => (
                <div key={s.label} style={{ padding: '14px 18px', background: 'rgba(234,231,227,0.06)', borderRadius: 12, border: '1px solid rgba(234,231,227,0.08)' }}>
                  <div style={{ ...labelSm, color: 'rgba(234,231,227,0.3)', marginBottom: 6 }}>{s.label}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontFamily: T.font, fontWeight: 800, fontSize: 26, color: s.highlight ? T.warning : T.shellText, lineHeight: 1 }}>{s.value}</span>
                    {s.d !== undefined && s.d !== 0 && <Trend val={s.d} />}
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>

        {/* ═══ MAIN CONTENT ═══ */}
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '18px 28px 40px' }}>

          {/* ── TODAY'S LIVE DATA — big card ── */}
          <div style={{
            background: T.white, borderRadius: 16, padding: '18px 22px', marginBottom: 14,
            border: '1px solid rgba(38,52,49,0.06)',
            boxShadow: '0 2px 10px rgba(38,52,49,0.03)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#5A8A6E', animation: 'pulse 2s ease infinite' }} />
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#5A8A6E' }}>LIVE TODAY</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(38,52,49,0.06)' }} />
              <span style={{ fontSize: 10, color: 'rgba(38,52,49,0.25)', fontWeight: 500 }}>{todayDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'VISITORS', value: todayVisits, color: '#5A8A9A', bg: 'rgba(90,138,154,0.1)', border: 'rgba(90,138,154,0.2)' },
                { label: 'ORDERS', value: todayOrderCount, color: '#9B5B53', bg: 'rgba(155,91,83,0.08)', border: 'rgba(155,91,83,0.18)' },
                { label: 'REVENUE', value: `₹${todayRevenue.toLocaleString('en-IN')}`, color: '#5A8A6E', bg: 'rgba(90,138,110,0.08)', border: 'rgba(90,138,110,0.18)' },
                { label: 'WAITER CALLS', value: todayWaiterCalls, color: T.warning, bg: 'rgba(196,168,109,0.08)', border: 'rgba(196,168,109,0.18)' },
              ].map(s => (
                <div key={s.label} style={{
                  padding: '16px 18px', borderRadius: 12,
                  background: s.bg,
                  border: `1px solid ${s.border}`,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: s.color, marginBottom: 8 }}>{s.label}</div>
                  <div style={{ fontFamily: T.font, fontWeight: 800, fontSize: 30, color: T.ink, lineHeight: 1 }}>
                    {typeof s.value === 'number' ? s.value.toLocaleString() : s.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Insights — green background ── */}
          {insights.length > 0 && (
            <div style={{
              background: `linear-gradient(135deg, ${T.shell} 0%, ${T.shellDarker} 100%)`,
              borderRadius: 16, padding: '16px 20px', marginBottom: 14,
              border: '1px solid rgba(234,231,227,0.06)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.warning }}>SMART INSIGHTS</div>
                <div style={{ flex: 1, height: 1, background: 'rgba(234,231,227,0.06)' }} />
                <span style={{ fontSize: 11, color: 'rgba(234,231,227,0.45)', fontWeight: 500 }}>Auto-analysed</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(insights.length, 4)}, 1fr)`, gap: 10 }}>
                {insights.map((ins, i) => {
                  const icons = { success: '▲', warning: '◆', danger: '!', info: '→' };
                  const colors = { success: '#7AAA8E', warning: T.warning, danger: '#E8907E', info: '#7ABAC8' };
                  return (
                    <div key={i} style={{
                      padding: '14px 16px', borderRadius: 10,
                      background: 'rgba(234,231,227,0.06)',
                      border: '1px solid rgba(234,231,227,0.08)',
                      borderLeft: `3px solid ${colors[ins.type]}`,
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
          <div style={{ position: 'sticky', top: 0, zIndex: 10, background: T.cream, marginLeft: -28, marginRight: -28, padding: '0 28px', borderBottom: '2px solid rgba(38,52,49,0.06)' }}>
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
          <div style={{ height: 18 }} />

          {/* Spinner */}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
              <div style={{ width: 28, height: 28, border: `3px solid ${T.warning}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>

          ) : tab === 'orders' ? (
            /* ═══ ORDERS & REVENUE ═══ */
            <div style={{ animation: 'fadeUp 0.2s ease' }}>
              <div style={{ ...card, padding: '20px 24px', marginBottom: 14 }}>
                <div style={secTitle}>Revenue Over Time</div>
                <div style={{ marginTop: 14 }}>
                  {revenueChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={revenueChartData}>
                        <defs><linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#5A8A6E" stopOpacity={0.3} /><stop offset="95%" stopColor="#5A8A6E" stopOpacity={0} /></linearGradient></defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(38,52,49,0.06)" />
                        <XAxis dataKey="date" tick={{ fill: 'rgba(38,52,49,0.45)', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: 'rgba(38,52,49,0.45)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v}`} />
                        <Tooltip contentStyle={tip} labelStyle={tipLabel} itemStyle={tipItem} formatter={v => [`₹${v.toLocaleString('en-IN')}`, '']} />
                        <Area type="monotone" dataKey="revenue" stroke="#5A8A6E" strokeWidth={2.5} fill="url(#revGrad)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : <div style={{ textAlign: 'center', padding: '50px 0', color: 'rgba(38,52,49,0.3)', fontSize: 13 }}>No order data in this period</div>}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div style={{ ...card, padding: '18px 22px' }}>
                  <div style={secTitle}>Orders Per Day</div>
                  <div style={{ marginTop: 12 }}>
                    {revenueChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={170}>
                        <BarChart data={revenueChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(38,52,49,0.06)" />
                          <XAxis dataKey="date" tick={{ fill: 'rgba(38,52,49,0.4)', fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: 'rgba(38,52,49,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={tip} labelStyle={tipLabel} itemStyle={tipItem} />
                          <Bar dataKey="orders" name="Orders" fill="#9B5B53" radius={[5, 5, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(38,52,49,0.3)', fontSize: 13 }}>No data</div>}
                  </div>
                </div>
                <div style={{ ...card, padding: '18px 22px' }}>
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
                <div style={{ ...card, padding: '18px 22px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={secTitle}>Peak Hours</div>
                    {peakHour && <span style={{ fontSize: 11, fontWeight: 700, color: '#9B5B53', background: 'rgba(155,91,83,0.08)', padding: '3px 10px', borderRadius: 20 }}>Busiest: {peakHour.label}</span>}
                  </div>
                  {peakHourData.length === 0 ? <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(38,52,49,0.3)', fontSize: 13 }}>No data</div> : (
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 110 }}>
                      {peakHourData.map(h => {
                        const maxO = Math.max(...peakHourData.map(x => x.orders)); const pct = maxO > 0 ? (h.orders / maxO) * 100 : 0; const isPeak = h === peakHour;
                        return (<div key={h.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: isPeak ? '#9B5B53' : 'rgba(38,52,49,0.35)' }}>{h.orders}</span>
                          <div style={{ width: '100%', minHeight: 4, height: `${pct}%`, borderRadius: 3, background: isPeak ? '#9B5B53' : T.warning, opacity: isPeak ? 1 : 0.5 }} />
                          <span style={{ fontSize: 8, color: 'rgba(38,52,49,0.35)' }}>{h.label}</span>
                        </div>);
                      })}
                    </div>
                  )}
                </div>
                <div style={{ ...card, padding: '18px 22px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={secTitle}>Busiest Days</div>
                    {busiestDay && busiestDay.orders > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#5A8A6E', background: 'rgba(90,138,110,0.08)', padding: '3px 10px', borderRadius: 20 }}>Top: {busiestDay.day}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 110 }}>
                    {dayData.map(d => {
                      const maxD = Math.max(...dayData.map(x => x.orders)); const pct = maxD > 0 ? (d.orders / maxD) * 100 : 0; const isB = d === busiestDay;
                      return (<div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: isB ? '#5A8A6E' : 'rgba(38,52,49,0.35)' }}>{d.orders}</span>
                        <div style={{ width: '100%', minHeight: 4, height: `${pct}%`, borderRadius: 4, background: '#5A8A6E', opacity: isB ? 1 : 0.4 }} />
                        <span style={{ fontSize: 10, color: 'rgba(38,52,49,0.4)', fontWeight: isB ? 700 : 500 }}>{d.day}</span>
                      </div>);
                    })}
                  </div>
                </div>
              </div>
            </div>

          ) : tab === 'overview' ? (
            <div style={{ animation: 'fadeUp 0.2s ease' }}>
              {/* Journey + Dish Performance */}
              <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 14, marginBottom: 14 }}>
                {/* Journey — vertical funnel */}
                <div style={{
                  background: `linear-gradient(180deg, ${T.shell} 0%, ${T.shellDarker} 100%)`,
                  borderRadius: 16, padding: '22px 24px',
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
                <div style={{ ...card, padding: '22px 24px' }}>
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
                    <div style={{ display: 'grid', gridTemplateColumns: rightCount > 0 ? '1fr 1fr' : '1fr', gridAutoRows: 'auto', gap: 10, alignItems: 'start' }}>
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

              {/* Visits chart — refined */}
              <div style={{
                background: T.white, borderRadius: 16, padding: '22px 26px', marginBottom: 14,
                border: '1px solid rgba(38,52,49,0.06)',
                boxShadow: '0 2px 12px rgba(38,52,49,0.04)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <div style={secTitle}>Visits Over Time</div>
                    <div style={{ fontSize: 11, color: 'rgba(38,52,49,0.35)', marginTop: 2 }}>Last {range} days traffic</div>
                  </div>
                  <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'rgba(38,52,49,0.45)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 14, height: 3, background: T.warning, borderRadius: 2 }} />Visits</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 14, height: 3, background: '#5A8A6E', borderRadius: 2 }} />Unique</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 14, height: 3, background: '#E05A3A', borderRadius: 2 }} />Customers</span>
                  </div>
                </div>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={T.warning} stopOpacity={0.2} /><stop offset="95%" stopColor={T.warning} stopOpacity={0} /></linearGradient>
                        <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#5A8A6E" stopOpacity={0.1} /><stop offset="95%" stopColor="#5A8A6E" stopOpacity={0} /></linearGradient>
                        <linearGradient id="g3" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#E05A3A" stopOpacity={0.12} /><stop offset="95%" stopColor="#E05A3A" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(38,52,49,0.05)" />
                      <XAxis dataKey="date" tick={{ fill: 'rgba(38,52,49,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'rgba(38,52,49,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tip} labelStyle={tipLabel} itemStyle={tipItem} />
                      <Area type="monotone" dataKey="visits" stroke={T.warning} strokeWidth={2.5} fill="url(#g1)" name="Visits" />
                      <Area type="monotone" dataKey="unique" stroke="#5A8A6E" strokeWidth={1.5} fill="url(#g2)" name="Unique Visitors" strokeDasharray="5 3" />
                      <Area type="monotone" dataKey="customers" stroke="#E05A3A" strokeWidth={2} fill="url(#g3)" name="Customers (by phone)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(38,52,49,0.3)', fontSize: 13 }}>No visit data yet</div>}
              </div>

              {/* Waiter + Top Menu Items — refined */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{
                  background: `linear-gradient(135deg, ${T.shell} 0%, ${T.shellDarker} 100%)`,
                  borderRadius: 16, padding: '22px 24px',
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
                  <div style={{
                    background: T.white, borderRadius: 16, padding: '22px 24px',
                    border: '1px solid rgba(38,52,49,0.06)',
                    boxShadow: '0 2px 12px rgba(38,52,49,0.04)',
                  }}>
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
                <div style={{ ...card, padding: '18px 22px' }}>
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
                <div style={{ ...card, padding: '18px 22px' }}>
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
              borderRadius: 16, padding: '18px 22px', marginTop: 20,
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
                if (lowRated.length > 0) alerts.push({ type: 'danger', text: `${lowRated.length} item${lowRated.length > 1 ? 's' : ''} rated below 3.5: ${lowRated.map(i => `${i.name} (${(i.ratingAvg||0).toFixed(1)})`).join(', ')}` });
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
