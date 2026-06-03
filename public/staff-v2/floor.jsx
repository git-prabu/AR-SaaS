/* Floor screen — table map by zone, status colours, running totals */

function FloorScreen({ tables, zone, setZone, onPick, totals, tweakShape, waiter }) {
  const zones = window.ZONES;
  const segRef = React.useRef(null);
  const zoneTables = tables.filter(t => t.zone === zone);

  const idx = zones.indexOf(zone);
  const pillStyle = { transform: `translateX(${idx * 100}%)`, width: `calc(${100/zones.length}% - ${8 - 8/zones.length}px)` };

  return (
    <div className="screen screen-enter">
      <div className="apphead">
        <div className="apphead-row">
          <div className="whoami" style={{ flex: 1 }}>
            <div className="avatar">{waiter[0]}</div>
            <div>
              <div className="eyebrow">{greeting()} · Floor</div>
              <h1 className="h-screen">Tables</h1>
            </div>
          </div>
          <button className="iconbtn"><span style={{position:'relative'}}>{window.I.bell}</span></button>
        </div>
      </div>

      {/* zone segmented control */}
      <div className="segwrap">
        <div className="seg" ref={segRef}>
          <div className="seg-pill" style={pillStyle}></div>
          {zones.map(z => (
            <button key={z} className={z === zone ? "on" : ""} onClick={() => setZone(z)}><span>{z}</span></button>
          ))}
        </div>
      </div>

      {/* legend */}
      <div className="legend">
        <span className="l"><span className="swatch" style={{background:'var(--st-free)'}}></span>Free</span>
        <span className="l"><span className="swatch" style={{background:'var(--st-seated)'}}></span>Seated</span>
        <span className="l"><span className="swatch" style={{background:'var(--st-sent)'}}></span>Order sent</span>
        <span className="l"><span className="swatch" style={{background:'var(--st-ready)'}}></span>Ready to pay</span>
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
                <span className="tdot"></span>
                {isLong ? (
                  <>
                    <div className="tlong-l">
                      <span className="tnum">{t.id}</span>
                      <span className="tseat">{window.I.user}{t.occupied}/{t.seats}</span>
                    </div>
                    <div className="tlong-r">
                      {total > 0 && <span className="ttotal">{window.rupee(total)}</span>}
                      <div style={{fontFamily:'var(--font-mono)',fontSize:'9px',letterSpacing:'.1em',color:'var(--tx-3)',textTransform:'uppercase',marginTop:'3px'}}>{statusWord(t.status)}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="tnum">{t.id}</span>
                    <span className="tseat">{t.occupied ? `${t.occupied}/${t.seats}` : `${t.seats} seats`}</span>
                    {total > 0 && <span className="ttotal">{window.rupee(total)}</span>}
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

function greeting() {
  const h = 11;
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
function statusWord(s) {
  return { free: "Free", seated: "Seated", sent: "Cooking", ready: "Ready" }[s] || s;
}

Object.assign(window, { FloorScreen });
