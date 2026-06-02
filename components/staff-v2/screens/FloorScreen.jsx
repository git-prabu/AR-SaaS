// components/staff-v2/screens/FloorScreen.jsx
//
// Floor map — zones, table tiles, status colours, running totals.
// Phase B uses real getTables() but with simplified status (Phase C
// adds live subscriptions to table sessions + orders for status that
// updates in real time).

import { useMemo } from 'react';
import { I } from '../ui/icons';
import { rupee } from '../ui/primitives';

// Derive a shape from a table's capacity (the prototype hardcoded the
// shape; we don't have that field yet, so infer until Phase F adds a
// schema field).
function shapeFor(table) {
  if (table.shape) return table.shape;
  const cap = Number(table.capacity) || 4;
  if (cap >= 7) return 'long';
  if (cap <= 2) return 'round';
  return 'square';
}

// Existing HaloHelm doesn't carry a "zone" string on tables — we have
// area docs with names. Phase C will wire real area data; for now,
// group by areaId and read the area name from the parent if known,
// else fall back to "Floor".
function zonesFromTables(tables, areas) {
  const map = new Map();
  for (const t of tables) {
    const key = t.areaId || 'unassigned';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(t);
  }
  // Stable order matching area insertion order.
  const zones = [];
  if (areas && areas.length) {
    for (const a of areas) {
      if (map.has(a.id)) zones.push({ id: a.id, name: a.name || 'Area', tables: map.get(a.id) });
    }
  }
  if (map.has('unassigned')) zones.push({ id: 'unassigned', name: 'Floor', tables: map.get('unassigned') });
  return zones;
}

export default function FloorScreen({
  tables, areas, zone, setZone, onPick, totals, statuses,
  waiter,
}) {
  const zones = useMemo(() => zonesFromTables(tables, areas), [tables, areas]);

  // Default-select first zone if none picked yet
  const currentZoneId = zone || zones[0]?.id;
  const currentZone = zones.find(z => z.id === currentZoneId) || zones[0];
  const idx = zones.findIndex(z => z.id === currentZoneId);

  // Elastic segmented-pill position (matches prototype exactly).
  const pillStyle = zones.length > 0 ? {
    transform: `translateX(${idx * 100}%)`,
    width: `calc(${100 / zones.length}% - ${8 - 8 / zones.length}px)`,
  } : {};

  return (
    <div className="screen screen-enter">
      {/* apphead — inline styles override any CSS specificity quirks
          the user's device might hit (real-device debugging revealed
          the row was being broken open with text-block at top and
          avatar/bell at bottom). Plain DOM-level styles guarantee
          the row layout sticks. */}
      <div style={{ padding: '14px 20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%' }}>
          <div className="avatar" style={{ flexShrink: 0 }}>{(waiter || 'S')[0].toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow">{greeting()} · Floor</div>
            <h1 className="h-screen">Tables</h1>
          </div>
          <button className="iconbtn" aria-label="Notifications" style={{ flexShrink: 0 }}>{I.bell}</button>
        </div>
      </div>

      {/* Zone segmented control */}
      {zones.length > 1 && (
        <div className="segwrap">
          <div className="seg">
            <div className="seg-pill" style={pillStyle} />
            {zones.map(z => (
              <button key={z.id} className={z.id === currentZoneId ? 'on' : ''} onClick={() => setZone(z.id)}>
                <span>{z.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="legend">
        <span className="l"><span className="swatch" style={{ background: 'var(--st-free)' }} />Free</span>
        <span className="l"><span className="swatch" style={{ background: 'var(--st-seated)' }} />Seated</span>
        <span className="l"><span className="swatch" style={{ background: 'var(--st-sent)' }} />Order sent</span>
        <span className="l"><span className="swatch" style={{ background: 'var(--st-ready)' }} />Ready to pay</span>
      </div>

      <div className="scroll">
        <div className="floor">
          {(currentZone?.tables || []).map(t => {
            const shape = shapeFor(t);
            const isLong = shape === 'long';
            const status = statuses?.[t.id] || 'free';
            const total = totals?.[t.id] || 0;
            return (
              <button key={t.id} className={`tabletok shape-${isLong ? 'long' : shape} status-${status}`} onClick={() => onPick(t)}>
                <span className="tdot" />
                {isLong ? (
                  <>
                    <div className="tlong-l">
                      <span className="tnum">{t.label || t.id}</span>
                      <span className="tseat">{I.user}{t.capacity || '?'} seats</span>
                    </div>
                    <div className="tlong-r">
                      {total > 0 && <span className="ttotal">{rupee(total)}</span>}
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.1em', color: 'var(--tx-3)', textTransform: 'uppercase', marginTop: 3 }}>
                        {statusWord(status)}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="tnum">{t.label || t.id}</span>
                    <span className="tseat">{t.capacity || 4} seats</span>
                    {total > 0 && <span className="ttotal">{rupee(total)}</span>}
                  </>
                )}
              </button>
            );
          })}
          {(currentZone?.tables || []).length === 0 && (
            <div style={{ gridColumn: 'span 3', textAlign: 'center', padding: '40px 20px', color: 'var(--tx-3)' }}>
              <p style={{ fontSize: 13 }}>No tables in this area yet.</p>
              <p style={{ fontSize: 11, marginTop: 6 }}>Add tables from <code>/admin/tables</code> Manage tab.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function statusWord(s) {
  return { free: 'Free', seated: 'Seated', sent: 'Cooking', ready: 'Ready' }[s] || s;
}
