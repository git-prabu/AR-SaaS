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
      <div className="apphead">
        <div className="apphead-row">
          <div className="whoami" style={{ flex: 1 }}>
            <div className="avatar">{(waiter || 'S')[0].toUpperCase()}</div>
            <div>
              <div className="eyebrow">{greeting()} · Floor</div>
              <h1 className="h-screen">Tables</h1>
            </div>
          </div>
          <button className="iconbtn"><span style={{ position: 'relative' }}>{I.bell}</span></button>
        </div>
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
