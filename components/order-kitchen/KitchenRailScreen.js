// components/order-kitchen/KitchenRailScreen.js
//
// Phase C (2026-06-03) — Per-item Kitchen Display.
//
// Replaces the per-order bump KitchenScreen that the Phase A
// wrapper used. This page renders every active ticket with
// individual item rows; the kitchen marks each item ready
// independently, and the order auto-flips to status='ready' /
// 'served' once every item is stamped (handled server-side by
// lib/db's markOrderItemReadyAs / markOrderItemServedAs).
//
// Duplicate-dish indicator: any dish appearing in 2+ active
// tickets gets a gold "fire together" badge with the total
// quantity and ticket count, so the kitchen can batch-cook
// across tables. Same logic /admin/kitchen has today, ported
// to the dark Order & Kitchen palette.
//
// All-day counter strip: top 8 dishes by ticket count, shown
// just below the apphead. Tap-able in a future phase; today
// it's a glanceable summary.

import React, { useEffect, useRef, useState } from 'react';
import PushToggle from './PushToggle';
import { IconSound, IconMic } from './ActionQueueScreen';

// Theme-responsive tokens go through CSS vars (defined in
// styles/order-kitchen.css) so that the light mode override
// — body[data-theme="light"] .ok-root — flips them at paint
// time without us having to recompute inline styles in JS.
// Brand colours (gold / amber / green / danger) stay literal
// because they don't change between themes by design.
const COLORS = {
  text:       'var(--tx)',
  textMuted:  'var(--tx-2)',
  textFaint:  'var(--tx-3)',
  card:       'var(--card)',
  cardDarker: 'var(--card-2)',
  border:     'var(--line)',
  gold:       '#C4A86D',
  goldBg:     'rgba(196,168,109,0.14)',
  goldText:   '#D6BC85',
  amber:      '#C2562B',
  amberBg:    'rgba(194,86,43,0.14)',
  amberText:  '#D8783C',
  green:      '#4A8866',
  greenBg:    'rgba(74,136,102,0.14)',
  greenText:  '#7BA890',
  danger:     '#D9554F',
  dangerBg:   'rgba(217,85,79,0.14)',
};

const WAITING_LONG_SEC = 18 * 60;  // 18 min → red urgency (per /admin/waiter)
const WAITING_WARN_SEC = 10 * 60;  // 10 min → gold urgency

function fmtAge(ageSec) {
  // Match legacy /admin/kitchen format: "Xm Ys" with two-digit
  // seconds. Owner asked for this exact format on both mobile and
  // desktop. The old "Xm" / "just now" version was harder to read
  // at a glance when the rail had a mix of ages.
  if (ageSec == null) return '—';
  const m = Math.floor(ageSec / 60);
  const s = ageSec % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}
function orderLabel(o) {
  if (typeof o.orderNumber === 'number' && o.orderNumber > 0) return `#${String(o.orderNumber).padStart(4, '0')}`;
  return '#' + (o.id || '').slice(-4).toUpperCase();
}

export default function KitchenRailScreen({
  orders,            // active orders (pending/preparing/ready)
  duplicateDishes,   // Set<dishName>
  allDay,            // [[name, totalQty, ticketCount], ...]
  filter,            // 'all' | 'new' | 'cooking' | 'ready'
  onFilterChange,
  onStartOrder,      // (order) => mark order preparing
  onMarkItemReady,   // (order, itemIdx) => stamp readyAt
  onMarkItemServed,  // (order, itemIdx) => stamp servedAt
  updatingKey,       // string identifying the in-flight write
  isLight,           // theme state for the inline toggle button
  onToggleTheme,     // theme switch callback
  soundEnabled,      // optional — chime toggle
  voiceEnabled,      // optional — TTS toggle
  onToggleSound,     // optional callback
  onToggleVoice,     // optional callback
  pushRestaurantId,  // optional — wires the inline push toggle
  pushSubscriber,    // optional — { kind, id, perms }
  servedToday,       // optional — count for the slim stats line (desktop parity)
}) {
  const counts = {
    all:     orders.length,
    new:     orders.filter(o => o.status === 'pending').length,
    cooking: orders.filter(o => o.status === 'preparing').length,
    ready:   orders.filter(o => o.status === 'ready').length,
  };
  const visible = orders
    .filter(o => {
      if (filter === 'new')     return o.status === 'pending';
      if (filter === 'cooking') return o.status === 'preparing';
      if (filter === 'ready')   return o.status === 'ready';
      return true;
    })
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));

  const filters = [
    { id: 'all',     label: 'All' },
    { id: 'new',     label: 'New' },
    { id: 'cooking', label: 'Cooking' },
    { id: 'ready',   label: 'Ready' },
  ];

  // ── scroll-more indicator ─────────────────────────────────────
  // Owner reported on mobile that when there are more tickets than
  // fit on screen, there's no hint to scroll. Desktop KitchenColumn
  // has a "↓ N more below" floating CTA — mirror it here.
  //
  // We track scroll position on the .scroll wrapper and show a
  // floating gold badge ("↓ N more") when there's content below
  // the visible viewport. Tapping it scrolls smoothly to the
  // bottom (showing user that more exists, not strict next-ticket
  // alignment — same behavior as desktop).
  const scrollRef = useRef(null);
  const [moreBelow, setMoreBelow] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const recompute = () => {
      const remaining = el.scrollHeight - el.clientHeight - el.scrollTop;
      // Count remaining tickets approximately: each ticket is
      // roughly 220px tall (header + item rows). We round but
      // treat <60px as "you're basically at the bottom".
      if (remaining < 60) {
        setMoreBelow(0);
      } else {
        setMoreBelow(Math.max(1, Math.round(remaining / 220)));
      }
    };
    recompute();
    el.addEventListener('scroll', recompute, { passive: true });
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    // Recompute when the visible list length changes (e.g. filter
    // toggled or new ticket arrived). Using visible.length in the
    // dep array does the work.
    return () => {
      el.removeEventListener('scroll', recompute);
      ro.disconnect();
    };
  }, [visible.length]);
  const scrollDown = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ top: el.clientHeight * 0.8, behavior: 'smooth' });
  };

  return (
    <div className="screen screen-enter">
      {/* apphead */}
      <div style={{
        padding: '14px 20px', flexShrink: 0,
        display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12,
        width: '100%',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 10, fontWeight: 600, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: COLORS.textFaint,
          }}>Kitchen Display · live</div>
          <h1 style={{
            fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
            fontWeight: 700, fontSize: 27, letterSpacing: '-0.02em',
            margin: '2px 0 0', color: COLORS.text, lineHeight: 1.1,
          }}>Kitchen rail</h1>
        </div>
        {/* Push toggle — sits before sound/voice/theme. Enables
            lock-screen notifications via FCM web push so the chef
            hears the chime even when the phone is locked. */}
        {pushRestaurantId && pushSubscriber && (
          <PushToggle restaurantId={pushRestaurantId} subscriber={pushSubscriber} />
        )}
        {/* Sound + voice toggles (when wired). Sit before the
            theme toggle so on narrow phones the theme toggle stays
            visually anchored to the right edge. */}
        {onToggleSound && (
          <button
            onClick={onToggleSound}
            title={soundEnabled ? 'Mute in-app chime' : 'Unmute in-app chime'}
            aria-label="Toggle in-app sound"
            className={`ok-iconbtn${soundEnabled ? ' on' : ''}`}
          ><IconSound on={soundEnabled} /></button>
        )}
        {onToggleVoice && (
          <button
            onClick={onToggleVoice}
            title={voiceEnabled ? 'Disable voice' : 'Enable voice'}
            aria-label="Toggle voice"
            className={`ok-iconbtn${voiceEnabled ? ' on' : ''}`}
          ><IconMic on={voiceEnabled} /></button>
        )}
        {/* Theme toggle (replaces the decorative chef tile — it
            didn't do anything; the toggle is the only useful
            top-right control on mobile). */}
        {onToggleTheme ? (
          <button
            onClick={onToggleTheme}
            title={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
            aria-label="Toggle theme"
            style={{
              width: 40, height: 40, borderRadius: 13, flexShrink: 0,
              background: COLORS.card, border: `1px solid ${COLORS.border}`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: COLORS.text, cursor: 'pointer', padding: 0, fontSize: 18,
            }}
          >{isLight ? '🌙' : '☀️'}</button>
        ) : (
          <div style={{
            width: 40, height: 40, borderRadius: 13, flexShrink: 0,
            background: 'linear-gradient(135deg, #C4A86D, #C2562B)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: '#1A1815', fontSize: 20,
          }}>👨‍🍳</div>
        )}
      </div>

      {/* Slim stats line — the desktop LIVE KITCHEN strip, phone-sized.
          active · oldest ticket age · served today. */}
      {(() => {
        const nowSec = Math.floor(Date.now() / 1000);
        let oldest = 0;
        orders.forEach(o => {
          const age = o.createdAt?.seconds ? nowSec - o.createdAt.seconds : 0;
          if (age > oldest) oldest = age;
        });
        const oldestM = Math.floor(oldest / 60);
        return (
          <div style={{
            padding: '0 20px 8px', flexShrink: 0,
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 11, color: COLORS.textMuted, letterSpacing: '.02em',
          }}>
            {orders.length} active · oldest {orders.length === 0 ? '—' : `${oldestM}m`}
            {typeof servedToday === 'number' && <> · <span style={{ color: 'var(--st-ready)', fontWeight: 700 }}>{servedToday} served today</span></>}
          </div>
        );
      })()}

      {/* all-day counter — top duplicate dishes across the rail */}
      {allDay.length > 0 && (
        <div style={{
          padding: '0 16px 6px', flexShrink: 0,
          display: 'flex', gap: 6, flexWrap: 'wrap', overflowX: 'auto',
        }}>
          <span style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 9, fontWeight: 700, letterSpacing: '0.10em',
            textTransform: 'uppercase', color: COLORS.textFaint,
            alignSelf: 'center', marginRight: 4,
          }}>All-day</span>
          {allDay.map(([name, qty, ticketCount]) => (
            <span key={name} title={`${qty} × ${name} across ${ticketCount} active orders`} style={{
              padding: '4px 10px', borderRadius: 999,
              background: COLORS.goldBg, color: COLORS.goldText,
              border: `1px solid ${COLORS.border}`,
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
            }}>{qty}× {name} <span style={{ color: COLORS.textFaint, marginLeft: 4 }}>· {ticketCount}</span></span>
          ))}
        </div>
      )}

      {/* filter pills */}
      <div style={{
        padding: '6px 16px 10px', flexShrink: 0,
        display: 'flex', gap: 8, flexWrap: 'wrap',
      }}>
        {filters.map(f => {
          const on = filter === f.id;
          return (
            <button key={f.id} onClick={() => onFilterChange(f.id)} style={{
              padding: '8px 14px', borderRadius: 999,
              border: `1px solid ${on ? COLORS.gold : COLORS.border}`,
              background: on ? COLORS.goldBg : COLORS.card,
              color: on ? COLORS.goldText : COLORS.textMuted,
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {f.label}
              <span style={{
                padding: '1px 6px', borderRadius: 999,
                // off-state badge uses var(--line-soft), not a white wash —
                // rgba(255,255,255,0.06) was invisible on light cards.
                background: on ? 'rgba(0,0,0,0.18)' : 'var(--line-soft)',
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                fontSize: 10, fontWeight: 700,
              }}>{counts[f.id]}</span>
            </button>
          );
        })}
      </div>

      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}>
        <div className="scroll" ref={scrollRef} style={{ flex: 1 }}>
        {visible.length === 0 ? (
          <div className="empty">
            <span className="e-emoji">🍳</span>
            <p>{
              filter === 'new'     ? 'No new tickets. New orders land here instantly.'
              : filter === 'cooking' ? 'Nothing cooking. Tap a New ticket to start.'
              : filter === 'ready'   ? 'No tickets ready to pick up.'
              : 'The rail is clear.'
            }</p>
          </div>
        ) : (
          <div className="ok-cards-grid" style={{
            display: 'flex', flexDirection: 'column', gap: 12,
            padding: '4px 16px 24px',
          }}>
            {visible.map(o => (
              <KitchenTicket
                key={o.id}
                order={o}
                duplicateDishes={duplicateDishes}
                allDay={allDay}
                onStartOrder={onStartOrder}
                onMarkItemReady={onMarkItemReady}
                onMarkItemServed={onMarkItemServed}
                updatingKey={updatingKey}
              />
            ))}
          </div>
        )}
        </div>
        {/* Floating "more below" CTA. Same gold accent as the
            desktop KitchenColumn version, positioned bottom-center
            of the scroll viewport. Click scrolls one screenful. */}
        {moreBelow > 0 && (
          <button
            onClick={scrollDown}
            aria-label={`Scroll to see ${moreBelow} more ticket${moreBelow === 1 ? '' : 's'}`}
            style={{
              position: 'absolute',
              left: '50%', transform: 'translateX(-50%)',
              bottom: 14,
              padding: '7px 14px', borderRadius: 999,
              background: COLORS.gold, color: '#1A1815',
              border: 'none',
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', cursor: 'pointer',
              boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
              zIndex: 5,
              whiteSpace: 'nowrap',
            }}
          >↓ {moreBelow} more</button>
        )}
      </div>
    </div>
  );
}

function KitchenTicket({
  order, duplicateDishes, allDay,
  onStartOrder, onMarkItemReady, onMarkItemServed,
  updatingKey,
}) {
  // Seconds-precision age — same as the desktop ticket. fmtAge
  // formats as "Xm Ys" with two-digit seconds.
  const ageSec = order.createdAt?.toDate
    ? Math.max(0, Math.floor((Date.now() - order.createdAt.toDate().getTime()) / 1000))
    : Math.max(0, Math.floor((Date.now() / 1000) - (order.createdAt?.seconds || 0)));
  const ageMin = Math.floor(ageSec / 60);
  const isOver = ageSec >= WAITING_LONG_SEC;
  const isWarn = ageSec >= WAITING_WARN_SEC;
  const status = order.status;

  let accent, statusLabel;
  if (status === 'pending')   { accent = COLORS.gold;  statusLabel = 'NEW'; }
  else if (status === 'preparing') { accent = COLORS.amber; statusLabel = 'COOKING'; }
  else /* ready */            { accent = COLORS.green; statusLabel = 'READY'; }

  const edgeColor = isOver ? COLORS.danger : isWarn ? COLORS.gold : 'transparent';
  const timerColor = isOver ? COLORS.danger : isWarn ? COLORS.goldText : COLORS.text;

  const itemsArr = Array.isArray(order.items) ? order.items : [];
  const isTakeaway = order.orderType === 'takeaway' || order.orderType === 'takeout';
  // Same short-label / long-label split as DesktopTicket — the 42×42
  // tile only fits 1-3 chars; multi-word strings like "Not specified"
  // overflow it. Long labels show as a subtitle next to the order id.
  const rawTableLabel = isTakeaway ? (order.customerName || '') : (order.tableNumber || '');
  const isShortLabel = rawTableLabel.length > 0 && rawTableLabel.length <= 3 && !rawTableLabel.includes(' ');
  const tileLabel = isShortLabel ? rawTableLabel : (isTakeaway ? '↗' : '—');
  const longLabel = isShortLabel ? null : (rawTableLabel || 'Not specified');
  const placedAt = order.createdAt?.toDate
    ? (() => {
        const d = order.createdAt.toDate();
        const h = d.getHours() % 12 || 12;
        return `${h}:${String(d.getMinutes()).padStart(2, '0')}`;
      })()
    : '—';

  return (
    <div style={{
      position: 'relative',
      background: COLORS.card,
      borderRadius: 14,
      border: `1px solid ${COLORS.border}`,
      borderLeft: `4px solid ${accent}`,
      overflow: 'hidden',
      boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
    }}>
      {/* urgency band */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 0, height: 3,
        background: edgeColor,
      }} />

      {/* ticket head */}
      <div style={{
        padding: '12px 14px 10px',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        borderBottom: `1px solid var(--line-soft)`,
      }}>
        <div style={{
          width: 42, height: 42, borderRadius: 11,
          background: COLORS.cardDarker,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <span style={{
            fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
            fontWeight: 700, fontSize: 16, color: COLORS.text, lineHeight: 1,
          }}>{tileLabel}</span>
          <span style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 8, color: COLORS.textFaint, marginTop: 2,
            letterSpacing: '0.06em',
          }}>{isTakeaway ? 'PICKUP' : 'TABLE'}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          }}>
            <span style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontWeight: 700, fontSize: 13, color: COLORS.gold,
            }}>{orderLabel(order)}</span>
            <span style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
              padding: '2px 7px', borderRadius: 4,
              background: status === 'pending' ? COLORS.goldBg
                       : status === 'preparing' ? COLORS.amberBg
                       : COLORS.greenBg,
              color:   status === 'pending' ? COLORS.goldText
                       : status === 'preparing' ? COLORS.amberText
                       : COLORS.greenText,
            }}>{statusLabel}</span>
            {longLabel && (
              <span style={{
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                fontSize: 11, fontWeight: 600, color: COLORS.textMuted,
              }}>· {isTakeaway ? `Takeaway · ${longLabel}` : `Table ${longLabel}`}</span>
            )}
          </div>
          <div style={{
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: 11, color: COLORS.textMuted, marginTop: 2,
          }}>Placed {placedAt} · {order.placedBy || 'staff'}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 14, fontWeight: 700, color: timerColor,
            fontVariantNumeric: 'tabular-nums',
          }}>{fmtAge(ageSec)}</div>
          {isOver && (
            <div style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 9, color: COLORS.danger, fontWeight: 700,
              letterSpacing: '0.06em', marginTop: 2,
            }}>LATE</div>
          )}
        </div>
      </div>

      {/* items */}
      <div style={{ padding: '8px 14px' }}>
        {itemsArr.map((item, i) => {
          const isDup = duplicateDishes.has(item.name);
          const dupEntry = allDay.find(([n]) => n === item.name);
          const dupTotalQty = dupEntry?.[1];
          const dupTickets = dupEntry?.[2];
          const itemUpdatingKey = `${order.id}:item:${i}`;
          const isUpdating = updatingKey === itemUpdatingKey;
          const canBumpItems = status === 'preparing' || status === 'ready';

          return (
            <div key={i} style={{
              padding: '8px 10px',
              borderTop: i > 0 ? '1px solid var(--line-soft)' : 'none',
              borderRadius: isDup ? 8 : 0,
              background: isDup ? 'rgba(196,168,109,0.06)' : 'transparent',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  fontWeight: 700, fontSize: 14, color: COLORS.gold,
                  minWidth: 24, flexShrink: 0, paddingTop: 2,
                }}>{item.qty || 1}×</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
                    fontWeight: 600, fontSize: 14, color: COLORS.text,
                    lineHeight: 1.3,
                  }}>
                    {item.name}
                    {isDup && (
                      <span title={`${dupTotalQty} total across ${dupTickets} active orders — fire together`} style={{
                        display: 'inline-block', marginLeft: 6,
                        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                        padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase',
                        background: COLORS.gold, color: '#1A1815',
                        verticalAlign: 'middle',
                      }}>×{dupTotalQty} in {dupTickets}</span>
                    )}
                  </div>
                  {item.note && (
                    <div style={{
                      marginTop: 5, padding: '5px 9px',
                      background: COLORS.goldBg, borderRadius: 6,
                      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                      fontSize: 11, color: COLORS.goldText,
                    }}>
                      <b style={{ fontWeight: 700 }}>Note:</b> {item.note}
                    </div>
                  )}
                  {Array.isArray(item.modifiers) && item.modifiers.length > 0 && (
                    <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {item.modifiers.map((mod, mi) => (
                        <span key={mi} style={{
                          padding: '2px 7px', borderRadius: 4,
                          background: 'var(--card-2)', color: COLORS.textMuted,
                          border: '1px solid var(--line)',
                          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                          fontSize: 10, fontWeight: 500,
                        }}>{mod}</span>
                      ))}
                    </div>
                  )}

                  {/* Per-item ready / served pills — all four states
                      (Mark ready button, ✓ Ready pill, Mark served
                      button, ✓ Served pill) share IDENTICAL geometry
                      so they line up no matter which mix of states
                      the row sits in. Owner reported the ✓ READY
                      pill rendering much larger than MARK SERVED
                      because they used different padding + fontSize.
                      Single style constant fixes that. */}
                  {canBumpItems && (() => {
                    const PILL = {
                      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                      padding: '5px 12px', borderRadius: 999,
                      textTransform: 'uppercase',
                      border: 'none', display: 'inline-flex',
                      alignItems: 'center', justifyContent: 'center',
                      lineHeight: 1.2,
                    };
                    return (
                    <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {item.readyAt ? (
                        <span style={{ ...PILL, background: COLORS.greenBg, color: COLORS.greenText }}>✓ Ready</span>
                      ) : (
                        <button
                          onClick={() => onMarkItemReady(order, i)}
                          disabled={isUpdating}
                          style={{ ...PILL, background: COLORS.gold, color: '#1A1815', cursor: isUpdating ? 'wait' : 'pointer', opacity: isUpdating ? 0.55 : 1 }}
                        >Mark ready</button>
                      )}
                      {item.servedAt ? (
                        // ✓ Served pill: use card-2 + tx-3 so it reads
                        // softly on BOTH dark cards (subtle dark wash,
                        // faint cream text) and light cards (subtle
                        // off-white wash, faint dark text). The old
                        // rgba(255,255,255,0.06) bg was invisible on
                        // light cards.
                        <span style={{ ...PILL, background: 'var(--card-2)', color: 'var(--tx-3)', border: '1px solid var(--line)' }}>✓ Served</span>
                      ) : item.readyAt ? (
                        // Mark served button: hardcoded dark bg + cream
                        // text so it stays visible in both themes. The
                        // old `background: COLORS.text` was using the
                        // theme-flipping --tx var, which made the bg
                        // dark in light mode → dark text on dark bg.
                        <button
                          onClick={() => onMarkItemServed(order, i)}
                          disabled={isUpdating}
                          style={{ ...PILL, background: '#1A1815', color: '#EFEBE4', cursor: isUpdating ? 'wait' : 'pointer', opacity: isUpdating ? 0.55 : 1 }}
                        >Mark served</button>
                      ) : null}
                    </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* footer — order-level Start cooking button (only on pending) */}
      {status === 'pending' && (
        <div style={{ padding: '10px 14px', borderTop: `1px solid var(--line-soft)` }}>
          <button
            onClick={() => onStartOrder(order)}
            disabled={updatingKey === `${order.id}:start`}
            style={{
              width: '100%', padding: '11px',
              background: COLORS.amber, color: COLORS.text, border: 'none',
              borderRadius: 11,
              fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
              fontWeight: 700, fontSize: 13,
              cursor: 'pointer', letterSpacing: '0.02em',
              opacity: updatingKey === `${order.id}:start` ? 0.55 : 1,
            }}
          >🔥 Start cooking</button>
        </div>
      )}
    </div>
  );
}
