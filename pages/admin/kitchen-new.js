// pages/admin/kitchen-new.js
//
// Phase C (2026-06-03) — Kitchen Station (per-item KDS).
//
// Replaces the Phase A thin wrapper that delegated to
// OrderKitchen(mode='kitchen'). That wrapper inherited the
// per-ORDER bump UI; this page is per-ITEM, matching the
// existing /admin/kitchen behavior the owner asked for.
//
// What's wired here:
//   * Subscribe to orders (the only Firestore feed needed
//     for the rail — we don't render tables / menu items /
//     sessions / bills on this page).
//   * Per-item ready bump (stamps items[i].readyAt; order
//     auto-flips to status='ready' once every item has the
//     stamp — handled server-side by markOrderItemReadyAs).
//   * Per-item served bump (stamps items[i].servedAt; order
//     auto-flips to status='served' once every item is
//     stamped).
//   * Order-level "Start cooking" button on pending tickets
//     (pending → preparing). Per-item bumps only unlock once
//     the order is preparing OR ready.
//   * Duplicate-dish indicator: any dish appearing in 2+
//     active tickets gets a gold "×qty in N" badge so the
//     kitchen can batch-cook across tables.
//   * All-day counter strip at the top: 8 most-batched
//     dishes with totals.
//   * Filter pills (All / New / Cooking / Ready) with counts.
//
// Auth pattern is the same as /admin/orders: useAuth() +
// readStaffSession(); rid + scopedDb derived from whichever
// is present. Page bypasses AdminLayout / StaffShell so the
// dark UI takes the whole viewport.

import Head from 'next/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import toast from 'react-hot-toast';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';

import { useAuth } from '../../hooks/useAuth';
import useOkTheme from '../../hooks/useOkTheme';
import { readStaffSession } from '../../lib/staffSession';
import { db, staffDb } from '../../lib/firebase';
import {
  markOrderItemReadyAs, markOrderItemServedAs,
  updateOrderStatus, updateOrderStatusAs,
} from '../../lib/db';
import {
  announceOrder, unlockSound,
  isVoiceEnabled, setVoiceEnabled as setVoiceEnabledLS,
} from '../../lib/sounds';

import KitchenRailScreen from '../../components/order-kitchen/KitchenRailScreen';
import { I } from '../../components/order-kitchen/Icons';

// Same key /admin/kitchen + /admin/orders use, so toggling sound on
// one surface flips it everywhere.
const LS_SOUND_KEY = 'ar_kitchen_sound_enabled';

function useIsDesktop(breakpoint = 920) {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= breakpoint);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);
  return isDesktop;
}

function fmtClock(d) {
  const h = d.getHours() % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = d.getHours() < 12 ? 'AM' : 'PM';
  return `${h}:${m} ${ampm}`;
}

export default function KitchenNew() {
  const router = useRouter();
  const { user, userData, loading: adminLoading } = useAuth();
  const { isLight, toggle: toggleTheme } = useOkTheme();
  const isDesktop = useIsDesktop(920);
  const [staffSession, setStaffSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    setStaffSession(readStaffSession());
    setAuthChecked(true);
  }, []);

  const rid = userData?.restaurantId || staffSession?.restaurantId;
  const isAdmin = !!userData?.restaurantId;
  const scopedDb = isAdmin ? db : staffDb;

  // Auth gate — match /admin/orders / /admin/order-kitchen.
  useEffect(() => {
    if (!authChecked || adminLoading) return;
    if (user && !userData) return;
    if (isAdmin) return;
    if (staffSession) return;
    router.replace('/staff/login');
  }, [authChecked, adminLoading, user, userData, isAdmin, staffSession, router]);

  // ─── Orders subscription ────────────────────────────────────────
  const [ordersById, setOrdersById] = useState({});
  const [ordersReady, setOrdersReady] = useState(false);
  useEffect(() => {
    if (!rid) return;
    const uo = onSnapshot(
      query(collection(scopedDb, 'restaurants', rid, 'orders'), orderBy('createdAt', 'desc'), limit(300)),
      snap => {
        const m = {};
        snap.docs.forEach(d => { m[d.id] = { id: d.id, ...d.data() }; });
        setOrdersById(m);
        setOrdersReady(true);
      },
      () => setOrdersReady(true),
    );
    return () => uo();
  }, [rid, scopedDb]);

  // 1-second tick so the per-ticket age display refreshes live.
  const [, setTick] = useState(0);
  useEffect(() => { const iv = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(iv); }, []);

  // ─── Filter + updating state ────────────────────────────────────
  const [filter, setFilter] = useState('all');
  // `updatingKey` is a string identifying the in-flight write so the
  // affected pill / button can show a "Saving…" affordance without
  // disabling the rest of the rail.
  const [updatingKey, setUpdatingKey] = useState(null);

  // ─── Sound + voice toggles ─────────────────────────────────────
  // Default sound ON, voice OFF (mirrors /admin/kitchen + /admin/orders).
  // The localStorage flag is shared with the other surfaces so
  // toggling on /admin/kitchen also flips this page's state on
  // next mount. AutoUnlock in lib/sounds is the safety net for
  // browsers that don't fire a sound toggle before the first new
  // order arrives.
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabledState] = useState(false);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_SOUND_KEY);
      if (stored !== null) setSoundEnabled(stored === 'true');
    } catch {}
    try { setVoiceEnabledState(isVoiceEnabled()); } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(LS_SOUND_KEY, String(soundEnabled)); } catch {}
  }, [soundEnabled]);
  useEffect(() => { setVoiceEnabledLS(voiceEnabled); }, [voiceEnabled]);

  const toggleSound = () => {
    setSoundEnabled(v => !v);
    try { unlockSound(); } catch {}
  };
  const toggleVoice = () => setVoiceEnabledState(v => !v);

  // Refs for the new-arrival detector. Effect itself sits below
  // activeOrders (the useMemo it depends on) to avoid TDZ during
  // render-phase dependency evaluation.
  const prevPendingIdsRef = useRef(new Set());
  const initialOrdersLoadedRef = useRef(false);

  // ─── Derived data ───────────────────────────────────────────────
  // Active orders (anything not served + not cancelled). Takeaway
  // orders DO show on the kitchen — they're still tickets the kitchen
  // has to cook even if no waiter delivers them.
  const activeOrders = useMemo(() => {
    return Object.values(ordersById)
      .filter(o => ['pending', 'preparing', 'ready'].includes(o.status))
      .map(o => ({ ...o, items: Array.isArray(o.items) ? o.items : [] }))
      // Oldest-first so the most-urgent tickets sit at the top of
      // each kanban column. The kitchen's mental model is "what's
      // been waiting longest" — newest at top would bury an order
      // that's been in the rail for 30+ min under a fresh one.
      .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  }, [ordersById]);

  // ─── New-arrival detector (mirrors /admin/kitchen pattern) ─────
  // Watch the pending-orders id set. First snapshot bypasses the
  // chime (initial settling shouldn't sound like 5 new orders just
  // landed). After that, any newly-added pending id triggers an
  // announce. announceOrder honours soundEnabled internally and the
  // voice path is gated by isVoiceEnabled() inside lib/sounds.
  useEffect(() => {
    const pending = activeOrders.filter(o => o.status === 'pending');
    const currentIds = new Set(pending.map(o => o.id));
    if (!initialOrdersLoadedRef.current) {
      prevPendingIdsRef.current = currentIds;
      initialOrdersLoadedRef.current = true;
      return;
    }
    const prevIds = prevPendingIdsRef.current;
    const newOrders = pending.filter(o => !prevIds.has(o.id));
    if (newOrders.length > 0) {
      // activeOrders is oldest-first → newest among newOrders is last
      const o = newOrders[newOrders.length - 1];
      const isTakeaway = o.orderType === 'takeaway' || o.orderType === 'takeout';
      const rawTable = isTakeaway ? (o.customerName || 'Takeaway') : (o.tableNumber || '');
      const tableLabel = String(rawTable || '').trim() || 'unknown';
      const itemCount = (o.items || []).reduce((s, it) => s + (Number(it.qty) || 1), 0);
      announceOrder(tableLabel, itemCount, { sound: soundEnabled });
    }
    prevPendingIdsRef.current = currentIds;
  }, [activeOrders, soundEnabled]);

  // Duplicate-dish aggregation: name → { totalQty, ticketCount }.
  // A dish only qualifies if it appears in 2+ DISTINCT tickets — a
  // single ticket with 5×Paneer isn't a batching opportunity. Top 8
  // by ticket count drive both the all-day counter strip AND the
  // per-ticket dish highlighting.
  const allDay = useMemo(() => {
    const map = new Map();
    activeOrders.forEach(o => {
      // Per-ticket: collapse multiple lines of same dish first
      // (edge case but safer for the count).
      const perTicket = new Map();
      o.items.forEach(it => {
        const key = it.name;
        if (!key) return;
        perTicket.set(key, (perTicket.get(key) || 0) + (Number(it.qty) || 1));
      });
      perTicket.forEach((qty, name) => {
        const existing = map.get(name) || { totalQty: 0, ticketCount: 0 };
        map.set(name, { totalQty: existing.totalQty + qty, ticketCount: existing.ticketCount + 1 });
      });
    });
    return Array.from(map.entries())
      .filter(([, info]) => info.ticketCount >= 2)
      .sort((a, b) => b[1].ticketCount - a[1].ticketCount || b[1].totalQty - a[1].totalQty)
      .slice(0, 8)
      .map(([name, info]) => [name, info.totalQty, info.ticketCount]);
  }, [activeOrders]);

  const duplicateDishes = useMemo(() => new Set(allDay.map(([name]) => name)), [allDay]);

  // ─── Handlers ───────────────────────────────────────────────────
  const onStartOrder = async (order) => {
    setUpdatingKey(`${order.id}:start`);
    try {
      if (isAdmin) await updateOrderStatus(rid, order.id, 'preparing', { db: scopedDb });
      else         await updateOrderStatusAs(scopedDb, rid, order.id, 'preparing');
    } catch (e) {
      console.error('Start cooking failed:', e);
      toast.error('Could not start the order. Retry.');
    }
    setUpdatingKey(null);
  };

  const onMarkItemReady = async (order, itemIdx) => {
    const k = `${order.id}:item:${itemIdx}`;
    setUpdatingKey(k);
    try {
      await markOrderItemReadyAs(scopedDb, rid, order.id, itemIdx);
    } catch (e) {
      console.error('Mark item ready failed:', e);
      toast.error('Could not mark item ready. Retry.');
    }
    setUpdatingKey(null);
  };

  const onMarkItemServed = async (order, itemIdx) => {
    const k = `${order.id}:item:${itemIdx}`;
    setUpdatingKey(k);
    try {
      await markOrderItemServedAs(scopedDb, rid, order.id, itemIdx);
    } catch (e) {
      console.error('Mark item served failed:', e);
      toast.error('Could not mark item served. Retry.');
    }
    setUpdatingKey(null);
  };

  // ─── Desktop hooks MUST sit BEFORE the early-return render
  // gate (rules of hooks: hooks must run in the same order every
  // render). When auth resolves the conditional returns flip and
  // a hook order change throws — ErrorBoundary catches as
  // "Something went wrong". Moved above the gate.
  const [clockNow, setClockNow] = useState(() => new Date());
  useEffect(() => {
    if (!isDesktop) return;
    const iv = setInterval(() => setClockNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, [isDesktop]);

  // ─── Render gate ────────────────────────────────────────────────
  if (!authChecked || adminLoading) return null;
  if (!isAdmin && !staffSession) return null;

  // Desktop derivations — plain const (not a hook), safe after the gate.
  const cols = {
    new: activeOrders.filter(o => o.status === 'pending'),
    cooking: activeOrders.filter(o => o.status === 'preparing'),
    ready: activeOrders.filter(o => o.status === 'ready'),
  };

  return (
    <>
      <Head><title>Kitchen Station — HaloHelm</title></Head>
      <div className="ok-root">
        {isDesktop ? (
          <div className="pos">
            <aside className="rail">
              <div className="rail-logo">
                <b>K</b>
                <small>KITCHEN</small>
              </div>
              <div className="rail-nav">
                <button
                  className="rail-btn"
                  onClick={() => router.push('/admin/orders')}
                  title="Floor"
                >{I.grid}<span>Floor</span></button>
                <button
                  className="rail-btn on"
                  title="Kitchen station"
                >{I.chef}<span>Kitchen</span></button>
              </div>
              <div className="rail-foot">
                <button
                  className="rail-btn"
                  onClick={toggleTheme}
                  title={isLight ? 'Switch to dark' : 'Switch to light'}
                  style={{ height: 44 }}
                >
                  <span style={{ fontSize: 18 }}>{isLight ? '🌙' : '☀️'}</span>
                </button>
                <div className="rail-avatar">K</div>
              </div>
            </aside>
            <main className="workspace">
              <div className="ws-head">
                <div className="ws-title">
                  <div className="ws-eyebrow">Kitchen Display · live</div>
                  <h1 className="ws-h1">Kitchen rail</h1>
                </div>
                {/* Sound + voice toggles. These let the chef silence
                    the new-order chime (e.g. during a non-rush hour
                    or testing) and turn on TTS readouts of incoming
                    tickets. They share LS with /admin/kitchen so
                    toggling on one surface persists everywhere. */}
                <div style={{
                  display: 'inline-flex', gap: 8, marginLeft: 'auto', marginRight: 14,
                }}>
                  <button
                    onClick={toggleSound}
                    title={soundEnabled ? 'Mute new-order chime' : 'Unmute new-order chime'}
                    aria-label="Toggle sound"
                    style={{
                      width: 38, height: 38, borderRadius: 10,
                      background: soundEnabled ? 'rgba(196,168,109,0.14)' : 'var(--card)',
                      border: `1px solid ${soundEnabled ? '#C4A86D' : 'var(--line)'}`,
                      color: soundEnabled ? '#D6BC85' : 'var(--tx-2)',
                      fontSize: 16, cursor: 'pointer', padding: 0,
                    }}
                  >{soundEnabled ? '🔔' : '🔕'}</button>
                  <button
                    onClick={toggleVoice}
                    title={voiceEnabled ? 'Disable voice readout' : 'Enable voice readout'}
                    aria-label="Toggle voice"
                    style={{
                      width: 38, height: 38, borderRadius: 10,
                      background: voiceEnabled ? 'rgba(196,168,109,0.14)' : 'var(--card)',
                      border: `1px solid ${voiceEnabled ? '#C4A86D' : 'var(--line)'}`,
                      color: voiceEnabled ? '#D6BC85' : 'var(--tx-2)',
                      fontSize: 16, cursor: 'pointer', padding: 0,
                    }}
                  >{voiceEnabled ? '🎙️' : '🔇'}</button>
                </div>
                <div className="ws-clock">{I.clock}{fmtClock(clockNow)}</div>
              </div>
              {/* Stats strip + ALL-DAY chips (legacy /admin/kitchen
                  parity, owner asked for this pattern). Active = all
                  non-served orders; oldest = max age in seconds across
                  active; served-today = orders served today. */}
              {ordersReady && (
                <div style={{ padding: '0 30px 16px', flexShrink: 0 }}>
                  {(() => {
                    let oldestSec = 0;
                    activeOrders.forEach(o => {
                      const sec = o.createdAt?.toDate
                        ? Math.floor((Date.now() - o.createdAt.toDate().getTime()) / 1000)
                        : 0;
                      if (sec > oldestSec) oldestSec = sec;
                    });
                    const oldestM = Math.floor(oldestSec / 60);
                    // Same format as the per-ticket age: Xm Ys.
                    const oldestStr = `${oldestM}m ${String(oldestSec % 60).padStart(2, '0')}s`;
                    const oldestColor = oldestM >= 18 ? 'var(--danger)'
                                     : oldestM >= 10 ? 'var(--gold)'
                                     : 'var(--tx)';
                    const todayStart = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime() / 1000; })();
                    const servedToday = Object.values(ordersById).filter(o =>
                      o.status === 'served' && (o.updatedAt?.seconds || 0) >= todayStart
                    ).length;
                    return (
                      <>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 24,
                          padding: '14px 22px',
                          background: 'var(--rail)', color: 'var(--tx)',
                          borderRadius: 16, marginBottom: 14, flexWrap: 'wrap',
                        }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            fontFamily: 'var(--font-mono)', fontSize: 10,
                            letterSpacing: '.14em', textTransform: 'uppercase',
                            color: 'var(--tx-2)',
                          }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--st-ready)' }} />
                            LIVE KITCHEN
                          </span>
                          <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--tx-2)' }}>ACTIVE</span>
                            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--tx)' }}>{activeOrders.length}</span>
                          </span>
                          <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--tx-2)' }}>OLDEST</span>
                            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: oldestColor, fontVariantNumeric: 'tabular-nums' }}>
                              {activeOrders.length === 0 ? '—' : oldestStr}
                            </span>
                          </span>
                          <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--tx-2)' }}>SERVED TODAY</span>
                            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--st-ready)' }}>{servedToday}</span>
                          </span>
                          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-2)' }}>
                            {clockNow.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                        {allDay.length > 0 && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{
                              fontFamily: 'var(--font-mono)', fontSize: 9,
                              letterSpacing: '.14em', textTransform: 'uppercase',
                              color: 'var(--tx-3)', marginRight: 4,
                            }}>ALL-DAY</span>
                            {allDay.map(([name, qty, tickets]) => (
                              <span key={name} title={`${qty} × ${name} across ${tickets} active orders — fire together`} style={{
                                padding: '4px 10px', borderRadius: 999,
                                background: 'var(--card)', border: '1px solid var(--line)',
                                color: 'var(--tx)',
                                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                                whiteSpace: 'nowrap',
                              }}>
                                <b style={{ color: 'var(--gold)', marginRight: 5 }}>{qty}×</b>
                                {name.length > 22 ? name.slice(0, 20) + '…' : name}
                                <span style={{ color: 'var(--tx-3)', marginLeft: 6 }}>in {tickets}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
              {ordersReady ? (
                <div className="kds-wrap">
                  <div className="kds">
                    {[
                      { id: 'new', label: 'New', orders: cols.new },
                      { id: 'cooking', label: 'Cooking', orders: cols.cooking },
                      { id: 'ready', label: 'Ready', orders: cols.ready },
                    ].map(col => (
                      <KitchenColumn
                        key={col.id}
                        col={col}
                        duplicateDishes={duplicateDishes}
                        allDay={allDay}
                        onStartOrder={onStartOrder}
                        onMarkItemReady={onMarkItemReady}
                        onMarkItemServed={onMarkItemServed}
                        updatingKey={updatingKey}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--tx-3)' }}>Loading the kitchen rail…</div>
              )}
            </main>
          </div>
        ) : (
        <div className="page-bg">
          <div className="frame">
            <div className="notch" />
            {/* Floating theme toggle removed — KitchenRailScreen now
                renders the toggle inline in its apphead via the
                isLight / onToggleTheme props below. */}
            <div className="screenwrap">
              {/* Notch clearance — see comment in order-kitchen.js */}
              <div style={{ height: 30, flexShrink: 0 }} />
              {ordersReady ? (
                <KitchenRailScreen
                  orders={activeOrders}
                  duplicateDishes={duplicateDishes}
                  allDay={allDay}
                  filter={filter}
                  onFilterChange={setFilter}
                  onStartOrder={onStartOrder}
                  onMarkItemReady={onMarkItemReady}
                  onMarkItemServed={onMarkItemServed}
                  isLight={isLight}
                  onToggleTheme={toggleTheme}
                  soundEnabled={soundEnabled}
                  voiceEnabled={voiceEnabled}
                  onToggleSound={toggleSound}
                  onToggleVoice={toggleVoice}
                  updatingKey={updatingKey}
                />
              ) : (
                <div className="screen screen-enter">
                  <div className="empty">
                    <span className="e-emoji">⏳</span>
                    <p>Loading the kitchen rail…</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        )}
      </div>
    </>
  );
}

// One column of the 3-column KDS board. Owns its own scroll
// state so it can render a "↓ more below" indicator at the
// bottom when there are tickets the user hasn't scrolled to.
// Mirrors the legacy /admin/kitchen footer hint ("↓ 1 new
// order below — scroll down to view") owner pointed at.
function KitchenColumn({ col, duplicateDishes, allDay, onStartOrder, onMarkItemReady, onMarkItemServed, updatingKey }) {
  const listRef = useRef(null);
  const [hiddenBelow, setHiddenBelow] = useState(0);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const recalc = () => {
      const gap = el.scrollHeight - el.clientHeight - el.scrollTop;
      if (gap <= 8) { setHiddenBelow(0); return; }
      // Count how many ticket children sit fully below the visible
      // viewport. Cheaper than measuring every child: walk from the
      // bottom upward and stop at the first one that's in view.
      const tickets = el.querySelectorAll(':scope > .ticket');
      const viewBottom = el.scrollTop + el.clientHeight;
      let n = 0;
      for (let i = tickets.length - 1; i >= 0; i--) {
        const t = tickets[i];
        if (t.offsetTop >= viewBottom - 8) n++;
        else break;
      }
      setHiddenBelow(n);
    };
    recalc();
    el.addEventListener('scroll', recalc);
    // Recompute when content height shifts (item added, status
    // change triggers DOM re-layout, etc.).
    const ro = new ResizeObserver(recalc);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', recalc); ro.disconnect(); };
  }, [col.orders.length]);

  return (
    <div className={`kcol col-${col.id}`} style={{ position: 'relative' }}>
      <div className="kcol-head">
        <span className="kc-dot" />
        <h3>{col.label}</h3>
        <span className="kc-n">{col.orders.length}</span>
      </div>
      <div className="kcol-list" ref={listRef}>
        {col.orders.length === 0 ? (
          <div className="kcol-empty">No tickets in this column.</div>
        ) : (
          col.orders.map(o => (
            <DesktopTicket
              key={o.id}
              order={o}
              duplicateDishes={duplicateDishes}
              allDay={allDay}
              onStart={() => onStartOrder(o)}
              onMarkItemReady={onMarkItemReady}
              onMarkItemServed={onMarkItemServed}
              updatingKey={updatingKey}
            />
          ))
        )}
      </div>
      {hiddenBelow > 0 && (
        <button
          onClick={() => {
            const el = listRef.current;
            if (el) el.scrollBy({ top: el.clientHeight - 60, behavior: 'smooth' });
          }}
          style={{
            position: 'absolute', left: 14, right: 14, bottom: 14,
            padding: '10px 16px', borderRadius: 12,
            background: 'var(--gold)', color: '#1A1815', border: 'none',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12,
            letterSpacing: '0.02em', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: '0 8px 22px rgba(196,168,109,0.35)',
            zIndex: 2,
          }}
        >↓ {hiddenBelow} more {hiddenBelow === 1 ? 'ticket' : 'tickets'} below — tap to scroll</button>
      )}
    </div>
  );
}

// Inline desktop ticket — simpler than KitchenRailScreen's Ticket
// component which is sized for a phone-frame column. Renders the
// per-item bump pills, duplicate-dish badge, and a single bump
// action footer matching the column the ticket sits in.
function DesktopTicket({ order, duplicateDishes, allDay, onStart, onMarkItemReady, onMarkItemServed, updatingKey }) {
  const itemsArr = Array.isArray(order.items) ? order.items : [];
  const isTakeaway = order.orderType === 'takeaway' || order.orderType === 'takeout';
  const rawTableLabel = isTakeaway ? (order.customerName || 'PICKUP') : (order.tableNumber || '');
  // For the 44×44 tile we need a SHORT label (1-3 chars). Anything
  // longer ("Not specified", customer names with spaces, long table
  // codes) gets a "—" placeholder in the tile and the full string
  // moves to the meta line under the order id — that matches the
  // legacy /admin/kitchen pattern where unknown / multi-word tables
  // render as "Table Not specified" inline rather than overflowing
  // the tile box.
  const isShortLabel = rawTableLabel.length > 0 && rawTableLabel.length <= 3 && !rawTableLabel.includes(' ');
  const tileLabel = isShortLabel ? rawTableLabel : (isTakeaway ? '↗' : '—');
  const longLabel = isShortLabel ? null : (rawTableLabel || 'Not specified');
  const orderLabel = typeof order.orderNumber === 'number' && order.orderNumber > 0
    ? `#${String(order.orderNumber).padStart(4, '0')}`
    : '#' + (order.id || '').slice(-4).toUpperCase();
  const placedAt = order.createdAt?.toDate
    ? (() => { const d = order.createdAt.toDate(); const h = d.getHours() % 12 || 12; return `${h}:${String(d.getMinutes()).padStart(2, '0')}`; })()
    : '—';
  const ageSec = order.createdAt?.toDate
    ? Math.max(0, Math.floor((Date.now() - order.createdAt.toDate().getTime()) / 1000))
    : 0;
  const ageMin = Math.floor(ageSec / 60);
  // Match legacy /admin/kitchen formatting exactly — always
  // "Xm Ys" with two-digit seconds (758m 1s, 28m 48s, 4m 12s).
  // Owner explicitly pointed at the legacy "758m 1s" display as
  // the target; converting to "12h 38m" loses the at-a-glance
  // comparison kitchen staff make between tickets.
  const ageStr = `${ageMin}m ${String(ageSec % 60).padStart(2, '0')}s`;
  // Urgency colors (legacy thresholds): gold @ 10m, red @ 18m, green-ish under 10m.
  const urgency = order.status === 'ready' ? 'ready'
                : ageMin >= 18 ? 'late'
                : ageMin >= 10 ? 'warn'
                : 'fresh';
  const ageColor = urgency === 'late' ? 'var(--danger)'
                 : urgency === 'warn' ? 'var(--gold)'
                 : urgency === 'ready' ? 'var(--st-ready)'
                 : 'var(--tx-2)';

  return (
    <div className={'ticket' + (order.status === 'pending' ? ' is-new' : '')}>
      <div className="ticket-head">
        <div className="th-table">
          <b>{tileLabel}</b>
          <small>{isTakeaway ? 'PICKUP' : 'TABLE'}</small>
        </div>
        <div className="th-meta">
          <div className="th-id">
            {orderLabel}
            {longLabel && (
              <span style={{
                marginLeft: 8, fontFamily: 'var(--font-body)',
                fontWeight: 500, fontSize: 13, color: 'var(--tx-2)',
              }}>· {isTakeaway ? `Takeaway · ${longLabel}` : `Table ${longLabel}`}</span>
            )}
          </div>
          <div className="th-sub">{placedAt} · {order.placedBy || 'staff'}</div>
        </div>
        <div className="th-age">
          <span className="kage" style={{ color: ageColor, fontVariantNumeric: 'tabular-nums' }}>
            {ageStr}
          </span>
          {urgency === 'late' && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
              letterSpacing: '0.10em', textTransform: 'uppercase',
              color: 'var(--danger)', marginTop: 2,
            }}>LATE</span>
          )}
        </div>
      </div>
      <div className="ticket-items">
        {itemsArr.map((it, i) => {
          const isDup = duplicateDishes.has(it.name);
          const dup = allDay.find(([n]) => n === it.name);
          const updatingThis = updatingKey === `${order.id}:item:${i}`;
          // Per-item meta chips matching legacy /admin/kitchen +
          // design spec: SEAT N or TABLE pill, spice pips, plus
          // EXTRA SPICY / per-mod chips. Renders in a single meta
          // row beneath the item name.
          const seatN = Number(it.seat) || 0;
          const spiceLevel = typeof it.spice === 'number' ? it.spice : 0;
          const mods = Array.isArray(it.modifiers) ? it.modifiers : [];
          return (
            <div key={i} className="kitem">
              <span className="ki-qty">{it.qty || 1}×</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span className="ki-name">{it.name}{isDup && dup && (
                  <span style={{
                    display: 'inline-block', marginLeft: 6,
                    fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                    letterSpacing: '0.08em', padding: '2px 6px', borderRadius: 4,
                    textTransform: 'uppercase', background: 'var(--gold)', color: '#1A1815',
                    verticalAlign: 'middle',
                  }}>×{dup[1]} in {dup[2]}</span>
                )}</span>
                {/* Meta row: SEAT/TABLE + spice pips + modifiers */}
                <div className="ki-meta" style={{ marginTop: 5 }}>
                  <span className="ki-seat">{seatN > 0 ? `SEAT ${seatN}` : 'TABLE'}</span>
                  {spiceLevel > 0 && (
                    <span style={{ display: 'inline-flex', gap: 2.5, alignItems: 'center' }}>
                      {[0,1,2,3].map(idx => (
                        <span key={idx} style={{
                          width: 5.5, height: 5.5, borderRadius: '50%',
                          background: idx < spiceLevel ? 'var(--saffron)' : 'var(--line)',
                        }} />
                      ))}
                    </span>
                  )}
                  {mods.map((m, mi) => (
                    <span key={mi} className="ki-seat" style={{
                      color: 'var(--saffron)', borderColor: 'var(--saffron)',
                    }}>{String(m).toUpperCase()}</span>
                  ))}
                </div>
                {it.note && (
                  <div style={{
                    marginTop: 6, padding: '6px 10px',
                    background: 'rgba(196,168,109,0.10)', borderRadius: 6,
                    fontFamily: 'var(--font-body)', fontSize: 11.5,
                    color: 'var(--gold)', fontWeight: 500, lineHeight: 1.4,
                  }}>
                    <b style={{ fontWeight: 700 }}>Note:</b> {it.note}
                  </div>
                )}
                {(order.status === 'preparing' || order.status === 'ready') && (
                  <div className="ki-meta" style={{ marginTop: 6 }}>
                    {it.readyAt ? (
                      <span className="ki-seat" style={{ color: 'var(--st-ready)', borderColor: 'var(--st-ready)' }}>✓ Ready</span>
                    ) : (
                      <button onClick={() => onMarkItemReady(order, i)} disabled={updatingThis} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.06em', padding: '4px 10px', borderRadius: 999, background: 'var(--gold)', color: '#1A1815', border: 'none', textTransform: 'uppercase', cursor: 'pointer', opacity: updatingThis ? 0.55 : 1 }}>Mark ready</button>
                    )}
                    {it.servedAt ? (
                      <span className="ki-seat" style={{ color: 'var(--tx-3)' }}>✓ Served</span>
                    ) : it.readyAt ? (
                      <button onClick={() => onMarkItemServed(order, i)} disabled={updatingThis} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.06em', padding: '4px 10px', borderRadius: 999, background: 'var(--tx)', color: 'var(--surface)', border: 'none', textTransform: 'uppercase', cursor: 'pointer', opacity: updatingThis ? 0.55 : 1 }}>Mark served</button>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {order.status === 'pending' && (
        <div className="ticket-foot">
          <button className="bump start" onClick={onStart} disabled={updatingKey === `${order.id}:start`}>
            🔥 Start cooking
          </button>
        </div>
      )}
    </div>
  );
}

KitchenNew.getLayout = (page) => page;
