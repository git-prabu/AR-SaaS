import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getOrders } from '../../lib/db';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

const S = {
  card: { background: '#fff', border: '1px solid rgba(42,31,16,0.07)', borderRadius: 20, boxShadow: '0 2px 12px rgba(42,31,16,0.04)' },
};

const PERIOD_OPTS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All Time' },
];

function startOfPeriod(period) {
  const now = new Date();
  if (period === 'today') {
    const s = new Date(now); s.setHours(0, 0, 0, 0); return s;
  }
  if (period === 'week') {
    const s = new Date(now); s.setDate(s.getDate() - s.getDay()); s.setHours(0, 0, 0, 0); return s;
  }
  if (period === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return new Date(0);
}

function fmtDate(seconds, period) {
  const d = new Date(seconds * 1000);
  if (period === 'today') return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  if (period === 'week') return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const tip = { backgroundColor: '#1E1B18', border: 'none', borderRadius: 10, color: '#FFF5E8', fontSize: 12, fontFamily: 'Inter,sans-serif', padding: '8px 14px' };
const tipLabel = { color: '#FFF5E8', fontWeight: 600 };
const CAT_COLORS = ['#E05A3A', '#F79B3D', '#8A70B0', '#5A9A78', '#4A80C0', '#C04A28'];

export default function AdminReports() {
  const { userData } = useAuth();
  const rid = userData?.restaurantId;

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('week');

  useEffect(() => {
    if (!rid) return;
    getOrders(rid).then(o => { setOrders(o); setLoading(false); });
  }, [rid]);

  const start = startOfPeriod(period);
  const filtered = orders.filter(o => {
    if (!o.createdAt?.seconds) return false;
    return new Date(o.createdAt.seconds * 1000) >= start;
  });

  // KPIs
  const totalRevenue = filtered.reduce((s, o) => s + (o.total || 0), 0);
  const paidOrders = filtered.filter(o => ['paid', 'cash_requested', 'card_requested', 'online_requested'].includes(o.paymentStatus));
  const paidRevenue = paidOrders.reduce((s, o) => s + (o.total || 0), 0);
  const avgOrder = filtered.length ? (totalRevenue / filtered.length) : 0;
  const orderCount = filtered.length;

  // Revenue over time chart
  const revenueByDate = {};
  filtered.forEach(o => {
    if (!o.createdAt?.seconds) return;
    const key = fmtDate(o.createdAt.seconds, period);
    revenueByDate[key] = (revenueByDate[key] || 0) + (o.total || 0);
  });
  const chartData = Object.entries(revenueByDate)
    .map(([date, revenue]) => ({ date, revenue }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Top items
  const itemTotals = {};
  filtered.forEach(o => {
    (o.items || []).forEach(it => {
      if (!itemTotals[it.name]) itemTotals[it.name] = { name: it.name, qty: 0, revenue: 0 };
      itemTotals[it.name].qty += it.qty || 1;
      itemTotals[it.name].revenue += (it.price || 0) * (it.qty || 1);
    });
  });
  const topItems = Object.values(itemTotals).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

  // Payment method breakdown
  const methodCounts = { cash_requested: 0, card_requested: 0, online_requested: 0, unpaid: 0, paid: 0 };
  filtered.forEach(o => { if (methodCounts[o.paymentStatus] !== undefined) methodCounts[o.paymentStatus]++; else methodCounts.unpaid++; });

  if (loading) return (
    <AdminLayout>
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
        <div style={{ width: 32, height: 32, border: '3px solid #F79B3D', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </AdminLayout>
  );

  return (
    <AdminLayout>
      <Head><title>Revenue Reports | Advert Radical</title></Head>
      <div style={{ padding: '28px 32px', maxWidth: 1100, paddingBottom: 60, fontFamily: 'Inter,sans-serif' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 14 }}>
          <div>
            <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 22, color: '#1E1B18' }}>Revenue Reports</div>
            <div style={{ fontSize: 13, color: 'rgba(42,31,16,0.45)', marginTop: 4 }}>Orders, revenue, and top-selling items</div>
          </div>
          {/* Period toggle */}
          <div style={{ display: 'flex', background: 'rgba(42,31,16,0.05)', borderRadius: 12, padding: 3, gap: 2 }}>
            {PERIOD_OPTS.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)} style={{
                padding: '7px 16px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'Inter,sans-serif',
                background: period === p.key ? '#1E1B18' : 'transparent',
                color: period === p.key ? '#FFF5E8' : 'rgba(42,31,16,0.5)',
                transition: 'all 0.15s',
              }}>{p.label}</button>
            ))}
          </div>
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Total Orders', value: orderCount, color: '#1E1B18', icon: '🛒' },
            { label: 'Total Revenue', value: `₹${totalRevenue.toLocaleString('en-IN')}`, color: '#E05A3A', icon: '💰' },
            { label: 'Avg. Order Value', value: `₹${Math.round(avgOrder).toLocaleString('en-IN')}`, color: '#8A70B0', icon: '◈' },
            { label: 'Paid Revenue', value: `₹${paidRevenue.toLocaleString('en-IN')}`, color: '#2D8B4E', icon: '✓' },
          ].map(k => (
            <div key={k.label} style={{ ...S.card, padding: '20px 22px' }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>{k.icon}</div>
              <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 26, color: k.color, lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: 12, color: 'rgba(42,31,16,0.45)', fontWeight: 600, marginTop: 6 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Revenue Chart */}
        <div style={{ ...S.card, padding: '24px 26px', marginBottom: 24 }}>
          <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 15, color: '#1E1B18', marginBottom: 20 }}>Revenue Over Time</div>
          {chartData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(42,31,16,0.3)', fontSize: 14 }}>No orders in this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#E05A3A" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#E05A3A" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,31,16,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'rgba(42,31,16,0.4)', fontFamily: 'Inter,sans-serif' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => `₹${v}`} tick={{ fontSize: 11, fill: 'rgba(42,31,16,0.4)', fontFamily: 'Inter,sans-serif' }} axisLine={false} tickLine={false} width={60} />
                <Tooltip contentStyle={tip} labelStyle={tipLabel} formatter={v => [`₹${v.toLocaleString('en-IN')}`, 'Revenue']} />
                <Area type="monotone" dataKey="revenue" stroke="#E05A3A" strokeWidth={2.5} fill="url(#revGrad)" dot={false} activeDot={{ r: 5, fill: '#E05A3A' }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top Items */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ ...S.card, padding: '24px 26px' }}>
            <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 15, color: '#1E1B18', marginBottom: 18 }}>Top Items by Revenue</div>
            {topItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'rgba(42,31,16,0.3)', fontSize: 13 }}>No data</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {topItems.map((item, i) => {
                  const maxRev = topItems[0].revenue;
                  return (
                    <div key={item.name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1E1B18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: CAT_COLORS[i % CAT_COLORS.length], borderRadius: 20, padding: '1px 7px', marginRight: 7 }}>#{i + 1}</span>
                          {item.name}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E1B18', flexShrink: 0 }}>₹{item.revenue.toLocaleString('en-IN')}</div>
                      </div>
                      <div style={{ height: 5, background: 'rgba(42,31,16,0.07)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: CAT_COLORS[i % CAT_COLORS.length], borderRadius: 99, width: `${(item.revenue / maxRev) * 100}%`, transition: 'width 0.5s' }} />
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(42,31,16,0.4)', marginTop: 2 }}>{item.qty} sold</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Payment Methods */}
          <div style={{ ...S.card, padding: '24px 26px' }}>
            <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 15, color: '#1E1B18', marginBottom: 18 }}>Payment Methods</div>
            {orderCount === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'rgba(42,31,16,0.3)', fontSize: 13 }}>No data</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { key: 'cash_requested', label: 'Cash', icon: '💵', color: '#2D8B4E' },
                  { key: 'card_requested', label: 'Card', icon: '💳', color: '#4A80C0' },
                  { key: 'online_requested', label: 'Online (UPI)', icon: '📱', color: '#8A70B0' },
                  { key: 'unpaid', label: 'Unpaid / Pending', icon: '⏳', color: 'rgba(42,31,16,0.35)' },
                  { key: 'paid', label: 'Paid', icon: '✅', color: '#2D8B4E' },
                ].filter(m => methodCounts[m.key] > 0).map(m => (
                  <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: 20, flexShrink: 0 }}>{m.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1E1B18' }}>{m.label}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: m.color }}>{methodCounts[m.key]} orders</div>
                      </div>
                      <div style={{ height: 5, background: 'rgba(42,31,16,0.07)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: m.color, borderRadius: 99, width: `${(methodCounts[m.key] / orderCount) * 100}%`, transition: 'width 0.5s' }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
