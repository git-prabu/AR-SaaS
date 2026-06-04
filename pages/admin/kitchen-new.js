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
import { useEffect, useMemo, useState } from 'react';
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

import KitchenRailScreen from '../../components/order-kitchen/KitchenRailScreen';
import { I } from '../../components/order-kitchen/Icons';

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

  // ─── Derived data ───────────────────────────────────────────────
  // Active orders (anything not served + not cancelled). Takeaway
  // orders DO show on the kitchen — they're still tickets the kitchen
  // has to cook even if no waiter delivers them.
  const activeOrders = useMemo(() => {
    return Object.values(ordersById)
      .filter(o => ['pending', 'preparing', 'ready'].includes(o.status))
      .map(o => ({ ...o, items: Array.isArray(o.items) ? o.items : [] }));
  }, [ordersById]);

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
                    const oldestStr = oldestM >= 60
                      ? `${Math.floor(oldestM / 60)}h ${oldestM % 60}m`
                      : `${oldestM}m ${String(oldestSec % 60).padStart(2, '0')}s`;
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
                            color: 'rgba(239,235,228,0.55)',
                          }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--st-ready)' }} />
                            LIVE KITCHEN
                          </span>
                          <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(239,235,228,0.55)' }}>ACTIVE</span>
                            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'rgba(239,235,228,1)' }}>{activeOrders.length}</span>
                          </span>
                          <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(239,235,228,0.55)' }}>OLDEST</span>
                            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: oldestColor, fontVariantNumeric: 'tabular-nums' }}>
                              {activeOrders.length === 0 ? '—' : oldestStr}
                            </span>
                          </span>
                          <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(239,235,228,0.55)' }}>SERVED TODAY</span>
                            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--st-ready)' }}>{servedToday}</span>
                          </span>
                          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(239,235,228,0.55)' }}>
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
                      <div key={col.id} className={`kcol col-${col.id}`}>
                        <div className="kcol-head">
                          <span className="kc-dot" />
                          <h3>{col.label}</h3>
                          <span className="kc-n">{col.orders.length}</span>
                        </div>
                        <div className="kcol-list">
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
                      </div>
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
            <button
              className="ok-theme-toggle"
              onClick={toggleTheme}
              title={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
              aria-label="Toggle theme"
            >{isLight ? '🌙' : '☀️'}</button>
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

// Inline desktop ticket — simpler than KitchenRailScreen's Ticket
// component which is sized for a phone-frame column. Renders the
// per-item bump pills, duplicate-dish badge, and a single bump
// action footer matching the column the ticket sits in.
function DesktopTicket({ order, duplicateDishes, allDay, onStart, onMarkItemReady, onMarkItemServed, updatingKey }) {
  const itemsArr = Array.isArray(order.items) ? order.items : [];
  const isTakeaway = order.orderType === 'takeaway' || order.orderType === 'takeout';
  const tableLabel = isTakeaway ? (order.customerName || 'PICKUP') : (order.tableNumber || '—');
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
  // Match legacy /admin/kitchen formatting:
  //   < 60m   → "12m 42s"
  //   >= 60m  → "12h 23m"
  // Previously rendered as "723m" for 12-hour-old test orders, which
  // is what owner reported looking absurd on the screen.
  const ageStr = ageMin >= 60
    ? `${Math.floor(ageMin / 60)}h ${ageMin % 60}m`
    : `${ageMin}m ${String(ageSec % 60).padStart(2, '0')}s`;
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
          <b>{tableLabel}</b>
          <small>{isTakeaway ? 'PICKUP' : 'TABLE'}</small>
        </div>
        <div className="th-meta">
          <div className="th-id">{orderLabel}</div>
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
                {it.note && <div className="ki-meta"><span className="ki-seat">Note: {it.note}</span></div>}
                {(order.status === 'preparing' || order.status === 'ready') && (
                  <div className="ki-meta" style={{ marginTop: 4 }}>
                    {it.readyAt ? (
                      <span className="ki-seat" style={{ color: 'var(--st-ready)', borderColor: 'var(--st-ready)' }}>✓ Ready</span>
                    ) : (
                      <button onClick={() => onMarkItemReady(order, i)} disabled={updatingThis} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.06em', padding: '3px 8px', borderRadius: 999, background: 'var(--gold)', color: '#1A1815', border: 'none', textTransform: 'uppercase', cursor: 'pointer', opacity: updatingThis ? 0.55 : 1 }}>Mark ready</button>
                    )}
                    {it.servedAt ? (
                      <span className="ki-seat" style={{ color: 'var(--tx-3)' }}>✓ Served</span>
                    ) : it.readyAt ? (
                      <button onClick={() => onMarkItemServed(order, i)} disabled={updatingThis} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.06em', padding: '3px 8px', borderRadius: 999, background: 'var(--tx)', color: 'var(--surface)', border: 'none', textTransform: 'uppercase', cursor: 'pointer', opacity: updatingThis ? 0.55 : 1 }}>Mark served</button>
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
