import Head from 'next/head';
import { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { updateOrderStatus } from '../../lib/db';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

// ═══ Aspire palette — same tokens as analytics/reports/orders ═══
const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER,
  cream: '#EDEDED',
  ink: '#1A1A1A',
  shell: '#FFFFFF',
  shellDarker: '#FAFAF8',
  warning: '#C4A86D',       // Antique Gold — brand signature
  warningDim: '#A08656',    // Darker gold for subdued text
  // Matte black tokens for the signature LIVE card (matches analytics's LIVE TODAY card)
  forest: '#1A1A1A',
  forestDarker: '#2A2A2A',
  forestText: '#EAE7E3',
  forestTextMuted: 'rgba(234,231,227,0.55)',
  forestTextFaint: 'rgba(234,231,227,0.35)',
  forestSubtleBg: 'rgba(255,255,255,0.04)',
  forestBorder: '1px solid rgba(255,255,255,0.06)',
  success: '#3F9E5A',
  danger: '#D9534F',
  mutedText: 'rgba(0,0,0,0.55)',
  faintText: 'rgba(0,0,0,0.38)',
  subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)',
  borderStrong: '1px solid rgba(0,0,0,0.10)',
  shadowCard: '0 2px 10px rgba(38,52,49,0.03)',
};

// ═══ Status metadata — drives button label, tag, and next-state transition ═══
const STATUS_META = {
  pending:   { label: 'New',       next: 'preparing', nextLabel: 'Start Preparing', btnKind: 'gold' },
  preparing: { label: 'Preparing', next: 'ready',     nextLabel: 'Mark Ready',      btnKind: 'ink'  },
  ready:     { label: 'Ready',     next: 'served',    nextLabel: 'Mark Served',     btnKind: 'green'},
  served:    { label: 'Served',    next: null,        nextLabel: null,              btnKind: null   },
};

// ═══ Target prep time (minutes). Color states:
//     elapsed < target * 0.75  →  fresh    (neutral edge)
//     elapsed >= target * 0.75 →  warn     (gold edge)
//     elapsed >= target        →  over     (red edge)
// Default 15 minutes. Future: store per-item target in the menu.
// ═══
const TARGET_MIN = 15;

// ═══ Stations (deferred feature) ═══
// Station routing (hot line / cold line / desserts / bar) is intentionally NOT wired up yet.
// Rationale: today's target restaurants are small-to-medium, single-kitchen setups where
// filtering by station would be unhelpful — the cook needs the full picture for each table.
// Stations become valuable for restaurants with 5+ cooks or physically separated prep areas.
// When a real customer asks for it, build:
//   1. A `station` dropdown field on the menu item schema (hot/cold/dessert/bar)
//   2. Admin UI in pages/admin/items.js to let them pick
//   3. Copy station onto order items during order creation
//   4. Restore the station filter pills, sort-by-station mode, and station chips here
// For now, all the station-related data paths are simply omitted — simpler code, cleaner UI.

// ═══ Utility: staff session (cookie-free local auth for kitchen tablet logins) ═══
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

// ═══ Format elapsed seconds as "18m 4s" or "0s". Avoids "18:04" which reads like clock time. ═══
function formatElapsed(secondsElapsed) {
  if (secondsElapsed == null || secondsElapsed < 0) return '0s';
  if (secondsElapsed < 60) return `${Math.floor(secondsElapsed)}s`;
  const m = Math.floor(secondsElapsed / 60);
  const s = Math.floor(secondsElapsed % 60);
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

// ═══ Order label: "#5" or fallback to id slice ═══
function orderLabel(o) {
  if (typeof o.orderNumber === 'number' && o.orderNumber > 0) return `#${o.orderNumber}`;
  return '#' + (o.id || '').slice(-5).toUpperCase();
}

export default function KitchenDisplay() {
  const { user, userData, loading: adminLoading } = useAuth();
  const router = useRouter();

  const [staffSession, setStaffSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [orders, setOrders] = useState([]);
  const [updating, setUpdating] = useState(null);
  const [tick, setTick] = useState(0);

  // UI state
  const [density, setDensity] = useState('comfortable'); // 'comfortable' or 'compact'
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [todayServed, setTodayServed] = useState(0);

  // Refs
  const audioRef = useRef(null);
  const prevPendingRef = useRef(null);
  // Set of ticket IDs that just appeared — drives the gold flash animation (clears after 4s)
  const [flashingIds, setFlashingIds] = useState(new Set());
  // Set of ticket IDs the user hasn't scrolled into view yet — drives the bottom banner
  const [unseenIds, setUnseenIds] = useState(new Set());
  // Tracks previously-seen ticket IDs across snapshots for diffing
  const previousTicketIdsRef = useRef(new Set());
  // Prevents flashing all tickets on the very first snapshot
  const initialLoadDoneRef = useRef(false);

  // ══ Auth check ══
  useEffect(() => {
    const session = getStaffSession();
    setStaffSession(session);
    setAuthChecked(true);
  }, []);

  useEffect(() => {
    if (!authChecked || adminLoading) return;
    if (user && !userData) return;
    const isAdmin = !!userData?.restaurantId;
    if (isAdmin) return; // admin: full access
    if (staffSession?.role === 'kitchen') return; // kitchen staff: allow
    if (staffSession?.role === 'waiter') { router.replace('/admin/waiter'); return; }
    router.replace('/staff/login');
  }, [authChecked, adminLoading, user, userData, staffSession]);

  const rid = userData?.restaurantId || staffSession?.restaurantId;
  const isAdmin = !!userData?.restaurantId;

  // ══ Load sound preference from localStorage; preload audio ══
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ar_kitchen_sound');
      if (stored !== null) setSoundEnabled(stored === 'true');
    } catch {}
    try {
      audioRef.current = new Audio('/notification.mp3');
      audioRef.current.preload = 'auto';
    } catch {}
  }, []);

  // ══ Persist sound preference ══
  useEffect(() => {
    try { localStorage.setItem('ar_kitchen_sound', String(soundEnabled)); } catch {}
  }, [soundEnabled]);

  // ══ Load density preference from localStorage ══
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ar_kitchen_density');
      if (stored === 'compact' || stored === 'comfortable') setDensity(stored);
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem('ar_kitchen_density', density); } catch {}
  }, [density]);

  // ══ 1-second tick — keeps ticket timers live. Lightweight state bump, no heavy re-render. ══
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // ══ Firestore listener on orders ══
  useEffect(() => {
    if (!rid) return;
    const q = query(collection(db, 'restaurants', rid, 'orders'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setOrders(all);
      // Count today's served (midnight-to-now) for the header subtitle
      const midnight = new Date(); midnight.setHours(0,0,0,0);
      const ms = midnight.getTime() / 1000;
      const servedToday = all.filter(o => o.status === 'served' && (o.createdAt?.seconds || 0) >= ms).length;
      setTodayServed(servedToday);
    }, err => {
      console.error('Kitchen listener error:', err);
    });
    return unsub;
  }, [rid]);

  // ══ Sound alert: play when pending count goes up ══
  useEffect(() => {
    const pendingNow = orders.filter(o => o.status === 'pending').length;
    const prev = prevPendingRef.current;
    if (prev !== null && pendingNow > prev && soundEnabled && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {}); // autoplay-blocked fails silently
    }
    prevPendingRef.current = pendingNow;
  }, [orders, soundEnabled]);


  // ══ Advance status (or recall to New) ══
  const advance = async (order) => {
    const meta = STATUS_META[order.status];
    if (!meta?.next) return;
    setUpdating(order.id);
    try { await updateOrderStatus(rid, order.id, meta.next); }
    catch (e) { console.error('Advance failed:', e); }
    setUpdating(null);
  };
  const recallToNew = async (order) => {
    setUpdating(order.id);
    try { await updateOrderStatus(rid, order.id, 'pending'); }
    catch (e) { console.error('Recall failed:', e); }
    setUpdating(null);
  };

  const staffLogout = () => {
    localStorage.removeItem('ar_staff_session');
    router.replace('/staff/login');
  };

  // ══ Active tickets (anything not served) with enriched station info ══
  // Enrich active tickets with a `hasNote` flag (drives the "Note" badge next to the order #)
  const enrichedActive = useMemo(() => {
    return orders
      .filter(o => ['pending', 'preparing', 'ready'].includes(o.status))
      .map(o => {
        const items = o.items || [];
        return {
          ...o,
          items,
          hasNote: items.some(i => i.note) || !!o.specialInstructions,
        };
      });
  }, [orders]);

  // Detect newly-arrived tickets. Flash them gold for 4s and mark as unseen until scrolled-to.
  useEffect(() => {
    const currentIds = new Set(enrichedActive.map(o => o.id));
    const previousIds = previousTicketIdsRef.current;

    if (!initialLoadDoneRef.current) {
      previousTicketIdsRef.current = currentIds;
      initialLoadDoneRef.current = true;
      return;
    }

    const newlyAdded = [...currentIds].filter(id => !previousIds.has(id));
    if (newlyAdded.length > 0) {
      setFlashingIds(prev => {
        const next = new Set(prev);
        newlyAdded.forEach(id => next.add(id));
        return next;
      });
      setUnseenIds(prev => {
        const next = new Set(prev);
        newlyAdded.forEach(id => next.add(id));
        return next;
      });
      setTimeout(() => {
        setFlashingIds(prev => {
          const next = new Set(prev);
          newlyAdded.forEach(id => next.delete(id));
          return next;
        });
      }, 4000);
    }

    // Clean up unseen IDs for tickets no longer active (served/removed)
    setUnseenIds(prev => {
      let changed = false;
      const next = new Set();
      prev.forEach(id => { if (currentIds.has(id)) next.add(id); else changed = true; });
      return changed ? next : prev;
    });

    previousTicketIdsRef.current = currentIds;
  }, [enrichedActive]);

  // Scroll detection: clear unseen set when user scrolls near page bottom
  useEffect(() => {
    if (unseenIds.size === 0) return;
    const handleScroll = () => {
      const scrolled = window.innerHeight + window.scrollY;
      const bottom = document.documentElement.scrollHeight - 100;
      if (scrolled >= bottom) setUnseenIds(new Set());
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // check immediately in case grid fits in viewport
    return () => window.removeEventListener('scroll', handleScroll);
  }, [unseenIds.size]);

  // ══ Filter by station ══
  // No station filtering for now (see "Stations (deferred feature)" note at top of file)
  const filtered = enrichedActive;

  // Always sort oldest-first — that's the kitchen prioritization order.
  // Multiple sort modes could make sense once we have stations; until then, a single mode is clearer.
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)),
    [filtered]
  );

  // ══ All-Day counter ══
  // For each dish, count: (a) how many distinct tickets contain it, (b) total qty across all tickets.
  // We only show dishes that appear in 2+ distinct tickets — that's when "fire together" is useful.
  // A single ticket with 5× of the same dish is NOT a batching opportunity with another order.
  const allDay = useMemo(() => {
    // Map<dishName, {orderCount: number, totalQty: number}>
    const map = new Map();
    enrichedActive.forEach(o => {
      // Per-ticket: collapse multiple lines of same dish first (edge case but safer)
      const perTicketCounts = new Map();
      o.items.forEach(i => {
        const key = i.name;
        if (!key) return;
        perTicketCounts.set(key, (perTicketCounts.get(key) || 0) + (i.qty || 1));
      });
      // Now roll up per-ticket counts into the global map, incrementing orderCount by 1 per ticket
      perTicketCounts.forEach((qty, name) => {
        const existing = map.get(name) || { orderCount: 0, totalQty: 0 };
        map.set(name, { orderCount: existing.orderCount + 1, totalQty: existing.totalQty + qty });
      });
    });
    return Array.from(map.entries())
      .filter(([, info]) => info.orderCount >= 2) // must be in 2+ different tickets
      .sort((a, b) => b[1].orderCount - a[1].orderCount || b[1].totalQty - a[1].totalQty)
      .slice(0, 8)
      .map(([name, info]) => [name, info.totalQty, info.orderCount]); // tuple: [name, totalQty, orderCount]
  }, [enrichedActive]);

  // Set of dish names in 2+ distinct tickets — drives per-card duplicate highlighting.
  // Derived from allDay so threshold is consistent.
  const duplicateDishes = useMemo(() => new Set(allDay.map(([name]) => name)), [allDay]);

  // ══ Oldest order age for the subtitle ══
  const oldestAge = useMemo(() => {
    if (enrichedActive.length === 0) return null;
    const oldest = enrichedActive.reduce((min, o) => {
      const s = o.createdAt?.seconds || Infinity;
      return s < min ? s : min;
    }, Infinity);
    if (oldest === Infinity) return null;
    const elapsed = Math.floor(Date.now() / 1000) - oldest;
    return formatElapsed(elapsed);
  }, [enrichedActive, tick]);

  // ══ Full-screen toggle ══
  const toggleFullscreen = () => {
    try {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    } catch {}
  };

  if (adminLoading || !authChecked) return null;

  // ═══ The main page body (wrapped in AdminLayout for admins, bare for staff) ═══
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
        .kds-ticket.flash-new { animation: flashNew 1.3s ease-in-out infinite, fadeUp 0.25s ease both; }
        .kds-station-pill:hover:not(.active) { background: ${A.subtleBg}; color: ${A.ink}; }
        .kds-icon-btn:hover { background: ${A.shellDarker}; }
        .kds-bump-btn:hover:not(:disabled) { filter: brightness(1.08); }
        .kds-recall-btn:hover { background: ${A.subtleBg}; color: ${A.ink}; }
        .kds-ticket { transition: all 0.15s; }
        .kds-ticket:hover { box-shadow: 0 4px 20px rgba(38,52,49,0.06); }
        @media (max-width: 640px) {
          .kds-grid { grid-template-columns: 1fr !important; }
          .kds-filter-bar { flex-direction: column; align-items: flex-start !important; }
        }
      `}</style>

      {/* ═══ Header ═══ */}
      <div style={{ padding: '24px 28px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, marginBottom: 6, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Operations</span>
              <span style={{ opacity: 0.5 }}>›</span>
              <span style={{ color: A.mutedText }}>Kitchen</span>
            </div>
            <div style={{ fontWeight: 600, fontSize: 28, color: A.ink, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
              Kitchen <span style={{ color: A.mutedText, fontWeight: 500 }}>Display</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center', alignSelf: 'flex-start' }}>
            {/* Density toggle */}
            <div style={{ display: 'inline-flex', background: A.shell, border: A.border, borderRadius: 10, padding: 3 }}>
              {[['comfortable', '☰'], ['compact', '≡']].map(([val, icon]) => {
                const active = density === val;
                return (
                  <button key={val} onClick={() => setDensity(val)}
                    title={val === 'comfortable' ? 'Comfortable view' : 'Compact view'}
                    style={{
                      padding: '6px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                      fontSize: 13, fontFamily: A.font, width: 30,
                      background: active ? A.subtleBg : 'transparent',
                      color: active ? A.ink : A.mutedText,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>{icon}</button>
                );
              })}
            </div>

            {/* Sound toggle */}
            <button className="kds-icon-btn"
              onClick={() => setSoundEnabled(v => !v)}
              title={soundEnabled ? 'Mute new-order sound' : 'Enable new-order sound'}
              style={{
                padding: '8px 12px', borderRadius: 10, border: A.border, background: A.shell,
                color: soundEnabled ? A.ink : A.faintText,
                fontSize: 14, cursor: 'pointer', fontFamily: A.font, minWidth: 38,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
              {soundEnabled ? '🔔' : '🔕'}
            </button>

            {/* Full-screen toggle */}
            <button className="kds-icon-btn"
              onClick={toggleFullscreen}
              title="Toggle full screen"
              style={{
                padding: '8px 12px', borderRadius: 10, border: A.border, background: A.shell,
                color: A.ink, fontSize: 14, cursor: 'pointer', fontFamily: A.font, minWidth: 38,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
              ⛶
            </button>

            {/* Staff logout */}
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

        {/* ═══ LIVE KITCHEN stats card — spans full content width, compact for practical use ═══ */}
        <div style={{
          background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
          borderRadius: 12, padding: '12px 18px', marginTop: 14, marginBottom: 14,
          border: A.forestBorder,
          boxShadow: '0 4px 16px rgba(38,52,49,0.12)',
        }}>
          {/* Single horizontal row: label + dividing line + tiles inline + date */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: A.warning, animation: 'pulse 2s ease infinite', boxShadow: '0 0 6px rgba(196,168,109,0.6)' }} />
              <span style={{ fontFamily: A.font, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: A.warning }}>LIVE KITCHEN</span>
            </div>
            <div style={{ width: 1, height: 28, background: 'rgba(234,231,227,0.10)', flexShrink: 0 }} />
            {/* Inline stat groups — each is [LABEL / value] */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 80 }}>
                <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 2 }}>Active</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 22, color: enrichedActive.length > 0 ? A.warning : A.forestText, lineHeight: 1, letterSpacing: '-0.5px' }}>
                  {enrichedActive.length}
                </div>
              </div>
              <div style={{ width: 1, height: 24, background: 'rgba(234,231,227,0.06)', flexShrink: 0 }} />
              <div style={{ minWidth: 90 }}>
                <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 2 }}>Oldest</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 18, color: A.forestText, lineHeight: 1, letterSpacing: '-0.3px' }}>
                  {oldestAge || '—'}
                </div>
              </div>
              <div style={{ width: 1, height: 24, background: 'rgba(234,231,227,0.06)', flexShrink: 0 }} />
              <div style={{ minWidth: 90 }}>
                <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 2 }}>Served today</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 18, color: A.success, lineHeight: 1, letterSpacing: '-0.3px' }}>
                  {todayServed}
                </div>
              </div>
            </div>
            <span style={{ fontFamily: A.font, fontSize: 10, color: A.forestTextMuted, fontWeight: 500, flexShrink: 0, letterSpacing: '0.02em' }}>
              {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
          </div>
        </div>
      </div>

      {/* ═══ Main content: filter bar + all-day row + ticket grid ═══ */}
      <div style={{ padding: '0 28px 40px' }}>

        {/* Station filter + sort controls deferred — see top-of-file note */}
        {false && (
        <div className="kds-filter-bar" style={{
          background: A.shell, border: A.border, borderRadius: 14,
          boxShadow: A.shadowCard, padding: '12px 18px',
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          marginBottom: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span
              title="Filter tickets by cooking station."
              style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning, marginRight: 2, cursor: 'help', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              STATION
              <span style={{ fontSize: 10, color: A.warning, opacity: 0.6 }}>ⓘ</span>
            </span>
            {[
              ['all', 'All'],
              ['hot', 'Hot'],
              ['cold', 'Cold'],
              ['dessert', 'Desserts'],
              ['bar', 'Bar'],
            ].map(([val, label]) => {
              const active = stationFilter === val;
              const count = stationCounts[val] || 0;
              return (
                <button key={val} className={`kds-station-pill ${active ? 'active' : ''}`}
                  onClick={() => setStationFilter(val)}
                  style={{
                    padding: '6px 12px', fontFamily: A.font, fontSize: 12, fontWeight: active ? 600 : 500,
                    background: active ? A.subtleBg : 'transparent',
                    border: 'none', cursor: 'pointer',
                    color: active ? A.ink : A.mutedText,
                    borderRadius: 7,
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}>
                  {label} <span style={{ fontSize: 10, color: active ? A.warning : A.faintText, fontWeight: 600 }}>{count}</span>
                </button>
              );
            })}
          </div>

          <span style={{ width: 1, height: 22, background: 'rgba(0,0,0,0.10)', margin: '0 4px' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span
              title="Oldest first: shows the ticket that has been waiting longest at the top. By station: groups tickets by station (all Hot together, all Cold together) — useful for batch-cooking similar items at once."
              style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning, marginRight: 2, cursor: 'help', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              SORT
              <span style={{ fontSize: 10, color: A.warning, opacity: 0.6 }}>ⓘ</span>
            </span>
            {[['oldest', 'Oldest first'], ['station', 'By station']].map(([val, label]) => {
              const active = sortMode === val;
              return (
                <button key={val} className={`kds-station-pill ${active ? 'active' : ''}`}
                  onClick={() => setSortMode(val)}
                  style={{
                    padding: '6px 12px', fontFamily: A.font, fontSize: 12, fontWeight: active ? 600 : 500,
                    background: active ? A.subtleBg : 'transparent',
                    border: 'none', cursor: 'pointer',
                    color: active ? A.ink : A.mutedText,
                    borderRadius: 7,
                  }}>{label}</button>
              );
            })}
          </div>
        </div>
        )}

        {/* All-Day counter (separate row, lighter weight) */}
        {allDay.length > 0 && (
          <div style={{ padding: '0 2px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              title="Shows dishes appearing in 2 or more active tickets right now. Fire them together to save pan time — e.g. two Paneer Kaati Rolls in one batch instead of two separate rounds."
              style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: A.warning, cursor: 'help', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              ALL-DAY
              <span style={{ fontSize: 10, color: A.warning, opacity: 0.6 }}>ⓘ</span>
            </span>
            {allDay.map(([name, totalQty, orderCount]) => (
              <span key={name}
                title={`${totalQty} total across ${orderCount} active order${orderCount === 1 ? '' : 's'}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px', borderRadius: 16,
                  background: A.shell, border: A.border,
                  fontSize: 12, fontWeight: 500, color: A.ink,
                }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: A.warning }}>{totalQty}×</span>
                {name.length > 18 ? name.slice(0, 17) + '…' : name}
                <span style={{ fontSize: 10, color: A.mutedText, fontWeight: 500 }}>in {orderCount}</span>
              </span>
            ))}
          </div>
        )}

        {/* ═══ Ticket grid ═══ */}
        {sorted.length === 0 ? (
          <div style={{
            background: A.shell, borderRadius: 14, border: A.border,
            padding: '64px 32px', textAlign: 'center', boxShadow: A.shadowCard,
          }}>
            <div style={{ display: 'inline-flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: A.warning, opacity: 0.8, animation: 'pulse 1.8s infinite' }} />
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(0,0,0,0.10)' }} />
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(0,0,0,0.06)' }} />
            </div>
            <div style={{ fontWeight: 600, fontSize: 16, color: A.ink, marginBottom: 8, letterSpacing: '-0.2px' }}>Kitchen is clear</div>
            <div style={{ fontSize: 13, color: A.mutedText, lineHeight: 1.6, maxWidth: 360, margin: '0 auto' }}>New orders will appear here in real time.</div>
          </div>
        ) : (
          <div className="kds-grid" style={{
            display: 'grid',
            gridTemplateColumns: density === 'compact'
              ? 'repeat(auto-fill, minmax(240px, 1fr))'
              : 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: density === 'compact' ? 10 : 14,
          }}>
            {sorted.map((order, idx) => {
              const meta = STATUS_META[order.status] || STATUS_META.pending;
              const secs = order.createdAt?.seconds || 0;
              const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - secs);
              const elapsedMin = elapsed / 60;

              // Time-based state
              const warnAt = TARGET_MIN * 0.75;
              let state = 'fresh';
              if (elapsedMin >= TARGET_MIN) state = 'over';
              else if (elapsedMin >= warnAt) state = 'warn';

              // Edge bar color
              const edgeColor = state === 'over' ? A.danger
                              : state === 'warn' ? A.warning
                              : 'rgba(0,0,0,0.06)';
              // Preparing status gets a distinct bg + muted edge (overrides time state edge only for fresh)
              const isPreparing = order.status === 'preparing';
              const cardBg = isPreparing ? A.shellDarker : A.shell;
              const finalEdge = (isPreparing && state === 'fresh') ? 'rgba(26,26,26,0.25)' : edgeColor;

              // Timer colors based on state
              const timerColor = state === 'over' ? A.danger
                               : state === 'warn' ? A.warning
                               : A.ink;
              const targetColor = state === 'over' ? A.danger
                                : state === 'warn' ? A.warning
                                : A.faintText;
              const targetWeight = (state === 'over') ? 700 : (state === 'warn' ? 600 : 500);
              const targetText = state === 'over'
                ? `${Math.floor(elapsedMin - TARGET_MIN)} min over target`
                : state === 'warn'
                  ? `${Math.ceil(TARGET_MIN - elapsedMin)} min left`
                  : 'on track';

              const btnBg = meta.btnKind === 'gold' ? A.warning
                          : meta.btnKind === 'ink'  ? A.ink
                          : meta.btnKind === 'green' ? A.success
                          : 'transparent';
              const btnColor = meta.btnKind === 'ink' ? A.cream : A.shell;

              // Order type badge (all current orders are dine-in)
              const orderType = order.orderType || 'dinein';
              const typeLabel = orderType === 'takeout' ? 'TAKEOUT' : orderType === 'delivery' ? 'DELIVERY' : 'DINE-IN';
              const typeBg = orderType === 'takeout' ? 'rgba(26,26,26,0.08)'
                           : orderType === 'delivery' ? 'rgba(63,158,90,0.10)'
                           : 'rgba(196,168,109,0.14)';
              const typeColor = orderType === 'takeout' ? A.ink
                              : orderType === 'delivery' ? A.success
                              : A.warningDim;

              // Status tag (kept per user request — small, redundant but clarifying)
              const statusBg = order.status === 'pending' ? 'rgba(196,168,109,0.15)'
                             : order.status === 'preparing' ? 'rgba(0,0,0,0.06)'
                             : 'rgba(63,158,90,0.10)';
              const statusColor = order.status === 'pending' ? A.warningDim
                                : order.status === 'preparing' ? A.ink
                                : A.success;

              const isFlashing = flashingIds.has(order.id);
              // Does this ticket contain any dish that appears in 2+ active tickets?
              const hasDuplicateDish = (order.items || []).some(i => duplicateDishes.has(i.name));

              return (
                <div key={order.id} className={`kds-ticket${isFlashing ? ' flash-new' : ''}`} style={{
                  background: cardBg, borderRadius: 14, border: A.border,
                  boxShadow: A.shadowCard, overflow: 'hidden',
                  animation: isFlashing ? undefined : 'fadeUp 0.25s ease both',
                  animationDelay: isFlashing ? undefined : `${Math.min(idx * 0.03, 0.4)}s`,
                  position: 'relative',
                  display: 'flex', flexDirection: 'column',
                }}>
                  {/* Time-based top edge bar */}
                  <div style={{
                    position: 'absolute', left: 0, right: 0, top: 0, height: 3,
                    background: finalEdge,
                  }} />

                  {/* Head */}
                  <div style={{
                    padding: density === 'compact' ? '10px 14px 6px' : '14px 16px 10px',
                    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10,
                  }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: density === 'compact' ? 18 : 22,
                          fontWeight: 700, color: A.ink, letterSpacing: '-0.5px', lineHeight: 1,
                        }}>{orderLabel(order)}</span>
                        <span style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: '0.10em',
                          padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase',
                          background: typeBg, color: typeColor,
                        }}>{typeLabel}</span>
                        {/* Status tag (kept) */}
                        <span style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: '0.10em',
                          padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase',
                          background: statusBg, color: statusColor,
                        }}>{meta.label}</span>
                        {/* Has-note flag */}
                        {order.hasNote && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            fontSize: 9, fontWeight: 700, letterSpacing: '0.10em',
                            padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase',
                            background: 'rgba(196,168,109,0.14)', color: A.warningDim,
                          }}>
                            <span style={{ fontSize: 7 }}>●</span> Note
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: A.mutedText, fontWeight: 500 }}>
                        {order.tableNumber ? `Table ${order.tableNumber}` : 'No table'}
                        {typeof order.covers === 'number' && ` · ${order.covers} covers`}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: density === 'compact' ? 13 : 14,
                        fontWeight: 700, color: timerColor,
                        letterSpacing: '-0.2px', lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                      }}>{formatElapsed(elapsed)}</div>
                      {density !== 'compact' && (
                        <div style={{ fontSize: 10, color: targetColor, fontWeight: targetWeight, marginTop: 3 }}>
                          {targetText}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Items */}
                  <div style={{
                    padding: density === 'compact' ? '0 14px 8px' : '0 16px 12px',
                    flex: 1,
                  }}>
                    {(order.items || []).map((item, i) => {
                      const isDupDish = duplicateDishes.has(item.name);
                      // dupEntry is [name, totalQty, orderCount]
                      const dupEntry = allDay.find(([n]) => n === item.name);
                      const dupTotalQty = dupEntry?.[1];
                      const dupOrderCount = dupEntry?.[2];
                      return (
                        <div key={i} style={{
                          display: 'flex', gap: 10, alignItems: 'flex-start', padding: '6px 8px',
                          borderTop: i > 0 ? '1px solid rgba(0,0,0,0.04)' : 'none',
                          background: isDupDish ? 'rgba(196,168,109,0.08)' : 'transparent',
                          borderRadius: isDupDish ? 4 : 0,
                          margin: isDupDish ? '0 -4px' : 0,
                        }}>
                          <span style={{
                            fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
                            fontSize: density === 'compact' ? 13 : 14,
                            color: A.warning, minWidth: density === 'compact' ? 22 : 26,
                            flexShrink: 0, paddingTop: 2,
                          }}>{item.qty || 1}×</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div>
                              <span style={{
                                fontSize: density === 'compact' ? 13 : 14,
                                fontWeight: 600, color: A.ink, lineHeight: 1.35,
                              }}>{item.name}</span>
                              {isDupDish && (
                                <span
                                  title={`${dupTotalQty} total across ${dupOrderCount} active orders — fire them together`}
                                  style={{
                                    display: 'inline-block', marginLeft: 6,
                                    fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                                    textTransform: 'uppercase',
                                    padding: '2px 6px', borderRadius: 3, lineHeight: 1.3, verticalAlign: 'middle',
                                    background: A.warning, color: A.shell,
                                  }}>×{dupTotalQty} in {dupOrderCount}</span>
                              )}
                            </div>
                            {item.note && (
                              <div style={{
                                marginTop: 6, padding: '6px 10px',
                                background: 'rgba(196,168,109,0.10)', borderRadius: 6,
                                fontSize: 11, color: A.warningDim, fontWeight: 500, lineHeight: 1.4,
                              }}>
                                <b style={{ fontWeight: 700 }}>Note:</b> {item.note}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {/* Order-level special instructions */}
                    {order.specialInstructions && (
                      <div style={{
                        marginTop: 8, padding: '8px 10px',
                        background: 'rgba(196,168,109,0.10)', borderRadius: 6,
                        fontSize: 11, color: A.warningDim, fontWeight: 500, lineHeight: 1.4,
                      }}>
                        <b style={{ fontWeight: 700 }}>Order note:</b> {order.specialInstructions}
                      </div>
                    )}
                  </div>

                  {/* Foot */}
                  <div style={{
                    padding: density === 'compact' ? '8px 12px' : '10px 14px',
                    borderTop: '1px solid rgba(0,0,0,0.04)',
                    background: 'rgba(0,0,0,0.015)',
                    display: 'flex', gap: 6,
                  }}>
                    {meta.next ? (
                      <>
                        <button className="kds-bump-btn"
                          onClick={() => advance(order)}
                          disabled={updating === order.id}
                          style={{
                            flex: 1, padding: density === 'compact' ? '7px' : '10px 14px',
                            borderRadius: 8, border: 'none',
                            fontFamily: A.font, fontSize: density === 'compact' ? 12 : 13,
                            fontWeight: 700, cursor: 'pointer',
                            letterSpacing: '0.01em', transition: 'all 0.15s',
                            background: btnBg, color: btnColor,
                            opacity: updating === order.id ? 0.6 : 1,
                          }}>
                          {updating === order.id
                            ? <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                            : meta.nextLabel}
                        </button>
                        {/* Recall button on preparing tickets (un-bump to New) */}
                        {order.status === 'preparing' && (
                          <button className="kds-recall-btn"
                            onClick={() => recallToNew(order)}
                            disabled={updating === order.id}
                            title="Send back to New"
                            style={{
                              padding: density === 'compact' ? '7px 10px' : '10px 12px',
                              borderRadius: 8, background: 'transparent', border: A.border,
                              color: A.mutedText, cursor: 'pointer', fontFamily: A.font,
                              fontSize: density === 'compact' ? 12 : 13,
                            }}>
                            ↺
                          </button>
                        )}
                      </>
                    ) : (
                      <div style={{ textAlign: 'center', color: A.faintText, fontSize: 12, fontWeight: 600, width: '100%', padding: 4 }}>
                        Completed
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom banner — flashes when there are newly-arrived unseen tickets.
            Clears when user scrolls near bottom (useEffect with scroll listener). */}
        {unseenIds.size > 0 && (
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
            ↓ {unseenIds.size} new order{unseenIds.size === 1 ? '' : 's'} below — scroll down to view
          </div>
        )}
      </div>
    </div>
  );

  // Admin sees inside AdminLayout (with sidebar).
  // Staff sees the bare page (no sidebar — it's their dedicated kitchen tablet view).
  if (isAdmin) {
    return (
      <AdminLayout>
        <Head><title>Kitchen Display | Advert Radical</title></Head>
        {body}
      </AdminLayout>
    );
  }

  return (
    <>
      <Head><title>Kitchen Display | Advert Radical</title></Head>
      {/* Staff top bar for branding + logout */}
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

KitchenDisplay.getLayout = (page) => page;