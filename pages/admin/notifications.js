import Head from 'next/head';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { db } from '../../lib/firebase';
import {
  collection, onSnapshot, query, orderBy, limit,
} from 'firebase/firestore';
import {
  resolveWaiterCall, deleteWaiterCall,
  getRestaurantById, updateRestaurant, getFeedback,
} from '../../lib/db';

// ═══ Payment status sets — kept in sync with payments.js + reports.js.
// Firestore order docs use suffixed statuses like `cash_requested`, `paid_cash`.
// We never see a raw `requested` or `paid` alone — always with the method suffix.
// These sets make all paymentStatus membership checks correct. ═══
const REQUESTED_STATUSES = new Set(['cash_requested', 'card_requested', 'online_requested']);
const PAID_STATUSES = new Set(['paid', 'paid_cash', 'paid_card', 'paid_online']);

// ═══ Aspire palette — same tokens as analytics/kitchen/waiter/staff ═══
const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER,
  cream: '#EDEDED',
  ink: '#1A1A1A',
  shell: '#FFFFFF',
  shellDarker: '#F8F8F8',
  warning: '#C4A86D',
  warningDim: '#A08656',
  // Matte black tokens for signature dark cards
  forest: '#1A1A1A',
  forestDarker: '#2A2A2A',
  forestText: '#EAE7E3',
  forestTextMuted: 'rgba(234,231,227,0.55)',
  forestTextFaint: 'rgba(234,231,227,0.35)',
  forestSubtleBg: 'rgba(255,255,255,0.04)',
  forestBorder: '1px solid rgba(255,255,255,0.06)',
  success: '#3F9E5A',
  successDim: '#2E7E45',
  danger: '#D9534F',
  mutedText: 'rgba(0,0,0,0.55)',
  faintText: 'rgba(0,0,0,0.38)',
  subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)',
  cardShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
};

// ═══ Event type metadata — drives filter pills, accent bars, action labels ═══
// All four types use monochrome accents (gold / matte-black / success-green) in keeping with Aspire.
// No clashing jewel tones. Differentiation is by label + left-edge-accent + action text.
const EVENT_TYPES = {
  call:     { label: 'CALL',     displayLabel: 'Calls',    action: 'Resolve' },
  order:    { label: 'ORDER',    displayLabel: 'Orders',   action: 'Open' },
  payment:  { label: 'PAYMENT',  displayLabel: 'Payments', action: 'Review' },
  feedback: { label: 'FEEDBACK', displayLabel: 'Feedback', action: 'View' },
};

// ═══ Format helpers ═══
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

export default function NotificationsPage() {
  const { userData } = useAuth();
  const router = useRouter();
  const rid = userData?.restaurantId;
  const restaurantName = userData?.restaurantName || 'Your Restaurant';

  // ══ Data — direct Firestore listeners (fixes the stuck-loading bug from b6fa233) ══
  // Old version relied on useAdminOrders/useAdminWaiterCalls context hooks. If those
  // hooks never flipped loaded=true, the page was stuck on the spinner forever.
  // Direct listeners guarantee we know the load state — we flip loaded=true both on
  // success AND on error, so the UI always unblocks.
  const [calls, setCalls] = useState([]);
  const [callsLoaded, setCallsLoaded] = useState(false);
  const [orders, setOrders] = useState([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [feedback, setFeedback] = useState([]);
  // feedback isn't critical for the page to load — we don't block on it

  // Restaurant settings (drives the "Accept waiter calls" toggle in the settings drawer)
  const [restaurantSettings, setRestaurantSettings] = useState(null);
  const [toggling, setToggling] = useState(false);

  // UI state
  const [filter, setFilter] = useState('all');         // 'all' | 'call' | 'order' | 'payment' | 'feedback'
  const [pendingOnly, setPendingOnly] = useState(true); // focus mode — only shows items needing action
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [actionId, setActionId] = useState(null);       // id of event currently being acted on (resolve/delete)
  const [banner, setBanner] = useState(null);           // { kind: 'success'|'error', text: '…' }

  // Sound + browser notification prefs
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [browserNotifsEnabled, setBrowserNotifsEnabled] = useState(false);
  const [browserPermState, setBrowserPermState] = useState('default'); // 'granted' | 'denied' | 'default'
  const audioRef = useRef(null);

  // Refs for detecting "new items" between snapshots (so we ping sound + OS notif)
  const prevCallCountRef = useRef(null);
  const prevOrderCountRef = useRef(null);
  const prevPaymentOrderIdsRef = useRef(new Set());

  // ══ Live tick so "30s ago" timestamps stay fresh ══
  // 15s interval is enough granularity for the "Xm ago" display without eating CPU.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 15000);
    return () => clearInterval(t);
  }, []);

  // ══ Sound + browser-notification pref (load from localStorage on mount) ══
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ar_sound_enabled');
      if (stored !== null) setSoundEnabled(stored === 'true');
    } catch {}
    try {
      audioRef.current = new Audio('/notification.mp3');
      audioRef.current.preload = 'auto';
    } catch {}
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setBrowserPermState(Notification.permission);
      setBrowserNotifsEnabled(Notification.permission === 'granted');
    }
  }, []);
  useEffect(() => {
    try { localStorage.setItem('ar_sound_enabled', String(soundEnabled)); } catch {}
  }, [soundEnabled]);

  // ══ Restaurant settings (for waiter-calls toggle) ══
  const loadSettings = async () => {
    if (!rid) return;
    try {
      const r = await getRestaurantById(rid);
      setRestaurantSettings(r);
    } catch (e) {
      console.error('loadSettings error:', e);
    }
  };
  useEffect(() => { loadSettings(); }, [rid]);

  // ══ Waiter calls listener ══
  useEffect(() => {
    if (!rid) return;
    const q = query(
      collection(db, 'restaurants', rid, 'waiterCalls'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    return onSnapshot(q, snap => {
      setCalls(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setCallsLoaded(true);
    }, err => {
      console.error('calls listener error:', err);
      setCallsLoaded(true); // unblock UI even on error
    });
  }, [rid]);

  // ══ Orders listener (with docChanges for payment-request detection) ══
  useEffect(() => {
    if (!rid) return;
    const q = query(
      collection(db, 'restaurants', rid, 'orders'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    return onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setOrders(all);
      setOrdersLoaded(true);

      // Detect newly-requested payments by watching docChanges where paymentStatus
      // transitioned to one of the *_requested states (cash_requested, card_requested,
      // online_requested). Also catches brand-new orders that arrive already-requested
      // (rare, but possible). The Set tracks IDs we've already pinged for so we don't
      // double-beep if the doc is modified again.
      snap.docChanges().forEach(change => {
        if (change.type === 'added' || change.type === 'modified') {
          const data = change.doc.data();
          const isRequested = REQUESTED_STATUSES.has(data.paymentStatus);
          if (isRequested && !prevPaymentOrderIdsRef.current.has(change.doc.id)) {
            prevPaymentOrderIdsRef.current.add(change.doc.id);
            if (ordersLoaded) {
              playSound();
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

  // ══ Feedback: poll every 30s (not a listener — feedback volume is too low to warrant real-time) ══
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

  // ══ Sound + browser notification helpers ══
  const playSound = () => {
    if (!soundEnabled || !audioRef.current) return;
    try {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    } catch {}
  };
  const pushBrowserNotif = (title, body) => {
    if (!browserNotifsEnabled) return;
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const n = new Notification(title, { body, icon: '/favicon.ico', tag: title + '-' + Date.now() });
      setTimeout(() => { try { n.close(); } catch {} }, 6000);
    } catch (e) { console.error('browser notif error:', e); }
  };

  // Ping sound + OS notif when pending waiter calls count goes up
  useEffect(() => {
    const pending = calls.filter(c => c.status === 'pending').length;
    const prev = prevCallCountRef.current;
    if (prev !== null && pending > prev) {
      playSound();
      pushBrowserNotif('New waiter call', `${pending} call${pending === 1 ? '' : 's'} pending`);
    }
    prevCallCountRef.current = pending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calls]);
  useEffect(() => {
    const newOrders = orders.filter(o => o.status === 'pending').length;
    const prev = prevOrderCountRef.current;
    if (prev !== null && newOrders > prev) {
      playSound();
      pushBrowserNotif('New order', `${newOrders} order${newOrders === 1 ? '' : 's'} to prepare`);
    }
    prevOrderCountRef.current = newOrders;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  // ══ Request browser notification permission ══
  const requestBrowserPerm = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setBanner({ kind: 'error', text: 'This browser does not support notifications' });
      return;
    }
    if (Notification.permission === 'granted') {
      setBrowserNotifsEnabled(true);
      return;
    }
    if (Notification.permission === 'denied') {
      setBanner({ kind: 'error', text: 'Notifications blocked. Enable in browser settings.' });
      return;
    }
    const result = await Notification.requestPermission();
    setBrowserPermState(result);
    setBrowserNotifsEnabled(result === 'granted');
    if (result === 'granted') setBanner({ kind: 'success', text: 'Browser notifications enabled' });
  };

  // ══ Toggle whether customers can call waiters at all ══
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

  // Auto-clear banner after 3.5s
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 3500);
    return () => clearTimeout(t);
  }, [banner]);

  // ══ Unified event stream — merges all four data sources into one list ══
  // Each event has { id, rawId, type, status, title, subtitle, seconds, data }
  // status='pending' means "needs admin action"; status='resolved' means historical.
  const events = useMemo(() => {
    const evs = [];

    // Waiter calls (pending + resolved)
    calls.forEach(c => {
      const isResolved = c.status === 'resolved';
      evs.push({
        id: 'call:' + c.id,
        rawId: c.id,
        type: 'call',
        status: isResolved ? 'resolved' : 'pending',
        title: `Table ${c.tableNumber || '—'} · ${reasonLabel(c.reason)}`,
        subtitle: isResolved
          ? `Resolved ${timeAgo(c.resolvedAt?.seconds)}`
          : 'Waiting for waiter',
        seconds: c.createdAt?.seconds || 0,
        data: c,
      });
    });

    // Orders — split into three flavors: "new order" (pending), "payment requested", "paid".
    // paymentStatus is never the bare string 'requested' or 'paid' — it's always one of
    // the method-suffixed variants (cash_requested / paid_cash / etc). We use the sets
    // declared at the top of this file to match correctly.
    orders.forEach(o => {
      const isNewOrder = o.status === 'pending';
      const isPaymentRequested = REQUESTED_STATUSES.has(o.paymentStatus);
      const isPaid = PAID_STATUSES.has(o.paymentStatus);

      if (isNewOrder) {
        evs.push({
          id: 'order:' + o.id,
          rawId: o.id,
          type: 'order',
          status: 'pending',
          title: `New order · Table ${o.tableNumber || '—'}`,
          subtitle: `${(o.items || []).length} item${(o.items || []).length === 1 ? '' : 's'} · ₹${o.total || o.subtotal || 0}`,
          seconds: o.createdAt?.seconds || 0,
          data: o,
        });
      }
      if (isPaymentRequested) {
        evs.push({
          id: 'payment:' + o.id,
          rawId: o.id,
          type: 'payment',
          status: 'pending',
          title: `Payment requested · Table ${o.tableNumber || '—'}`,
          subtitle: `₹${o.total || o.subtotal || 0} · Order #${o.orderNumber || o.id.slice(-5).toUpperCase()}`,
          seconds: o.paymentRequestedAt?.seconds || o.updatedAt?.seconds || o.createdAt?.seconds || 0,
          data: o,
        });
      }
      if (isPaid && !isPaymentRequested) {
        evs.push({
          id: 'paid:' + o.id,
          rawId: o.id,
          type: 'payment',
          status: 'resolved',
          title: `Paid · Table ${o.tableNumber || '—'}`,
          subtitle: `₹${o.total || o.subtotal || 0} · ${o.paymentMethod || 'payment'}`,
          seconds: o.paidAt?.seconds || o.updatedAt?.seconds || 0,
          data: o,
        });
      }
    });

    // Feedback — only today's entries (older ones live on /admin/feedback)
    const today = startOfToday();
    feedback
      .filter(f => (f.createdAt?.seconds || 0) >= today)
      .forEach(f => {
        const stars = '★'.repeat(f.rating) + '☆'.repeat(5 - f.rating);
        evs.push({
          id: 'fb:' + f.id,
          rawId: f.id,
          type: 'feedback',
          // Treat unread feedback as "pending" so it shows up in the pending-only view.
          status: f.isRead ? 'resolved' : 'pending',
          title: `Feedback · ${stars}`,
          subtitle: f.comment
            ? (f.comment.length > 80 ? f.comment.slice(0, 79) + '…' : f.comment)
            : `Table ${f.tableNumber || '—'} · no comment`,
          seconds: f.createdAt?.seconds || 0,
          data: f,
        });
      });

    // Newest first
    return evs.sort((a, b) => (b.seconds || 0) - (a.seconds || 0));
  }, [calls, orders, feedback]);

  // ══ Filtered events ══
  const filteredEvents = useMemo(() => {
    let result = events;
    if (pendingOnly) result = result.filter(e => e.status === 'pending');
    if (filter !== 'all') result = result.filter(e => e.type === filter);
    return result;
  }, [events, filter, pendingOnly]);

  // ══ Stats for the matte-black header card ══
  const stats = useMemo(() => {
    const pending = events.filter(e => e.status === 'pending').length;
    const today = startOfToday();
    const isToday = (e) => (e.seconds || 0) >= today;
    const todayCount = events.filter(isToday).length;

    // All-time counts by type — drives the filter pill badges so the user can find history.
    const byType = {
      call:     events.filter(e => e.type === 'call').length,
      order:    events.filter(e => e.type === 'order').length,
      payment:  events.filter(e => e.type === 'payment').length,
      feedback: events.filter(e => e.type === 'feedback').length,
    };
    // Today-only counts by type — drives the matte-black LIVE ACTIVITY stat card so the
    // numbers stay meaningful. A 500-call all-time count would dwarf everything else.
    const byTypeToday = {
      call:     events.filter(e => e.type === 'call'     && isToday(e)).length,
      order:    events.filter(e => e.type === 'order'    && isToday(e)).length,
      payment:  events.filter(e => e.type === 'payment'  && isToday(e)).length,
      feedback: events.filter(e => e.type === 'feedback' && isToday(e)).length,
    };
    return { total: events.length, pending, today: todayCount, byType, byTypeToday };
  }, [events]);

  // ══ Actions ══
  const handleAction = async (ev) => {
    setActionId(ev.id);
    try {
      if (ev.type === 'call' && ev.status === 'pending') {
        await resolveWaiterCall(rid, ev.rawId);
        setBanner({ kind: 'success', text: 'Call resolved' });
      } else if (ev.type === 'order') {
        // "Open" routes to the kitchen display for context + management
        router.push('/admin/kitchen');
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

  // Delete a resolved call from the list (keeps the history clean).
  // Only makes sense for call events — order/payment/feedback don't support this.
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

  return (
    <AdminLayout>
      <Head><title>Live Activity — Advert Radical</title></Head>
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font }}>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
          @keyframes livePulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(63,158,90,0.50); }
            50%      { box-shadow: 0 0 0 6px rgba(63,158,90,0); }
          }
          @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
          @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
          @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
          .live-card { transition: box-shadow 0.12s ease, transform 0.12s ease; }
          .live-card:hover { box-shadow: 0 4px 18px rgba(38,52,49,0.06); transform: translateY(-1px); }
          .live-filter-pill:hover:not(.active) { background: ${A.subtleBg}; color: ${A.ink}; }
          .live-icon-btn:hover { background: ${A.shellDarker}; }
          .live-action-btn:hover:not(:disabled) { filter: brightness(1.08); }
          .live-delete-btn:hover { background: rgba(217,83,79,0.14); color: ${A.danger}; }
        `}</style>

        {/* ═══ ASPIRE HEADER ═══ */}
        <div style={{ padding: '24px 28px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, marginBottom: 6, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Operations</span>
                <span style={{ opacity: 0.5 }}>›</span>
                <span style={{ color: A.mutedText }}>Live Activity</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 600, fontSize: 28, color: A.ink, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                  Live <span style={{ color: A.mutedText, fontWeight: 500 }}>Activity</span>
                </div>
                {/* Pulsing green LIVE pill */}
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px', borderRadius: 12,
                  background: 'rgba(63,158,90,0.10)', border: '1px solid rgba(63,158,90,0.25)',
                }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', background: A.success,
                    animation: 'livePulse 2s ease infinite',
                  }} />
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: A.successDim }}>
                    LIVE
                  </span>
                </div>
              </div>
              <div style={{ fontSize: 12, color: A.mutedText, marginTop: 4 }}>
                Unified stream of everything happening in your restaurant right now.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button className="live-icon-btn"
                onClick={() => setSoundEnabled(v => !v)}
                title={soundEnabled ? 'Mute' : 'Unmute'}
                style={{
                  padding: '8px 12px', borderRadius: 10, border: A.border, background: A.shell,
                  color: soundEnabled ? A.ink : A.faintText,
                  fontSize: 14, cursor: 'pointer', fontFamily: A.font, minWidth: 38,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                {soundEnabled ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                )}
              </button>
              <button className="live-icon-btn"
                onClick={() => setSettingsOpen(true)}
                title="Settings"
                style={{
                  padding: '8px 12px', borderRadius: 10, border: A.border, background: A.shell,
                  color: A.ink, fontSize: 14, cursor: 'pointer', fontFamily: A.font, minWidth: 38,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </button>
            </div>
          </div>

          {banner && (
            <div style={{
              padding: '10px 14px', marginBottom: 14, borderRadius: 10,
              background: banner.kind === 'success' ? 'rgba(63,158,90,0.10)' : 'rgba(217,83,79,0.10)',
              border: `1px solid ${banner.kind === 'success' ? 'rgba(63,158,90,0.30)' : 'rgba(217,83,79,0.30)'}`,
              color: banner.kind === 'success' ? A.success : A.danger,
              fontSize: 13, fontWeight: 600,
              animation: 'slideDown 0.2s ease',
            }}>
              {banner.kind === 'success' ? '✓ ' : '⚠ '}{banner.text}
            </div>
          )}

          {/* ═══ LIVE ACTIVITY — matte-black signature card ═══ */}
          <div style={{
            background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
            borderRadius: 14, padding: '20px 24px', marginBottom: 14,
            border: A.forestBorder,
            boxShadow: '0 4px 16px rgba(38,52,49,0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: A.warning, animation: 'pulse 2s ease infinite', boxShadow: '0 0 8px rgba(196,168,109,0.6)' }} />
              <span style={{ fontFamily: A.font, fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>LIVE ACTIVITY</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(234,231,227,0.08)' }} />
              <span style={{ fontFamily: A.font, fontSize: 11, color: A.forestTextMuted, fontWeight: 500 }}>
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'PENDING', value: stats.pending, accent: stats.pending > 0 },
                { label: 'TODAY',   value: stats.today,   accent: false },
                { label: 'CALLS',   value: stats.byTypeToday.call,    accent: false },
                { label: 'ORDERS',  value: stats.byTypeToday.order,   accent: false },
              ].map(s => (
                <div key={s.label} style={{
                  padding: '16px 18px', borderRadius: 10,
                  background: A.forestSubtleBg,
                  border: A.forestBorder,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 8 }}>{s.label}</div>
                  <div style={{ fontWeight: 700, fontSize: 28, lineHeight: 1, letterSpacing: '-0.5px',
                    color: s.accent ? A.warning : A.forestText,
                  }}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ═══ Filter bar (plain card — pills + pending-only toggle) ═══ */}
          <div style={{
            background: A.shell, border: A.border, borderRadius: 12,
            padding: '10px 14px', marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            boxShadow: A.cardShadow,
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
                  <button key={f.key} className={`live-filter-pill ${active ? 'active' : ''}`}
                    onClick={() => setFilter(f.key)}
                    style={{
                      padding: '6px 12px', fontFamily: A.font, fontSize: 12, fontWeight: active ? 700 : 500,
                      background: active ? A.ink : 'transparent', color: active ? A.cream : A.mutedText,
                      border: 'none', borderRadius: 7, cursor: 'pointer', transition: 'all 0.15s',
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}>
                    {f.label}
                    <span style={{
                      padding: '1px 6px', borderRadius: 10,
                      background: active ? 'rgba(237,237,237,0.18)' : A.subtleBg,
                      color: active ? A.cream : A.faintText,
                      fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                    }}>{f.count}</span>
                  </button>
                );
              })}
            </div>
            <span style={{ width: 1, height: 22, background: 'rgba(0,0,0,0.10)', flexShrink: 0 }} />
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
              <input
                type="checkbox"
                checked={pendingOnly}
                onChange={e => setPendingOnly(e.target.checked)}
                style={{ width: 14, height: 14, accentColor: A.warning, cursor: 'pointer' }}
              />
              <span style={{ fontSize: 12, fontWeight: 600, color: pendingOnly ? A.ink : A.mutedText }}>
                Pending only
              </span>
            </label>
            <span style={{ fontSize: 11, color: A.faintText, fontWeight: 500, marginLeft: 'auto' }}>
              {filteredEvents.length} event{filteredEvents.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {/* ═══ Event stream ═══ */}
        <div style={{ padding: '0 28px 60px' }}>
          {loading ? (
            <div style={{
              background: A.shell, borderRadius: 14, border: A.border, padding: '48px',
              textAlign: 'center', boxShadow: A.cardShadow,
            }}>
              <div style={{ width: 30, height: 30, border: `3px solid ${A.warning}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              <div style={{ fontSize: 13, color: A.mutedText, fontWeight: 600 }}>Loading activity…</div>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div style={{
              background: A.shell, borderRadius: 14, border: A.border, padding: '56px 32px',
              textAlign: 'center', boxShadow: A.cardShadow,
            }}>
              <div style={{ display: 'inline-flex', gap: 10, marginBottom: 18, alignItems: 'center' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: A.success, opacity: 0.8, animation: 'pulse 1.8s infinite' }} />
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(0,0,0,0.10)' }} />
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(0,0,0,0.06)' }} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: A.ink, marginBottom: 6 }}>
                {pendingOnly ? 'All clear' : 'No activity'}
              </div>
              <div style={{ fontSize: 13, color: A.mutedText, maxWidth: 380, margin: '0 auto', lineHeight: 1.5 }}>
                {pendingOnly
                  ? 'Nothing pending right now. New activity will show up here as it happens.'
                  : 'No events match this filter yet.'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredEvents.map(ev => {
                const type = EVENT_TYPES[ev.type];
                const isPending = ev.status === 'pending';
                const isBusy = actionId === ev.id;
                // Use gold for pending, muted for resolved — keeps the palette monochrome
                const accentColor = isPending ? A.warning : 'rgba(0,0,0,0.08)';
                return (
                  <div key={ev.id} className="live-card" style={{
                    background: A.shell, borderRadius: 12,
                    border: A.border,
                    borderLeft: `3px solid ${accentColor}`,
                    padding: '14px 18px',
                    display: 'grid',
                    gridTemplateColumns: '1fr auto auto auto',
                    gap: 14, alignItems: 'center',
                    boxShadow: A.cardShadow,
                    opacity: isPending ? 1 : 0.75,
                    animation: 'fadeUp 0.2s ease both',
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: '0.10em',
                          padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase',
                          background: A.subtleBg, color: A.mutedText,
                        }}>{type.label}</span>
                        <span style={{ fontWeight: 700, fontSize: 14, color: A.ink, letterSpacing: '-0.2px' }}>
                          {ev.title}
                        </span>
                        {!isPending && (
                          <span style={{
                            padding: '1px 7px', borderRadius: 3,
                            background: A.subtleBg, color: A.faintText,
                            fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                          }}>Done</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: A.mutedText, fontWeight: 500 }}>
                        {ev.subtitle}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{
                        fontSize: 11, fontWeight: 600, color: A.mutedText, fontFamily: "'JetBrains Mono', monospace",
                      }}>{timeAgo(ev.seconds)}</div>
                      <div style={{ fontSize: 10, color: A.faintText, marginTop: 2 }}>{formatTime(ev.seconds)}</div>
                    </div>
                    <button className="live-action-btn"
                      onClick={() => handleAction(ev)}
                      disabled={isBusy}
                      style={{
                        padding: '7px 14px', borderRadius: 8, border: 'none',
                        background: isPending ? A.ink : A.subtleBg,
                        color: isPending ? A.cream : A.ink,
                        fontSize: 12, fontWeight: 700, cursor: isBusy ? 'not-allowed' : 'pointer',
                        fontFamily: A.font, opacity: isBusy ? 0.6 : 1, whiteSpace: 'nowrap',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        minWidth: 80,
                      }}>
                      {isBusy
                        ? <span style={{ display: 'inline-block', width: 11, height: 11, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                        : (isPending ? type.action : 'Open')}
                    </button>
                    {/* Delete button — only for resolved call events */}
                    {ev.type === 'call' && ev.status === 'resolved' ? (
                      <button onClick={() => handleDeleteCall(ev)}
                        disabled={isBusy}
                        className="live-delete-btn"
                        title="Remove this call from history"
                        style={{
                          width: 28, height: 28, borderRadius: 6,
                          border: 'none', background: 'transparent',
                          color: A.faintText, cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          opacity: isBusy ? 0.4 : 1,
                        }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    ) : (
                      // Placeholder to keep the grid column alignment consistent across rows
                      <div style={{ width: 28 }} />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Settings drawer ═══ */}
      {settingsOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
          display: 'flex', justifyContent: 'flex-end',
        }} onClick={e => { if (e.target === e.currentTarget) setSettingsOpen(false); }}>
          <div style={{
            background: A.shell, width: '100%', maxWidth: 380,
            height: '100%', overflowY: 'auto',
            padding: '24px 22px',
            animation: 'slideInRight 0.2s ease',
            boxShadow: '-10px 0 40px rgba(0,0,0,0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: A.warningDim, marginBottom: 4 }}>
                  Settings
                </div>
                <div style={{ fontWeight: 700, fontSize: 18, color: A.ink, letterSpacing: '-0.3px' }}>
                  Notification preferences
                </div>
              </div>
              <button onClick={() => setSettingsOpen(false)} style={{
                width: 32, height: 32, borderRadius: 8, border: A.border, background: A.shell,
                color: A.mutedText, fontSize: 16, cursor: 'pointer', fontFamily: A.font,
              }}>✕</button>
            </div>

            {/* Sound */}
            <SettingRow
              title="Sound alerts"
              description="Play a chime when new activity arrives."
              checked={soundEnabled}
              onToggle={() => setSoundEnabled(v => !v)}
            />

            {/* Browser notifications */}
            <SettingRow
              title="Browser notifications"
              description={
                browserPermState === 'denied'
                  ? 'Blocked. Enable in browser settings first.'
                  : 'Show desktop popups even when this tab is in the background.'
              }
              checked={browserNotifsEnabled}
              disabled={browserPermState === 'denied'}
              onToggle={async () => {
                if (!browserNotifsEnabled) {
                  await requestBrowserPerm();
                } else {
                  setBrowserNotifsEnabled(false);
                }
              }}
            />

            {/* Accept waiter calls — controls whether customers can call from their table */}
            <SettingRow
              title="Accept waiter calls"
              description="When off, customers can't call a waiter from their table."
              checked={waiterCallsEnabled}
              disabled={toggling || !restaurantSettings}
              onToggle={toggleWaiterCalls}
            />

            <div style={{
              marginTop: 22, padding: '14px 16px', borderRadius: 10,
              background: A.shellDarker, border: A.border,
              fontSize: 12, color: A.mutedText, lineHeight: 1.6,
            }}>
              <b style={{ color: A.ink }}>Live Activity</b> streams waiter calls, new orders, payment requests, and customer feedback in real time. Use the <b>Pending only</b> toggle to focus on what needs action.
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

// ═══ Reusable toggle row used in the settings drawer ═══
function SettingRow({ title, description, checked, disabled, onToggle }) {
  const A_SUCCESS = '#3F9E5A';
  const A_INK = '#1A1A1A';
  const A_MUTED = 'rgba(0,0,0,0.55)';
  return (
    <div style={{
      padding: '14px 0', borderTop: '1px solid rgba(0,0,0,0.06)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: A_INK, marginBottom: 2, letterSpacing: '-0.1px' }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: A_MUTED, lineHeight: 1.5 }}>
          {description}
        </div>
      </div>
      <button onClick={onToggle} disabled={disabled} style={{
        position: 'relative',
        width: 40, height: 22, borderRadius: 11, border: 'none',
        background: checked ? A_SUCCESS : 'rgba(0,0,0,0.18)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 0.2s',
        flexShrink: 0,
      }}>
        <span style={{
          position: 'absolute', top: 2, left: checked ? 20 : 2,
          width: 18, height: 18, borderRadius: '50%', background: '#fff',
          transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </button>
    </div>
  );
}
