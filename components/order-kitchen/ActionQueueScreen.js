// components/order-kitchen/ActionQueueScreen.js
//
// Phase B.2 (2026-06-03) — Action Queue screen for /admin/orders.
//
// Renders the merged call + serve + payment queue. Three card
// types, each color-coded so a waiter can scan the screen and know
// which actions are most urgent:
//
//   CALL    — gold accent. Customer pressed "call waiter" on the
//             QR menu. Tap "Resolve" to dismiss.
//   READY   — green accent. Kitchen marked an item ready (per-item
//             grain — one card per ready item, not one per order).
//             Tap "Mark Served" to flip item.servedAt.
//   PAYMENT — colored by method. Cash→gold, card→slate, online→
//             purple. Cash opens a receipt modal first (cashReceived
//             input → auto-computed change) so the cash drawer
//             reconciles. Card / UPI direct-mark.
//
// Behavior mirrored 1:1 from the existing /admin/waiter Queue tab
// (lib functions, sort order, priority labels, urgency bands).
// Only the visual treatment changes: the Aspire-light styling there
// becomes the dark Order & Kitchen palette here. Area-scoping has
// been DROPPED per owner's call — every waiter sees every action.
//
// All UI is inline-style (no .apphead-row className) so it can't
// collide with the layout bug we hit on the FloorScreen apphead.

import React from 'react';
import { I } from './Icons';
import PushToggle from './PushToggle';

const WAITING_LONG_SEC = 180;  // 3 min → red urgency band
const WAITING_WARN_SEC = 60;   // 1 min → gold urgency band

// Toggle icons with DISTINCT on/off states (the old 🔊/🎙️ emojis were
// unclear, and voice showed the same glyph both ways so it looked broken).
export const IconSound = ({ on }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 5 6 9H2v6h4l5 4V5z" />
    {on
      ? (<><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a10 10 0 0 1 0 14" /></>)
      : (<><line x1="22" y1="9" x2="16" y2="15" /><line x1="16" y1="9" x2="22" y2="15" /></>)}
  </svg>
);
export const IconMic = ({ on }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
    <line x1="12" y1="18" x2="12" y2="22" />
    {!on && <line x1="3" y1="3" x2="21" y2="21" />}
  </svg>
);

function formatElapsed(seconds) {
  if (seconds == null || seconds < 0) return '0s';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

// Theme-responsive tokens go through CSS vars so light mode flips
// them at paint time without recomputing inline styles in JS.
const COLORS = {
  text:        'var(--tx)',
  textMuted:   'var(--tx-2)',
  textFaint:   'var(--tx-3)',
  card:        'var(--card)',
  cardDarker:  'var(--card-2)',
  border:      'var(--line)',
  // type accents — match the gold / green / payment-method palette
  // from the prototype + the existing /admin/waiter
  goldAccent:   '#C4A86D',
  goldBg:       'rgba(196,168,109,0.14)',
  goldText:     '#D6BC85',
  greenAccent:  '#4A8866',
  greenBg:      'rgba(74,136,102,0.14)',
  greenText:    '#7BA890',
  cardAccent:   '#6E8EAF',
  cardBg:       'rgba(110,142,175,0.14)',
  cardText:     '#8FA8C2',
  upiAccent:    '#9B7BBF',
  upiBg:        'rgba(155,123,191,0.14)',
  upiText:      '#B59AD1',
  danger:       '#D9554F',
  dangerBg:     'rgba(217,85,79,0.14)',
};

export default function ActionQueueScreen({
  items, onAction, resolvingId,
  soundEnabled, onToggleSound,
  voiceEnabled, onToggleVoice,
  flashingIds,
  desktop = false,  // skip apphead — ws-head supplies the title on desktop
  pushRestaurantId, pushSubscriber, // optional — lock-screen push bell in the mobile apphead
}) {
  const counts = {
    calls:    items.filter(i => i.type === 'call').length,
    serves:   items.filter(i => i.type === 'serve').length,
    payments: items.filter(i => i.type === 'payment').length,
  };
  const oldestSec = items[0]?.seconds;
  const oldestAge = oldestSec ? Math.floor(Date.now() / 1000) - oldestSec : null;

  return (
    <div className="screen screen-enter">
      {/* apphead — pure inline styles. Eyebrow + h1 left, sound + voice toggles right.
          Skipped on desktop: ws-head provides the title and the sound/voice
          toggles live in the rail. */}
      {!desktop && (
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
          }}>Action Queue · live</div>
          <h1 style={{
            fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
            fontWeight: 700, fontSize: 27, letterSpacing: '-0.02em',
            margin: '2px 0 0', color: COLORS.text, lineHeight: 1.1,
          }}>Queue</h1>
        </div>
        {pushRestaurantId && pushSubscriber && (
          <PushToggle restaurantId={pushRestaurantId} subscriber={pushSubscriber} />
        )}
        <button
          onClick={onToggleSound}
          title={soundEnabled ? 'Sound on (tap to mute)' : 'Sound muted (tap to enable)'}
          className={`ok-iconbtn${soundEnabled ? ' on' : ''}`}
        ><IconSound on={soundEnabled} /></button>
        <button
          onClick={onToggleVoice}
          title={voiceEnabled ? 'Voice on (tap to silence)' : 'Voice off (tap to enable)'}
          className={`ok-iconbtn${voiceEnabled ? ' on' : ''}`}
        ><IconMic on={voiceEnabled} /></button>
      </div>
      )}
      {/* Desktop sound/voice toggles now live in the waiter station header
          (orders.js ws-head) — one aligned control group alongside push —
          so they're no longer duplicated as a floating toolbar here. */}

      {/* stat strip — shows counts of each type + oldest age. Hidden when empty. */}
      {items.length > 0 && (
        <div style={{
          padding: '6px 20px 10px', flexShrink: 0,
          display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          {counts.calls > 0 && (
            <span style={{
              padding: '4px 10px', borderRadius: 999,
              background: COLORS.goldBg, color: COLORS.goldText,
            }}>📞 {counts.calls} {counts.calls === 1 ? 'call' : 'calls'}</span>
          )}
          {counts.serves > 0 && (
            <span style={{
              padding: '4px 10px', borderRadius: 999,
              background: COLORS.greenBg, color: COLORS.greenText,
            }}>🍽 {counts.serves} ready</span>
          )}
          {counts.payments > 0 && (
            <span style={{
              padding: '4px 10px', borderRadius: 999,
              background: COLORS.goldBg, color: COLORS.goldText,
            }}>💳 {counts.payments} {counts.payments === 1 ? 'payment' : 'payments'}</span>
          )}
          {oldestAge !== null && oldestAge >= 30 && (
            <span style={{
              padding: '4px 10px', borderRadius: 999,
              background: oldestAge >= WAITING_LONG_SEC ? COLORS.dangerBg : COLORS.goldBg,
              color: oldestAge >= WAITING_LONG_SEC ? COLORS.danger : COLORS.goldText,
              marginLeft: 'auto',
            }}>Oldest {formatElapsed(oldestAge)}</span>
          )}
        </div>
      )}

      <div className="scroll">
        {items.length === 0 ? (
          <div className="empty">
            <span className="e-emoji">✓</span>
            <p>No actions pending. Calls, ready-to-serve items, and payment requests appear here in real time.</p>
          </div>
        ) : (
          <div className="ok-stack-list" style={{
            display: 'flex', flexDirection: 'column', gap: 10,
            padding: '4px 16px 24px',
          }}>
            {items.map(item => (
              <ActionCard
                key={item.id}
                item={item}
                onAction={onAction}
                isResolving={resolvingId === item.id}
                isFlashing={flashingIds.has(item.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionCard({ item, onAction, isResolving, isFlashing }) {
  const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - (item.seconds || 0));
  const isCall = item.type === 'call';
  const isServe = item.type === 'serve';
  const isPayment = item.type === 'payment';

  // Type-specific accent. Payments by method (matches /admin/payments
  // color coding so staff carry the same mental model across pages).
  let accent, typeBg, typeFg, typeLabel, btnBg, btnFg, btnLabel;
  if (isCall) {
    accent = COLORS.goldAccent; typeBg = COLORS.goldBg; typeFg = COLORS.goldText;
    typeLabel = 'CALL';
    btnBg = COLORS.goldAccent; btnFg = '#1A1815'; btnLabel = 'Resolve';
  } else if (isServe) {
    accent = COLORS.greenAccent; typeBg = COLORS.greenBg; typeFg = COLORS.greenText;
    typeLabel = 'READY';
    btnBg = COLORS.greenAccent; btnFg = '#EFEBE4'; btnLabel = 'Mark Served';
  } else /* payment */ {
    if (item.method === 'cash') {
      accent = COLORS.goldAccent; typeBg = COLORS.goldBg; typeFg = COLORS.goldText;
      btnBg = COLORS.goldAccent; btnFg = '#1A1815';
    } else if (item.method === 'card') {
      accent = COLORS.cardAccent; typeBg = COLORS.cardBg; typeFg = COLORS.cardText;
      btnBg = COLORS.cardAccent; btnFg = '#EFEBE4';
    } else /* online */ {
      accent = COLORS.upiAccent; typeBg = COLORS.upiBg; typeFg = COLORS.upiText;
      btnBg = COLORS.upiAccent; btnFg = '#EFEBE4';
    }
    typeLabel = `PAY · ${(item.methodLabel || '').toUpperCase()}`;
    btnLabel = 'Mark Paid';
  }

  // Urgency band along the top edge of the card
  let edgeColor = 'transparent';
  let timerColor = COLORS.text;
  if (elapsed >= WAITING_LONG_SEC) { edgeColor = COLORS.danger; timerColor = COLORS.danger; }
  else if (elapsed >= WAITING_WARN_SEC) { edgeColor = COLORS.goldAccent; timerColor = COLORS.goldText; }
  const isOver = elapsed >= WAITING_LONG_SEC;

  return (
    <div style={{
      position: 'relative',
      background: COLORS.card,
      borderRadius: 14,
      border: `1px solid ${COLORS.border}`,
      borderLeft: `4px solid ${accent}`,
      overflow: 'hidden',
      transition: 'transform .14s, opacity .14s',
      boxShadow: isFlashing
        ? `0 0 0 2px ${accent}, 0 0 24px ${accent}55`
        : '0 4px 14px rgba(0,0,0,0.18)',
    }}>
      {/* top edge urgency bar */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 0, height: 3,
        background: edgeColor,
      }} />

      <div style={{
        padding: '14px 16px 14px 18px',
        display: 'grid',
        gridTemplateColumns: '1fr auto auto',
        gap: 12, alignItems: 'center',
      }}>
        {/* Left: type pill + table + subtitle + items chips (for serves) */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
              padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase',
              background: typeBg, color: typeFg,
            }}>{typeLabel}</span>
            <span style={{
              fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
              fontWeight: 700, fontSize: 15, color: COLORS.text, letterSpacing: '-0.2px',
            }}>{item.isTakeaway ? `Takeaway · ${item.table}` : `Table ${item.table}`}</span>
            {isOver && (
              <span style={{
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                fontSize: 9, fontWeight: 700, letterSpacing: '0.10em',
                padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase',
                background: COLORS.dangerBg, color: COLORS.danger,
              }}>Waiting long</span>
            )}
          </div>
          <div style={{
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: 12, color: COLORS.textMuted, fontWeight: 500,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{item.subtitle}</div>
          {isServe && item.raw?.items && item.raw.items.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {item.raw.items.slice(0, 4).map((it, i) => (
                <span key={i} style={{
                  padding: '2px 8px', borderRadius: 8,
                  background: 'var(--card-2)',
                  border: '1px solid var(--line)',
                  color: COLORS.text,
                  fontSize: 11, fontWeight: 500,
                }}>
                  <span style={{
                    color: COLORS.goldAccent, fontWeight: 700,
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  }}>{it.qty || 1}×</span>{' '}{it.name}
                </span>
              ))}
              {item.raw.items.length > 4 && (
                <span style={{
                  padding: '2px 8px', borderRadius: 8,
                  background: 'var(--card-2)',
                  border: '1px solid var(--line)',
                  color: COLORS.textMuted, fontSize: 11, fontWeight: 500,
                }}>+{item.raw.items.length - 4} more</span>
              )}
            </div>
          )}
        </div>

        {/* Middle: elapsed timer */}
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 14, fontWeight: 700, color: timerColor,
            letterSpacing: '-0.2px', lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}>{formatElapsed(elapsed)}</div>
          <div style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 9, color: COLORS.textFaint, fontWeight: 500,
            marginTop: 3, letterSpacing: '0.05em',
          }}>{isCall ? 'waiting' : isServe ? 'ready' : 'requested'}</div>
        </div>

        {/* Right: action button */}
        <button
          onClick={() => onAction(item)}
          disabled={isResolving}
          style={{
            padding: '9px 14px', borderRadius: 10, border: 'none',
            background: btnBg, color: btnFg,
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: 12, fontWeight: 700, cursor: isResolving ? 'wait' : 'pointer',
            letterSpacing: '0.01em', opacity: isResolving ? 0.6 : 1,
            whiteSpace: 'nowrap',
            minWidth: 100,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >{isResolving ? '…' : btnLabel}</button>
      </div>
    </div>
  );
}

// ─── Cash receipt modal ──────────────────────────────────────────
// Opens when waiter taps "Mark Paid" on a cash payment request.
// Auto-prefills cashReceived with the order total (most common case
// — customer paid exact). Waiter can edit if customer paid more,
// the modal shows the calculated change automatically.
export function CashModal({ item, cashReceived, onChange, onConfirm, onCancel, isResolving }) {
  if (!item) return null;
  const total = Math.round(Number(item.raw?.total) || 0);
  const received = Math.round(Number(cashReceived) || 0);
  const change = Math.max(0, received - total);
  const tooLittle = received < total;

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'absolute', inset: 0, zIndex: 80,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          background: COLORS.card,
          borderTop: `1px solid ${COLORS.border}`,
          borderRadius: '22px 22px 0 0',
          padding: '20px 22px 24px',
          maxHeight: '88%',
          overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: 'var(--line)',
          alignSelf: 'center', marginBottom: 4,
        }} />
        <div>
          <div style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 10, fontWeight: 600, letterSpacing: '0.16em',
            textTransform: 'uppercase', color: COLORS.textFaint,
          }}>Cash payment · Table {item.table}</div>
          <h2 style={{
            fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
            fontWeight: 700, fontSize: 22, letterSpacing: '-0.02em',
            margin: '4px 0 0', color: COLORS.text,
          }}>Collect ₹{total.toLocaleString('en-IN')}</h2>
        </div>

        <div>
          <label style={{
            display: 'block',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: 11, fontWeight: 600, color: COLORS.textMuted,
            marginBottom: 6, letterSpacing: '0.02em',
          }}>Cash received</label>
          <input
            type="number"
            inputMode="numeric"
            value={cashReceived}
            onChange={e => onChange(e.target.value)}
            min={0}
            style={{
              width: '100%',
              padding: '12px 14px',
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 18, fontWeight: 700,
              // var(--card-2), not a fixed dark wash — the old
              // rgba(0,0,0,0.32) bg + theme-flipping text turned the
              // cash input dark-on-dark in light mode.
              background: 'var(--card-2)',
              color: COLORS.text,
              border: `1px solid ${tooLittle ? COLORS.danger : COLORS.border}`,
              borderRadius: 10,
              outline: 'none',
            }}
          />
        </div>

        <div style={{
          padding: '12px 14px', borderRadius: 10,
          background: tooLittle ? COLORS.dangerBg : 'rgba(74,136,102,0.10)',
          color: tooLittle ? COLORS.danger : COLORS.greenText,
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
          fontSize: 13, fontWeight: 600,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {tooLittle ? (
            <>
              <span>Short by</span>
              <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 15 }}>
                ₹{(total - received).toLocaleString('en-IN')}
              </span>
            </>
          ) : (
            <>
              <span>Change to give</span>
              <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 15 }}>
                ₹{change.toLocaleString('en-IN')}
              </span>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button
            onClick={onCancel}
            disabled={isResolving}
            style={{
              flex: 1, padding: '13px', borderRadius: 11,
              background: 'var(--card-2)', color: COLORS.text,
              border: '1px solid var(--line)',
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              opacity: isResolving ? 0.6 : 1,
            }}
          >Cancel</button>
          <button
            onClick={onConfirm}
            disabled={isResolving || tooLittle}
            style={{
              flex: 1, padding: '13px', borderRadius: 11, border: 'none',
              background: COLORS.goldAccent, color: '#1A1815',
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
              fontSize: 13, fontWeight: 700, cursor: tooLittle ? 'not-allowed' : 'pointer',
              opacity: (isResolving || tooLittle) ? 0.5 : 1,
            }}
          >{isResolving ? 'Saving…' : 'Confirm payment'}</button>
        </div>
      </div>
    </div>
  );
}
