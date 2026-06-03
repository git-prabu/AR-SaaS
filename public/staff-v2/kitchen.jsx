/* Kitchen ticket rail — what kitchen staff sees; bump tickets through states */

function KitchenScreen({ tickets, onBump, tick }) {
  const [filter, setFilter] = React.useState('all');
  const order = { new: 0, cooking: 1, ready: 2 };
  const counts = {
    all: tickets.length,
    new: tickets.filter(t => t.status === 'new').length,
    cooking: tickets.filter(t => t.status === 'cooking').length,
    ready: tickets.filter(t => t.status === 'ready').length,
  };
  const shown = tickets
    .filter(t => filter === 'all' || t.status === filter)
    .slice()
    .sort((a, b) => (order[a.status] - order[b.status]) || (b.ageMin - a.ageMin));

  const filters = [
    { id: 'all', label: 'All' },
    { id: 'new', label: 'New' },
    { id: 'cooking', label: 'Cooking' },
    { id: 'ready', label: 'Ready' },
  ];

  return (
    <div className="screen screen-enter">
      <div className="apphead">
        <div className="apphead-row">
          <div style={{ flex: 1 }}>
            <div className="eyebrow">Kitchen Display · live</div>
            <h1 className="h-screen">Kitchen rail</h1>
          </div>
          <button className="iconbtn gold">{window.I.chef}</button>
        </div>
      </div>

      <div className="kfilter">
        {filters.map(f => (
          <button key={f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>
            {f.label}<span className="kf-n">{counts[f.id]}</span>
          </button>
        ))}
      </div>

      <div className="scroll">
        {shown.length === 0 ? (
          <div className="empty"><span className="e-emoji">🍳</span><p>No tickets here. New orders land on the rail instantly.</p></div>
        ) : (
          <div className="ticketlist">
            {shown.map(t => <Ticket key={t.id} t={t} onBump={onBump} tick={tick} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function Ticket({ t, onBump, tick }) {
  const age = t.ageMin;
  const late = age >= 18 && t.status !== 'ready';
  const statusLabel = { new: 'New', cooking: 'Cooking', ready: 'Ready' }[t.status];
  return (
    <div className={"ticket status-" + t.status}>
      <div className="ticket-head">
        <div className="th-table"><b>{t.table.replace('T', '')}</b><small>Table</small></div>
        <div className="th-meta">
          <div className="th-id">{t.id}<span className={"kstatus " + t.status}>{statusLabel}</span></div>
          <div className="th-sub">{t.zone} · {t.waiter} · {t.placedAt}</div>
        </div>
        <span className={"kage" + (late ? " late" : "")}>{window.I.clock}&nbsp;{age}m</span>
      </div>

      <div className="ticket-items">
        {t.items.map((it, i) => (
          <div className="kitem" key={i}>
            <span className="ki-qty">{it.qty}×</span>
            <div style={{ flex: 1 }}>
              <span className="ki-name">{it.name}</span>
              <div className="ki-meta">
                <span className="ki-seat">{it.seat === 0 ? 'Table' : 'Seat ' + it.seat}</span>
                {it.spice > 0 && <window.SpicePips level={it.spice} />}
                {it.notes.map((n, j) => <span className="li-modtag" key={j}>{n}</span>)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="ticket-foot">
        {t.status === 'new' && <button className="bump start" onClick={() => onBump(t.id, 'cooking')}>{window.I.flame} Start cooking</button>}
        {t.status === 'cooking' && <button className="bump done" onClick={() => onBump(t.id, 'ready')}>{window.I.check} Mark ready</button>}
        {t.status === 'ready' && <button className="bump cleared" onClick={() => onBump(t.id, 'cleared')}>{window.I.check} Picked up · clear</button>}
      </div>
    </div>
  );
}

Object.assign(window, { KitchenScreen });
