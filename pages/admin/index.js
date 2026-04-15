// pages/admin/index.js — Admin Dashboard Home (Aspire-inspired, Cinematic Forest)
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { getAllMenuItems } from '../../lib/db';
import { T, ADMIN_STYLES } from '../../lib/utils';
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine,
  BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts';

/* ─── helpers ──────────────────────────────────────────────────── */

const fmtINR = n => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const fmtINRShort = n => {
  const v = Math.round(n || 0);
  if (v >= 100000) return '₹' + (v / 100000).toFixed(1) + 'L';
  if (v >= 1000) return '₹' + (v / 1000).toFixed(1) + 'K';
  return '₹' + v;
};
const dayKey = d => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const fmtTick = key => {
  const [y, m, d] = key.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[m - 1]} ${d}`;
};
const todayKey = () => dayKey(new Date());

const orderTotal = o => {
  if (typeof o.total === 'number') return o.total;
  return (o.items || []).reduce((s, it) => s + (it.price || 0) * (it.qty || it.quantity || 1), 0);
};
const orderTs = o => o.createdAt?.seconds ? o.createdAt.seconds * 1000 : (typeof o.createdAt === 'number' ? o.createdAt : Date.now());

const timeAgoShort = ms => {
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
};

/* ─── tiny UI atoms ────────────────────────────────────────────── */

const labelSm = {
  fontFamily: T.font, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
  textTransform: 'uppercase', color: 'rgba(38,52,49,0.42)',
};
const cardTitle = {
  fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 22, color: T.ink,
  letterSpacing: '-0.3px', margin: 0,
};
const linkSm = {
  fontFamily: T.font, fontSize: 11, fontWeight: 600, color: T.stone,
  textDecoration: 'none', letterSpacing: '0.02em',
};

function TrendPill({ pct }) {
  if (pct === null || pct === undefined || !isFinite(pct)) return null;
  const up = pct >= 0;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontFamily: T.font, fontSize: 11, fontWeight: 700,
      padding: '3px 9px', borderRadius: 999,
      background: up ? 'rgba(74,122,94,0.14)' : 'rgba(138,74,66,0.12)',
      color: up ? T.success : T.danger,
    }}>
      {up ? '▲' : '▼'} {Math.abs(Math.round(pct))}%
    </span>
  );
}

function CardChrome({ title, action, children, style }) {
  return (
    <section style={{ ...ADMIN_STYLES.card, padding: '18px 20px 16px', display: 'flex', flexDirection: 'column', ...style }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={cardTitle}>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

/* ─── tooltips ─────────────────────────────────────────────────── */

const tipStyle = {
  background: T.ink, border: 'none', borderRadius: 10, padding: '8px 12px',
  boxShadow: '0 6px 20px rgba(0,0,0,0.28)',
};
function ChartTip({ active, payload, label, prefix = '', suffix = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={tipStyle}>
      <div style={{ color: T.cream, fontSize: 11, fontWeight: 600, opacity: 0.7 }}>{label && fmtTick(label)}</div>
      <div style={{ color: T.cream, fontSize: 14, fontWeight: 700, marginTop: 2 }}>
        {prefix}{Math.round(payload[0].value).toLocaleString('en-IN')}{suffix}
      </div>
    </div>
  );
}

/* ─── main page ────────────────────────────────────────────────── */

export default function AdminHome() {
  const { userData } = useAuth();
  const rid = userData?.restaurantId;

  const [orders, setOrders] = useState([]);
  const [waiterCalls, setWaiterCalls] = useState([]);
  const [items, setItems] = useState([]);
  const [activityTab, setActivityTab] = useState('all'); // all | orders | calls

  /* live orders */
  useEffect(() => {
    if (!rid) return;
    const q = query(collection(db, 'restaurants', rid, 'orders'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [rid]);

  /* live waiter calls */
  useEffect(() => {
    if (!rid) return;
    const q = query(collection(db, 'restaurants', rid, 'waiterCalls'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => setWaiterCalls(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [rid]);

  /* one-shot menu items (used for table; refreshed when rid changes) */
  useEffect(() => {
    if (!rid) return;
    let alive = true;
    getAllMenuItems(rid).then(d => { if (alive) setItems(d || []); });
    return () => { alive = false; };
  }, [rid]);

  /* ─── derived metrics ─── */

  const today = todayKey();

  // Build day-keyed buckets for the last 14 days (oldest → newest)
  const days14 = useMemo(() => {
    const arr = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      arr.push(dayKey(d));
    }
    return arr;
  }, []);

  const revenueSeries = useMemo(() => {
    const buckets = Object.fromEntries(days14.map(k => [k, { date: k, revenue: 0, orders: 0 }]));
    for (const o of orders) {
      const k = dayKey(orderTs(o));
      if (buckets[k]) {
        buckets[k].revenue += orderTotal(o);
        buckets[k].orders += 1;
      }
    }
    return days14.map(k => buckets[k]);
  }, [orders, days14]);

  const todayIdx = revenueSeries.findIndex(r => r.date === today);
  const todayRevenue = revenueSeries[todayIdx]?.revenue || 0;
  const todayOrders = revenueSeries[todayIdx]?.orders || 0;

  // last 7 days vs previous 7
  const last7Rev = revenueSeries.slice(-7).reduce((s, r) => s + r.revenue, 0);
  const prev7Rev = revenueSeries.slice(0, 7).reduce((s, r) => s + r.revenue, 0);
  const revWoW = prev7Rev ? ((last7Rev - prev7Rev) / prev7Rev) * 100 : null;

  const last7Ord = revenueSeries.slice(-7).reduce((s, r) => s + r.orders, 0);
  const prev7Ord = revenueSeries.slice(0, 7).reduce((s, r) => s + r.orders, 0);
  const ordWoW = prev7Ord ? ((last7Ord - prev7Ord) / prev7Ord) * 100 : null;

  // sparkline data — last 7 days only
  const spark7 = revenueSeries.slice(-7);

  // status donut for today's orders
  const todayOrdersList = useMemo(
    () => orders.filter(o => dayKey(orderTs(o)) === today),
    [orders, today]
  );
  const statusMix = useMemo(() => {
    const counts = { pending: 0, preparing: 0, ready: 0, served: 0 };
    for (const o of todayOrdersList) {
      const s = (o.status || 'pending').toLowerCase();
      if (counts[s] !== undefined) counts[s] += 1;
      else counts.pending += 1;
    }
    return [
      { name: 'Pending',   value: counts.pending,   color: T.warning },
      { name: 'Preparing', value: counts.preparing, color: '#9B7BC4' },
      { name: 'Ready',     value: counts.ready,     color: T.success },
      { name: 'Served',    value: counts.served,    color: T.stone },
    ];
  }, [todayOrdersList]);
  const totalToday = statusMix.reduce((s, r) => s + r.value, 0);

  // top items today
  const topItemsToday = useMemo(() => {
    const map = new Map();
    for (const o of todayOrdersList) {
      for (const it of (o.items || [])) {
        const key = it.id || it.itemId || it.name;
        if (!key) continue;
        const prev = map.get(key) || { id: key, name: it.name || 'Untitled', units: 0, revenue: 0 };
        const qty = it.qty || it.quantity || 1;
        prev.units += qty;
        prev.revenue += (it.price || 0) * qty;
        map.set(key, prev);
      }
    }
    const enriched = Array.from(map.values()).map(row => {
      const meta = items.find(m => m.id === row.id || m.name === row.name) || {};
      return {
        ...row,
        category: meta.category || '—',
        ratingAvg: meta.ratingAvg || 0,
        imageURL: meta.imageURL || null,
      };
    });
    return enriched.sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  }, [todayOrdersList, items]);

  // activity feed stream
  const activity = useMemo(() => {
    const orderEvents = orders.slice(0, 30).map(o => ({
      kind: 'order',
      id: o.id,
      ts: orderTs(o),
      table: o.tableNumber,
      total: orderTotal(o),
      status: o.status || 'pending',
      itemCount: (o.items || []).length,
    }));
    const callEvents = waiterCalls.slice(0, 30).map(c => ({
      kind: 'call',
      id: c.id,
      ts: c.createdAt?.seconds ? c.createdAt.seconds * 1000 : Date.now(),
      table: c.tableNumber,
      status: c.status || 'active',
    }));
    let merged = [...orderEvents, ...callEvents];
    if (activityTab === 'orders') merged = orderEvents;
    if (activityTab === 'calls') merged = callEvents;
    return merged.sort((a, b) => b.ts - a.ts).slice(0, 14);
  }, [orders, waiterCalls, activityTab]);

  const activeCalls = waiterCalls.filter(c => (c.status || 'active') === 'active').length;
  const pendingOrdersCount = orders.filter(o => (o.status || 'pending') === 'pending').length;

  /* ─── render ─── */

  return (
    <AdminLayout>
      <Head><title>Dashboard — {userData?.restaurantName || 'Advert Radical'}</title></Head>

      {/* Page header */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12, marginBottom: 20,
      }}>
        <div>
          <h1 style={{ ...ADMIN_STYLES.h1, fontSize: 30 }}>
            Dashboard <span style={{ fontFamily: T.fontDisplay, fontStyle: 'italic', fontWeight: 500, color: T.warning }}>overview</span>
          </h1>
          <p style={{ ...ADMIN_STYLES.sub, marginTop: 4 }}>
            {userData?.restaurantName || 'Your restaurant'} · live as of {new Date().toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {(activeCalls > 0 || pendingOrdersCount > 0) && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 12px', borderRadius: 999,
              background: 'rgba(196,168,109,0.14)', border: `1px solid ${T.warning}40`,
              fontFamily: T.font, fontSize: 12, fontWeight: 600, color: T.ink,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.warning, animation: 'arPulse 1.6s ease-in-out infinite' }} />
              {pendingOrdersCount > 0 && `${pendingOrdersCount} pending`}
              {pendingOrdersCount > 0 && activeCalls > 0 && ' · '}
              {activeCalls > 0 && `${activeCalls} call${activeCalls > 1 ? 's' : ''}`}
            </div>
          )}
          <Link href="/admin/analytics" style={{
            padding: '8px 14px', borderRadius: 10, background: T.ink, color: T.cream,
            fontFamily: T.font, fontSize: 12, fontWeight: 600, textDecoration: 'none',
            border: `1px solid ${T.ink}`,
          }}>Open Analytics →</Link>
        </div>
      </div>

      {/* GRID */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gridAutoRows: 'min-content',
        gap: 14,
      }}>

        {/* ── Hero chart : Revenue last 14 days ── */}
        <CardChrome
          title="Revenue Trend"
          style={{ gridColumn: 'span 8' }}
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                ...labelSm, padding: '5px 10px', borderRadius: 999,
                background: T.cream, color: T.stone,
              }}>LAST 14 DAYS</span>
            </div>
          }
        >
          {/* floating annotation */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
            <span style={{
              fontFamily: T.font, fontWeight: 700, fontSize: 30, color: T.ink, letterSpacing: '-0.5px',
            }}>{fmtINR(todayRevenue)}</span>
            <TrendPill pct={revWoW} />
            <span style={{ fontFamily: T.font, fontSize: 11, color: T.stone, marginLeft: 2 }}>
              today · WoW vs prev 7 days
            </span>
          </div>

          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <AreaChart data={revenueSeries} margin={{ top: 18, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="strokeGradHome" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#D4943A" />
                    <stop offset="100%" stopColor={T.success} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date" tickFormatter={fmtTick}
                  tick={{ fontFamily: T.font, fontSize: 10, fill: T.stone }}
                  axisLine={false} tickLine={false} minTickGap={28}
                />
                <YAxis
                  tickFormatter={fmtINRShort}
                  tick={{ fontFamily: T.font, fontSize: 10, fill: T.stone }}
                  axisLine={false} tickLine={false} width={48}
                />
                <Tooltip content={<ChartTip prefix="₹" />} cursor={{ stroke: T.sand, strokeDasharray: '3 3' }} />
                <ReferenceLine
                  x={today} stroke={T.ink} strokeOpacity={0.35} strokeDasharray="3 4"
                  label={{ value: 'Today', position: 'top', fill: T.ink, fontSize: 10, fontFamily: T.font, fontWeight: 700 }}
                />
                <Area
                  type="monotone" dataKey="revenue"
                  stroke="url(#strokeGradHome)" strokeWidth={2.5}
                  fill="transparent" fillOpacity={0}
                  dot={false}
                  activeDot={{ r: 5, fill: T.ink, stroke: T.white, strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardChrome>

        {/* ── Donut : Today's order status ── */}
        <CardChrome
          title="Order Status"
          style={{ gridColumn: 'span 4' }}
          action={<Link href="/admin/orders" style={linkSm}>See All →</Link>}
        >
          <div style={{ position: 'relative', width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={totalToday > 0 ? statusMix : [{ name: 'No orders yet', value: 1, color: T.sand }]}
                  dataKey="value" innerRadius={62} outerRadius={92}
                  startAngle={90} endAngle={-270} paddingAngle={totalToday > 0 ? 3 : 0} stroke="none"
                >
                  {(totalToday > 0 ? statusMix : [{ color: T.sand }]).map((s, i) => (
                    <Cell key={i} fill={s.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
            }}>
              <div style={{ ...labelSm, marginBottom: 2 }}>Today</div>
              <div style={{ fontFamily: T.font, fontWeight: 700, fontSize: 30, color: T.ink, letterSpacing: '-0.5px' }}>{totalToday}</div>
              <div style={{ fontFamily: T.font, fontSize: 11, color: T.stone, marginTop: 1 }}>
                order{totalToday !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 10 }}>
            {statusMix.map(s => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
                <span style={{ fontFamily: T.font, fontSize: 11, color: T.stone, fontWeight: 500 }}>
                  <strong style={{ color: T.ink, fontWeight: 700 }}>{s.value}</strong> {s.name}
                </span>
              </div>
            ))}
          </div>
        </CardChrome>

        {/* ── Stat: Today's Orders (gold) ── */}
        <StatCard
          tone="gold"
          label="Today's Orders"
          value={todayOrders}
          trend={ordWoW}
          spark={spark7}
          dataKey="orders"
          link="/admin/orders"
        />

        {/* ── Stat: Today's Revenue (green) ── */}
        <StatCard
          tone="green"
          label="Today's Revenue"
          value={fmtINR(todayRevenue)}
          trend={revWoW}
          spark={spark7}
          dataKey="revenue"
          link="/admin/reports"
        />

        {/* ── Activity feed (tall right) ── */}
        <CardChrome
          title="Live Activity"
          style={{ gridColumn: 'span 4', gridRow: 'span 2' }}
          action={
            <div style={{ display: 'flex', gap: 4, background: T.cream, padding: 3, borderRadius: 999 }}>
              {[
                { k: 'all', label: 'All' },
                { k: 'orders', label: 'Orders' },
                { k: 'calls', label: 'Calls' },
              ].map(t => (
                <button
                  key={t.k}
                  onClick={() => setActivityTab(t.k)}
                  style={{
                    padding: '4px 11px', borderRadius: 999, border: 'none', cursor: 'pointer',
                    fontFamily: T.font, fontSize: 11, fontWeight: 600,
                    background: activityTab === t.k ? T.white : 'transparent',
                    color: activityTab === t.k ? T.ink : T.stone,
                    boxShadow: activityTab === t.k ? '0 1px 3px rgba(38,52,49,0.10)' : 'none',
                    transition: 'all 0.15s',
                  }}
                >{t.label}</button>
              ))}
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 540, overflowY: 'auto' }}>
            {activity.length === 0 && (
              <div style={{
                padding: '40px 8px', textAlign: 'center',
                fontFamily: T.font, fontSize: 12, color: T.stone,
              }}>
                Quiet for now — new orders & calls will appear here live.
              </div>
            )}
            {activity.map((ev, i) => (
              <ActivityRow key={`${ev.kind}-${ev.id}`} ev={ev} isLast={i === activity.length - 1} />
            ))}
          </div>
        </CardChrome>

        {/* ── Top selling items today ── */}
        <CardChrome
          title="Top Sellers Today"
          style={{ gridColumn: 'span 8' }}
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Link href="/admin/items" style={linkSm}>All Items →</Link>
            </div>
          }
        >
          {topItemsToday.length === 0 ? (
            <div style={{
              padding: '32px 8px', textAlign: 'center',
              fontFamily: T.font, fontSize: 12, color: T.stone,
            }}>
              No orders placed yet today. Top sellers will appear here as orders come in.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Rank', 'Item', 'Category', 'Units', 'Revenue', 'Rating'].map(h => (
                      <th key={h} style={{
                        textAlign: h === 'Units' || h === 'Revenue' ? 'right' : 'left',
                        padding: '8px 10px', borderBottom: `1px solid ${T.sand}`,
                        ...labelSm, fontWeight: 700,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topItemsToday.map((it, i) => (
                    <tr key={it.id} style={{ borderBottom: i === topItemsToday.length - 1 ? 'none' : `1px solid ${T.sand}40` }}>
                      <td style={tdL}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 24, height: 24, borderRadius: 8,
                          background: i === 0 ? 'rgba(196,168,109,0.20)' : T.cream,
                          color: i === 0 ? T.warning : T.stone,
                          fontFamily: T.font, fontSize: 11, fontWeight: 700,
                        }}>{i + 1}</span>
                      </td>
                      <td style={tdL}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {it.imageURL ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={it.imageURL} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover' }} />
                          ) : (
                            <span style={{
                              width: 32, height: 32, borderRadius: 8, background: T.cream,
                              display: 'inline-block',
                            }} />
                          )}
                          <span style={{ fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.ink }}>
                            {it.name}
                          </span>
                        </div>
                      </td>
                      <td style={tdL}>
                        <span style={{
                          display: 'inline-block', padding: '3px 9px', borderRadius: 999,
                          background: T.cream, fontFamily: T.font, fontSize: 11, fontWeight: 600, color: T.stone,
                        }}>{it.category}</span>
                      </td>
                      <td style={tdR}>
                        <span style={{ fontFamily: T.font, fontSize: 13, fontWeight: 700, color: T.ink }}>{it.units}</span>
                      </td>
                      <td style={tdR}>
                        <span style={{ fontFamily: T.font, fontSize: 13, fontWeight: 700, color: T.success }}>
                          {fmtINR(it.revenue)}
                        </span>
                      </td>
                      <td style={tdL}>
                        {it.ratingAvg > 0 ? (
                          <span style={{ fontFamily: T.font, fontSize: 12, fontWeight: 600, color: T.warning }}>
                            ★ {it.ratingAvg.toFixed(1)}
                          </span>
                        ) : (
                          <span style={{ fontFamily: T.font, fontSize: 11, color: 'rgba(38,52,49,0.25)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardChrome>

      </div>

      <style jsx global>{`
        @keyframes arPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(1.4); }
        }
      `}</style>
    </AdminLayout>
  );
}

/* ─── StatCard component ─────────────────────────────────────── */

function StatCard({ tone, label, value, trend, spark, dataKey, link }) {
  const isGreen = tone === 'green';
  const barColor = isGreen ? T.success : '#D4943A';

  return (
    <section style={{
      ...ADMIN_STYLES.card, gridColumn: 'span 4', padding: '18px 20px 14px',
      display: 'flex', flexDirection: 'column',
    }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={labelSm}>{label}</span>
        {link && <Link href={link} style={linkSm}>See All →</Link>}
      </header>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{
          fontFamily: T.font, fontWeight: 700, fontSize: 28, color: T.ink, letterSpacing: '-0.5px',
        }}>{value}</span>
        <TrendPill pct={trend} />
      </div>
      <div style={{ fontFamily: T.font, fontSize: 11, color: T.stone, marginTop: 2 }}>
        vs previous 7 days
      </div>
      <div style={{ width: '100%', height: 56, marginTop: 8 }}>
        <ResponsiveContainer>
          <BarChart data={spark} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
            <Tooltip
              cursor={{ fill: 'rgba(38,52,49,0.04)' }}
              content={<ChartTip prefix={dataKey === 'revenue' ? '₹' : ''} />}
            />
            <Bar dataKey={dataKey} fill={barColor} radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

/* ─── Activity row ──────────────────────────────────────────── */

const tdL = { padding: '11px 10px', textAlign: 'left', verticalAlign: 'middle' };
const tdR = { padding: '11px 10px', textAlign: 'right', verticalAlign: 'middle' };

function ActivityRow({ ev, isLast }) {
  const isOrder = ev.kind === 'order';
  const statusColor = isOrder
    ? (ev.status === 'served' ? T.success : ev.status === 'ready' ? T.warning : ev.status === 'preparing' ? '#9B7BC4' : T.danger)
    : (ev.status === 'resolved' ? T.success : T.danger);
  const statusBg = `${statusColor}1F`;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 2px', borderBottom: isLast ? 'none' : `1px solid ${T.sand}40`,
    }}>
      <div style={{
        flexShrink: 0, width: 36, height: 36, borderRadius: 10,
        background: isOrder ? 'rgba(196,168,109,0.14)' : 'rgba(138,74,66,0.12)',
        color: isOrder ? T.warning : T.danger,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16,
      }}>
        {isOrder ? '🍽️' : '🔔'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: T.font, fontSize: 12, fontWeight: 700, color: T.ink }}>
            {isOrder ? `Order · Table ${ev.table || '—'}` : `Waiter Call · Table ${ev.table || '—'}`}
          </span>
          <span style={{
            ...labelSm, padding: '2px 7px', borderRadius: 999,
            background: statusBg, color: statusColor, fontSize: 9,
          }}>{ev.status}</span>
        </div>
        <div style={{ fontFamily: T.font, fontSize: 11, color: T.stone, marginTop: 2 }}>
          {isOrder
            ? `${ev.itemCount} item${ev.itemCount !== 1 ? 's' : ''} · ${fmtINR(ev.total)}`
            : 'Tap to attend'}
        </div>
      </div>
      <span style={{
        flexShrink: 0, fontFamily: T.font, fontSize: 10, fontWeight: 600,
        color: T.stone, opacity: 0.7,
      }}>{timeAgoShort(ev.ts)}</span>
    </div>
  );
}