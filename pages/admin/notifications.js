// pages/admin/notifications.js
import Head from 'next/head';
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { resolveWaiterCall, deleteWaiterCall, getRestaurantById, updateRestaurant } from '../../lib/db';
import { useAdminOrders, useAdminWaiterCalls } from '../../contexts/AdminDataContext';
import toast from 'react-hot-toast';
import { timeAgo, ADMIN_STYLES as S } from '../../lib/utils';

const REASON_MAP = {
  water: { emoji: '💧', label: 'Need Water', color: '#4A80C0', bg: 'rgba(74,128,192,0.1)' },
  bill: { emoji: '🧾', label: 'Need Bill', color: '#8A5AC4', bg: 'rgba(138,90,196,0.1)' },
  assistance: { emoji: '🙋', label: 'Need Assistance', color: '#8A4A42', bg: 'rgba(138,74,66,0.1)' },
  order: { emoji: '📋', label: 'Ready to Order', color: '#4A7A5E', bg: 'rgba(74,122,94,0.1)' },
};

function ToggleSwitch({ enabled, onToggle, disabled }) {
  return (
    <div
      onClick={disabled ? undefined : onToggle}
      style={{
        width: 44, height: 24, borderRadius: 12, flexShrink: 0,
        background: enabled ? '#4A7A5E' : 'rgba(38,52,49,0.18)',
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
  const { calls, loaded: callsLoaded } = useAdminWaiterCalls(); // shared from AdminLayout
  const { orders, loaded: ordersLoaded } = useAdminOrders();     // shared from AdminLayout
  const loading = !callsLoaded;
  const [resolving, setResolving] = useState(null);
  const [tab, setTab] = useState('pending');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [waiterCallsEnabled, setWaiterCallsEnabled] = useState(true);
  const [togglingCalls, setTogglingCalls] = useState(false);
  const soundEnabledRef = useRef(true);
  const notifGrantedRef = useRef(false);   // tracks OS notification permission
  const rid = userData?.restaurantId;

  // ── Sound preference ──────────────────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem('ar_sound_enabled');
    const val = stored !== null ? stored === 'true' : true;
    setSoundEnabled(val);
    soundEnabledRef.current = val;
  }, []);

  // ── Browser OS notification permission ────────────────────────────────────
  // Requested once on mount — lets us fire a popup when this tab is in the
  // background so the admin hears/sees new events even from another tab.
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      notifGrantedRef.current = true;
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(p => {
        notifGrantedRef.current = p === 'granted';
      });
    }
  }, []);

  // Fires an OS-level notification (works in background tabs)
  const showOsNotif = (title, body) => {
    if (!notifGrantedRef.current) return;
    try {
      // tag:'ar-alert' collapses rapid duplicates into one notification
      const n = new Notification(title, { body, icon: '/favicon.ico', tag: 'ar-alert' });
      setTimeout(() => n.close(), 8000);          // auto-dismiss after 8 s
      n.onclick = () => { window.focus(); n.close(); }; // click → bring tab to front
    } catch { }
  };

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

  // Real-time data (orders + waiterCalls) is shared from AdminLayout via context.
  // No duplicate onSnapshot listeners needed here.

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

      <div style={{ background: '#EAE7E3', minHeight: '100vh', padding: 32, fontFamily: 'Outfit, sans-serif' }}>
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
                <div style={{ padding: '8px 14px', borderRadius: 20, background: 'rgba(74,122,94,0.1)', border: '1px solid rgba(74,122,94,0.25)', fontSize: 13, fontWeight: 700, color: '#1A6040' }}>
                  🛒 <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800 }}>{pendingOrders.length}</span> order{pendingOrders.length > 1 ? 's' : ''}
                </div>
              )}
              {pendingCalls.length > 0 && (
                <div style={{ padding: '8px 14px', borderRadius: 20, background: 'rgba(138,74,66,0.12)', border: '1px solid rgba(138,74,66,0.25)', fontSize: 13, fontWeight: 700, color: '#8A4A42' }}>
                  🔔 <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800 }}>{pendingCalls.length}</span> call{pendingCalls.length > 1 ? 's' : ''}
                </div>
              )}
              <div style={{ fontSize: 12, color: '#4A7A5E', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4A7A5E', display: 'inline-block', boxShadow: '0 0 6px rgba(74,122,94,0.5)' }} />
                Live
              </div>
            </div>
          </div>

          {/* ── Settings Panel ─────────────────────────────────────────── */}
          <div style={{ ...S.card, padding: '18px 24px', marginBottom: 20 }}>
            <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 14, fontWeight: 700, color: '#263431', letterSpacing: '0.01em', marginBottom: 14 }}>
              Settings
            </div>

            {/* Sound toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingBottom: 14, borderBottom: '1px solid rgba(38,52,49,0.06)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 17 }}>{soundEnabled ? '🔔' : '🔕'}</span>
                  <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, fontSize: 13, color: '#263431' }}>Bell Sound</span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                    background: soundEnabled ? 'rgba(74,122,94,0.1)' : 'rgba(38,52,49,0.06)',
                    color: soundEnabled ? '#1A5A38' : 'rgba(38,52,49,0.4)',
                  }}>
                    {soundEnabled ? 'On' : 'Off'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(38,52,49,0.4)', marginTop: 3, paddingLeft: 24 }}>
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
                  <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, fontSize: 13, color: '#263431' }}>Customer Waiter Calls</span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                    background: waiterCallsEnabled ? 'rgba(74,122,94,0.1)' : 'rgba(138,74,66,0.1)',
                    color: waiterCallsEnabled ? '#1A5A38' : '#8A4A42',
                  }}>
                    {waiterCallsEnabled ? 'Enabled' : 'Paused'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(38,52,49,0.4)', marginTop: 3, paddingLeft: 24 }}>
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
                style={{ padding: '9px 20px', borderRadius: 30, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', background: tab === id ? '#4A7A5E' : '#fff', color: tab === id ? '#EAE7E3' : 'rgba(38,52,49,0.55)', boxShadow: tab === id ? '0 2px 8px rgba(74,122,94,0.25)' : '0 1px 4px rgba(38,52,49,0.06)', transition: 'all 0.15s' }}>
                {label} {count > 0 && <span style={{ marginLeft: 6, background: tab === id ? 'rgba(255,255,255,0.2)' : 'rgba(38,52,49,0.08)', borderRadius: 99, padding: '1px 7px', fontSize: 11, fontFamily: 'Outfit, sans-serif' }}>{count}</span>}
              </button>
            ))}
          </div>

          {/* ── Call List ──────────────────────────────────────────────── */}
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
              <div style={{ width: 32, height: 32, border: '3px solid #C4A86D', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>

          ) : tab === 'orders' ? (
            /* ── New Orders tab ── */
            pendingOrders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(38,52,49,0.4)' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🛒</div>
                <p style={{ fontSize: 15, fontWeight: 600 }}>No pending orders</p>
                <p style={{ fontSize: 13, marginTop: 6 }}>New orders appear here in real time.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {pendingOrders.map(order => (
                  <div key={order.id} style={{ ...S.card, padding: '18px 22px', animation: 'fadeIn 0.25s ease', borderLeft: '4px solid #4A7A5E' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontWeight: 800, fontSize: 16, color: '#263431' }}><span style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Table </span><span style={{ fontFamily: 'Outfit, sans-serif' }}>{order.tableNumber || '—'}</span></span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(138,74,66,0.1)', color: '#8A4A42' }}>New Order</span>
                      </div>
                      <span style={{ fontSize: 12, color: 'rgba(38,52,49,0.4)' }}>🕐 {timeAgo(order.createdAt?.seconds || 0)}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {(order.items || []).map((item, i) => (
                        <div key={i} style={{ fontSize: 13, color: 'rgba(38,52,49,0.7)' }}>
                          {item.name} × {item.qty}
                        </div>
                      ))}
                    </div>
                    {order.specialInstructions && (
                      <div style={{ marginTop: 10, padding: '7px 10px', borderRadius: 8, background: 'rgba(196,168,109,0.07)', border: '1px solid rgba(196,168,109,0.2)', fontSize: 12, color: 'rgba(38,52,49,0.6)' }}>
                        📝 {order.specialInstructions}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )

          ) : shownCalls.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(38,52,49,0.4)' }}>
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
                        <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 15, color: '#263431' }}>{info.label}</span>
                        {call.status === 'resolved' && (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(74,122,94,0.12)', color: '#1A5A38' }}>✓ Resolved</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 16, marginTop: 5, flexWrap: 'wrap' }}>
                        {call.tableNumber && call.tableNumber !== 'Not specified' && (
                          <span style={{ fontSize: 12, color: 'rgba(38,52,49,0.55)' }}>🪑 Table: <strong>{call.tableNumber}</strong></span>
                        )}
                        <span style={{ fontSize: 12, color: 'rgba(38,52,49,0.4)' }}>🕐 {timeAgo(secs)}</span>
                        {resolvedSecs && (
                          <span style={{ fontSize: 12, color: 'rgba(74,122,94,0.8)' }}>✓ resolved {timeAgo(resolvedSecs)}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      {call.status === 'pending' && (
                        <button onClick={() => handleResolve(call)} disabled={resolving === call.id}
                          style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: '#263431', color: '#EAE7E3', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: resolving === call.id ? 0.6 : 1, transition: 'all 0.15s' }}>
                          {resolving === call.id ? '…' : '✓ Done'}
                        </button>
                      )}
                      <button onClick={() => handleDelete(call)}
                        style={{ padding: '8px 10px', borderRadius: 10, border: '1.5px solid rgba(138,74,66,0.3)', background: 'rgba(138,74,66,0.08)', color: '#8A4A42', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Footer hint ────────────────────────────────────────────── */}
          <div style={{ marginTop: 28, padding: '16px 20px', borderRadius: 14, background: 'rgba(196,168,109,0.07)', border: '1px solid rgba(196,168,109,0.2)', fontSize: 12, color: 'rgba(38,52,49,0.55)' }}>
            <strong style={{ color: '#263431' }}>How it works:</strong> Customers tap the 🔔 button on your menu page, choose a reason, and their request appears here instantly. Keep this page open on a tablet at your restaurant for live monitoring.
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

AdminNotifications.getLayout = (page) => page;