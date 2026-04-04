import Head from 'next/head';
import { useEffect, useState, useRef } from 'react';
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

const CALL_REASON_META = {
  order:     { icon: '🍽', label: 'Take Order',     color: '#F79B3D', bg: 'rgba(247,155,61,0.1)' },
  bill:      { icon: '🧾', label: 'Bill Please',     color: '#E05A3A', bg: 'rgba(224,90,58,0.1)' },
  water:     { icon: '💧', label: 'Water Refill',    color: '#4A9FD4', bg: 'rgba(74,159,212,0.1)' },
  condiment: { icon: '🧂', label: 'Condiments',      color: '#8B6F47', bg: 'rgba(139,111,71,0.1)' },
  issue:     { icon: '⚠️', label: 'Issue at Table',  color: '#DC2626', bg: 'rgba(220,38,38,0.1)' },
  other:     { icon: '🔔', label: 'Assistance',      color: '#6366F1', bg: 'rgba(99,102,241,0.1)' },
};

function getCallMeta(reason) {
  if (!reason) return CALL_REASON_META.other;
  const key = Object.keys(CALL_REASON_META).find(k => reason.toLowerCase().includes(k));
  return CALL_REASON_META[key] || { icon: '🔔', label: reason, color: '#6366F1', bg: 'rgba(99,102,241,0.1)' };
}

export default function WaiterDashboard() {
  const { userData } = useAuth();
  const [calls, setCalls] = useState([]);
  const [readyOrders, setReadyOrders] = useState([]);
  const [resolvingCall, setResolvingCall] = useState(null);
  const [servingOrder, setServingOrder] = useState(null);
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState('calls'); // calls | serve
  const prevCallsRef = useRef(0);
  const audioCtx = useRef(null);

  // Tick every second
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Bell for new waiter call
  const playBell = () => {
    try {
      if (!audioCtx.current) audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx.current;
      const tone = (freq, start, dur, peak) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(peak, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
        osc.start(start); osc.stop(start + dur);
      };
      tone(880, ctx.currentTime, 0.5, 0.4);
      tone(1100, ctx.currentTime + 0.2, 0.4, 0.3);
    } catch {}
  };

  // Realtime waiter calls
  useEffect(() => {
    if (!userData?.restaurantId) return;
    const rid = userData.restaurantId;
    const q = query(collection(db, 'restaurants', rid, 'waiterCalls'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const pending = all.filter(c => c.status === 'pending');
      if (pending.length > prevCallsRef.current) playBell();
      prevCallsRef.current = pending.length;
      setCalls(all);
    });
    return unsub;
  }, [userData?.restaurantId]);

  // Realtime orders — only "ready" ones
  useEffect(() => {
    if (!userData?.restaurantId) return;
    const rid = userData.restaurantId;
    const q = query(collection(db, 'restaurants', rid, 'orders'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const ready = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(o => o.status === 'ready');
      setReadyOrders(ready);
    });
    return unsub;
  }, [userData?.restaurantId]);

  const handleResolveCall = async (call) => {
    setResolvingCall(call.id);
    try { await resolveWaiterCall(userData.restaurantId, call.id); }
    catch (e) { console.error(e); }
    setResolvingCall(null);
  };

  const handleMarkServed = async (order) => {
    setServingOrder(order.id);
    try { await updateOrderStatus(userData.restaurantId, order.id, 'served'); }
    catch (e) { console.error(e); }
    setServingOrder(null);
  };

  const pendingCalls = calls.filter(c => c.status === 'pending');
  const resolvedCalls = calls.filter(c => c.status === 'resolved');

  return (
    <AdminLayout>
      <Head><title>Waiter Dashboard | Advert Radical</title></Head>

      <div style={{ padding: '0 0 40px' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 22, color: '#1E1B18' }}>
            🛎 Waiter Dashboard
          </div>
          <div style={{ fontSize: 13, color: 'rgba(42,31,16,0.45)', marginTop: 4 }}>
            Live waiter calls and ready-to-serve orders
          </div>
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Pending Calls', value: pendingCalls.length, color: '#E05A3A', bg: 'rgba(224,90,58,0.07)', icon: '🔔' },
            { label: 'Ready to Serve', value: readyOrders.length, color: '#2D8B4E', bg: 'rgba(45,139,78,0.07)', icon: '🍽' },
            { label: 'Resolved Today', value: resolvedCalls.length, color: '#6366F1', bg: 'rgba(99,102,241,0.07)', icon: '✅' },
          ].map(c => (
            <div key={c.label} style={{ background: c.bg, border: `1px solid ${c.color}22`, borderRadius: 16, padding: '16px 18px' }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>{c.icon}</div>
              <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 28, color: c.color }}>{c.value}</div>
              <div style={{ fontSize: 12, color: 'rgba(42,31,16,0.5)', fontWeight: 600 }}>{c.label}</div>
            </div>
          ))}
        </div>

        {/* Tab selector */}
        <div style={{ display: 'flex', background: 'rgba(42,31,16,0.05)', borderRadius: 12, padding: 4, gap: 4, marginBottom: 20, width: 'fit-content' }}>
          {[
            ['calls', `🔔 Calls (${pendingCalls.length})`],
            ['serve', `🍽 Serve (${readyOrders.length})`],
            ['history', '📋 History'],
          ].map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)} style={{
              padding: '8px 20px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: 13,
              background: tab === v ? '#fff' : 'transparent',
              color: tab === v ? '#1E1B18' : 'rgba(42,31,16,0.5)',
              boxShadow: tab === v ? '0 1px 6px rgba(42,31,16,0.1)' : 'none',
            }}>{l}</button>
          ))}
        </div>

        {/* ── TAB: Calls ── */}
        {tab === 'calls' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pendingCalls.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 20px', background: 'rgba(42,31,16,0.03)', borderRadius: 16, border: '1px dashed rgba(42,31,16,0.1)' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <div style={{ fontWeight: 700, color: 'rgba(42,31,16,0.5)' }}>No pending calls</div>
                <div style={{ fontSize: 13, color: 'rgba(42,31,16,0.35)', marginTop: 4 }}>All tables are happy!</div>
              </div>
            )}
            {pendingCalls.map(call => {
              const meta = getCallMeta(call.reason);
              const isOld = call.createdAt?.seconds && (Date.now() / 1000 - call.createdAt.seconds) > 180;
              return (
                <div key={call.id} style={{
                  background: '#fff',
                  border: `1.5px solid ${isOld ? '#E05A3A' : meta.color}44`,
                  borderLeft: `4px solid ${isOld ? '#E05A3A' : meta.color}`,
                  borderRadius: 14, padding: '16px 18px',
                  boxShadow: isOld ? '0 2px 16px rgba(224,90,58,0.12)' : '0 2px 10px rgba(42,31,16,0.05)',
                  display: 'flex', alignItems: 'center', gap: 16,
                  animation: isOld ? 'pulse 2s infinite' : 'none',
                }}>
                  {/* Icon */}
                  <div style={{ fontSize: 32, flexShrink: 0 }}>{meta.icon}</div>

                  {/* Details */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 16, color: '#1E1B18' }}>
                        Table {call.tableNumber || '—'}
                      </div>
                      <div style={{ padding: '2px 10px', borderRadius: 20, background: meta.bg, color: meta.color, fontSize: 11, fontWeight: 700 }}>
                        {meta.label}
                      </div>
                      {isOld && (
                        <div style={{ padding: '2px 10px', borderRadius: 20, background: 'rgba(224,90,58,0.1)', color: '#E05A3A', fontSize: 11, fontWeight: 700 }}>
                          ⚠ Waiting long
                        </div>
                      )}
                    </div>
                    {call.reason && call.reason !== meta.label && (
                      <div style={{ fontSize: 13, color: 'rgba(42,31,16,0.55)', marginBottom: 4 }}>"{call.reason}"</div>
                    )}
                    <div style={{ fontSize: 12, color: 'rgba(42,31,16,0.35)' }}>
                      {timeAgo(call.createdAt?.seconds)}
                    </div>
                  </div>

                  {/* Resolve button */}
                  <button
                    onClick={() => handleResolveCall(call)}
                    disabled={resolvingCall === call.id}
                    style={{
                      padding: '10px 20px', borderRadius: 10, border: 'none',
                      background: 'linear-gradient(135deg,#2D8B4E,#1A6B38)',
                      color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                      opacity: resolvingCall === call.id ? 0.6 : 1, flexShrink: 0,
                      boxShadow: '0 3px 12px rgba(45,139,78,0.3)',
                    }}
                  >
                    {resolvingCall === call.id ? 'Resolving…' : '✓ Resolve'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* ── TAB: Serve ── */}
        {tab === 'serve' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {readyOrders.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 20px', background: 'rgba(42,31,16,0.03)', borderRadius: 16, border: '1px dashed rgba(42,31,16,0.1)' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>👨‍🍳</div>
                <div style={{ fontWeight: 700, color: 'rgba(42,31,16,0.5)' }}>Kitchen is still cooking</div>
                <div style={{ fontSize: 13, color: 'rgba(42,31,16,0.35)', marginTop: 4 }}>No orders ready to serve yet</div>
              </div>
            )}
            {readyOrders.map(order => (
              <div key={order.id} style={{
                background: '#fff', border: '1.5px solid rgba(45,139,78,0.3)', borderLeft: '4px solid #2D8B4E',
                borderRadius: 14, padding: '16px 18px',
                boxShadow: '0 2px 16px rgba(45,139,78,0.1)',
                display: 'flex', alignItems: 'center', gap: 16,
              }}>
                <div style={{ fontSize: 32, flexShrink: 0 }}>🍽</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 16, color: '#1E1B18', marginBottom: 6 }}>
                    {order.tableNumber ? `Table ${order.tableNumber}` : 'No Table'}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(order.items || []).map((item, i) => (
                      <div key={i} style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(45,139,78,0.08)', color: '#2D8B4E', fontSize: 12, fontWeight: 600 }}>
                        {item.qty}× {item.name}
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(42,31,16,0.35)', marginTop: 6 }}>
                    Ready {timeAgo(order.updatedAt?.seconds || order.createdAt?.seconds)}
                  </div>
                </div>
                <button
                  onClick={() => handleMarkServed(order)}
                  disabled={servingOrder === order.id}
                  style={{
                    padding: '10px 20px', borderRadius: 10, border: 'none',
                    background: 'linear-gradient(135deg,#2D8B4E,#1A6B38)',
                    color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    opacity: servingOrder === order.id ? 0.6 : 1, flexShrink: 0,
                    boxShadow: '0 3px 12px rgba(45,139,78,0.3)',
                  }}
                >
                  {servingOrder === order.id ? 'Updating…' : '🍽 Mark Served'}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── TAB: History ── */}
        {tab === 'history' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'rgba(42,31,16,0.5)', marginBottom: 8 }}>
              Resolved Calls Today ({resolvedCalls.length})
            </div>
            {resolvedCalls.length === 0 && (
              <div style={{ textAlign: 'center', padding: 32, color: 'rgba(42,31,16,0.3)' }}>No resolved calls yet</div>
            )}
            {resolvedCalls.map(call => {
              const meta = getCallMeta(call.reason);
              const waitTime = call.resolvedAt?.seconds && call.createdAt?.seconds
                ? Math.round((call.resolvedAt.seconds - call.createdAt.seconds) / 60)
                : null;
              return (
                <div key={call.id} style={{ background: 'rgba(42,31,16,0.02)', border: '1px solid rgba(42,31,16,0.07)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontSize: 20 }}>{meta.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#1E1B18' }}>
                      Table {call.tableNumber || '—'} — {meta.label}
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(42,31,16,0.4)', marginTop: 2 }}>
                      {timeAgo(call.createdAt?.seconds)}
                      {waitTime !== null && ` · Resolved in ${waitTime}m`}
                    </div>
                  </div>
                  <div style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(45,139,78,0.08)', color: '#2D8B4E', fontSize: 11, fontWeight: 700 }}>
                    ✓ Resolved
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 2px 16px rgba(224,90,58,0.12); }
          50% { box-shadow: 0 2px 24px rgba(224,90,58,0.35); }
        }
      `}</style>
    </AdminLayout>
  );
}
