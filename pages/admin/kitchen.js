import Head from 'next/head';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { updateOrderStatus } from '../../lib/db';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
// Direct Firestore listeners used instead of context for reliability
import { T } from '../../lib/utils';

const STATUS_META = {
  pending:   { label: 'New Order',  color: '#8A4A42', bg: 'rgba(138,74,66,0.15)',  border: 'rgba(138,74,66,0.4)',  next: 'preparing', nextLabel: 'Start Preparing', nextBg: '#8A4A42' },
  preparing: { label: 'Preparing',  color: '#C4A86D', bg: 'rgba(196,168,109,0.15)', border: 'rgba(196,168,109,0.4)', next: 'ready',     nextLabel: 'Mark Ready',       nextBg: '#C4A86D' },
  ready:     { label: 'Ready',      color: '#4A7A5E', bg: 'rgba(74,122,94,0.15)',  border: 'rgba(74,122,94,0.4)',  next: 'served',    nextLabel: 'Mark Served',      nextBg: '#4A7A5E' },
  served:    { label: 'Served',     color: '#888',    bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.1)', next: null, nextLabel: null, nextBg: null },
};

// Must match the sidebar width in AdminLayout.jsx (currently 250px)
const SIDEBAR_W = 250;

const COLUMNS = [
  { key: 'pending',   title: 'New Orders',  dot: '#8A4A42' },
  { key: 'preparing', title: 'Preparing',   dot: '#C4A86D' },
  { key: 'ready',     title: 'Ready',       dot: '#4A7A5E' },
];

function elapsed(seconds) {
  if (!seconds) return '0s';
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

function isUrgent(seconds) {
  if (!seconds) return false;
  return (Math.floor(Date.now() / 1000) - seconds) > 600;
}

function getStaffSession() {
  if (typeof window === 'undefined') return null;
  try {
    const s = localStorage.getItem('ar_staff_session');
    if (!s) return null;
    const parsed = JSON.parse(s);
    const hours = (Date.now() - new Date(parsed.loggedInAt).getTime()) / 3600000;
    return hours < 12 ? parsed : null;
  } catch { return null; }
}

export default function KitchenDashboard() {
  const { user, userData, loading: adminLoading } = useAuth();
  const router = useRouter();
  const [staffSession, setStaffSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [allOrdersLocal, setAllOrdersLocal] = useState([]);
  const [filter, setFilter] = useState('active');
  const [updating, setUpdating] = useState(null);
  const [tick, setTick] = useState(0);
  const audioCtx = useRef(null);
  const prevPendingRef = useRef(0);

  // Auth check
  useEffect(() => {
    const session = getStaffSession();
    setStaffSession(session);
    setAuthChecked(true);
  }, []);

  useEffect(() => {
    if (!authChecked || adminLoading) return;
    // Wait for userData to finish loading after Firebase auth resolves
    if (user && !userData) return;
    const isAdmin = !!userData?.restaurantId;
    // Admin has full access — ignore any staff session in localStorage
    if (isAdmin) return;
    // Not a Firebase admin — check staff session
    if (staffSession?.role === 'kitchen') return; // correct role, allow
    if (staffSession?.role === 'waiter') { router.replace('/admin/waiter'); return; }
    router.replace('/staff/login');
  }, [authChecked, adminLoading, user, userData, staffSession]);

  const rid = userData?.restaurantId || staffSession?.restaurantId;
  const isAdmin = !!userData?.restaurantId;

  // Timer tick — 1s interval is intentional: kitchen staff need second-level
  // elapsed-time accuracy per order to manage prep urgency. The tick only
  // drives a lightweight counter increment (no heavy re-renders).
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Alert sound
  const playAlert = () => {
    try {
      if (!audioCtx.current) audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx.current;
      [0, 0.2, 0.4].forEach((offset, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(i === 2 ? 550 : 440, ctx.currentTime + offset);
        gain.gain.setValueAtTime(0.25, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.18);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.18);
      });
    } catch {}
  };

  // Direct Firestore listener — always active for both admin and staff
  useEffect(() => {
    if (!rid) return;
    const q = query(collection(db, 'restaurants', rid, 'orders'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const pendingCount = all.filter(o => o.status === 'pending').length;
      if (pendingCount > prevPendingRef.current) playAlert();
      prevPendingRef.current = pendingCount;
      setAllOrdersLocal(all);
    });
    return unsub;
  }, [rid]);

  const orders = allOrdersLocal;

  const handleNext = async (order) => {
    const meta = STATUS_META[order.status];
    if (!meta?.next) return;
    setUpdating(order.id);
    try { await updateOrderStatus(rid, order.id, meta.next); }
    catch (e) { console.error(e); }
    setUpdating(null);
  };

  const staffLogout = () => {
    localStorage.removeItem('ar_staff_session');
    router.replace('/staff/login');
  };

  const activeOrders = orders.filter(o => ['pending','preparing','ready'].includes(o.status));
  const filtered = filter === 'active' ? activeOrders : orders;
  const totalActive = orders.filter(o => ['pending','preparing'].includes(o.status)).length;

  if (adminLoading || !authChecked) return null;

  // ── KDS Board content (shared between admin and staff views) ──
  const KDSContent = (
    <div style={{ flex: 1, background: '#0F0F0F', display: 'flex', flexDirection: 'column', fontFamily: T.font }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#141414', flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: T.fontDisplay, fontWeight: 800, fontSize: 20, color: '#fff' }}>
            Kitchen Display
          </div>
          <div style={{ fontSize: 12, fontFamily: T.font, color: totalActive > 0 ? '#C4A86D' : 'rgba(255,255,255,0.35)', marginTop: 2, fontWeight: totalActive > 0 ? 700 : 400 }}>
            {totalActive > 0 ? `${totalActive} order${totalActive !== 1 ? 's' : ''} need attention` : 'All clear'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.07)', borderRadius: 8, padding: 3 }}>
            {[['active','Active'],['all','All']].map(([v,l]) => (
              <button key={v} onClick={() => setFilter(v)} style={{
                padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: T.font,
                background: filter === v ? '#C4A86D' : 'transparent',
                color: filter === v ? '#fff' : 'rgba(255,255,255,0.45)',
              }}>{l}</button>
            ))}
          </div>
          {!isAdmin && (
            <button onClick={staffLogout} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: T.font }}>
              Sign Out
            </button>
          )}
        </div>
      </div>

      {/* Board */}
      <div style={{ flex: 1, padding: '16px 20px', overflowY: 'auto' }}>
        {filter === 'active' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, alignItems: 'start' }}>
            {COLUMNS.map(col => {
              const colOrders = filtered.filter(o => o.status === col.key);
              const meta = STATUS_META[col.key];
              return (
                <div key={col.key} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Column header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: `1px solid rgba(255,255,255,0.08)` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: col.dot, boxShadow: `0 0 8px ${col.dot}` }} />
                      <span style={{ fontWeight: 700, fontSize: 13, color: '#fff', fontFamily: T.font }}>{col.title}</span>
                    </div>
                    <div style={{ background: meta.bg, color: meta.color, borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 800, fontFamily: T.font }}>
                      {colOrders.length}
                    </div>
                  </div>

                  {/* Cards */}
                  {colOrders.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '28px 12px', color: 'rgba(255,255,255,0.18)', fontSize: 13, borderRadius: 12, border: '1px dashed rgba(255,255,255,0.07)', fontFamily: T.font }}>
                      No orders
                    </div>
                  ) : colOrders.map(order => {
                    const urgent = isUrgent(order.createdAt?.seconds);
                    return (
                      <div key={order.id} style={{
                        background: urgent ? 'rgba(138,74,66,0.07)' : '#1C1C1C',
                        border: `1.5px solid ${urgent ? 'rgba(138,74,66,0.5)' : meta.border}`,
                        borderRadius: 14, padding: 14, position: 'relative',
                        boxShadow: urgent ? '0 0 20px rgba(138,74,66,0.15)' : 'none',
                      }}>
                        {urgent && (
                          <div style={{ position: 'absolute', top: -1, right: 12, transform: 'translateY(-50%)', background: '#8A4A42', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 20, fontFamily: T.font }}>
                            URGENT
                          </div>
                        )}

                        {/* Table + timer */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                          <div style={{ fontFamily: T.fontDisplay, fontWeight: 800, fontSize: 17, color: '#fff' }}>
                            {order.tableNumber ? `Table ${order.tableNumber}` : 'No Table'}
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 700, fontFamily: T.font, color: urgent ? '#8A4A42' : 'rgba(255,255,255,0.3)', background: urgent ? 'rgba(138,74,66,0.12)' : 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: 8 }}>
                            {elapsed(order.createdAt?.seconds)}
                          </div>
                        </div>

                        {/* Items */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                          {(order.items || []).map((item, i) => (
                            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                              <div style={{
                                minWidth: 26, height: 26, borderRadius: 8,
                                background: meta.bg, color: meta.color,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 800, fontSize: 13, flexShrink: 0, fontFamily: T.font,
                              }}>{item.qty}</div>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', lineHeight: 1.3, fontFamily: T.font }}>{item.name}</div>
                                {item.note && <div style={{ fontSize: 11, color: '#C4A86D', marginTop: 2, fontFamily: T.font }}>Note: {item.note}</div>}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Action button */}
                        {meta.next ? (
                          <button onClick={() => handleNext(order)} disabled={updating === order.id} style={{
                            width: '100%', padding: '10px', borderRadius: 10, border: 'none',
                            background: meta.nextBg, color: '#fff',
                            fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: T.font,
                            opacity: updating === order.id ? 0.6 : 1,
                          }}>
                            {updating === order.id ? 'Updating…' : meta.nextLabel}
                          </button>
                        ) : (
                          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 12, fontWeight: 600, fontFamily: T.font }}>Completed</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ) : (
          // All orders list
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 640 }}>
            {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.25)', fontSize: 14, fontFamily: T.font }}>No orders yet</div>}
            {filtered.map(order => {
              const meta = STATUS_META[order.status] || STATUS_META.pending;
              return (
                <div key={order.id} style={{ background: '#1C1C1C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ minWidth: 80 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: '#fff', fontFamily: T.font }}>{order.tableNumber ? `Table ${order.tableNumber}` : 'No Table'}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2, fontFamily: T.font }}>{elapsed(order.createdAt?.seconds)}</div>
                  </div>
                  <div style={{ flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.6)', fontFamily: T.font }}>{(order.items||[]).map(i=>`${i.qty}× ${i.name}`).join(', ')}</div>
                  <div style={{ padding: '3px 12px', borderRadius: 20, background: meta.bg, color: meta.color, fontSize: 11, fontWeight: 700, flexShrink: 0, fontFamily: T.font }}>{meta.label}</div>
                  {meta.next && (
                    <button onClick={() => handleNext(order)} disabled={updating === order.id} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: meta.nextBg, color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer', flexShrink: 0, fontFamily: T.font }}>
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
  );

  // Admin sees AdminLayout wrapper; staff sees bare full-screen dark view
  if (isAdmin) {
    return (
      <AdminLayout>
        <Head><title>Kitchen Display | Advert Radical</title></Head>
        <div style={{ position: 'fixed', top: 0, left: SIDEBAR_W, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', background: '#0F0F0F', zIndex: 1 }}>
          {KDSContent}
        </div>
      </AdminLayout>
    );
  }

  return (
    <>
      <Head><title>Kitchen Display | Advert Radical</title></Head>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#0F0F0F' }}>
        {/* Staff header bar */}
        <div style={{ background: '#141414', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontFamily: T.fontDisplay, fontWeight: 900, fontSize: 16 }}>
              <span style={{ color: '#fff' }}>Advert </span><span style={{ color: '#C4A86D' }}>Radical</span>
            </div>
            <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.15)' }} />
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: 600, fontFamily: T.font }}>{staffSession?.restaurantName}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: T.font }}>
              Logged in as <span style={{ color: '#C4A86D', fontWeight: 700 }}>{staffSession?.name}</span>
            </div>
            <button onClick={staffLogout} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 12, fontFamily: T.font }}>
              Sign Out
            </button>
          </div>
        </div>
        {KDSContent}
      </div>
    </>
  );
}
