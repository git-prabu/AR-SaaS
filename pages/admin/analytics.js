import Head from 'next/head';
import { useEffect, useState, useCallback, useMemo } from 'react';
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
  LineChart, Line, ComposedChart, Legend,
} from 'recharts';

const tip = { backgroundColor: T.ink, border: 'none', borderRadius: 10, color: T.cream, fontSize: 12, fontFamily: T.font, padding: '8px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.25)' };
const tipLabel = { color: T.cream, fontWeight: 600 };
const tipItem = { color: 'rgba(234,231,227,0.8)' };
const CAT_COLORS = ['#9B5B53', '#C4A86D', '#8A7A6A', '#5A8A6E', '#5A8A9A', '#7AAA8E', '#F4D070', '#A08060'];
const BAR_PALETTE = ['#9B5B53', '#5A8A6E', '#C4A86D', '#5A8A9A', '#8A7A6A', '#7AAA8E'];

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
      {up ? '\u25B2' : '\u25BC'} {Math.abs(val)}%
    </span>
  );
}

function Stars({ avg, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {[1, 2, 3, 4, 5].map(s => (
        <span key={s} style={{ fontSize: 11, color: s <= Math.round(avg || 0) ? T.warning : 'rgba(38,52,49,0.15)' }}>{'\u2605'}</span>
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

/* Issue 11: Fix formatTime — handle absurd values */
function formatTime(secs) {
  if (!secs) return '\u2014';
  if (secs > 86400) return '\u2014';
  if (secs > 3600) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return `${h}h ${m}m`;
  }
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

/* Issue 6: Image fallback placeholder */
function DishImage({ item, size = 32, fontSize = 14 }) {
  if (item?.imageURL) {
    return <img src={item.imageURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
  }
  const initial = (item?.name || '?').charAt(0).toUpperCase();
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(135deg, ${T.sand} 0%, ${T.cream} 100%)`,
      fontFamily: T.fontDisplay, fontWeight: 700, fontSize: fontSize, color: T.stone,
    }}>{initial}</div>
  );
}

/* Issue 10: Chart type toggle button */
function ChartToggle({ mode, onToggle, options }) {
  return (
    <div style={{ display: 'inline-flex', borderRadius: 16, border: `1px solid ${T.sand}`, overflow: 'hidden' }}>
      {options.map(opt => (
        <button key={opt.value} onClick={() => onToggle(opt.value)} style={{
          padding: '3px 10px', border: 'none', cursor: 'pointer',
          background: mode === opt.value ? T.ink : 'transparent',
          color: mode === opt.value ? T.cream : T.stone,
          fontSize: 13, fontFamily: T.font, fontWeight: 600, transition: 'all 0.15s',
        }}>{opt.icon}</button>
      ))}
    </div>
  );
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
  /* Issue 10: chart mode states */
  const [overviewChartMode, setOverviewChartMode] = useState('combo');
  const [revenueChartMode, setRevenueChartMode] = useState('area');
  const [ordersChartMode, setOrdersChartMode] = useState('bar');
  /* Issue 16: bar color state */
  const [barColor, setBarColor] = useState('#9B5B53');
  /* Issue 19: menu table sort/filter state */
  const [menuSort, setMenuSort] = useState('revenue');
  const [menuSortDir, setMenuSortDir] = useState('desc');
  const [menuCatFilter, setMenuCatFilter] = useState('all');
  /* Issue 13: expandable alerts state */
  const [expandedAlerts, setExpandedAlerts] = useState({});

  const rid = userData?.restaurantId;

  const load = useCallback(async () => {
    if (!rid) return;
    setLoading(true);
    const [anal, allAnal, items, today, waiter, allOrders] = await Promise.all([
      getAnalytics(rid, range), getAnalytics(rid, range * 2), getAllMenuItems(rid),
      getTodayAnalytics(rid), getWaiterCallsCount(rid, range), getOrders(rid),
    ]);
    setAnalytics(anal);
    setPrevAnal(allAnal.slice(0, Math.max(0, allAnal.length - range)));
    setMenuItems(items); setTodayStat(today); setWaiterStat(waiter);
    setOrders(allOrders || []); setLoading(false);
  }, [rid, range]);

  useEffect(() => { load(); }, [load]);

  const sum = (arr, k) => arr.reduce((s, d) => s + (d[k] || 0), 0);
  const delta = (curr, prev) => prev === 0 ? (curr > 0 ? null : 0) : Math.round(((curr - prev) / prev) * 100);

  const parseDate = (createdAt) => {
    if (!createdAt) return new Date();
    return createdAt?.toDate ? createdAt.toDate() : (createdAt?.seconds ? new Date(createdAt.seconds * 1000) : new Date(createdAt || Date.now()));
  };

  const totalVisits = sum(analytics, 'totalVisits');
  const uniqueVisits = sum(analytics, 'uniqueVisitors');
  const prevVisits = sum(prevAnal, 'totalVisits');
  const prevUnique = sum(prevAnal, 'uniqueVisitors');
  const chartData = analytics.map(d => ({ date: d.date?.slice(5) || '', visits: d.totalVisits || 0, unique: d.uniqueVisitors || 0 }));

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
    const d = parseDate(o.createdAt);
    return d >= rangeStart;
  });
  const totalOrders = ordersInRange.length;
  const totalRevenue = ordersInRange.reduce((s, o) => s + (o.total || 0), 0);
  const avgOrderValue = totalOrders > 0 ? (totalRevenue / totalOrders) : 0;

  /* Issue 14: Previous period for trend comparison */
  const prevStart = new Date(Date.now() - range * 2 * 24 * 60 * 60 * 1000);
  const prevOrdersInRange = orders.filter(o => {
    const d = parseDate(o.createdAt);
    return d >= prevStart && d < rangeStart;
  });
  const prevTotalOrders = prevOrdersInRange.length;
  const prevTotalRevenue = prevOrdersInRange.reduce((s, o) => s + (o.total || 0), 0);
  const prevAvgOrder = prevTotalOrders > 0 ? (prevTotalRevenue / prevTotalOrders) : 0;

  const revByDay = {};
  ordersInRange.forEach(o => {
    const d = parseDate(o.createdAt);
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
    const d = parseDate(o.createdAt);
    hourlyOrders[d.getHours()] += 1;
  });
  const peakHourData = hourlyOrders.map((count, h) => ({
    hour: h, label: `${h === 0 ? 12 : h > 12 ? h - 12 : h}${h < 12 ? 'AM' : 'PM'}`, orders: count,
  })).filter(h => h.orders > 0);
  const peakHour = peakHourData.reduce((best, h) => h.orders > (best?.orders || 0) ? h : best, null);

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dailyOrders = Array(7).fill(0);
  ordersInRange.forEach(o => {
    const d = parseDate(o.createdAt);
    dailyOrders[d.getDay()] += 1;
  });
  const dayData = dailyOrders.map((count, i) => ({ day: dayNames[i], orders: count }));
  const busiestDay = dayData.reduce((best, d) => d.orders > (best?.orders || 0) ? d : best, null);

  const heatmapData = [...activeItems]
    .map(i => ({ ...i, score: (i.views || 0) + (i.arViews || 0) * 2 + (i.ratingAvg || 0) * 10, arRate: i.views > 0 ? Math.round(((i.arViews || 0) / i.views) * 100) : 0 }))
    .sort((a, b) => b.score - a.score);
  const maxScore = heatmapData[0]?.score || 1;

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
  const allCategories = ['all', ...catData.map(c => c.name)];

  /* Issue 5: Change "AR Launches" to "AR Views" */
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
    if (parseFloat(arRate) > 0) list.push({ text: `AR engagement at ${arRate}% \u2014 ${parseFloat(arRate) >= 15 ? 'strong' : 'room to grow'}`, type: parseFloat(arRate) >= 15 ? 'success' : 'warning' });
    if (peakHour) list.push({ text: `Peak ordering time: ${peakHour.label} with ${peakHour.orders} orders`, type: 'info' });
    const viewedNotOrdered = activeItems.filter(i => (i.views || 0) > 10).filter(i => !itemFreq[i.name] || itemFreq[i.name].qty === 0).sort((a, b) => (b.views || 0) - (a.views || 0));
    if (viewedNotOrdered.length > 0) list.push({ text: `${viewedNotOrdered[0].name}: ${viewedNotOrdered[0].views} views but 0 orders`, type: 'danger' });
    if (zeroView.length > 0) list.push({ text: `${zeroView.length} item${zeroView.length > 1 ? 's' : ''} with zero views \u2014 update photos`, type: 'danger' });
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

  // TODAY's live metrics
  const todayDate = new Date();
  const todayOrders = orders.filter(o => {
    const d = parseDate(o.createdAt);
    return d.toDateString() === todayDate.toDateString();
  });
  const todayOrderCount = todayOrders.length;
  const todayRevenue = todayOrders.reduce((s, o) => s + (o.total || 0), 0);
  const todayVisits = todayStat?.totalVisits || 0;
  const todayWaiterCalls = todayStat?.waiterCalls || 0;

  /* Issue 19: Full item intelligence for ALL items (not sliced) */
  const allItemIntelligence = useMemo(() => {
    return activeItems.map(item => {
      const freq = itemFreq[item.name];
      const views = item.views || 0, arViews = item.arViews || 0, ordered = freq?.qty || 0, revenue = freq?.revenue || 0;
      const rating = item.ratingAvg || 0, ratingCount = item.ratingCount || 0;
      let suggestion = '', sColor = 'rgba(38,52,49,0.5)';
      if (views > 20 && ordered === 0) { suggestion = 'High views, no orders'; sColor = '#9B5B53'; }
      else if (views === 0) { suggestion = 'No views \u2014 update photo'; sColor = '#9B5B53'; }
      else if (rating > 0 && rating < 3) { suggestion = 'Low rating \u2014 improve'; sColor = '#9B5B53'; }
      else if (ordered > 5 && rating >= 4) { suggestion = 'Star performer'; sColor = '#5A8A6E'; }
      else if (arViews > 0 && arViews / Math.max(views, 1) > 0.3) { suggestion = 'High AR interest'; sColor = T.warning; }
      else if (ordered > 0) { suggestion = 'Performing well'; sColor = 'rgba(38,52,49,0.35)'; }
      else { suggestion = 'Needs attention'; sColor = 'rgba(38,52,49,0.4)'; }
      return { ...item, ordered, revenue, suggestion, sColor, views, arViews, rating, ratingCount };
    });
  }, [activeItems, itemFreq]);

  /* Issue 19: Sorted and filtered menu items */
  const filteredMenuItems = useMemo(() => {
    let items = [...allItemIntelligence];
    if (menuCatFilter !== 'all') {
      items = items.filter(i => {
        const raw = i.category || 'Uncategorised';
        const cat = raw.charAt(0).toUpperCase() + raw.slice(1);
        return cat === menuCatFilter;
      });
    }
    items.sort((a, b) => {
      let aVal, bVal;
      switch (menuSort) {
        case 'name': aVal = (a.name || '').toLowerCase(); bVal = (b.name || '').toLowerCase(); return menuSortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        case 'views': aVal = a.views || 0; bVal = b.views || 0; break;
        case 'arViews': aVal = a.arViews || 0; bVal = b.arViews || 0; break;
        case 'ordered': aVal = a.ordered || 0; bVal = b.ordered || 0; break;
        case 'revenue': aVal = a.revenue || 0; bVal = b.revenue || 0; break;
        case 'rating': aVal = a.rating || 0; bVal = b.rating || 0; break;
        default: aVal = a.revenue || 0; bVal = b.revenue || 0;
      }
      if (typeof aVal === 'number') return menuSortDir === 'asc' ? aVal - bVal : bVal - aVal;
      return 0;
    });
    return items;
  }, [allItemIntelligence, menuSort, menuSortDir, menuCatFilter]);

  const handleMenuSort = (col) => {
    if (menuSort === col) {
      setMenuSortDir(menuSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setMenuSort(col);
      setMenuSortDir('desc');
    }
  };

  const sortArrow = (col) => {
    if (menuSort !== col) return '';
    return menuSortDir === 'asc' ? ' \u25B2' : ' \u25BC';
  };

  const exportCSV = () => {
    if (tab === 'overview') downloadCSV(revenueChartData.map(d => ({ date: d.date, revenue: d.revenue, orders: d.orders })), `analytics-${range}d.csv`);
    else if (tab === 'orders') downloadCSV(revenueChartData.map(d => ({ date: d.date, revenue: d.revenue, orders: d.orders })), `orders-revenue-${range}d.csv`);
    else downloadCSV(activeItems.map(i => ({ name: i.name, category: i.category || '', views: i.views || 0, ar_views: i.arViews || 0, rating_avg: i.ratingAvg || 0 })), 'menu-performance.csv');
  };

  const bestSeller = topOrderedItems[0] || null;
  const bestSellerItem = bestSeller ? activeItems.find(i => i.name === bestSeller.name) : null;
  const topDishes = topOrderedItems.slice(0, 6);
  const restaurantName = userData?.restaurantName || 'Your Restaurant';

  /* Issue 7: Dynamic gridRow for best seller */
  const otherDishCount = topDishes.length - 1;
  const bestSellerGridRow = otherDishCount <= 2 ? '1 / 2' : otherDishCount <= 4 ? '1 / 3' : '1 / 4';

  // Card + section shared styles
  const card = { background: T.white, borderRadius: 16, border: '1px solid rgba(38,52,49,0.06)', boxShadow: '0 2px 10px rgba(38,52,49,0.03)' };
  const secTitle = { fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 22, color: T.ink, letterSpacing: '-0.3px' };
  const labelSm = { fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(38,52,49,0.35)' };

  return (
    <AdminLayout>
      <Head><title>Analytics &mdash; Advert Radical</title></Head>
      <div style={{ background: T.cream, minHeight: '100vh', fontFamily: T.font }}>
        <style>{`
          @keyframes spin{to{transform:rotate(360deg)}}
          @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
          @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
          .row-hover:hover{background:rgba(196,168,109,0.04)!important}
          .kpi-card{transition:transform 0.12s ease,box-shadow 0.12s ease}
          .kpi-card:hover{transform:translateY(-1px);box-shadow:0 4px 18px rgba(38,52,49,0.07)!important}
          .sort-header{cursor:pointer;user-select:none}
          .sort-header:hover{color:${T.ink}!important}
        `}</style>

        {/* HERO BANNER — no range selector here (moved to sticky bar) */}
        <div style={{
          background: `linear-gradient(135deg, ${T.shell} 0%, ${T.shellDarker} 60%, #1A2420 100%)`,
          padding: '28px 32px 24px', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.warning}, transparent)` }} />
          <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative', zIndex: 1 }}>
            {/* Title row */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: T.fontDisplay, fontWeight: 800, fontSize: 30, color: T.shellText, letterSpacing: '-0.3px', whiteSpace: 'nowrap' }}>
                {restaurantName} <span style={{ color: T.warning, fontWeight: 400, fontStyle: 'italic', fontSize: 24 }}>Analytics</span>
              </div>
              <div style={{ fontSize: 13, color: 'rgba(234,231,227,0.45)', marginTop: 5 }}>Performance dashboard &mdash; last {range} days</div>
            </div>

            {/* Issue 14: Hero stats with trends for ALL 4 cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'VISITORS', value: totalVisits.toLocaleString(), d: delta(totalVisits, prevVisits) },
                { label: 'ORDERS', value: totalOrders.toLocaleString(), d: delta(totalOrders, prevTotalOrders) },
                { label: 'REVENUE', value: `\u20B9${totalRevenue.toLocaleString('en-IN')}`, highlight: true, d: delta(totalRevenue, prevTotalRevenue) },
                { label: 'AVG ORDER', value: `\u20B9${avgOrderValue.toFixed(0)}`, d: delta(Math.round(avgOrderValue), Math.round(prevAvgOrder)) },
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

        {/* Issue 8: Sticky bar with Tabs (left) + Range buttons + Export (right) */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: T.cream,
          borderBottom: `1px solid ${T.sand}`,
          padding: '0 28px',
        }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {/* Left: Tabs */}
            <div style={{ display: 'flex', gap: 0 }}>
              {[['overview', 'Overview'], ['orders', 'Orders & Revenue'], ['menu', 'Menu Performance']].map(([id, label]) => (
                <button key={id} onClick={() => setTab(id)} style={{
                  padding: '12px 24px', border: 'none', cursor: 'pointer', fontFamily: T.font,
                  fontSize: 13, fontWeight: tab === id ? 700 : 500,
                  color: tab === id ? T.ink : 'rgba(38,52,49,0.4)',
                  background: 'transparent',
                  borderBottom: tab === id ? `2.5px solid ${T.warning}` : '2.5px solid transparent',
                  transition: 'all 0.15s',
                }}>{label}</button>
              ))}
            </div>
            {/* Right: Range + Export */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {[7, 30, 90].map(d => (
                <button key={d} onClick={() => setRange(d)} style={{
                  padding: '5px 14px', borderRadius: 20,
                  border: range === d ? `1.5px solid ${T.warning}` : `1.5px solid ${T.sand}`,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: T.font,
                  background: range === d ? 'rgba(196,168,109,0.15)' : 'transparent',
                  color: range === d ? T.warning : T.stone, transition: 'all 0.15s',
                }}>{d}d</button>
              ))}
              <button onClick={exportCSV} style={{
                padding: '5px 14px', borderRadius: 20, border: `1.5px solid ${T.sand}`,
                background: 'transparent', color: T.stone, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: T.font,
              }}>Export</button>
            </div>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '18px 28px 40px' }}>

          {/* TODAY'S LIVE DATA */}
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
                { label: 'REVENUE', value: `\u20B9${todayRevenue.toLocaleString('en-IN')}`, color: '#5A8A6E', bg: 'rgba(90,138,110,0.08)', border: 'rgba(90,138,110,0.18)' },
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

          {/* Insights */}
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
                  const icons = { success: '\u25B2', warning: '\u25C6', danger: '!', info: '\u2192' };
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

          {/* Spinner */}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
              <div style={{ width: 28, height: 28, border: `3px solid ${T.warning}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>

          ) : tab === 'orders' ? (
            /* ORDERS & REVENUE TAB */
            <div style={{ animation: 'fadeUp 0.2s ease' }}>
              <div style={{ ...card, padding: '20px 24px', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={secTitle}>Revenue Over Time</div>
                  {/* Issue 10: chart toggle */}
                  <ChartToggle mode={revenueChartMode} onToggle={setRevenueChartMode} options={[
                    { value: 'area', icon: '\uD83D\uDCC8' },
                    { value: 'bar', icon: '\uD83D\uDCCA' },
                  ]} />
                </div>
                <div style={{ marginTop: 4 }}>
                  {revenueChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      {revenueChartMode === 'bar' ? (
                        <BarChart data={revenueChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(38,52,49,0.06)" />
                          <XAxis dataKey="date" tick={{ fill: 'rgba(38,52,49,0.45)', fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: 'rgba(38,52,49,0.45)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `\u20B9${v}`} />
                          <Tooltip contentStyle={tip} labelStyle={tipLabel} itemStyle={tipItem} formatter={v => [`\u20B9${v.toLocaleString('en-IN')}`, '']} />
                          <Bar dataKey="revenue" name="Revenue" fill="#5A8A6E" radius={[5, 5, 0, 0]} />
                        </BarChart>
                      ) : (
                        <AreaChart data={revenueChartData}>
                          <defs><linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#5A8A6E" stopOpacity={0.3} /><stop offset="95%" stopColor="#5A8A6E" stopOpacity={0} /></linearGradient></defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(38,52,49,0.06)" />
                          <XAxis dataKey="date" tick={{ fill: 'rgba(38,52,49,0.45)', fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: 'rgba(38,52,49,0.45)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `\u20B9${v}`} />
                          <Tooltip contentStyle={tip} labelStyle={tipLabel} itemStyle={tipItem} formatter={v => [`\u20B9${v.toLocaleString('en-IN')}`, '']} />
                          <Area type="monotone" dataKey="revenue" stroke="#5A8A6E" strokeWidth={2.5} fill="url(#revGrad)" dot={false} />
                        </AreaChart>
                      )}
                    </ResponsiveContainer>
                  ) : <div style={{ textAlign: 'center', padding: '50px 0', color: 'rgba(38,52,49,0.3)', fontSize: 13 }}>No order data in this period</div>}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div style={{ ...card, padding: '18px 22px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={secTitle}>Orders Per Day</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* Issue 16: Color palette */}
                      <div style={{ display: 'flex', gap: 4 }}>
                        {BAR_PALETTE.map(c => (
                          <button key={c} onClick={() => setBarColor(c)} style={{
                            width: 16, height: 16, borderRadius: '50%', background: c, border: barColor === c ? `2px solid ${T.ink}` : '2px solid transparent',
                            cursor: 'pointer', padding: 0, transition: 'border 0.15s',
                          }} />
                        ))}
                      </div>
                      {/* Issue 10: chart toggle */}
                      <ChartToggle mode={ordersChartMode} onToggle={setOrdersChartMode} options={[
                        { value: 'bar', icon: '\uD83D\uDCCA' },
                        { value: 'line', icon: '\uD83D\uDCC8' },
                      ]} />
                    </div>
                  </div>
                  {/* Issue 15: increased height to 220 */}
                  <div>
                    {revenueChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        {ordersChartMode === 'line' ? (
                          <LineChart data={revenueChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(38,52,49,0.06)" />
                            <XAxis dataKey="date" tick={{ fill: 'rgba(38,52,49,0.4)', fontSize: 10 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: 'rgba(38,52,49,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={tip} labelStyle={tipLabel} itemStyle={tipItem} />
                            <Line type="monotone" dataKey="orders" name="Orders" stroke={barColor} strokeWidth={2.5} dot={{ r: 3, fill: barColor }} />
                          </LineChart>
                        ) : (
                          <BarChart data={revenueChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(38,52,49,0.06)" />
                            <XAxis dataKey="date" tick={{ fill: 'rgba(38,52,49,0.4)', fontSize: 10 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: 'rgba(38,52,49,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={tip} labelStyle={tipLabel} itemStyle={tipItem} />
                            <Bar dataKey="orders" name="Orders" fill={barColor} radius={[5, 5, 0, 0]} />
                          </BarChart>
                        )}
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
                          <span style={{ fontSize: 11, color: 'rgba(38,52,49,0.4)', flexShrink: 0 }}>{'\u20B9'}{item.revenue.toFixed(0)}</span>
                        </div>
                      );
                    }) : <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(38,52,49,0.3)', fontSize: 13 }}>No orders yet</div>}
                  </div>
                </div>
              </div>

              {/* Issue 17: Peak Hours & Busiest Days with proper Recharts */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ ...card, padding: '18px 22px' }}>
                  {/* Issue 18: Fix badge alignment */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={secTitle}>Peak Hours</div>
                    {peakHour && <span style={{ fontSize: 11, fontWeight: 700, color: '#9B5B53', background: 'rgba(155,91,83,0.08)', padding: '4px 12px', borderRadius: 20, display: 'inline-flex', alignItems: 'center' }}>Busiest: {peakHour.label}</span>}
                  </div>
                  {peakHourData.length === 0 ? <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(38,52,49,0.3)', fontSize: 13 }}>No data</div> : (
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={peakHourData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(38,52,49,0.06)" />
                        <XAxis dataKey="label" tick={{ fill: 'rgba(38,52,49,0.4)', fontSize: 9 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: 'rgba(38,52,49,0.4)', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={tip} labelStyle={tipLabel} itemStyle={tipItem} />
                        <Bar dataKey="orders" name="Orders" radius={[4, 4, 0, 0]}>
                          {peakHourData.map((entry, idx) => (
                            <Cell key={idx} fill={entry === peakHour ? '#9B5B53' : T.warning} opacity={entry === peakHour ? 1 : 0.5} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div style={{ ...card, padding: '18px 22px' }}>
                  {/* Issue 18: Fix badge alignment */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={secTitle}>Busiest Days</div>
                    {busiestDay && busiestDay.orders > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#5A8A6E', background: 'rgba(90,138,110,0.08)', padding: '4px 12px', borderRadius: 20, display: 'inline-flex', alignItems: 'center' }}>Top: {busiestDay.day}</span>}
                  </div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={dayData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(38,52,49,0.06)" />
                      <XAxis dataKey="day" tick={{ fill: 'rgba(38,52,49,0.4)', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'rgba(38,52,49,0.4)', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={tip} labelStyle={tipLabel} itemStyle={tipItem} />
                      <Bar dataKey="orders" name="Orders" radius={[4, 4, 0, 0]}>
                        {dayData.map((entry, idx) => (
                          <Cell key={idx} fill={entry === busiestDay ? '#5A8A6E' : '#5A8A6E'} opacity={entry === busiestDay ? 1 : 0.4} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

          ) : tab === 'overview' ? (
            <div style={{ animation: 'fadeUp 0.2s ease' }}>
              {/* Journey + Dish Performance */}
              <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 14, marginBottom: 14 }}>
                {/* Journey vertical funnel */}
                <div style={{
                  background: `linear-gradient(180deg, ${T.shell} 0%, ${T.shellDarker} 100%)`,
                  borderRadius: 16, padding: '22px 24px',
                  border: '1px solid rgba(234,231,227,0.06)',
                }}>
                  <div style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 22, color: '#fff', letterSpacing: '-0.3px' }}>Customer Journey</div>
                  <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {funnelData.map((f, i) => {
                      const widthPct = [100, 72, 48][i];
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

                {/* Dish Performance */}
                <div style={{ ...card, padding: '22px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div style={secTitle}>Dish Performance</div>
                    {topDishes.length > 0 && <span style={{ fontSize: 10, color: 'rgba(38,52,49,0.35)', fontWeight: 500 }}>{range}d data</span>}
                  </div>
                  {topDishes.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridAutoRows: 'auto', gap: 10 }}>
                      {/* Issue 6 & 7: Best seller hero card with image fallback and dynamic gridRow */}
                      {bestSellerItem && (
                        <div style={{
                          gridRow: bestSellerGridRow, borderRadius: 16, overflow: 'hidden', position: 'relative',
                          minHeight: 260, background: T.shellDarker,
                          boxShadow: '0 8px 24px rgba(38,52,49,0.12)',
                        }}>
                          {bestSellerItem.imageURL ? (
                            <img src={bestSellerItem.imageURL} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{
                              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: `linear-gradient(135deg, ${T.shell} 0%, ${T.shellDarker} 100%)`,
                            }}>
                              <span style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 72, color: 'rgba(234,231,227,0.12)' }}>
                                {(bestSellerItem.name || '?').charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(28,40,37,0.9) 0%, rgba(28,40,37,0.3) 40%, rgba(0,0,0,0.05) 100%)' }} />
                          <div style={{ position: 'absolute', top: 12, left: 12 }}>
                            <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', color: T.shellDarker, background: T.warning, padding: '4px 10px', borderRadius: 6, textTransform: 'uppercase' }}>Best Seller</span>
                          </div>
                          <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16 }}>
                            <div style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 18, color: '#fff', lineHeight: 1.25 }}>{bestSellerItem.name}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                              <span style={{ fontSize: 11, color: T.warning, fontWeight: 700 }}>{bestSeller.qty}x ordered</span>
                              <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
                              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>{'\u20B9'}{bestSeller.revenue.toFixed(0)}</span>
                            </div>
                          </div>
                        </div>
                      )}
                      {/* Issue 6: Other top dishes with image fallback */}
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
                            <div style={{ width: 42, height: 42, borderRadius: 10, overflow: 'hidden', background: T.cream, flexShrink: 0, border: '1px solid rgba(38,52,49,0.04)' }}>
                              <DishImage item={menuItem || { name: dish.name }} size={42} fontSize={18} />
                            </div>
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>{dish.name}</div>
                              <div style={{ height: 3, borderRadius: 2, background: 'rgba(38,52,49,0.05)', overflow: 'hidden' }}>
                                <div style={{ height: '100%', borderRadius: 2, background: `linear-gradient(90deg, ${T.warning}, #D4A85A)`, width: `${barPct}%`, transition: 'width 0.3s ease' }} />
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                                <span style={{ fontSize: 10, color: 'rgba(38,52,49,0.4)', fontWeight: 600 }}>{dish.qty}x</span>
                                <span style={{ fontSize: 10, color: '#5A8A6E', fontWeight: 700 }}>{'\u20B9'}{dish.revenue.toFixed(0)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : <div style={{ textAlign: 'center', padding: '50px 0', color: 'rgba(38,52,49,0.3)', fontSize: 13 }}>No order data yet</div>}
                </div>
              </div>

              {/* Issue 9: Replace Visits Over Time with Orders & Revenue combo chart */}
              <div style={{
                background: T.white, borderRadius: 16, padding: '22px 26px', marginBottom: 14,
                border: '1px solid rgba(38,52,49,0.06)',
                boxShadow: '0 2px 12px rgba(38,52,49,0.04)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <div style={secTitle}>Orders & Revenue</div>
                    <div style={{ fontSize: 11, color: 'rgba(38,52,49,0.35)', marginTop: 2 }}>Last {range} days</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'rgba(38,52,49,0.45)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 18, height: 8, background: T.warning, borderRadius: 2, opacity: 0.7 }} />Orders</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 18, height: 3, background: '#5A8A6E', borderRadius: 2 }} />Revenue</span>
                    </div>
                    {/* Issue 10: chart toggle */}
                    <ChartToggle mode={overviewChartMode} onToggle={setOverviewChartMode} options={[
                      { value: 'combo', icon: '\uD83D\uDCCA' },
                      { value: 'line', icon: '\uD83D\uDCC8' },
                    ]} />
                  </div>
                </div>
                {revenueChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    {overviewChartMode === 'line' ? (
                      <LineChart data={revenueChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(38,52,49,0.05)" />
                        <XAxis dataKey="date" tick={{ fill: 'rgba(38,52,49,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="left" tick={{ fill: 'rgba(38,52,49,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fill: 'rgba(38,52,49,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `\u20B9${v}`} />
                        <Tooltip contentStyle={tip} labelStyle={tipLabel} itemStyle={tipItem} />
                        <Line yAxisId="left" type="monotone" dataKey="orders" stroke={T.warning} strokeWidth={2.5} name="Orders" dot={{ r: 3, fill: T.warning }} />
                        <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="#5A8A6E" strokeWidth={2} name="Revenue" dot={false} />
                      </LineChart>
                    ) : (
                      <ComposedChart data={revenueChartData}>
                        <defs>
                          <linearGradient id="revLineGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#5A8A6E" stopOpacity={0.2} /><stop offset="95%" stopColor="#5A8A6E" stopOpacity={0} /></linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(38,52,49,0.05)" />
                        <XAxis dataKey="date" tick={{ fill: 'rgba(38,52,49,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="left" tick={{ fill: 'rgba(38,52,49,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fill: 'rgba(38,52,49,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `\u20B9${v}`} />
                        <Tooltip contentStyle={tip} labelStyle={tipLabel} itemStyle={tipItem} />
                        <Bar yAxisId="left" dataKey="orders" name="Orders" fill={T.warning} opacity={0.7} radius={[4, 4, 0, 0]} />
                        <Line yAxisId="right" type="monotone" dataKey="revenue" name="Revenue" stroke="#5A8A6E" strokeWidth={2.5} dot={false} />
                      </ComposedChart>
                    )}
                  </ResponsiveContainer>
                ) : <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(38,52,49,0.3)', fontSize: 13 }}>No data yet</div>}
              </div>

              {/* Issue 11: Waiter + Top Menu Items — alignItems start for independent sizing */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
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
                        { label: 'Resolved', value: waiterStat.resolved, color: '#7AAA8E', sub: waiterStat.total > 0 ? `${Math.round((waiterStat.resolved / waiterStat.total) * 100)}% rate` : '\u2014' },
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
                    {/* Issue 12: View all items button */}
                    <button onClick={() => setTab('menu')} style={{
                      display: 'block', width: '100%', marginTop: 14, padding: '10px 0',
                      background: 'transparent', border: `1px solid ${T.sand}`, borderRadius: T.radiusBtn,
                      fontFamily: T.font, fontSize: 12, fontWeight: 700, color: T.stone,
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}>View all items {'\u2192'}</button>
                  </div>
                )}
              </div>
            </div>

          ) : (
            /* MENU PERFORMANCE TAB — Issue 19: Single sortable table */
            <div style={{ animation: 'fadeUp 0.2s ease' }}>
              <div style={{ ...card, padding: '20px 24px', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div>
                    <div style={secTitle}>Menu Performance</div>
                    <div style={{ fontSize: 11, color: 'rgba(38,52,49,0.4)', marginTop: 2 }}>All items with sortable columns</div>
                  </div>
                  {/* Category filter dropdown */}
                  <select
                    value={menuCatFilter}
                    onChange={e => setMenuCatFilter(e.target.value)}
                    style={{
                      padding: '6px 14px', borderRadius: T.radiusBtn,
                      border: `1px solid ${T.sand}`, background: T.white,
                      fontFamily: T.font, fontSize: 12, fontWeight: 600, color: T.ink,
                      cursor: 'pointer', outline: 'none',
                    }}
                  >
                    {allCategories.map(cat => (
                      <option key={cat} value={cat}>{cat === 'all' ? 'All Categories' : cat}</option>
                    ))}
                  </select>
                </div>

                {/* Table header */}
                <div style={{ display: 'grid', gridTemplateColumns: '32px 36px 1fr 60px 60px 60px 70px 80px 150px', gap: 5, padding: '0 6px 8px', borderBottom: `1px solid rgba(38,52,49,0.06)` }}>
                  <div style={{ ...labelSm, fontSize: 9 }}>#</div>
                  <div style={{ ...labelSm, fontSize: 9 }}></div>
                  <div className="sort-header" onClick={() => handleMenuSort('name')} style={{ ...labelSm, fontSize: 9, cursor: 'pointer' }}>Dish{sortArrow('name')}</div>
                  <div className="sort-header" onClick={() => handleMenuSort('views')} style={{ ...labelSm, fontSize: 9, textAlign: 'center', cursor: 'pointer' }}>Views{sortArrow('views')}</div>
                  <div className="sort-header" onClick={() => handleMenuSort('arViews')} style={{ ...labelSm, fontSize: 9, textAlign: 'center', cursor: 'pointer' }}>AR{sortArrow('arViews')}</div>
                  <div className="sort-header" onClick={() => handleMenuSort('ordered')} style={{ ...labelSm, fontSize: 9, textAlign: 'center', cursor: 'pointer' }}>Orders{sortArrow('ordered')}</div>
                  <div className="sort-header" onClick={() => handleMenuSort('revenue')} style={{ ...labelSm, fontSize: 9, textAlign: 'center', cursor: 'pointer' }}>Rev{sortArrow('revenue')}</div>
                  <div className="sort-header" onClick={() => handleMenuSort('rating')} style={{ ...labelSm, fontSize: 9, textAlign: 'center', cursor: 'pointer' }}>Rating{sortArrow('rating')}</div>
                  <div style={{ ...labelSm, fontSize: 9 }}>Status</div>
                </div>

                {filteredMenuItems.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: 'rgba(38,52,49,0.3)', fontSize: 13 }}>No items found</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {filteredMenuItems.map((item, i) => (
                      <div key={item.id || i} className="row-hover" style={{
                        display: 'grid', gridTemplateColumns: '32px 36px 1fr 60px 60px 60px 70px 80px 150px',
                        gap: 5, alignItems: 'center', padding: '7px 6px', borderRadius: 8, transition: 'background 0.12s',
                      }}>
                        <span style={{ fontSize: 10, color: 'rgba(38,52,49,0.2)', textAlign: 'right' }}>#{i + 1}</span>
                        <div style={{ width: 32, height: 32, borderRadius: 8, overflow: 'hidden', background: T.cream }}>
                          <DishImage item={item} size={32} fontSize={14} />
                        </div>
                        <div style={{ overflow: 'hidden' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                          <div style={{ fontSize: 10, color: 'rgba(38,52,49,0.3)' }}>{item.category || ''}</div>
                        </div>
                        <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'rgba(38,52,49,0.6)' }}>{item.views}</div>
                        <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: T.warning }}>{item.arViews}</div>
                        <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#9B5B53' }}>{item.ordered}</div>
                        <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#5A8A6E' }}>{'\u20B9'}{item.revenue.toFixed(0)}</div>
                        <div style={{ textAlign: 'center' }}>{item.ratingCount > 0 ? <Stars avg={item.rating} /> : <span style={{ fontSize: 10, color: 'rgba(38,52,49,0.2)' }}>{'\u2014'}</span>}</div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: item.sColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.suggestion}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Restaurant Health — bottom of page */}
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
                    {healthScore >= 90 ? '"Your restaurant is performing exceptionally \u2014 keep this momentum going!"'
                    : healthScore >= 80 ? '"Great progress! Your menu and service are resonating with customers."'
                    : '"You\'re on the right track \u2014 a few tweaks and you\'ll be in the top tier!"'}
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {[
                  { label: 'VISITS \u2192 ORDERS', value: viewToOrderRate + '%', sub: 'conversion' },
                  { label: 'AR \u2192 ORDERS', value: arToOrderRate + '%', sub: 'AR conversion' },
                  { label: 'AR ENGAGEMENT', value: arRate + '%', sub: `${totalARViews} views` },
                  { label: 'AVG RATING', value: avgRating > 0 ? `\u2605 ${avgRating}` : '\u2014', sub: `${activeItems.filter(i => (i.ratingCount || 0) > 0).length} rated items` },
                ].map(s => (
                  <div key={s.label} style={{ padding: '14px 16px', background: 'rgba(234,231,227,0.06)', borderRadius: 10, border: '1px solid rgba(234,231,227,0.08)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(234,231,227,0.5)', marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontFamily: T.font, fontWeight: 800, fontSize: 24, color: T.warning, lineHeight: 1 }}>{s.value}</div>
                    <div style={{ fontSize: 12, color: 'rgba(234,231,227,0.4)', marginTop: 4 }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Issue 13: NEEDS ATTENTION — specific items with expandable lists */}
              {(() => {
                const alerts = [];

                if (zeroView.length > 0) {
                  alerts.push({
                    type: 'danger',
                    header: `${zeroView.length} item${zeroView.length > 1 ? 's' : ''} with zero views`,
                    items: zeroView.map(i => ({ name: i.name, detail: i.category || 'Uncategorised', metric: '0 views' })),
                  });
                }

                const viewedNotBought = activeItems
                  .filter(i => (i.views || 0) > 10)
                  .filter(i => !itemFreq[i.name] || itemFreq[i.name].qty === 0)
                  .sort((a, b) => (b.views || 0) - (a.views || 0));
                if (viewedNotBought.length > 0) {
                  alerts.push({
                    type: 'warning',
                    header: `${viewedNotBought.length} item${viewedNotBought.length > 1 ? 's' : ''} viewed but never ordered`,
                    items: viewedNotBought.map(i => ({ name: i.name, detail: i.category || 'Uncategorised', metric: `${i.views} views` })),
                  });
                }

                if (lowRated.length > 0) {
                  alerts.push({
                    type: 'danger',
                    header: `${lowRated.length} item${lowRated.length > 1 ? 's' : ''} rated below 3.5`,
                    items: lowRated.map(i => ({ name: i.name, detail: i.category || 'Uncategorised', metric: `${(i.ratingAvg || 0).toFixed(1)} rating` })),
                  });
                }

                const noRating = activeItems.filter(i => (i.ratingCount || 0) === 0);
                if (noRating.length > 0 && noRating.length < activeItems.length) {
                  alerts.push({
                    type: 'info',
                    header: `${noRating.length} item${noRating.length > 1 ? 's' : ''} have no ratings yet`,
                    items: noRating.map(i => ({ name: i.name, detail: i.category || 'Uncategorised', metric: '\u2014' })),
                  });
                }

                return (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: alerts.length > 0 ? '#E8907E' : '#7AAA8E', marginBottom: 8 }}>
                      {alerts.length > 0 ? 'NEEDS ATTENTION' : 'ALL CLEAR'}
                    </div>
                    {alerts.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {alerts.map((a, idx) => {
                          const colorsMap = {
                            danger: { bg: 'rgba(155,91,83,0.1)', border: 'rgba(155,91,83,0.18)', text: '#E8907E', headerBg: 'rgba(155,91,83,0.15)' },
                            warning: { bg: 'rgba(196,168,109,0.08)', border: 'rgba(196,168,109,0.15)', text: T.warning, headerBg: 'rgba(196,168,109,0.12)' },
                            info: { bg: 'rgba(90,138,154,0.08)', border: 'rgba(90,138,154,0.12)', text: '#7ABAC8', headerBg: 'rgba(90,138,154,0.1)' },
                          };
                          const c = colorsMap[a.type] || colorsMap.info;
                          const isExpanded = expandedAlerts[idx];
                          const visibleItems = isExpanded ? a.items : a.items.slice(0, 5);
                          const remaining = a.items.length - 5;

                          return (
                            <div key={idx} style={{ borderRadius: 10, border: `1px solid ${c.border}`, overflow: 'hidden' }}>
                              <div style={{ padding: '10px 14px', background: c.headerBg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: c.text }}>{a.header}</span>
                                <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(234,231,227,0.4)' }}>{a.items.length} items</span>
                              </div>
                              <div style={{ background: c.bg, padding: '6px 0' }}>
                                {visibleItems.map((item, itemIdx) => (
                                  <div key={itemIdx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 14px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <span style={{ fontSize: 12, fontWeight: 600, color: T.shellText }}>{item.name}</span>
                                      <span style={{ fontSize: 10, color: 'rgba(234,231,227,0.35)' }}>{item.detail}</span>
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: c.text }}>{item.metric}</span>
                                  </div>
                                ))}
                                {a.items.length > 5 && !isExpanded && (
                                  <button onClick={() => setExpandedAlerts(prev => ({ ...prev, [idx]: true }))} style={{
                                    display: 'block', width: '100%', padding: '6px 14px', background: 'transparent',
                                    border: 'none', cursor: 'pointer', fontFamily: T.font, fontSize: 11,
                                    fontWeight: 700, color: c.text, textAlign: 'left',
                                  }}>and {remaining} more...</button>
                                )}
                                {isExpanded && a.items.length > 5 && (
                                  <button onClick={() => setExpandedAlerts(prev => ({ ...prev, [idx]: false }))} style={{
                                    display: 'block', width: '100%', padding: '6px 14px', background: 'transparent',
                                    border: 'none', cursor: 'pointer', fontFamily: T.font, fontSize: 11,
                                    fontWeight: 700, color: c.text, textAlign: 'left',
                                  }}>show less</button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ padding: '10px 14px', background: 'rgba(90,138,110,0.08)', borderRadius: 8, border: '1px solid rgba(90,138,110,0.15)' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#7AAA8E' }}>All menu items are performing well &mdash; no issues detected</span>
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
