// components/order-kitchen/FloorScreen.js
//
// Direct 1:1 port of the Claude Design prototype's floor.jsx.
// Same JSX structure, same className strings, same helper logic.
// Only changes: window.I / window.rupee → ES imports;
// window.ZONES → props.zones (passed from the page).

import React, { useRef } from 'react';
import { I, rupee } from './Icons';
import PushToggle from './PushToggle';

function statusWord(s) {
  return { free: 'Free', seated: 'Seated', sent: 'Cooking', served: 'Ready to pay', ready: 'Paid' }[s] || s;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function FloorScreen({
  tables, zones, zone, setZone, onPick, totals, tweakShape = 'auto', waiter,
  isLight, onToggleTheme,
  pushRestaurantId, pushSubscriber,
  onManageTables, // owner-only: opens the floor-plan editor (add/edit tables)
}) {
  const segRef = useRef(null);
  const zoneTables = tables.filter(t => t.zone === zone);

  const idx = Math.max(0, zones.indexOf(zone));
  const pillStyle = zones.length > 0 ? {
    // Step by (pill width + 4px gap) per tab so the pill lands exactly on the
    // active tab — `idx * 100%` alone ignored the gap and drifted left.
    transform: `translateX(calc(${idx} * (100% + 4px)))`,
    width: `calc(${100 / zones.length}% - ${4 + 4 / zones.length}px)`,
  } : {};

  return (
    <div className="screen screen-enter">
      {/* apphead — pure inline styles (proven approach, mirrored in
          KitchenScreen / ReviewScreen / MenuScreen). The .apphead-row
          className had a production layout bug that stranded children
          at viewport middle; bypassing it with inline styles works. */}
      <div style={{
        padding: '14px 20px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        width: '100%',
      }}>
        <div style={{
          width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, #C4A86D, #C2562B)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
          fontWeight: 700, fontSize: 16, color: '#1A1815',
          boxShadow: '0 0 0 1px rgba(196,168,109,0.13), 0 6px 16px rgba(0,0,0,0.3)',
        }}>{(waiter || 'S')[0].toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 10, fontWeight: 600, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: 'var(--tx-3)',
          }}>{greeting()} · Floor</div>
          <h1 style={{
            fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
            fontWeight: 700, fontSize: 27, letterSpacing: '-0.02em',
            margin: '2px 0 0', color: 'var(--tx)', lineHeight: 1.1,
          }}>Tables</h1>
        </div>
        {/* Theme toggle replaces the decorative bell. Owner reported
            the absolute-positioned floating toggle was awkwardly
            stacked above the bell — moving it inline next to the
            apphead avatar/title gives it a real home. The bell did
            nothing (no onClick); the theme toggle is the only useful
            top-right control today. */}
        {pushRestaurantId && pushSubscriber && (
          <PushToggle restaurantId={pushRestaurantId} subscriber={pushSubscriber} />
        )}
        {onManageTables && (
          <button
            onClick={onManageTables}
            title="Manage tables — add, edit, or remove tables"
            aria-label="Manage tables"
            style={{
              height: 40, padding: '0 13px', borderRadius: 13, flexShrink: 0,
              background: 'var(--card)', border: '1px solid var(--line)',
              display: 'inline-flex', alignItems: 'center', gap: 7,
              color: 'var(--tx)', cursor: 'pointer', fontFamily: 'var(--font-display)',
              fontSize: 13, fontWeight: 600,
            }}
          ><span style={{ fontSize: 15 }}>⊞</span><span>Tables</span></button>
        )}
        <button
          onClick={onToggleTheme}
          title={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
          aria-label="Toggle theme"
          style={{
            width: 40, height: 40, borderRadius: 13, flexShrink: 0,
            background: 'var(--card)', border: '1px solid var(--line)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--tx)', cursor: 'pointer', padding: 0, fontSize: 18,
          }}
        >{isLight ? '🌙' : '☀️'}</button>
      </div>

      {/* zone segmented control */}
      {zones.length > 1 && (
        <div className="segwrap">
          <div className="seg" ref={segRef}>
            <div className="seg-pill" style={pillStyle} />
            {zones.map(z => (
              <button key={z} className={z === zone ? 'on' : ''} onClick={() => setZone(z)}>
                <span>{z}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* legend */}
      <div className="legend">
        <span className="l"><span className="swatch" style={{ background: 'var(--st-free)' }} />Free</span>
        <span className="l"><span className="swatch" style={{ background: 'var(--st-seated)' }} />Seated</span>
        <span className="l"><span className="swatch" style={{ background: 'var(--st-sent)' }} />Cooking</span>
        <span className="l"><span className="swatch" style={{ background: 'var(--st-served)' }} />Ready to pay</span>
        <span className="l"><span className="swatch" style={{ background: 'var(--st-paid)' }} />Paid</span>
      </div>

      <div className="scroll">
        <div className="floor">
          {zoneTables.map(t => {
            // Shape varies by seats: round (≤2), square (3–6), long (7+) —
            // and the status word shows on all of them.
            const total = totals[t.id] || 0;
            const isLong = t.shape === 'long';
            return (
              <button key={t.id} className={`tabletok shape-${t.shape || 'square'} status-${t.status}`} onClick={() => onPick(t)}>
                <span className="tdot" />
                {isLong ? (
                  <>
                    <div className="tlong-l">
                      <span className="tnum">{t.id}</span>
                      <span className="tseat">{t.occupied ? `${t.occupied}/${t.seats}` : `${t.seats} seats`}</span>
                    </div>
                    <div className="tlong-r">
                      {total > 0 && <span className="ttotal">{rupee(total)}</span>}
                      <span className="tlabel">{statusWord(t.status)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="tnum">{t.id}</span>
                    <span className="tseat">{t.occupied ? `${t.occupied}/${t.seats}` : `${t.seats} seats`}</span>
                    <span className="tlabel">{statusWord(t.status)}</span>
                    {total > 0 && <span className="ttotal">{rupee(total)}</span>}
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
