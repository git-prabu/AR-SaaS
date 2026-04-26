import Head from 'next/head';
import { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { resolveWaiterCall, updateOrderStatus, resolveWaiterCallAs, updateOrderStatusAs, todayKey } from '../../lib/db';
import { db, staffDb } from '../../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import toast from 'react-hot-toast';
import DateRangePicker from '../../components/DateRangePicker';

// ═══ Aspire palette — same tokens as analytics/reports/orders/kitchen ═══
const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER,
  cream: '#EDEDED',
  ink: '#1A1A1A',
  shell: '#FFFFFF',
  shellDarker: '#FAFAF8',
  warning: '#C4A86D',      // Antique gold — used for CALL accent
  warningDim: '#A08656',
  // Matte black tokens for the signature LIVE card (matches analytics)
  forest: '#1A1A1A',
  forestDarker: '#2A2A2A',
  forestText: '#EAE7E3',
  forestTextMuted: 'rgba(234,231,227,0.55)',
  forestTextFaint: 'rgba(234,231,227,0.35)',
  forestSubtleBg: 'rgba(255,255,255,0.04)',
  forestBorder: '1px solid rgba(255,255,255,0.06)',
  success: '#3F9E5A',      // Green — used for READY accent
  danger: '#D9534F',
  mutedText: 'rgba(0,0,0,0.55)',
  faintText: 'rgba(0,0,0,0.38)',
  subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)',
  shadowCard: '0 2px 10px rgba(38,52,49,0.03)',
};

// ═══ Waiting-long threshold — call/serve items older than this get the red urgency band ═══
//     Kept as a named constant so it's self-documenting and easy to adjust later.
const WAITING_LONG_SEC = 180;  // 3 min → red band
const WAITING_WARN_SEC = 60;   // 1 min → gold band

// ═══ Call reason metadata — only the 4 reasons the customer can actually send.
//     Old code had `condiment` and `issue` categories that were unreachable from the customer modal.
//     Those are stripped. If you add more customer options later, add entries here.
// ═══
const CALL_REASON_META = {
  water:      { label: 'Water' },
  bill:       { label: 'Bill' },
  assistance: { label: 'Assistance' },
  order:      { label: 'Take Order' },
};
function reasonLabel(reason) {
  if (!reason) return 'Assistance';
  // Allow fuzzy match so legacy docs with reason strings like "Need Water" still map
  const key = Object.keys(CALL_REASON_META).find(k => reason.toLowerCase().includes(k));
  return key ? CALL_REASON_META[key].label : 'Assistance';
}

// ═══ Staff session (12-hour localStorage-based auth for waiter/kitchen tablets) ═══
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

// ═══ Time formatting — "18m 4s" reads as duration, not clock time ═══
function formatElapsed(seconds) {
  if (seconds == null || seconds < 0) return '0s';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

// ═══ Helpers for filtering by period ═══
function startOfToday() { const d = new Date(); d.setHours(0,0,0,0); return d.getTime() / 1000; }
function startOfWeek()  { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - d.getDay()); return d.getTime() / 1000; }
function startOfMonth() { const d = new Date(); d.setHours(0,0,0,0); d.setDate(1); return d.getTime() / 1000; }

// ═══ Order label ═══
function orderLabel(o) {
  if (typeof o.orderNumber === 'number' && o.orderNumber > 0) return `#${o.orderNumber}`;
  return '#' + (o.id || '').slice(-5).toUpperCase();
}

export default function WaiterDashboard() {
  const { user, userData, loading: adminLoading } = useAuth();
  const router = useRouter();

  const [staffSession, setStaffSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Data
  const [allCalls, setAllCalls] = useState([]);
  const [allOrders, setAllOrders] = useState([]);

  // UI / action state
  const [resolvingId, setResolvingId] = useState(null); // id of the call/order currently being acted on
  const [tab, setTab] = useState('queue');  // 'queue' | 'history'
  const [historyPeriod, setHistoryPeriod] = useState('today'); // 'today' | 'week' | 'month' | 'all'
  // Custom date range — overrides historyPeriod when active.
  const [historyCustomRange, setHistoryCustomRange] = useState({ active: false, start: '', end: '' });
  const [historySearch, setHistorySearch] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [tick, setTick] = useState(0);

  // Refs
  const audioRef = useRef(null);
  const prevActionCountRef = useRef(null);
  const prevActionIdsRef = useRef(new Set());
  const initialLoadDoneRef = useRef(false);
  const [flashingIds, setFlashingIds] = useState(new Set());
  const [unseenIds, setUnseenIds] = useState(new Set());

  // ── Auth check ──
  useEffect(() => {
    setStaffSession(getStaffSession());
    setAuthChecked(true);
  }, []);

  useEffect(() => {
    if (!authChecked || adminLoading) return;
    if (user && !userData) return;
    const isAdmin = !!userData?.restaurantId;
    if (isAdmin) return;
    if (staffSession?.role === 'waiter') return;
    if (staffSession?.role === 'kitchen') { router.replace('/admin/kitchen'); return; }
    router.replace('/staff/login');
  }, [authChecked, adminLoading, user, userData, staffSession]);

  const rid = userData?.restaurantId || staffSession?.restaurantId;
  const isAdmin = !!userData?.restaurantId;

  // ── Load sound pref + preload audio ──
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ar_waiter_sound');
      if (stored !== null) setSoundEnabled(stored === 'true');
    } catch {}
    try {
      audioRef.current = new Audio('/notification.mp3');
      audioRef.current.preload = 'auto';
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem('ar_waiter_sound', String(soundEnabled)); } catch {}
  }, [soundEnabled]);

  // ── 1-second tick for live elapsed timers ──
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Firestore listeners ──
  // Staff read via staffDb so their custom claims (role/rid) are in scope.
  useEffect(() => {
    if (!rid) return;
    const firestore = staffSession ? staffDb : db;
    const q = query(collection(firestore, 'restaurants', rid, 'waiterCalls'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      setAllCalls(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.error('Waiter calls listener error:', err));
  }, [rid, staffSession]);

  useEffect(() => {
    if (!rid) return;
    const firestore = staffSession ? staffDb : db;
    const q = query(collection(firestore, 'restaurants', rid, 'orders'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      setAllOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.error('Waiter orders listener error:', err));
  }, [rid, staffSession]);

  // ═══ Unified action queue ═══
  // Merges pending waiter calls + ready-status orders into a single list.
  // Each item has: { id, type: 'call'|'serve', table, subtitle, seconds, raw }
  // seconds is the timestamp the item first appeared (createdAt for calls;
  // updatedAt-or-createdAt for orders — so a just-marked-ready order sorts by when it was marked ready).
  const actionQueue = useMemo(() => {
    const calls = allCalls
      .filter(c => c.status === 'pending')
      .map(c => ({
        id: 'call:' + c.id,
        rawId: c.id,
        type: 'call',
        table: c.tableNumber || '—',
        subtitle: reasonLabel(c.reason),
        seconds: c.createdAt?.seconds || 0,
        raw: c,
      }));
    const serves = allOrders
      .filter(o => o.status === 'ready')
      .map(o => {
        const isTakeaway = o.orderType === 'takeaway' || o.orderType === 'takeout';
        return {
          id: 'serve:' + o.id,
          rawId: o.id,
          type: 'serve',
          isTakeaway,
          table: isTakeaway ? (o.customerName || 'Pickup') : (o.tableNumber || '—'),
          // For serves, subtitle is the order number + item count
          subtitle: `${orderLabel(o)} · ${(o.items || []).length} item${(o.items || []).length === 1 ? '' : 's'}`,
          seconds: o.updatedAt?.seconds || o.createdAt?.seconds || 0,
          raw: o,
        };
      });
    // Sort oldest first — that's the action priority for both types.
    return [...calls, ...serves].sort((a, b) => (a.seconds || 0) - (b.seconds || 0));
  }, [allCalls, allOrders]);

  const callsCount = actionQueue.filter(i => i.type === 'call').length;
  const servesCount = actionQueue.filter(i => i.type === 'serve').length;

  // Oldest action age — drives the stats strip. `tick` dep makes it recompute every second.
  const oldestAge = useMemo(() => {
    if (actionQueue.length === 0) return null;
    const oldest = actionQueue[0].seconds || 0;
    if (!oldest) return null;
    return formatElapsed(Math.floor(Date.now() / 1000) - oldest);
  }, [actionQueue, tick]);

  // ── Sound alert: play when a new action appears ──
  useEffect(() => {
    const now = actionQueue.length;
    const prev = prevActionCountRef.current;
    if (prev !== null && now > prev && soundEnabled && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
    prevActionCountRef.current = now;
  }, [actionQueue, soundEnabled]);

  // ── Detect newly-arrived items for flash + unseen-below tracking ──
  useEffect(() => {
    const currentIds = new Set(actionQueue.map(i => i.id));
    const prevIds = prevActionIdsRef.current;

    if (!initialLoadDoneRef.current) {
      prevActionIdsRef.current = currentIds;
      initialLoadDoneRef.current = true;
      return;
    }

    const newlyAdded = [...currentIds].filter(id => !prevIds.has(id));
    if (newlyAdded.length > 0) {
      setFlashingIds(prev => { const n = new Set(prev); newlyAdded.forEach(id => n.add(id)); return n; });
      setUnseenIds(prev => { const n = new Set(prev); newlyAdded.forEach(id => n.add(id)); return n; });
      setTimeout(() => {
        setFlashingIds(prev => { const n = new Set(prev); newlyAdded.forEach(id => n.delete(id)); return n; });
      }, 4000);
    }
    setUnseenIds(prev => {
      let changed = false;
      const next = new Set();
      prev.forEach(id => { if (currentIds.has(id)) next.add(id); else changed = true; });
      return changed ? next : prev;
    });

    prevActionIdsRef.current = currentIds;
  }, [actionQueue]);

  // ── Scroll detection: clear unseen when near bottom ──
  useEffect(() => {
    if (unseenIds.size === 0) return;
    const handleScroll = () => {
      const scrolled = window.innerHeight + window.scrollY;
      const bottom = document.documentElement.scrollHeight - 100;
      if (scrolled >= bottom) setUnseenIds(new Set());
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [unseenIds.size]);

  // ── Actions ──
  // Staff writes route through staffDb (Firestore rules gate on claims);
  // admin writes use the existing helpers (which use the admin db).
  const handleAction = async (item) => {
    setResolvingId(item.id);
    try {
      if (item.type === 'call') {
        if (staffSession) {
          await resolveWaiterCallAs(staffDb, rid, item.rawId);
        } else {
          await resolveWaiterCall(rid, item.rawId);
        }
      } else {
        if (staffSession) {
          await updateOrderStatusAs(staffDb, rid, item.rawId, 'served');
        } else {
          await updateOrderStatus(rid, item.rawId, 'served');
        }
      }
    } catch (e) {
      console.error('Action failed:', e);
      toast.error(item.type === 'call' ? 'Could not resolve call. Retry in a moment.' : 'Could not mark order as served. Retry in a moment.');
    }
    setResolvingId(null);
  };

  // ── History data ──
  // History shows calls (resolved) AND orders (served). Combined so the waiter can audit their shift.
  //
  // Range selection: a custom range (if active) overrides the period pill.
  // Custom bounds are local-midnight → 23:59:59 to match period semantics.
  const historyItems = useMemo(() => {
    let rangeStart = 0;
    let rangeEnd   = Infinity;
    if (historyCustomRange.active && historyCustomRange.start && historyCustomRange.end) {
      const s = new Date(historyCustomRange.start + 'T00:00:00'); s.setHours(0, 0, 0, 0);
      const e = new Date(historyCustomRange.end   + 'T23:59:59'); e.setHours(23, 59, 59, 999);
      rangeStart = s.getTime() / 1000;
      rangeEnd   = e.getTime() / 1000;
    } else {
      rangeStart = historyPeriod === 'today' ? startOfToday()
                 : historyPeriod === 'week'  ? startOfWeek()
                 : historyPeriod === 'month' ? startOfMonth()
                 : 0;
    }
    const inRange = (ts) => ts >= rangeStart && ts <= rangeEnd;

    const callsHist = allCalls
      .filter(c => c.status === 'resolved')
      .filter(c => inRange(c.resolvedAt?.seconds || c.createdAt?.seconds || 0))
      .map(c => ({
        id: 'call:' + c.id,
        type: 'call',
        table: c.tableNumber || '—',
        label: reasonLabel(c.reason),
        createdSec: c.createdAt?.seconds || 0,
        resolvedSec: c.resolvedAt?.seconds || null,
      }));
    const ordersHist = allOrders
      .filter(o => o.status === 'served')
      .filter(o => inRange(o.updatedAt?.seconds || o.createdAt?.seconds || 0))
      .map(o => {
        const isTakeaway = o.orderType === 'takeaway' || o.orderType === 'takeout';
        return {
          id: 'serve:' + o.id,
          type: 'serve',
          isTakeaway,
          table: isTakeaway ? (o.customerName || 'Pickup') : (o.tableNumber || '—'),
          label: `${orderLabel(o)} · ${(o.items || []).length} item${(o.items || []).length === 1 ? '' : 's'}`,
          createdSec: o.createdAt?.seconds || 0,
          resolvedSec: o.updatedAt?.seconds || null,
        };
      });
    const all = [...callsHist, ...ordersHist].sort((a, b) => (b.resolvedSec || 0) - (a.resolvedSec || 0));

    // Filter by search (table number or label)
    const q = historySearch.trim().toLowerCase();
    if (!q) return all;
    return all.filter(h =>
      String(h.table).toLowerCase().includes(q) ||
      h.label.toLowerCase().includes(q)
    );
  }, [allCalls, allOrders, historyPeriod, historyCustomRange, historySearch]);

  // Stats for header strip
  const doneTodayCount = useMemo(() => {
    const today = startOfToday();
    const resolvedCalls = allCalls.filter(c => c.status === 'resolved' && (c.resolvedAt?.seconds || 0) >= today).length;
    const servedOrders = allOrders.filter(o => o.status === 'served' && (o.updatedAt?.seconds || 0) >= today).length;
    return resolvedCalls + servedOrders;
  }, [allCalls, allOrders]);

  const avgResolutionTodayText = useMemo(() => {
    const today = startOfToday();
    // Base on calls only — orders' "served" time is set by waiter but prep started much earlier,
    // which would skew the average upward and confuse the metric.
    const resolved = allCalls.filter(c => c.status === 'resolved'
      && (c.resolvedAt?.seconds || 0) >= today
      && c.createdAt?.seconds && c.resolvedAt?.seconds);
    if (resolved.length === 0) return null;
    const totalSec = resolved.reduce((sum, c) => sum + (c.resolvedAt.seconds - c.createdAt.seconds), 0);
    return formatElapsed(Math.round(totalSec / resolved.length));
  }, [allCalls]);

  const staffLogout = () => {
    localStorage.removeItem('ar_staff_session');
    router.replace('/staff/login');
  };

  if (adminLoading || !authChecked) return null;

  // ═══ Main body ═══
  const body = (
    <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font }}>
      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes flashNew {
          0%, 100% { box-shadow: 0 2px 10px rgba(38,52,49,0.03); border-color: rgba(0,0,0,0.06); }
          50% { box-shadow: 0 0 0 3px rgba(196,168,109,0.35), 0 4px 20px rgba(196,168,109,0.25); border-color: rgba(196,168,109,0.60); }
        }
        @keyframes bannerPulse {
          0%, 100% { background: rgba(196,168,109,0.95); }
          50% { background: rgba(196,168,109,0.75); }
        }
        .waiter-action.flash-new { animation: flashNew 1.3s ease-in-out infinite, fadeUp 0.25s ease both; }
        .waiter-tab-pill:hover:not(.active) { background: ${A.subtleBg}; color: ${A.ink}; }
        .waiter-period-pill:hover:not(.active) { background: ${A.subtleBg}; color: ${A.ink}; }
        .waiter-icon-btn:hover { background: ${A.shellDarker}; }
        .waiter-action-btn:hover:not(:disabled) { filter: brightness(1.08); }
        .waiter-action:hover { box-shadow: 0 4px 20px rgba(38,52,49,0.06); }

        /* Tablet (iPad Mini → iPad Pro) — waiter staff hold the tablet
           and tap mid-shift, often with one hand. ≥48px touch targets so
           Resolve / Mark Served can't be missed. Action card padding bumps
           to give breathing room around the tap zones. */
        @media (min-width: 641px) and (max-width: 1199px) {
          .waiter-action-btn   { padding: 14px 22px !important; font-size: 14px !important; min-height: 48px; min-width: 132px !important; }
          .waiter-tab-pill     { padding: 12px 20px !important; min-height: 48px; }
          .waiter-period-pill  { padding: 10px 16px !important; min-height: 44px; }
          .waiter-icon-btn     { min-height: 48px; min-width: 48px; padding: 12px 14px !important; }
        }
      `}</style>

      {/* ═══ Header ═══ */}
      <div style={{ padding: '24px 28px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, marginBottom: 6, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Operations</span>
              <span style={{ opacity: 0.5 }}>›</span>
              <span style={{ color: A.mutedText }}>Waiter</span>
            </div>
            <div style={{ fontWeight: 600, fontSize: 28, color: A.ink, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
              Waiter <span style={{ color: A.mutedText, fontWeight: 500 }}>Dashboard</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center', alignSelf: 'flex-start' }}>
            {/* Sound toggle */}
            <button className="waiter-icon-btn"
              onClick={() => setSoundEnabled(v => !v)}
              title={soundEnabled ? 'Mute new-action sound' : 'Enable new-action sound'}
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

            {!isAdmin && (
              <button onClick={staffLogout} style={{
                padding: '8px 14px', borderRadius: 10, border: A.border, background: A.shell,
                color: A.mutedText, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: A.font,
              }}>
                Sign Out
              </button>
            )}
          </div>
        </div>

        {/* ═══ LIVE SERVICE stats card — full width, compact ═══ */}
        <div style={{
          background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
          borderRadius: 12, padding: '12px 18px', marginTop: 14, marginBottom: 14,
          border: A.forestBorder,
          boxShadow: '0 4px 16px rgba(38,52,49,0.12)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: A.warning, animation: 'pulse 2s ease infinite', boxShadow: '0 0 6px rgba(196,168,109,0.6)' }} />
              <span style={{ fontFamily: A.font, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: A.warning }}>LIVE SERVICE</span>
            </div>
            <div style={{ width: 1, height: 28, background: 'rgba(234,231,227,0.10)', flexShrink: 0 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 80 }}>
                <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 2 }}>
                  Actions {(callsCount > 0 || servesCount > 0) && <span style={{ color: A.forestTextMuted, fontWeight: 500, letterSpacing: 0, textTransform: 'none' }}>· {callsCount}c · {servesCount}s</span>}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 22, color: actionQueue.length > 0 ? A.warning : A.forestText, lineHeight: 1, letterSpacing: '-0.5px' }}>
                  {actionQueue.length}
                </div>
              </div>
              <div style={{ width: 1, height: 24, background: 'rgba(234,231,227,0.06)', flexShrink: 0 }} />
              <div style={{ minWidth: 80 }}>
                <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 2 }}>Oldest</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 18, color: A.forestText, lineHeight: 1, letterSpacing: '-0.3px' }}>
                  {oldestAge || '—'}
                </div>
              </div>
              <div style={{ width: 1, height: 24, background: 'rgba(234,231,227,0.06)', flexShrink: 0 }} />
              <div style={{ minWidth: 80 }}>
                <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 2 }}>Done today</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 18, color: A.success, lineHeight: 1, letterSpacing: '-0.3px' }}>
                  {doneTodayCount}
                </div>
              </div>
              <div style={{ width: 1, height: 24, background: 'rgba(234,231,227,0.06)', flexShrink: 0 }} />
              <div style={{ minWidth: 80 }}>
                <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 2 }}>Avg response</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 18, color: A.forestText, lineHeight: 1, letterSpacing: '-0.3px' }}>
                  {avgResolutionTodayText || '—'}
                </div>
              </div>
            </div>
            <span style={{ fontFamily: A.font, fontSize: 10, color: A.forestTextMuted, fontWeight: 500, flexShrink: 0, letterSpacing: '0.02em' }}>
              {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
          </div>
        </div>
      </div>

      {/* ═══ Tabs ═══ */}
      <div style={{ padding: '0 28px', marginBottom: 16 }}>
        <div style={{ display: 'inline-flex', background: A.shell, border: A.border, borderRadius: 10, padding: 3, boxShadow: A.shadowCard }}>
          {[
            { key: 'queue',   label: 'Action Queue', badge: actionQueue.length },
            { key: 'history', label: 'History',      badge: null },
          ].map(t => {
            const active = tab === t.key;
            return (
              <button key={t.key} className={`waiter-tab-pill ${active ? 'active' : ''}`}
                onClick={() => setTab(t.key)}
                style={{
                  padding: '8px 16px', borderRadius: 7, border: 'none', cursor: 'pointer',
                  fontFamily: A.font, fontSize: 13, fontWeight: active ? 700 : 600,
                  background: active ? A.ink : 'transparent',
                  color: active ? A.cream : A.mutedText,
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  transition: 'all 0.15s',
                }}>
                {t.label}
                {t.badge > 0 && (
                  <span style={{
                    padding: '1px 7px', borderRadius: 10,
                    background: active ? 'rgba(237,237,237,0.18)' : 'rgba(196,168,109,0.20)',
                    color: active ? A.cream : A.warningDim,
                    fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                    letterSpacing: '-0.2px',
                  }}>
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ Tab content ═══ */}
      <div style={{ padding: '0 28px 60px' }}>

        {/* ─── Action Queue ─── */}
        {tab === 'queue' && (
          actionQueue.length === 0 ? (
            <div style={{
              background: A.shell, borderRadius: 14, border: A.border,
              padding: '64px 32px', textAlign: 'center', boxShadow: A.shadowCard,
            }}>
              <div style={{ display: 'inline-flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: A.success, opacity: 0.8, animation: 'pulse 1.8s infinite' }} />
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(0,0,0,0.10)' }} />
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(0,0,0,0.06)' }} />
              </div>
              <div style={{ fontWeight: 600, fontSize: 16, color: A.ink, marginBottom: 8, letterSpacing: '-0.2px' }}>
                No actions pending
              </div>
              <div style={{ fontSize: 13, color: A.mutedText, lineHeight: 1.6, maxWidth: 360, margin: '0 auto' }}>
                New calls and ready-to-serve orders will appear here in real time.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {actionQueue.map((item, idx) => {
                const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - (item.seconds || 0));
                const isFlashing = flashingIds.has(item.id);
                const isCall = item.type === 'call';

                // Age urgency band
                let urgency = 'fresh';
                if (elapsed >= WAITING_LONG_SEC) urgency = 'over';
                else if (elapsed >= WAITING_WARN_SEC) urgency = 'warn';
                const edgeColor = urgency === 'over' ? A.danger
                                : urgency === 'warn' ? A.warning
                                : 'rgba(0,0,0,0.06)';
                const timerColor = urgency === 'over' ? A.danger
                                 : urgency === 'warn' ? A.warning
                                 : A.ink;

                // Type-specific accent (card left-edge stripe + type pill color)
                const accentColor = isCall ? A.warning : A.success;
                const typeBg = isCall ? 'rgba(196,168,109,0.14)' : 'rgba(63,158,90,0.10)';
                const typeColor = isCall ? A.warningDim : A.success;
                const typeLabel = isCall ? 'CALL' : 'READY';
                const btnBg = isCall ? A.warning : A.success;
                const btnColor = isCall ? A.ink : A.shell;
                const btnLabel = isCall ? 'Resolve' : 'Mark Served';

                return (
                  <div key={item.id}
                    className={`waiter-action${isFlashing ? ' flash-new' : ''}`}
                    style={{
                      position: 'relative',
                      background: A.shell, borderRadius: 14, border: A.border,
                      borderLeft: `4px solid ${accentColor}`,
                      boxShadow: A.shadowCard, overflow: 'hidden',
                      animation: isFlashing ? undefined : 'fadeUp 0.25s ease both',
                      animationDelay: isFlashing ? undefined : `${Math.min(idx * 0.03, 0.4)}s`,
                      transition: 'all 0.15s',
                    }}>
                    {/* Age urgency top edge bar */}
                    <div style={{
                      position: 'absolute', left: 0, right: 0, top: 0, height: 3,
                      background: edgeColor,
                    }} />

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto auto',
                      gap: 18, alignItems: 'center',
                      padding: '18px 24px',
                    }}>
                      {/* Left: type pill + table + subtitle */}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: 9, fontWeight: 700, letterSpacing: '0.10em',
                            padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase',
                            background: typeBg, color: typeColor,
                          }}>{typeLabel}</span>
                          <span style={{
                            fontWeight: 700, fontSize: 16, color: A.ink, letterSpacing: '-0.3px',
                          }}>{item.isTakeaway ? `Takeaway · ${item.table}` : `Table ${item.table}`}</span>
                          {urgency === 'over' && (
                            <span style={{
                              fontSize: 9, fontWeight: 700, letterSpacing: '0.10em',
                              padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase',
                              background: 'rgba(217,83,79,0.12)', color: A.danger,
                            }}>Waiting long</span>
                          )}
                        </div>
                        <div style={{ fontSize: 13, color: A.mutedText, fontWeight: 500 }}>
                          {item.subtitle}
                        </div>
                        {/* For serves, also show the item list underneath — waiter needs to grab the right plates */}
                        {!isCall && item.raw?.items && item.raw.items.length > 0 && (
                          <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {item.raw.items.slice(0, 4).map((it, i) => (
                              <span key={i} style={{
                                padding: '2px 8px', borderRadius: 10,
                                background: A.subtleBg, color: A.ink,
                                fontSize: 11, fontWeight: 500,
                              }}>
                                <span style={{ color: A.warning, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{it.qty || 1}×</span>
                                {' '}{it.name}
                              </span>
                            ))}
                            {item.raw.items.length > 4 && (
                              <span style={{
                                padding: '2px 8px', borderRadius: 10,
                                background: A.subtleBg, color: A.mutedText,
                                fontSize: 11, fontWeight: 500,
                              }}>+{item.raw.items.length - 4} more</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Middle: elapsed timer */}
                      <div style={{ textAlign: 'right' }}>
                        <div style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 15, fontWeight: 700, color: timerColor,
                          letterSpacing: '-0.2px', lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                        }}>{formatElapsed(elapsed)}</div>
                        <div style={{ fontSize: 10, color: A.faintText, fontWeight: 500, marginTop: 3 }}>
                          {isCall ? 'waiting' : 'ready'}
                        </div>
                      </div>

                      {/* Right: action button */}
                      <button className="waiter-action-btn"
                        onClick={() => handleAction(item)}
                        disabled={resolvingId === item.id}
                        style={{
                          padding: '10px 18px', borderRadius: 10, border: 'none',
                          background: btnBg, color: btnColor,
                          fontFamily: A.font, fontSize: 13, fontWeight: 700,
                          cursor: 'pointer', letterSpacing: '0.01em',
                          opacity: resolvingId === item.id ? 0.6 : 1,
                          whiteSpace: 'nowrap',
                          minWidth: 110,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                        {resolvingId === item.id
                          ? <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: btnColor, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                          : btnLabel}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ─── History ─── */}
        {tab === 'history' && (
          <div>
            {/* Period pills + search */}
            <div style={{
              background: A.shell, border: A.border, borderRadius: 14,
              boxShadow: A.shadowCard, padding: '12px 18px',
              display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
              marginBottom: 14,
            }}>
              {/* Period pills + Custom date-range picker. position:relative so
                  DateRangePicker's popover (absolute top:42) anchors here.
                  Picking a pill clears any active custom range; Custom overrides the pill. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', position: 'relative' }}>
                {[['today', 'Today'], ['week', 'Week'], ['month', 'Month'], ['all', 'All']].map(([val, label]) => {
                  const active = !historyCustomRange.active && historyPeriod === val;
                  return (
                    <button key={val} className={`waiter-period-pill ${active ? 'active' : ''}`}
                      onClick={() => { setHistoryCustomRange({ active: false, start: '', end: '' }); setHistoryPeriod(val); }}
                      style={{
                        padding: '6px 12px', fontFamily: A.font, fontSize: 12, fontWeight: active ? 700 : 500,
                        background: active ? A.ink : 'transparent',
                        color: active ? A.cream : A.mutedText,
                        border: 'none', borderRadius: 7, cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}>
                      {label}
                    </button>
                  );
                })}
                <DateRangePicker
                  value={historyCustomRange}
                  onChange={setHistoryCustomRange}
                  maxDate={todayKey()}
                  theme={A}
                  pillClassName="waiter-period-pill"
                />
              </div>
              <span style={{ width: 1, height: 22, background: 'rgba(0,0,0,0.10)' }} />
              <input
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                placeholder="Search by table or type…"
                style={{
                  flex: 1, minWidth: 200,
                  padding: '8px 12px', borderRadius: 8,
                  border: A.border, background: A.shellDarker,
                  fontSize: 13, fontFamily: A.font, color: A.ink,
                  outline: 'none',
                }}
                onFocus={e => e.target.style.background = A.shell}
                onBlur={e => e.target.style.background = A.shellDarker}
              />
              <span style={{ fontSize: 12, color: A.faintText, fontWeight: 500 }}>
                {historyItems.length} result{historyItems.length === 1 ? '' : 's'}
              </span>
            </div>

            {historyItems.length === 0 ? (
              <div style={{
                background: A.shell, borderRadius: 14, border: A.border,
                padding: '48px 32px', textAlign: 'center', boxShadow: A.shadowCard,
                fontSize: 13, color: A.mutedText,
              }}>
                No history in this period
              </div>
            ) : (
              <div style={{
                background: A.shell, borderRadius: 14, border: A.border,
                boxShadow: A.shadowCard, overflow: 'hidden',
              }}>
                {historyItems.map((h, i) => {
                  const waitSec = (h.resolvedSec && h.createdSec) ? (h.resolvedSec - h.createdSec) : null;
                  const isCall = h.type === 'call';
                  const typeColor = isCall ? A.warningDim : A.success;
                  const typeBg = isCall ? 'rgba(196,168,109,0.14)' : 'rgba(63,158,90,0.10)';
                  const typeLabel = isCall ? 'CALL' : 'SERVED';
                  return (
                    <div key={h.id} style={{
                      padding: '14px 18px',
                      borderTop: i > 0 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                      display: 'grid',
                      gridTemplateColumns: '80px 1fr auto auto',
                      gap: 16, alignItems: 'center',
                    }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.10em',
                        padding: '3px 8px', borderRadius: 4, textTransform: 'uppercase',
                        background: typeBg, color: typeColor,
                        justifySelf: 'start',
                      }}>{typeLabel}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: A.ink, lineHeight: 1.3 }}>
                          {h.isTakeaway ? `Takeaway · ${h.table}` : `Table ${h.table}`}
                        </div>
                        <div style={{ fontSize: 12, color: A.mutedText, marginTop: 2 }}>
                          {h.label}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: A.faintText, fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {h.resolvedSec ? new Date(h.resolvedSec * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </div>
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 12, fontWeight: 700, color: A.mutedText,
                        fontVariantNumeric: 'tabular-nums', minWidth: 50, textAlign: 'right',
                      }}>
                        {waitSec !== null ? formatElapsed(waitSec) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ Bottom banner for unseen new items (queue tab only) ═══ */}
        {tab === 'queue' && unseenIds.size > 0 && (
          <div style={{
            position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40,
            padding: '12px 24px',
            background: 'rgba(196,168,109,0.92)',
            color: A.ink,
            fontWeight: 700, fontSize: 14, letterSpacing: '0.02em',
            textAlign: 'center',
            boxShadow: '0 -4px 20px rgba(196,168,109,0.25)',
            animation: 'bannerPulse 1.2s ease-in-out infinite',
            cursor: 'pointer',
          }}
          onClick={() => {
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
          }}
          >
            ↓ {unseenIds.size} new item{unseenIds.size === 1 ? '' : 's'} below — scroll down to view
          </div>
        )}
      </div>
    </div>
  );

  // Admin wrap: inside AdminLayout (sidebar visible).
  // Staff wrap: bare page with branding header (dedicated tablet view).
  if (isAdmin) {
    return (
      <AdminLayout>
        <Head><title>Waiter Dashboard | Advert Radical</title></Head>
        {body}
      </AdminLayout>
    );
  }

  return (
    <>
      <Head><title>Waiter Dashboard | Advert Radical</title></Head>
      <div style={{
        background: A.shell, borderBottom: A.border,
        padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontFamily: A.font,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontFamily: A.font, fontWeight: 800, fontSize: 15 }}>
            <span style={{ color: A.ink }}>Advert </span>
            <span style={{ color: A.warning }}>Radical</span>
          </div>
          <div style={{ width: 1, height: 18, background: 'rgba(0,0,0,0.10)' }} />
          <div style={{ fontSize: 13, color: A.mutedText, fontWeight: 500 }}>{staffSession?.restaurantName}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 12, color: A.faintText }}>
            Logged in as <span style={{ color: A.warning, fontWeight: 600 }}>{staffSession?.name}</span>
          </div>
        </div>
      </div>
      {body}
    </>
  );
}

WaiterDashboard.getLayout = (page) => page;