// components/order-kitchen/FloorScreen.js
//
// Direct 1:1 port of the Claude Design prototype's floor.jsx.
// Same JSX structure, same className strings, same helper logic.
// Only changes: window.I / window.rupee → ES imports;
// window.ZONES → props.zones (passed from the page).

import React, { useRef, useState } from 'react';
import { I, rupee } from './Icons';
import PushToggle from './PushToggle';
import { RailChip, RailSheet } from './RailSheet';

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
  // Phone stand-ins for the desktop right rail + stat strip (2026-07-02).
  // Rows come prebuilt from orders.js so mobile/desktop can't drift.
  stats, waitlistCount = 0, waitlistRows = null, queueCount = 0, queueRows = null,
}) {
  const segRef = useRef(null);
  const [sheet, setSheet] = useState(null); // 'waitlist' | 'queue'
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
        {/* Avatar + theme toggle removed (2026-07-03) — the okv-station top
            bar above now carries brand, theme and avatar, so the apphead
            keeps only the title + push bell. */}
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

      {/* Slim stats line — the desktop stat strip, phone-sized. */}
      {stats && (
        <div style={{
          padding: '0 20px 10px', fontFamily: 'var(--font-mono)', fontSize: 11,
          color: 'var(--tx-2)', letterSpacing: '.02em',
        }}>
          {stats.seated} seated · {stats.cooking} cooking · {stats.ready} to pay · <span style={{ color: 'var(--badge-gold)', fontWeight: 700 }}>₹{Math.round(stats.revenue).toLocaleString('en-IN')} open</span>
        </div>
      )}

      {/* Waitlist + Service queue — the desktop rail as tap-chips. */}
      {(waitlistCount > 0 || queueCount > 0) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '0 20px 12px' }}>
          {waitlistCount > 0 && <RailChip label="Waitlist" count={waitlistCount} onClick={() => setSheet('waitlist')} />}
          {queueCount > 0 && <RailChip label="Service queue" count={queueCount} onClick={() => setSheet('queue')} />}
        </div>
      )}
      <RailSheet open={sheet === 'waitlist'} title="Waitlist" onClose={() => setSheet(null)}
        meta={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--badge-gold)' }}>{waitlistCount} waiting</span>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{waitlistRows}</div>
      </RailSheet>
      <RailSheet open={sheet === 'queue'} title="Service queue" onClose={() => setSheet(null)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{queueRows}</div>
      </RailSheet>

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
