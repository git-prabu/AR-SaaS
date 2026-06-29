// pages/admin/activity-log-v2.js
//
// ★ REDESIGN EXEMPLAR ★ — duplicate of /admin/activity-log re-laid-out on the
// Orders/Kitchen "ok-root" dark theme (via <OkShell>). ALL logic (the four
// data listeners, the unified event stream, filters, stats, sound + browser-
// notification prefs, the waiter-calls toggle, resolve/delete actions) is
// copied verbatim from activity-log.js — only the render is new. Original
// /admin/activity-log is untouched.
import Head from 'next/head';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import OkShell from '../../components/admin/OkShell';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import {
  collection, onSnapshot, query, orderBy, limit,
} from 'firebase/firestore';
import {
  resolveWaiterCall, deleteWaiterCall,
  getRestaurantById, updateRestaurant, getFeedback,
} from '../../lib/db';
import { playOrderSound, playCallSound, playPaymentSound, unlockSound } from '../../lib/sounds';

// Payment status sets — kept in sync with payments.js + reports.js.
const REQUESTED_STATUSES = new Set(['cash_requested', 'card_requested', 'online_requested']);
const PAID_STATUSES = new Set(['paid', 'paid_cash', 'paid_card', 'paid_online']);

// Event type metadata — drives filter pills + action labels.
const EVENT_TYPES = {
  call:     { label: 'CALL',     displayLabel: 'Calls',    action: 'Resolve' },
  order:    { label: 'ORDER',    displayLabel: 'Orders',   action: 'Open' },
  payment:  { label: 'PAYMENT',  displayLabel: 'Payments', action: 'Review' },
  feedback: { label: 'FEEDBACK', displayLabel: 'Feedback', action: 'View' },
};

// ── Format helpers (verbatim) ──
function timeAgo(seconds) {
  if (!seconds) return '';
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
function formatTime(seconds) {
  if (!seconds) return '';
  return new Date(seconds * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
function reasonLabel(reason) {
  if (!reason) return 'Assistance';
  const r = reason.toLowerCase();
  if (r.includes('water')) return 'Water';
  if (r.includes('bill'))  return 'Bill';
  if (r.includes('order')) return 'Take Order';
  return 'Assistance';
}
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

export default function ActivityLogV2() {
  const { userData } = useAuth();
  const router = useRouter();
  const { ready, isAdmin, rid, scopedDb, canView, staffSession } = useFeatureAccess('activity');
  const restaurantName = userData?.restaurantName || staffSession?.restaurantName || 'Your Restaurant';

  const [calls, setCalls] = useState([]);
  const [callsLoaded, setCallsLoaded] = useState(false);
  const [orders, setOrders] = useState([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [feedback, setFeedback] = useState([]);

  const [restaurantSettings, setRestaurantSettings] = useState(null);
  const [toggling, setToggling] = useState(false);

  const [filter, setFilter] = useState('all');
  const [pendingOnly, setPendingOnly] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [banner, setBanner] = useState(null);

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [browserNotifsEnabled, setBrowserNotifsEnabled] = useState(false);
  const [browserPermState, setBrowserPermState] = useState('default');

  const prevCallCountRef = useRef(null);
  const prevOrderCountRef = useRef(null);
  const prevPaymentOrderIdsRef = useRef(new Set());

  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('ar_sound_enabled');
      if (stored !== null) setSoundEnabled(stored === 'true');
    } catch {}
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setBrowserPermState(Notification.permission);
      setBrowserNotifsEnabled(Notification.permission === 'granted');
    }
  }, []);
  useEffect(() => {
    try { localStorage.setItem('ar_sound_enabled', String(soundEnabled)); } catch {}
  }, [soundEnabled]);

  const loadSettings = async () => {
    if (!rid) return;
    try {
      const r = await getRestaurantById(rid);
      setRestaurantSettings(r);
    } catch (e) {
      console.error('loadSettings error:', e);
    }
  };
  useEffect(() => { loadSettings(); }, [rid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!rid || !canView) return;
    const q = query(
      collection(scopedDb, 'restaurants', rid, 'waiterCalls'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    return onSnapshot(q, snap => {
      setCalls(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setCallsLoaded(true);
    }, err => {
      console.error('calls listener error:', err);
      setCallsLoaded(true);
    });
  }, [rid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!rid || !canView) return;
    const q = query(
      collection(scopedDb, 'restaurants', rid, 'orders'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    return onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setOrders(all);
      setOrdersLoaded(true);

      snap.docChanges().forEach(change => {
        if (change.type === 'added' || change.type === 'modified') {
          const data = change.doc.data();
          const isRequested = REQUESTED_STATUSES.has(data.paymentStatus);
          if (isRequested && !prevPaymentOrderIdsRef.current.has(change.doc.id)) {
            prevPaymentOrderIdsRef.current.add(change.doc.id);
            if (ordersLoaded) {
              playForPayment();
              pushBrowserNotif('Payment requested', `Table ${data.tableNumber || '—'} wants to pay`);
            }
          }
          if (!isRequested) {
            prevPaymentOrderIdsRef.current.delete(change.doc.id);
          }
        }
      });
    }, err => {
      console.error('orders listener error:', err);
      setOrdersLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rid]);

  useEffect(() => {
    if (!rid) return;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await getFeedback(rid);
        if (!cancelled) setFeedback(data);
      } catch (e) {
        if (!cancelled) console.error('feedback load error:', e);
      }
    };
    load();
    const t = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(t); };
  }, [rid]);

  const playForOrder    = () => { if (soundEnabled) playOrderSound();    };
  const playForCall     = () => { if (soundEnabled) playCallSound();     };
  const playForPayment  = () => { if (soundEnabled) playPaymentSound();  };
  const pushBrowserNotif = (title, body) => {
    if (!browserNotifsEnabled) return;
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const n = new Notification(title, { body, icon: '/favicon.ico', tag: title + '-' + Date.now() });
      setTimeout(() => { try { n.close(); } catch {} }, 6000);
    } catch (e) { console.error('browser notif error:', e); }
  };

  useEffect(() => {
    const pending = calls.filter(c => c.status === 'pending').length;
    const prev = prevCallCountRef.current;
    if (prev !== null && pending > prev) {
      playForCall();
      pushBrowserNotif('New waiter call', `${pending} call${pending === 1 ? '' : 's'} pending`);
    }
    prevCallCountRef.current = pending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calls]);
  useEffect(() => {
    const newOrders = orders.filter(o => o.status === 'pending').length;
    const prev = prevOrderCountRef.current;
    if (prev !== null && newOrders > prev) {
      playForOrder();
      pushBrowserNotif('New order', `${newOrders} order${newOrders === 1 ? '' : 's'} to prepare`);
    }
    prevOrderCountRef.current = newOrders;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  const requestBrowserPerm = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setBanner({ kind: 'error', text: 'This browser does not support notifications' });
      return;
    }
    if (Notification.permission === 'granted') { setBrowserNotifsEnabled(true); return; }
    if (Notification.permission === 'denied') {
      setBanner({ kind: 'error', text: 'Notifications blocked. Enable in browser settings.' });
      return;
    }
    const result = await Notification.requestPermission();
    setBrowserPermState(result);
    setBrowserNotifsEnabled(result === 'granted');
    if (result === 'granted') setBanner({ kind: 'success', text: 'Browser notifications enabled' });
  };

  const toggleWaiterCalls = async () => {
    if (!rid) return;
    setToggling(true);
    try {
      const newValue = !(restaurantSettings?.waiterCallsEnabled !== false);
      await updateRestaurant(rid, { waiterCallsEnabled: newValue });
      setRestaurantSettings(prev => ({ ...prev, waiterCallsEnabled: newValue }));
      setBanner({ kind: 'success', text: `Waiter calls ${newValue ? 'enabled' : 'disabled'}` });
    } catch (e) {
      console.error('toggle waiter calls error:', e);
      setBanner({ kind: 'error', text: 'Failed to update' });
    }
    setToggling(false);
  };

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 3500);
    return () => clearTimeout(t);
  }, [banner]);

  // Unified event stream (verbatim).
  const events = useMemo(() => {
    const evs = [];
    calls.forEach(c => {
      const isResolved = c.status === 'resolved';
      evs.push({
        id: 'call:' + c.id, rawId: c.id, type: 'call',
        status: isResolved ? 'resolved' : 'pending',
        title: `Table ${c.tableNumber || '—'} · ${reasonLabel(c.reason)}`,
        subtitle: isResolved ? `Resolved ${timeAgo(c.resolvedAt?.seconds)}` : 'Waiting for waiter',
        seconds: c.createdAt?.seconds || 0, data: c,
      });
    });
    orders.forEach(o => {
      const isNewOrder = o.status === 'pending';
      const isPaymentRequested = REQUESTED_STATUSES.has(o.paymentStatus);
      const isPaid = PAID_STATUSES.has(o.paymentStatus);
      if (isNewOrder) {
        evs.push({
          id: 'order:' + o.id, rawId: o.id, type: 'order', status: 'pending',
          title: `New order · Table ${o.tableNumber || '—'}`,
          subtitle: `${(o.items || []).length} item${(o.items || []).length === 1 ? '' : 's'} · ₹${o.total || o.subtotal || 0}`,
          seconds: o.createdAt?.seconds || 0, data: o,
        });
      }
      if (isPaymentRequested) {
        evs.push({
          id: 'payment:' + o.id, rawId: o.id, type: 'payment', status: 'pending',
          title: `Payment requested · Table ${o.tableNumber || '—'}`,
          subtitle: `₹${o.total || o.subtotal || 0} · Order #${o.orderNumber || o.id.slice(-5).toUpperCase()}`,
          seconds: o.paymentRequestedAt?.seconds || o.updatedAt?.seconds || o.createdAt?.seconds || 0, data: o,
        });
      }
      if (isPaid && !isPaymentRequested) {
        evs.push({
          id: 'paid:' + o.id, rawId: o.id, type: 'payment', status: 'resolved',
          title: `Paid · Table ${o.tableNumber || '—'}`,
          subtitle: `₹${o.total || o.subtotal || 0} · ${o.paymentMethod || 'payment'}`,
          seconds: o.paidAt?.seconds || o.updatedAt?.seconds || 0, data: o,
        });
      }
    });
    const today = startOfToday();
    feedback.filter(f => (f.createdAt?.seconds || 0) >= today).forEach(f => {
      const stars = '★'.repeat(f.rating) + '☆'.repeat(5 - f.rating);
      evs.push({
        id: 'fb:' + f.id, rawId: f.id, type: 'feedback',
        status: f.isRead ? 'resolved' : 'pending',
        title: `Feedback · ${stars}`,
        subtitle: f.comment ? (f.comment.length > 80 ? f.comment.slice(0, 79) + '…' : f.comment) : `Table ${f.tableNumber || '—'} · no comment`,
        seconds: f.createdAt?.seconds || 0, data: f,
      });
    });
    return evs.sort((a, b) => (b.seconds || 0) - (a.seconds || 0));
  }, [calls, orders, feedback]);

  const filteredEvents = useMemo(() => {
    let result = events;
    if (pendingOnly) result = result.filter(e => e.status === 'pending');
    if (filter !== 'all') result = result.filter(e => e.type === filter);
    return result;
  }, [events, filter, pendingOnly]);

  const stats = useMemo(() => {
    const pending = events.filter(e => e.status === 'pending').length;
    const today = startOfToday();
    const isToday = (e) => (e.seconds || 0) >= today;
    const todayCount = events.filter(isToday).length;
    const byType = {
      call:     events.filter(e => e.type === 'call').length,
      order:    events.filter(e => e.type === 'order').length,
      payment:  events.filter(e => e.type === 'payment').length,
      feedback: events.filter(e => e.type === 'feedback').length,
    };
    const byTypeToday = {
      call:     events.filter(e => e.type === 'call'     && isToday(e)).length,
      order:    events.filter(e => e.type === 'order'    && isToday(e)).length,
      payment:  events.filter(e => e.type === 'payment'  && isToday(e)).length,
      feedback: events.filter(e => e.type === 'feedback' && isToday(e)).length,
    };
    return { total: events.length, pending, today: todayCount, byType, byTypeToday };
  }, [events]);

  const handleAction = async (ev) => {
    setActionId(ev.id);
    try {
      if (ev.type === 'call' && ev.status === 'pending') {
        await resolveWaiterCall(rid, ev.rawId);
        setBanner({ kind: 'success', text: 'Call resolved' });
      } else if (ev.type === 'order') {
        router.push('/admin/kitchen-new');
      } else if (ev.type === 'payment') {
        router.push('/admin/payments');
      } else if (ev.type === 'feedback') {
        router.push('/admin/feedback');
      }
    } catch (e) {
      console.error('action failed:', e);
      setBanner({ kind: 'error', text: e.message || 'Action failed' });
    }
    setActionId(null);
  };

  const handleDeleteCall = async (ev) => {
    if (!confirm('Remove this resolved call from history? This cannot be undone.')) return;
    setActionId(ev.id);
    try {
      await deleteWaiterCall(rid, ev.rawId);
      setBanner({ kind: 'success', text: 'Call removed' });
    } catch (e) {
      console.error('delete failed:', e);
      setBanner({ kind: 'error', text: e.message || 'Failed to delete' });
    }
    setActionId(null);
  };

  const loading = !callsLoaded || !ordersLoaded;
  const waiterCallsEnabled = restaurantSettings?.waiterCallsEnabled !== false;

  // ── Gates (replace FeatureShell's neutral screens) ──
  if (!ready) {
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Head><title>Activity Log — HaloHelm</title></Head>
        <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 14 }}>Loading…</div>
      </div>
    );
  }
  if (!canView) {
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <Head><title>Activity Log — HaloHelm</title></Head>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div>
          <div style={{ color: 'var(--tx)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>No access</div>
          <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.6 }}>
            Your role doesn’t include the Activity Log. Ask the owner to grant it.
          </div>
        </div>
      </div>
    );
  }

  // Header controls (sound toggle + settings + LIVE pill).
  const headRight = (
    <>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 'var(--r-pill)', background: 'rgba(63,170,99,0.12)', border: '1px solid rgba(63,170,99,0.28)' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', animation: 'ok-dotpulse 1.6s infinite' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--success)' }}>LIVE</span>
      </span>
      <button onClick={() => { setSoundEnabled(v => !v); unlockSound(); }} title={soundEnabled ? 'Mute' : 'Unmute'}
        style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--card)', border: '1px solid var(--line)', color: soundEnabled ? 'var(--tx)' : 'var(--tx-3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
        {soundEnabled
          ? (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>)
          : (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>)}
      </button>
      <button onClick={() => setSettingsOpen(true)} title="Settings"
        style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--card)', border: '1px solid var(--line)', color: 'var(--tx)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      </button>
    </>
  );

  return (
    <>
      <Head><title>Activity Log — HaloHelm</title></Head>
      <OkShell active="activity" eyebrow="Operations · Live feed" title="Activity Log" brand={restaurantName} headRight={headRight}>
        {banner && (
          <div style={{
            padding: '10px 14px', marginBottom: 14, borderRadius: 10,
            background: banner.kind === 'success' ? 'rgba(63,170,99,0.12)' : 'rgba(217,83,79,0.12)',
            border: `1px solid ${banner.kind === 'success' ? 'rgba(63,170,99,0.32)' : 'rgba(217,83,79,0.32)'}`,
            color: banner.kind === 'success' ? 'var(--success)' : 'var(--danger)',
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
          }}>
            {banner.kind === 'success' ? '✓ ' : '⚠ '}{banner.text}
          </div>
        )}

        {/* Stat strip */}
        <div className="statstrip" style={{ padding: 0, marginBottom: 16 }}>
          <div className="statcard">
            <div className="sc-k"><i style={{ background: 'var(--gold)' }} />PENDING</div>
            <div className="sc-v" style={{ color: stats.pending > 0 ? 'var(--gold)' : 'var(--tx)' }}>{stats.pending}</div>
          </div>
          <div className="statcard">
            <div className="sc-k"><i style={{ background: 'var(--tx-3)' }} />TODAY</div>
            <div className="sc-v">{stats.today}</div>
          </div>
          <div className="statcard">
            <div className="sc-k"><i style={{ background: 'var(--st-sent)' }} />CALLS TODAY</div>
            <div className="sc-v">{stats.byTypeToday.call}</div>
          </div>
          <div className="statcard">
            <div className="sc-k"><i style={{ background: 'var(--st-served)' }} />ORDERS TODAY</div>
            <div className="sc-v">{stats.byTypeToday.order}</div>
          </div>
        </div>

        {/* Filter bar */}
        <div style={{
          background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14,
          padding: '10px 14px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {[
              { key: 'all',      label: 'All',      count: events.length },
              { key: 'call',     label: 'Calls',    count: stats.byType.call },
              { key: 'order',    label: 'Orders',   count: stats.byType.order },
              { key: 'payment',  label: 'Payments', count: stats.byType.payment },
              { key: 'feedback', label: 'Feedback', count: stats.byType.feedback },
            ].map(f => {
              const active = filter === f.key;
              return (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  style={{
                    padding: '6px 12px', fontFamily: 'var(--font-display)', fontSize: 12.5, fontWeight: active ? 700 : 600,
                    background: active ? 'var(--accent)' : 'transparent', color: active ? 'var(--accent-ink)' : 'var(--tx-2)',
                    border: 'none', borderRadius: 8, cursor: 'pointer', transition: 'all .15s',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}>
                  {f.label}
                  <span style={{
                    padding: '1px 6px', borderRadius: 10,
                    background: active ? 'rgba(26,24,21,0.18)' : 'var(--card-3)',
                    color: active ? 'var(--accent-ink)' : 'var(--tx-3)',
                    fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  }}>{f.count}</span>
                </button>
              );
            })}
          </div>
          <span style={{ width: 1, height: 22, background: 'var(--line)', flexShrink: 0 }} />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
            <input type="checkbox" checked={pendingOnly} onChange={e => setPendingOnly(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: 'var(--gold)', cursor: 'pointer' }} />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, color: pendingOnly ? 'var(--tx)' : 'var(--tx-3)' }}>Pending only</span>
          </label>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)', marginLeft: 'auto' }}>
            {filteredEvents.length} event{filteredEvents.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* Event stream */}
        {loading ? (
          <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--line)', padding: 48, textAlign: 'center' }}>
            <div style={{ width: 30, height: 30, border: '3px solid var(--gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-3)', fontWeight: 600 }}>Loading activity…</div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--line)', padding: '56px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 34, marginBottom: 12 }}>✦</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--tx)', marginBottom: 6 }}>
              {pendingOnly ? 'All clear' : 'No activity'}
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-3)', maxWidth: 380, margin: '0 auto', lineHeight: 1.6 }}>
              {pendingOnly ? 'Nothing pending right now. New activity shows up here as it happens.' : 'No events match this filter yet.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {filteredEvents.map(ev => {
              const type = EVENT_TYPES[ev.type];
              const isPending = ev.status === 'pending';
              const isBusy = actionId === ev.id;
              const accentColor = isPending ? 'var(--gold)' : 'var(--line)';
              return (
                <div key={ev.id} style={{
                  background: 'var(--card)', borderRadius: 14,
                  border: '1px solid var(--line)', borderLeft: `3px solid ${accentColor}`,
                  padding: '14px 18px', display: 'grid', gridTemplateColumns: '1fr auto auto auto',
                  gap: 14, alignItems: 'center', opacity: isPending ? 1 : 0.72,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.10em', padding: '2px 7px', borderRadius: 5, textTransform: 'uppercase', background: 'var(--card-3)', color: 'var(--tx-2)' }}>{type.label}</span>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--tx)' }}>{ev.title}</span>
                      {!isPending && (
                        <span style={{ padding: '1px 7px', borderRadius: 4, background: 'var(--card-3)', color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>Done</span>
                      )}
                    </div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--tx-3)', fontWeight: 500 }}>{ev.subtitle}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--tx-2)' }}>{timeAgo(ev.seconds)}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-3)', marginTop: 2 }}>{formatTime(ev.seconds)}</div>
                  </div>
                  <button onClick={() => handleAction(ev)} disabled={isBusy}
                    style={{
                      padding: '7px 14px', borderRadius: 9, border: 'none',
                      background: isPending ? 'var(--accent)' : 'var(--card-3)',
                      color: isPending ? 'var(--accent-ink)' : 'var(--tx)',
                      fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, cursor: isBusy ? 'not-allowed' : 'pointer',
                      opacity: isBusy ? 0.6 : 1, whiteSpace: 'nowrap', minWidth: 80,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}>
                    {isBusy
                      ? <span style={{ display: 'inline-block', width: 11, height: 11, border: '2px solid rgba(0,0,0,0.4)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                      : (isPending ? type.action : 'Open')}
                    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                  </button>
                  {ev.type === 'call' && ev.status === 'resolved' ? (
                    <button onClick={() => handleDeleteCall(ev)} disabled={isBusy} title="Remove this call from history"
                      style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--tx-3)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: isBusy ? 0.4 : 1 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  ) : (
                    <div style={{ width: 28 }} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Settings drawer */}
        {settingsOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', justifyContent: 'flex-end' }}
            onClick={e => { if (e.target === e.currentTarget) setSettingsOpen(false); }}>
            <div style={{ background: 'var(--surface)', width: '100%', maxWidth: 380, height: '100%', overflowY: 'auto', padding: '24px 22px', borderLeft: '1px solid var(--line)', boxShadow: '-20px 0 60px rgba(0,0,0,0.5)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--gold-dim)', marginBottom: 4 }}>Settings</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--tx)' }}>Notification preferences</div>
                </div>
                <button onClick={() => setSettingsOpen(false)} style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--tx-2)', fontSize: 16, cursor: 'pointer' }}>✕</button>
              </div>
              <SettingRow title="Sound alerts" description="Play a chime when new activity arrives." checked={soundEnabled} onToggle={() => { setSoundEnabled(v => !v); unlockSound(); }} />
              <SettingRow title="Browser notifications"
                description={browserPermState === 'denied' ? 'Blocked. Enable in browser settings first.' : 'Show desktop popups even when this tab is in the background.'}
                checked={browserNotifsEnabled} disabled={browserPermState === 'denied'}
                onToggle={async () => { if (!browserNotifsEnabled) { await requestBrowserPerm(); } else { setBrowserNotifsEnabled(false); } }} />
              <SettingRow title="Accept waiter calls" description="When off, customers can't call a waiter from their table." checked={waiterCallsEnabled} disabled={toggling || !restaurantSettings} onToggle={toggleWaiterCalls} />
              <div style={{ marginTop: 22, padding: '14px 16px', borderRadius: 12, background: 'var(--card)', border: '1px solid var(--line)', fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--tx-3)', lineHeight: 1.6 }}>
                <b style={{ color: 'var(--tx)' }}>Activity Log</b> streams waiter calls, new orders, payment requests, and customer feedback in real time. Use the <b style={{ color: 'var(--tx-2)' }}>Pending only</b> toggle to focus on what needs action.
              </div>
            </div>
          </div>
        )}
      </OkShell>
    </>
  );
}

// Dark-theme toggle row for the settings drawer.
function SettingRow({ title, description, checked, disabled, onToggle }) {
  return (
    <div style={{ padding: '14px 0', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--tx)', marginBottom: 2 }}>{title}</div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)', lineHeight: 1.5 }}>{description}</div>
      </div>
      <button onClick={onToggle} disabled={disabled} style={{
        position: 'relative', width: 40, height: 22, borderRadius: 11, border: 'none',
        background: checked ? 'var(--success)' : 'var(--card-3)',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, transition: 'background 0.2s', flexShrink: 0,
      }}>
        <span style={{ position: 'absolute', top: 2, left: checked ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
      </button>
    </div>
  );
}

ActivityLogV2.getLayout = (page) => page;
