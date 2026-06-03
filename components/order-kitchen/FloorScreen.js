// components/order-kitchen/FloorScreen.js
//
// Direct 1:1 port of the Claude Design prototype's floor.jsx.
// Same JSX structure, same className strings, same helper logic.
// Only changes: window.I / window.rupee → ES imports;
// window.ZONES → props.zones (passed from the page).

import React, { useRef } from 'react';
import { I, rupee } from './Icons';

function statusWord(s) {
  return { free: 'Free', seated: 'Seated', sent: 'Cooking', ready: 'Ready' }[s] || s;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function FloorScreen({ tables, zones, zone, setZone, onPick, totals, tweakShape = 'auto', waiter }) {
  const segRef = useRef(null);
  const zoneTables = tables.filter(t => t.zone === zone);

  const idx = Math.max(0, zones.indexOf(zone));
  const pillStyle = zones.length > 0 ? {
    transform: `translateX(${idx * 100}%)`,
    width: `calc(${100 / zones.length}% - ${8 - 8 / zones.length}px)`,
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
            textTransform: 'uppercase', color: 'rgba(239,235,228,0.38)',
          }}>{greeting()} · Floor</div>
          <h1 style={{
            fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
            fontWeight: 700, fontSize: 27, letterSpacing: '-0.02em',
            margin: '2px 0 0', color: '#EFEBE4', lineHeight: 1.1,
          }}>Tables</h1>
        </div>
        <button style={{
          width: 40, height: 40, borderRadius: 13, flexShrink: 0,
          background: '#221F1B', border: '1px solid rgba(196,168,109,0.13)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: '#EFEBE4', cursor: 'pointer', padding: 0,
        }}>
          <span style={{ width: 18, height: 18, display: 'inline-flex' }}>{I.bell}</span>
        </button>
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
        <span className="l"><span className="swatch" style={{ background: 'var(--st-sent)' }} />Order sent</span>
        <span className="l"><span className="swatch" style={{ background: 'var(--st-ready)' }} />Ready to pay</span>
      </div>

      <div className="scroll">
        <div className="floor">
          {zoneTables.map(t => {
            const shape = tweakShape === 'auto' ? t.shape : tweakShape;
            const total = totals[t.id] || 0;
            const isLong = shape === 'long' || t.shape === 'long';
            const cls = `tabletok shape-${isLong ? 'long' : shape} status-${t.status}`;
            return (
              <button key={t.id} className={cls} onClick={() => onPick(t)}>
                <span className="tdot" />
                {isLong ? (
                  <>
                    <div className="tlong-l">
                      <span className="tnum">{t.id}</span>
                      <span className="tseat">{I.user}{t.occupied}/{t.seats}</span>
                    </div>
                    <div className="tlong-r">
                      {total > 0 && <span className="ttotal">{rupee(total)}</span>}
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '.1em', color: 'var(--tx-3)', textTransform: 'uppercase', marginTop: '3px' }}>{statusWord(t.status)}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="tnum">{t.id}</span>
                    <span className="tseat">{t.occupied ? `${t.occupied}/${t.seats}` : `${t.seats} seats`}</span>
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
