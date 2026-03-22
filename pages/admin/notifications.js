// pages/admin/notifications.js
import Head from 'next/head';
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { resolveWaiterCall, deleteWaiterCall, getRestaurantById, updateRestaurant } from '../../lib/db';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, orderBy, doc } from 'firebase/firestore';
import toast from 'react-hot-toast';

const REASON_MAP = {
  water: { emoji: '💧', label: 'Need Water', color: '#4A80C0', bg: 'rgba(74,128,192,0.1)' },
  bill: { emoji: '🧾', label: 'Need Bill', color: '#8A5AC4', bg: 'rgba(138,90,196,0.1)' },
  assistance: { emoji: '🙋', label: 'Need Assistance', color: '#E05A3A', bg: 'rgba(224,90,58,0.1)' },
  order: { emoji: '📋', label: 'Ready to Order', color: '#5A9A78', bg: 'rgba(90,154,120,0.1)' },
};

const S = {
  card: { background: '#FFFFFF', border: '1px solid rgba(42,31,16,0.07)', borderRadius: 20, boxShadow: '0 2px 14px rgba(42,31,16,0.06)' },
  h1: { fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 22, color: '#1E1B18', margin: 0 },
  sub: { fontSize: 13, color: 'rgba(42,31,16,0.45)', marginTop: 4 },
};

function timeAgo(seconds) {
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function ToggleSwitch({ enabled, onToggle, disabled }) {
  return (
    <div
      onClick={disabled ? undefined : onToggle}
      style={{
        width: 44, height: 24, borderRadius: 12, flexShrink: 0,
        background: enabled ? '#1E1B18' : 'rgba(42,31,16,0.18)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative', transition: 'background 0.22s',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{
        position: 'absolute', top: 3,
        left: enabled ? 23 : 3,
        width: 18, height: 18, borderRadius: '50%',
        background: '#fff', transition: 'left 0.22s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.22)',
      }} />
    </div>
  );
}

export default function AdminNotifications() {
  const { userData } = useAuth();
  const [calls, setCalls] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(null);
  const [tab, setTab] = useState('pending');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [waiterCallsEnabled, setWaiterCallsEnabled] = useState(true);
  const [togglingCalls, setTogglingCalls] = useState(false);
  const prevCallCountRef = useRef(0);
  const prevOrderCountRef = useRef(0);
  const soundEnabledRef = useRef(true);
  const rid = userData?.restaurantId;

  // ── Sound preference ──────────────────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem('ar_sound_enabled');
    const val = stored !== null ? stored === 'true' : true;
    setSoundEnabled(val);
    soundEnabledRef.current = val;
  }, []);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundEnabledRef.current = next;
    localStorage.setItem('ar_sound_enabled', String(next));
    toast(next ? '🔔 Bell sound on' : '🔕 Bell sound off', { duration: 2000 });
  };

  // ── Waiter calls toggle ───────────────────────────────────────────────────
  useEffect(() => {
    if (!rid) return;
    getRestaurantById(rid).then(r => setWaiterCallsEnabled(r?.waiterCallsEnabled !== false));
  }, [rid]);

  const toggleWaiterCalls = async () => {
    if (togglingCalls) return;
    const next = !waiterCallsEnabled;
    setTogglingCalls(true);
    try {
      await updateRestaurant(rid, { waiterCallsEnabled: next });
      setWaiterCallsEnabled(next);
      toast(next ? '✅ Waiter calls enabled' : "⛔ Waiter calls paused", { duration: 3000 });
    } catch { toast.error('Failed to update setting'); }
    finally { setTogglingCalls(false); }
  };

  // ── Bell synthesizer ──────────────────────────────────────────────────────
  const playBell = () => {
    if (!soundEnabledRef.current) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const playTone = (freq, startTime, duration, gainPeak) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.start(startTime); osc.stop(startTime + duration);
      };
      playTone(880, ctx.currentTime, 1.4, 0.55);
      playTone(1760, ctx.currentTime, 0.7, 0.25);
      playTone(880, ctx.currentTime + 0.55, 1.2, 0.45);
      playTone(1760, ctx.currentTime + 0.55, 0.6, 0.2);
    } catch { }
  };

  // ── Real-time waiter calls listener ──────────────────────────────────────
  useEffect(() => {
    if (!rid) return;
    const q = query(collection(db, 'restaurants', rid, 'waiterCalls'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const pending = data.filter(c => c.status === 'pending').length;
      if (prevCallCountRef.current > 0 && pending > prevCallCountRef.current) {
        playBell();
        toast('🔔 New waiter call!', { duration: 4000 });
      }
      prevCallCountRef.current = pending;
      setCalls(data);
      setLoading(false);
    });
    return unsub;
  }, [rid]);

  // ── Real-time orders listener ─────────────────────────────────────────────
  useEffect(() => {
    if (!rid) return;
    const q = query(collection(db, 'restaurants', rid, 'orders'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const pending = data.filter(o => o.status === 'pending').length;
      if (prevOrderCountRef.current > 0 && pending > prevOrderCountRef.current) {
        playBell();
        toast('🛒 New order received!', { duration: 4000 });
      }
      prevOrderCountRef.current = pending;
      setOrders(data);
    });
    return unsub;
  }, [rid]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleResolve = async (call) => {
    setResolving(call.id);
    try {
      await resolveWaiterCall(rid, call.id);
      toast.success('Marked as resolved');
    } catch { toast.error('Failed to resolve'); }
    finally { setResolving(null); }
  };

  const handleDelete = async (call) => {
    if (!confirm('Delete this call record?')) return;
    try {
      await deleteWaiterCall(rid, call.id);
      toast.success('Deleted');
    } catch { toast.error('Failed to delete'); }
  };

  const pendingCalls = calls.filter(c => c.status === 'pending');
  const resolvedCalls = calls.filter(c => c.status === 'resolved');
  const pendingOrders = orders.filter(o => o.status === 'pending');
  const shownCalls = tab === 'pending' ? pendingCalls : resolvedCalls;

  return (
    <AdminLayout>
      <Head><title>Notifications — Advert Radical</title></Head>

      <div style={{ background: '#F2F0EC', minHeight: '100vh', padding: 32, fontFamily: 'Inter,sans-serif' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <style>{`
            @keyframes spin   { to { transform:rotate(360deg) } }
            @keyframes fadeIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:none } }
          `}</style>

          {/* ── Header ─────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={S.h1}>🔔 Notifications</h1>
              <p style={S.sub}>Live waiter call requests from your customers. Auto-refreshes every 15 seconds.</p>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {pendingOrders.length > 0 && (
                <div style={{ padding: '8px 14px', borderRadius: 12, background: 'rgba(90,154,120,0.1)', border: '1px solid rgba(90,154,120,0.25)', fontSize: 13, fontWeight: 700, color: '#1A6040' }}>
                  🛒 {pendingOrders.length} order{pendingOrders.length > 1 ? 's' : ''}
                </div>
              )}
              {pendingCalls.length > 0 && (
                <div style={{ padding: '8px 14px', borderRadius: 12, background: 'rgba(224,90,58,0.12)', border: '1px solid rgba(224,90,58,0.25)', fontSize: 13, fontWeight: 700, color: '#C04A28' }}>
                  🔔 {pendingCalls.length} call{pendingCalls.length > 1 ? 's' : ''}
                </div>
              )}
              <div style={{ fontSize: 11, color: 'rgba(42,31,16,0.35)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4CD964', display: 'inline-block' }} />
                Live
              </div>
            </div>
          </div>

          {/* ── Settings Panel ─────────────────────────────────────────── */}
          <div style={{ ...S.card, padding: '18px 24px', marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(42,31,16,0.4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>
              Settings
            </div>

            {/* Sound toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingBottom: 14, borderBottom: '1px solid rgba(42,31,16,0.06)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 17 }}>{soundEnabled ? '🔔' : '🔕'}</span>
                  <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 600, fontSize: 13, color: '#1E1B18' }}>Bell Sound</span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                    background: soundEnabled ? 'rgba(90,154,120,0.1)' : 'rgba(42,31,16,0.06)',
                    color: soundEnabled ? '#1A5A38' : 'rgba(42,31,16,0.4)',
                  }}>
                    {soundEnabled ? 'On' : 'Off'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(42,31,16,0.4)', marginTop: 3, paddingLeft: 24 }}>
                  Play a bell chime when new customer requests arrive
                </div>
              </div>
              <ToggleSwitch enabled={soundEnabled} onToggle={toggleSound} />
            </div>

            {/* Waiter calls toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingTop: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 17 }}>{waiterCallsEnabled ? '🙋' : '⛔'}</span>
                  <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 600, fontSize: 13, color: '#1E1B18' }}>Customer Waiter Calls</span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                    background: waiterCallsEnabled ? 'rgba(90,154,120,0.1)' : 'rgba(224,90,58,0.1)',
                    color: waiterCallsEnabled ? '#1A5A38' : '#C04A28',
                  }}>
                    {waiterCallsEnabled ? 'Enabled' : 'Paused'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(42,31,16,0.4)', marginTop: 3, paddingLeft: 24 }}>
                  {waiterCallsEnabled
                    ? 'Customers can tap "Need Help" on the menu page'
                    : 'The call button is hidden from customers right now'}
                </div>
              </div>
              <ToggleSwitch enabled={waiterCallsEnabled} onToggle={toggleWaiterCalls} disabled={togglingCalls} />
            </div>
          </div>

          {/* ── Tabs ───────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {[['pending', 'Waiter Calls', pendingCalls.length], ['resolved', 'Resolved', resolvedCalls.length], ['orders', 'New Orders', pendingOrders.length]].map(([id, label, count]) => (
              <button key={id} onClick={() => setTab(id)}
                style={{ padding: '9px 20px', borderRadius: 30, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif', background: tab === id ? '#1E1B18' : '#fff', color: tab === id ? '#FFF5E8' : 'rgba(42,31,16,0.55)', boxShadow: tab === id ? '0 2px 8px rgba(30,27,24,0.18)' : '0 1px 4px rgba(42,31,16,0.06)', transition: 'all 0.15s' }}>
                {label} {count > 0 && <span style={{ marginLeft: 6, background: tab === id ? 'rgba(255,255,255,0.2)' : 'rgba(42,31,16,0.08)', borderRadius: 99, padding: '1px 7px', fontSize: 11 }}>{count}</span>}
              </button>
            ))}
          </div>

          {/* ── Call List ──────────────────────────────────────────────── */}
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
              <div style={{ width: 32, height: 32, border: '3px solid #E05A3A', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>

          ) : tab === 'orders' ? (
            /* ── New Orders tab ── */
            pendingOrders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(42,31,16,0.4)' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🛒</div>
                <p style={{ fontSize: 15, fontWeight: 600 }}>No pending orders</p>
                <p style={{ fontSize: 13, marginTop: 6 }}>New orders appear here in real time.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {pendingOrders.map(order => (
                  <div key={order.id} style={{ ...S.card, padding: '18px 22px', animation: 'fadeIn 0.25s ease', borderLeft: '4px solid #5A9A78' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 16, color: '#1E1B18' }}>Table {order.tableNumber || '—'}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(224,90,58,0.1)', color: '#C04A28' }}>New Order</span>
                      </div>
                      <span style={{ fontSize: 12, color: 'rgba(42,31,16,0.4)' }}>🕐 {timeAgo(order.createdAt?.seconds || 0)}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {(order.items || []).map((item, i) => (
                        <div key={i} style={{ fontSize: 13, color: 'rgba(42,31,16,0.7)' }}>
                          {item.name} × {item.qty}
                        </div>
                      ))}
                    </div>
                    {order.specialInstructions && (
                      <div style={{ marginTop: 10, padding: '7px 10px', borderRadius: 8, background: 'rgba(247,155,61,0.07)', border: '1px solid rgba(247,155,61,0.2)', fontSize: 12, color: 'rgba(42,31,16,0.6)' }}>
                        📝 {order.specialInstructions}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )

          ) : shownCalls.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(42,31,16,0.4)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>{tab === 'pending' ? '✅' : '📭'}</div>
              <p style={{ fontSize: 15, fontWeight: 600 }}>{tab === 'pending' ? 'All clear — no pending requests' : 'No resolved calls yet'}</p>
              <p style={{ fontSize: 13, marginTop: 6 }}>{tab === 'pending' ? 'New waiter calls appear here in real time.' : 'Resolved calls will be archived here.'}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {shownCalls.map(call => {
                const info = REASON_MAP[call.reason] || { emoji: '🔔', label: call.reason, color: '#8B6010', bg: 'rgba(139,96,16,0.1)' };
                const secs = call.createdAt?.seconds || 0;
                const resolvedSecs = call.resolvedAt?.seconds;
                return (
                  <div key={call.id} style={{ ...S.card, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 16, animation: 'fadeIn 0.25s ease' }}>
                    <div style={{ width: 52, height: 52, borderRadius: 16, background: info.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
                      {info.emoji}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 15, color: '#1E1B18' }}>{info.label}</span>
                        {call.status === 'resolved' && (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(90,154,120,0.12)', color: '#1A5A38' }}>✓ Resolved</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 16, marginTop: 5, flexWrap: 'wrap' }}>
                        {call.tableNumber && call.tableNumber !== 'Not specified' && (
                          <span style={{ fontSize: 12, color: 'rgba(42,31,16,0.55)' }}>🪑 Table: <strong>{call.tableNumber}</strong></span>
                        )}
                        <span style={{ fontSize: 12, color: 'rgba(42,31,16,0.4)' }}>🕐 {timeAgo(secs)}</span>
                        {resolvedSecs && (
                          <span style={{ fontSize: 12, color: 'rgba(90,154,120,0.8)' }}>✓ resolved {timeAgo(resolvedSecs)}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      {call.status === 'pending' && (
                        <button onClick={() => handleResolve(call)} disabled={resolving === call.id}
                          style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: '#1E1B18', color: '#FFF5E8', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: resolving === call.id ? 0.6 : 1, transition: 'all 0.15s' }}>
                          {resolving === call.id ? '…' : '✓ Done'}
                        </button>
                      )}
                      <button onClick={() => handleDelete(call)}
                        style={{ padding: '8px 10px', borderRadius: 10, border: '1.5px solid rgba(244,160,176,0.4)', background: 'rgba(244,160,176,0.08)', color: '#8B1A2A', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Footer hint ────────────────────────────────────────────── */}
          <div style={{ marginTop: 28, padding: '16px 20px', borderRadius: 14, background: 'rgba(247,155,61,0.07)', border: '1px solid rgba(247,155,61,0.2)', fontSize: 12, color: 'rgba(42,31,16,0.55)' }}>
            <strong style={{ color: '#1E1B18' }}>How it works:</strong> Customers tap the 🔔 button on your menu page, choose a reason, and their request appears here instantly. Keep this page open on a tablet at your restaurant for live monitoring.
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

AdminNotifications.getLayout = (page) => page;