import Head from 'next/head';
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { updateOrderStatus } from '../../lib/db';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

const STATUS_META = {
  pending:   { label: 'New',       color: '#E05A3A', bg: 'rgba(224,90,58,0.12)',   next: 'preparing', nextLabel: '👨‍🍳 Start Preparing' },
  preparing: { label: 'Preparing', color: '#F79B3D', bg: 'rgba(247,155,61,0.12)',   next: 'ready',     nextLabel: '✅ Mark Ready'        },
  ready:     { label: 'Ready',     color: '#2D8B4E', bg: 'rgba(45,139,78,0.12)',    next: 'served',    nextLabel: '🍽 Mark Served'        },
  served:    { label: 'Served',    color: '#888',    bg: 'rgba(42,31,16,0.06)',      next: null,        nextLabel: null                   },
};

function elapsed(seconds) {
  if (!seconds) return '0s';
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

function isUrgent(seconds) {
  if (!seconds) return false;
  return (Math.floor(Date.now() / 1000) - seconds) > 600; // > 10 minutes
}

export default function KitchenDashboard() {
  const { userData } = useAuth();
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('active'); // active | all
  const [updating, setUpdating] = useState(null);
  const [tick, setTick] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const prevCountRef = useRef(0);
  const audioCtx = useRef(null);

  // Tick every second to update elapsed timers
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Kitchen alert sound — urgent buzzer
  const playAlert = () => {
    try {
      if (!audioCtx.current) audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx.current;
      const buzz = (freq, start, dur) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.3, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
        osc.start(start); osc.stop(start + dur);
      };
      buzz(440, ctx.currentTime, 0.15);
      buzz(440, ctx.currentTime + 0.18, 0.15);
      buzz(550, ctx.currentTime + 0.36, 0.25);
    } catch {}
  };

  // Realtime orders listener
  useEffect(() => {
    if (!userData?.restaurantId) return;
    const rid = userData.restaurantId;
    const q = query(collection(db, 'restaurants', rid, 'orders'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Alert on new pending orders
      const pendingCount = all.filter(o => o.status === 'pending').length;
      if (pendingCount > prevCountRef.current) playAlert();
      prevCountRef.current = pendingCount;
      setOrders(all);
    });
    return unsub;
  }, [userData?.restaurantId]);

  const handleNext = async (order) => {
    const meta = STATUS_META[order.status];
    if (!meta?.next) return;
    setUpdating(order.id);
    try {
      await updateOrderStatus(userData.restaurantId, order.id, meta.next);
    } catch (e) { console.error(e); }
    setUpdating(null);
  };

  const filtered = orders.filter(o =>
    filter === 'active' ? ['pending', 'preparing', 'ready'].includes(o.status) : true
  );

  // Group by status for active view
  const groups = filter === 'active'
    ? [
        { key: 'pending',   label: '🔴 New Orders',  orders: filtered.filter(o => o.status === 'pending') },
        { key: 'preparing', label: '🟠 Preparing',   orders: filtered.filter(o => o.status === 'preparing') },
        { key: 'ready',     label: '🟢 Ready',        orders: filtered.filter(o => o.status === 'ready') },
      ]
    : [{ key: 'all', label: 'All Orders', orders: filtered }];

  const totalActive = orders.filter(o => ['pending', 'preparing'].includes(o.status)).length;

  return (
    <AdminLayout>
      <Head><title>Kitchen Display | Advert Radical</title></Head>

      <div style={{ padding: fullscreen ? 16 : '0 0 40px', minHeight: '100vh', background: '#0F0F0F' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div>
            <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 22, color: '#fff' }}>
              🍳 Kitchen Display
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
              {totalActive > 0 ? `${totalActive} order${totalActive !== 1 ? 's' : ''} in progress` : 'All clear — no active orders'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {/* Filter tabs */}
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.07)', borderRadius: 10, padding: 3, gap: 2 }}>
              {[['active','Active'],['all','All']].map(([v,l]) => (
                <button key={v} onClick={() => setFilter(v)} style={{
                  padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  background: filter === v ? '#F79B3D' : 'transparent',
                  color: filter === v ? '#fff' : 'rgba(255,255,255,0.5)',
                }}>{l}</button>
              ))}
            </div>
            {/* Fullscreen toggle */}
            <button onClick={() => setFullscreen(f => !f)} style={{
              padding: '6px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 18,
            }}>{fullscreen ? '⊡' : '⛶'}</button>
          </div>
        </div>

        {/* Board */}
        <div style={{ padding: '20px 16px' }}>
          {filter === 'active' ? (
            // 3-column KDS layout
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {groups.map(group => (
                <div key={group.key}>
                  {/* Column header */}
                  <div style={{
                    padding: '10px 14px', borderRadius: 12, marginBottom: 12, textAlign: 'center',
                    fontWeight: 700, fontSize: 14, letterSpacing: '0.04em',
                    background: STATUS_META[group.key]?.bg || 'rgba(255,255,255,0.06)',
                    color: STATUS_META[group.key]?.color || '#fff',
                    border: `1px solid ${STATUS_META[group.key]?.color || 'transparent'}33`,
                  }}>
                    {group.label}
                    <span style={{ marginLeft: 8, background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '1px 8px', fontSize: 12 }}>
                      {group.orders.length}
                    </span>
                  </div>

                  {/* Cards */}
                  {group.orders.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 16px', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>
                      No orders here
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {group.orders.map(order => {
                        const meta = STATUS_META[order.status] || STATUS_META.pending;
                        const urgent = isUrgent(order.createdAt?.seconds);
                        const elapsedTime = elapsed(order.createdAt?.seconds);
                        return (
                          <div key={order.id} style={{
                            background: urgent ? 'rgba(224,90,58,0.08)' : '#1A1A1A',
                            border: urgent ? '1.5px solid rgba(224,90,58,0.5)' : '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 16, padding: 16, position: 'relative',
                            boxShadow: urgent ? '0 0 20px rgba(224,90,58,0.15)' : 'none',
                            animation: order.status === 'pending' ? 'none' : 'none',
                          }}>
                            {/* Urgent badge */}
                            {urgent && (
                              <div style={{ position: 'absolute', top: 10, right: 10, background: '#E05A3A', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
                                ⚠ URGENT
                              </div>
                            )}

                            {/* Table + time */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                              <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 18, color: '#fff' }}>
                                {order.tableNumber ? `Table ${order.tableNumber}` : 'No Table'}
                              </div>
                              <div style={{ fontSize: 12, color: urgent ? '#E05A3A' : 'rgba(255,255,255,0.35)', fontWeight: urgent ? 700 : 400 }}>
                                ⏱ {elapsedTime}
                              </div>
                            </div>

                            {/* Items */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                              {(order.items || []).map((item, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                  <div style={{
                                    minWidth: 28, height: 28, background: meta.bg, borderRadius: 8,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontWeight: 800, fontSize: 13, color: meta.color, flexShrink: 0,
                                  }}>{item.qty}</div>
                                  <div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', lineHeight: 1.3 }}>{item.name}</div>
                                    {item.note && (
                                      <div style={{ fontSize: 11, color: '#F79B3D', marginTop: 2 }}>📝 {item.note}</div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Status button */}
                            {meta.next && (
                              <button
                                onClick={() => handleNext(order)}
                                disabled={updating === order.id}
                                style={{
                                  width: '100%', padding: '10px', borderRadius: 10, border: 'none',
                                  background: meta.color, color: '#fff',
                                  fontWeight: 700, fontSize: 13, cursor: 'pointer',
                                  opacity: updating === order.id ? 0.6 : 1,
                                }}
                              >
                                {updating === order.id ? 'Updating…' : meta.nextLabel}
                              </button>
                            )}
                            {!meta.next && (
                              <div style={{ textAlign: 'center', padding: '8px', fontSize: 12, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>
                                ✓ Served
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            // All orders list view
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 600 }}>
              {filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.3)' }}>No orders yet</div>
              )}
              {filtered.map(order => {
                const meta = STATUS_META[order.status] || STATUS_META.pending;
                return (
                  <div key={order.id} style={{ background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ minWidth: 90 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: '#fff' }}>{order.tableNumber ? `Table ${order.tableNumber}` : 'No Table'}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{elapsed(order.createdAt?.seconds)} ago</div>
                    </div>
                    <div style={{ flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                      {(order.items || []).map(i => `${i.qty}× ${i.name}`).join(', ')}
                    </div>
                    <div style={{ padding: '4px 12px', borderRadius: 20, background: meta.bg, color: meta.color, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                      {meta.label}
                    </div>
                    {meta.next && (
                      <button onClick={() => handleNext(order)} disabled={updating === order.id} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: meta.color, color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>
                        {updating === order.id ? '…' : meta.nextLabel}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
