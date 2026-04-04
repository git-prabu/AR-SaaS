import Head from 'next/head';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { resolveWaiterCall, updateOrderStatus } from '../../lib/db';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

function timeAgo(seconds) {
  if (!seconds) return 'just now';
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function isToday(seconds) {
  if (!seconds) return false;
  const d = new Date(seconds * 1000);
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

function isWaiting(seconds) {
  if (!seconds) return false;
  return (Date.now() / 1000 - seconds) > 180; // 3 minutes
}

const CALL_ICONS = {
  order: '🍽', bill: '🧾', water: '💧', condiment: '🧂', issue: '⚠', other: '🔔',
};
const CALL_COLORS = {
  order: { color: '#F79B3D', bg: 'rgba(247,155,61,0.1)', label: 'Take Order' },
  bill:  { color: '#E05A3A', bg: 'rgba(224,90,58,0.1)',  label: 'Bill Please' },
  water: { color: '#4A9FD4', bg: 'rgba(74,159,212,0.1)', label: 'Water Refill' },
  condiment: { color: '#8B6F47', bg: 'rgba(139,111,71,0.1)', label: 'Condiments' },
  issue: { color: '#DC2626', bg: 'rgba(220,38,38,0.1)', label: 'Issue at Table' },
  other: { color: '#6366F1', bg: 'rgba(99,102,241,0.1)', label: 'Assistance' },
};

function getCallMeta(reason) {
  if (!reason) return { ...CALL_COLORS.other, icon: '🔔', label: 'Assistance' };
  const key = Object.keys(CALL_COLORS).find(k => reason.toLowerCase().includes(k));
  if (key) return { ...CALL_COLORS[key], icon: CALL_ICONS[key] };
  return { ...CALL_COLORS.other, icon: '🔔', label: reason };
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

export default function WaiterDashboard() {
  const { user, userData, loading: adminLoading } = useAuth();
  const router = useRouter();
  const [staffSession, setStaffSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [calls, setCalls] = useState([]);
  const [readyOrders, setReadyOrders] = useState([]);
  const [resolvingCall, setResolvingCall] = useState(null);
  const [servingOrder, setServingOrder] = useState(null);
  const [tab, setTab] = useState('calls');
  const prevCallsCountRef = useRef(0);
  const audioCtx = useRef(null);

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
    if (staffSession?.role === 'waiter') return; // correct role, allow
    if (staffSession?.role === 'kitchen') { router.replace('/admin/kitchen'); return; }
    router.replace('/staff/login');
  }, [authChecked, adminLoading, user, userData, staffSession]);

  const rid = userData?.restaurantId || staffSession?.restaurantId;
  const isAdmin = !!userData?.restaurantId;

  // Bell sound
  const playBell = () => {
    try {
      if (!audioCtx.current) audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx.current;
      [[880, 0, 0.4], [1100, 0.22, 0.35]].forEach(([freq, start, dur]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(0, ctx.currentTime + start);
        gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur);
      });
    } catch {}
  };

  // Waiter calls listener
  useEffect(() => {
    if (!rid) return;
    const q = query(collection(db, 'restaurants', rid, 'waiterCalls'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const pendingCount = all.filter(c => c.status === 'pending').length;
      if (pendingCount > prevCallsCountRef.current) playBell();
      prevCallsCountRef.current = pendingCount;
      setCalls(all);
    });
  }, [rid]);

  // Ready orders listener
  useEffect(() => {
    if (!rid) return;
    const q = query(collection(db, 'restaurants', rid, 'orders'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      setReadyOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(o => o.status === 'ready'));
    });
  }, [rid]);

  const handleResolveCall = async (call) => {
    setResolvingCall(call.id);
    try { await resolveWaiterCall(rid, call.id); } catch {}
    setResolvingCall(null);
  };

  const handleMarkServed = async (order) => {
    setServingOrder(order.id);
    try { await updateOrderStatus(rid, order.id, 'served'); } catch {}
    setServingOrder(null);
  };

  const staffLogout = () => {
    localStorage.removeItem('ar_staff_session');
    router.replace('/staff/login');
  };

  const pendingCalls = calls.filter(c => c.status === 'pending');
  // "Resolved Today" — only calls resolved/created today
  const resolvedToday = calls.filter(c => c.status === 'resolved' && isToday(c.createdAt?.seconds));
  const historyItems = calls.filter(c => c.status === 'resolved');

  if (adminLoading || !authChecked) return null;

  // ── Tab content ──
  const TABS = [
    { key: 'calls', label: `Calls`, badge: pendingCalls.length },
    { key: 'serve', label: `Serve`, badge: readyOrders.length },
    { key: 'history', label: `History`, badge: null },
  ];

  const MainContent = (
    <div style={{ fontFamily: 'Inter,sans-serif' }}>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Pending Calls',   value: pendingCalls.length,   color: '#E05A3A', bg: 'rgba(224,90,58,0.07)',   icon: '🔔' },
          { label: 'Ready to Serve',  value: readyOrders.length,    color: '#2D8B4E', bg: 'rgba(45,139,78,0.07)',   icon: '🍽' },
          { label: 'Resolved Today',  value: resolvedToday.length,  color: '#6366F1', bg: 'rgba(99,102,241,0.07)', icon: '✅' },
        ].map(c => (
          <div key={c.label} style={{ background: c.bg, border: `1.5px solid ${c.color}30`, borderRadius: 16, padding: '20px 22px' }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>{c.icon}</div>
            <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 32, color: c.color, lineHeight: 1 }}>{c.value}</div>
            <div style={{ fontSize: 12, color: 'rgba(42,31,16,0.5)', fontWeight: 600, marginTop: 6 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: 'rgba(42,31,16,0.05)', borderRadius: 10, padding: 3, gap: 3, marginBottom: 18, width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontWeight: 600, fontSize: 13, position: 'relative',
            background: tab === t.key ? '#fff' : 'transparent',
            color: tab === t.key ? '#1E1B18' : 'rgba(42,31,16,0.5)',
            boxShadow: tab === t.key ? '0 1px 6px rgba(42,31,16,0.1)' : 'none',
          }}>
            {t.label}
            {t.badge > 0 && (
              <span style={{ marginLeft: 6, background: '#E05A3A', color: '#fff', borderRadius: 20, padding: '1px 6px', fontSize: 11, fontWeight: 800 }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Calls */}
      {tab === 'calls' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pendingCalls.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '44px 20px', background: 'rgba(42,31,16,0.03)', borderRadius: 14, border: '1px dashed rgba(42,31,16,0.1)' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
              <div style={{ fontWeight: 700, color: 'rgba(42,31,16,0.5)' }}>No pending calls</div>
            </div>
          ) : pendingCalls.map(call => {
            const meta = getCallMeta(call.reason);
            const waiting = isWaiting(call.createdAt?.seconds);
            return (
              <div key={call.id} style={{
                background: '#fff', borderRadius: 14, padding: '16px 18px',
                border: `1.5px solid ${waiting ? '#E05A3A' : meta.color}33`,
                borderLeft: `4px solid ${waiting ? '#E05A3A' : meta.color}`,
                boxShadow: waiting ? '0 2px 16px rgba(224,90,58,0.1)' : '0 2px 8px rgba(42,31,16,0.05)',
                display: 'flex', alignItems: 'center', gap: 14,
                animation: waiting ? 'callPulse 2s infinite' : 'none',
              }}>
                <div style={{ fontSize: 30, flexShrink: 0 }}>{meta.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 16, color: '#1E1B18' }}>
                      Table {call.tableNumber || '—'}
                    </div>
                    <div style={{ padding: '2px 10px', borderRadius: 20, background: meta.bg, color: meta.color, fontSize: 11, fontWeight: 700 }}>
                      {meta.label}
                    </div>
                    {waiting && <div style={{ padding: '2px 10px', borderRadius: 20, background: 'rgba(224,90,58,0.1)', color: '#E05A3A', fontSize: 11, fontWeight: 700 }}>Waiting long</div>}
                  </div>
                  {call.reason && <div style={{ fontSize: 13, color: 'rgba(42,31,16,0.5)', marginBottom: 2 }}>"{call.reason}"</div>}
                  <div style={{ fontSize: 12, color: 'rgba(42,31,16,0.35)' }}>{timeAgo(call.createdAt?.seconds)}</div>
                </div>
                <button onClick={() => handleResolveCall(call)} disabled={resolvingCall === call.id} style={{
                  padding: '10px 18px', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg,#2D8B4E,#1A6B38)',
                  color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  opacity: resolvingCall === call.id ? 0.6 : 1, flexShrink: 0,
                }}>
                  {resolvingCall === call.id ? '…' : 'Resolve'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab: Serve */}
      {tab === 'serve' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {readyOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '44px 20px', background: 'rgba(42,31,16,0.03)', borderRadius: 14, border: '1px dashed rgba(42,31,16,0.1)' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>👨‍🍳</div>
              <div style={{ fontWeight: 700, color: 'rgba(42,31,16,0.5)' }}>No orders ready yet</div>
            </div>
          ) : readyOrders.map(order => (
            <div key={order.id} style={{
              background: '#fff', borderRadius: 14, padding: '16px 18px',
              border: '1.5px solid rgba(45,139,78,0.3)', borderLeft: '4px solid #2D8B4E',
              boxShadow: '0 2px 14px rgba(45,139,78,0.1)',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{ fontSize: 30, flexShrink: 0 }}>🍽</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 16, color: '#1E1B18', marginBottom: 6 }}>
                  {order.tableNumber ? `Table ${order.tableNumber}` : 'No Table'}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 4 }}>
                  {(order.items || []).map((item, i) => (
                    <div key={i} style={{ padding: '2px 10px', borderRadius: 20, background: 'rgba(45,139,78,0.08)', color: '#2D8B4E', fontSize: 12, fontWeight: 600 }}>
                      {item.qty}x {item.name}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(42,31,16,0.35)' }}>
                  Ready {timeAgo(order.updatedAt?.seconds || order.createdAt?.seconds)}
                </div>
              </div>
              <button onClick={() => handleMarkServed(order)} disabled={servingOrder === order.id} style={{
                padding: '10px 18px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg,#2D8B4E,#1A6B38)',
                color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                opacity: servingOrder === order.id ? 0.6 : 1, flexShrink: 0,
              }}>
                {servingOrder === order.id ? '…' : 'Mark Served'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Tab: History */}
      {tab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(42,31,16,0.45)', marginBottom: 6 }}>Resolved calls — all time ({historyItems.length})</div>
          {historyItems.length === 0 && <div style={{ textAlign: 'center', padding: 32, color: 'rgba(42,31,16,0.3)' }}>No history yet</div>}
          {historyItems.map(call => {
            const meta = getCallMeta(call.reason);
            const waitSec = call.resolvedAt?.seconds && call.createdAt?.seconds
              ? call.resolvedAt.seconds - call.createdAt.seconds : null;
            const waitMin = waitSec !== null ? Math.round(waitSec / 60) : null;
            return (
              <div key={call.id} style={{ background: 'rgba(42,31,16,0.02)', border: '1px solid rgba(42,31,16,0.07)', borderRadius: 10, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 18 }}>{meta.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#1E1B18' }}>
                    Table {call.tableNumber || '—'} — {meta.label}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(42,31,16,0.4)', marginTop: 2 }}>
                    {timeAgo(call.createdAt?.seconds)}
                    {waitMin !== null && ` · Resolved in ${waitMin < 1 ? '<1' : waitMin}m`}
                  </div>
                </div>
                <div style={{ padding: '2px 10px', borderRadius: 20, background: 'rgba(45,139,78,0.08)', color: '#2D8B4E', fontSize: 11, fontWeight: 700 }}>Resolved</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (isAdmin) {
    return (
      <AdminLayout>
        <Head><title>Waiter Dashboard | Advert Radical</title></Head>
        <div style={{ padding: '28px 32px', maxWidth: 1000, paddingBottom: 60 }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 22, color: '#1E1B18' }}>Waiter Dashboard</div>
            <div style={{ fontSize: 13, color: 'rgba(42,31,16,0.45)', marginTop: 4 }}>Live calls and ready-to-serve orders</div>
          </div>
          {MainContent}
        </div>
        <style jsx>{`@keyframes callPulse { 0%,100%{box-shadow:0 2px 8px rgba(42,31,16,0.05)} 50%{box-shadow:0 2px 20px rgba(224,90,58,0.2)} }`}</style>
      </AdminLayout>
    );
  }

  // Staff view — no sidebar
  return (
    <>
      <Head><title>Waiter Dashboard | Advert Radical</title></Head>
      <div style={{ minHeight: '100vh', background: '#F9F6F1', fontFamily: 'Inter,sans-serif' }}>
        {/* Staff header */}
        <div style={{ background: '#fff', borderBottom: '1px solid rgba(42,31,16,0.08)', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 900, fontSize: 16 }}>
              <span style={{ color: '#1E1B18' }}>Advert </span><span style={{ color: '#F79B3D' }}>Radical</span>
            </div>
            <div style={{ width: 1, height: 18, background: 'rgba(42,31,16,0.15)' }} />
            <div style={{ fontSize: 13, color: 'rgba(42,31,16,0.5)', fontWeight: 600 }}>{staffSession?.restaurantName}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 12, color: 'rgba(42,31,16,0.45)' }}>
              <span style={{ color: '#F79B3D', fontWeight: 700 }}>{staffSession?.name}</span>
            </div>
            <button onClick={staffLogout} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(42,31,16,0.15)', background: '#fff', color: 'rgba(42,31,16,0.5)', cursor: 'pointer', fontSize: 12 }}>
              Sign Out
            </button>
          </div>
        </div>
        <div style={{ padding: '20px 16px', maxWidth: 640, margin: '0 auto' }}>
          <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 20, color: '#1E1B18', marginBottom: 16 }}>Waiter Dashboard</div>
          {MainContent}
        </div>
      </div>
      <style jsx>{`@keyframes callPulse { 0%,100%{box-shadow:0 2px 8px rgba(42,31,16,0.05)} 50%{box-shadow:0 2px 20px rgba(224,90,58,0.2)} }`}</style>
    </>
  );
}
