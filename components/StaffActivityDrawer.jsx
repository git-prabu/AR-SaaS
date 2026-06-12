// components/StaffActivityDrawer.jsx
//
// Per-staff accountability view (12 Jun 2026 — owner request: "see
// what was done by them"). Slide-over panel opened from /admin/staff →
// a staff card's "Activity" button.
//
// Data: restaurants/{rid}/staffActivity — the append-only trail written
// by lib/db.js logStaffActivity + /api/staff/login. Initial load pulls
// the last 7 days (up to 500 entries — composite index staffId+at);
// "Load older" pages backwards 50 at a time beyond the window.
//
// What the owner sees (mirrors what Petpooja-class "user-wise" reports
// surface, per the 12 Jun research):
//   - stat tiles for the selected period (Today / 7 days): orders
//     placed, ₹ settled, items bumped, cancellations (red — the classic
//     fraud-watch number)
//   - a timeline of every action with timestamp, table, amount, detail
//   - login events, bill/KOT prints (reprint-watch), call resolutions

import { useEffect, useMemo, useState } from 'react';
import {
  collection, query, where, orderBy, limit, startAfter, getDocs, Timestamp,
} from 'firebase/firestore';

const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER,
  cream: '#EDEDED', ink: '#1A1A1A', shell: '#FFFFFF',
  warning: '#C4A86D', warningDim: '#A08656',
  success: '#3F9E5A', danger: '#D9534F',
  mutedText: 'rgba(0,0,0,0.55)', faintText: 'rgba(0,0,0,0.38)',
  subtleBg: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.06)',
};

// action → presentation. `money` rows show the amount badge;
// `danger` rows render red (cancellations — the fraud-watch signal).
const ACTION_META = {
  login:           { icon: '🔑', label: 'Logged in',            group: 'logins' },
  order_placed:    { icon: '🧾', label: 'Placed order',         group: 'orders', money: true },
  order_cancelled: { icon: '⛔', label: 'Cancelled order',      group: 'orders', danger: true },
  order_served:    { icon: '✅', label: 'Closed order (served)', group: 'orders' },
  item_ready:      { icon: '🍳', label: 'Marked item ready',    group: 'kitchen' },
  item_served:     { icon: '🍽', label: 'Marked item served',   group: 'kitchen' },
  payment_marked:  { icon: '💰', label: 'Marked payment',       group: 'money' },
  table_settled:   { icon: '🤝', label: 'Settled table',        group: 'money', money: true },
  call_resolved:   { icon: '🔔', label: 'Resolved call',        group: 'orders' },
  bill_printed:    { icon: '🖨', label: 'Printed bill',         group: 'prints' },
  kot_printed:     { icon: '📠', label: 'Printed KOT',          group: 'prints' },
};

const FILTERS = [
  { id: 'all',     label: 'All' },
  { id: 'orders',  label: 'Orders' },
  { id: 'money',   label: 'Money' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'prints',  label: 'Prints' },
  { id: 'logins',  label: 'Logins' },
];

const rupee = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');

function fmtWhen(ts) {
  const d = ts?.toDate ? ts.toDate() : null;
  if (!d) return '—';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = d >= today ? 'Today'
    : d >= new Date(today.getTime() - 86400000) ? 'Yesterday'
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return `${day}, ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function StaffActivityDrawer({ rid, scopedDb, staff, onClose }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [lastDoc, setLastDoc] = useState(null);   // pagination cursor
  const [exhausted, setExhausted] = useState(false);
  const [period, setPeriod] = useState('7d');     // 'today' | '7d'
  const [filter, setFilter] = useState('all');

  // Initial window: last 7 days, newest first.
  useEffect(() => {
    if (!rid || !staff?.id) return;
    let alive = true;
    (async () => {
      try {
        const since = Timestamp.fromDate(new Date(Date.now() - 7 * 86400000));
        const snap = await getDocs(query(
          collection(scopedDb, 'restaurants', rid, 'staffActivity'),
          where('staffId', '==', staff.id),
          where('at', '>=', since),
          orderBy('at', 'desc'),
          limit(500),
        ));
        if (!alive) return;
        setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLastDoc(snap.docs[snap.docs.length - 1] || null);
        setExhausted(snap.size < 500); // window not full → nothing newer left in it
      } catch (e) {
        console.warn('staffActivity load failed:', e?.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [rid, scopedDb, staff?.id]);

  // Page older history (beyond the 7-day window), 50 at a time.
  const loadOlder = async () => {
    if (loadingOlder) return;
    setLoadingOlder(true);
    try {
      const base = [
        collection(scopedDb, 'restaurants', rid, 'staffActivity'),
        where('staffId', '==', staff.id),
        orderBy('at', 'desc'),
      ];
      const q = lastDoc
        ? query(...base, startAfter(lastDoc), limit(50))
        : query(...base, limit(50));
      const snap = await getDocs(q);
      const fresh = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(e => !entries.some(x => x.id === e.id));
      setEntries(prev => [...prev, ...fresh]);
      setLastDoc(snap.docs[snap.docs.length - 1] || lastDoc);
      if (snap.size < 50) setExhausted(true);
    } catch (e) {
      console.warn('staffActivity older load failed:', e?.message);
    } finally {
      setLoadingOlder(false);
    }
  };

  // Period-scoped stats + filtered timeline.
  const { stats, visible } = useMemo(() => {
    const start = period === 'today'
      ? (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })()
      : Date.now() - 7 * 86400000;
    const inPeriod = entries.filter(e => {
      const t = e.at?.toMillis ? e.at.toMillis() : 0;
      return t >= start;
    });
    const count = (a) => inPeriod.filter(e => e.action === a).length;
    const s = {
      placed: count('order_placed'),
      cancelled: count('order_cancelled'),
      settledAmt: inPeriod.filter(e => e.action === 'table_settled')
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
      bumped: count('item_ready') + count('item_served'),
      payments: count('payment_marked') + count('table_settled'),
      calls: count('call_resolved'),
      prints: count('bill_printed') + count('kot_printed'),
      logins: count('login'),
    };
    const vis = inPeriod.filter(e =>
      filter === 'all' || (ACTION_META[e.action]?.group === filter));
    return { stats: s, visible: vis };
  }, [entries, period, filter]);

  if (!staff) return null;

  const tile = (label, value, danger) => (
    <div style={{ background: A.subtleBg, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: A.faintText }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: danger && value !== 0 && value !== '₹0' ? A.danger : A.ink, marginTop: 2 }}>{value}</div>
    </div>
  );

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 60,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(460px, 100vw)', height: '100%',
        background: A.shell, fontFamily: A.font,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.18)',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: A.border, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warningDim }}>
                Staff activity
              </div>
              <div style={{ fontSize: 19, fontWeight: 700, color: A.ink, letterSpacing: '-0.3px', marginTop: 2 }}>
                {staff.name}
              </div>
              <div style={{ fontSize: 11.5, color: A.faintText, marginTop: 2 }}>
                Last login: {staff.lastLoginAt?.toDate
                  ? staff.lastLoginAt.toDate().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                  : 'never'}
                {typeof staff.loginCount === 'number' ? ` · ${staff.loginCount} total logins` : ''}
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" style={{
              width: 34, height: 34, borderRadius: 9, border: A.border,
              background: A.shell, color: A.mutedText, fontSize: 16, cursor: 'pointer',
            }}>✕</button>
          </div>

          {/* Period toggle */}
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            {[['today', 'Today'], ['7d', 'Last 7 days']].map(([id, label]) => (
              <button key={id} onClick={() => setPeriod(id)} style={{
                padding: '6px 14px', borderRadius: 999, cursor: 'pointer', fontFamily: A.font,
                fontSize: 12, fontWeight: 600,
                border: period === id ? `1.5px solid ${A.warning}` : A.border,
                background: period === id ? 'rgba(196,168,109,0.12)' : A.shell,
                color: period === id ? A.warningDim : A.mutedText,
              }}>{label}</button>
            ))}
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
            {tile('Orders', stats.placed)}
            {tile('Settled', rupee(stats.settledAmt))}
            {tile('Items', stats.bumped)}
            {tile('Cancels', stats.cancelled, true)}
          </div>
          <div style={{ fontSize: 11, color: A.faintText, marginTop: 8 }}>
            {stats.payments} payment{stats.payments === 1 ? '' : 's'} · {stats.calls} call{stats.calls === 1 ? '' : 's'} · {stats.prints} print{stats.prints === 1 ? '' : 's'} · {stats.logins} login{stats.logins === 1 ? '' : 's'}
          </div>

          {/* Filter chips */}
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {FILTERS.map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{
                padding: '4px 11px', borderRadius: 999, cursor: 'pointer', fontFamily: A.font,
                fontSize: 11.5, fontWeight: 600,
                border: filter === f.id ? `1.5px solid ${A.warning}` : A.border,
                background: filter === f.id ? 'rgba(196,168,109,0.12)' : A.shell,
                color: filter === f.id ? A.warningDim : A.mutedText,
              }}>{f.label}</button>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 24px' }}>
          {loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: A.faintText, fontSize: 13 }}>Loading activity…</div>
          ) : visible.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: A.faintText, fontSize: 13, lineHeight: 1.6 }}>
              No activity {period === 'today' ? 'today' : 'in the last 7 days'}
              {filter !== 'all' ? ' for this filter' : ''}.<br />
              Actions are recorded from today onwards — history builds up as the team works.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {visible.map(e => {
                const meta = ACTION_META[e.action] || { icon: '•', label: e.action };
                return (
                  <div key={e.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '9px 10px', borderRadius: 9,
                    background: meta.danger ? 'rgba(217,83,79,0.06)' : 'transparent',
                  }}>
                    <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>{meta.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: meta.danger ? A.danger : A.ink }}>
                        {meta.label}
                        {e.tableNumber ? <span style={{ color: A.mutedText, fontWeight: 500 }}> · Table {e.tableNumber}</span> : null}
                      </div>
                      <div style={{ fontSize: 11.5, color: A.faintText, marginTop: 1 }}>
                        {fmtWhen(e.at)}{e.detail ? ` · ${e.detail}` : ''}
                      </div>
                    </div>
                    {e.amount != null && e.amount !== 0 && (
                      <span style={{
                        flexShrink: 0, fontSize: 12.5, fontWeight: 700,
                        color: A.success, fontFamily: "'JetBrains Mono', monospace",
                      }}>{rupee(e.amount)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!loading && !exhausted && period === '7d' && filter === 'all' && (
            <button onClick={loadOlder} disabled={loadingOlder} style={{
              width: '100%', marginTop: 12, padding: '10px',
              borderRadius: 9, border: A.border, background: A.shell,
              color: A.mutedText, fontSize: 12.5, fontWeight: 600,
              cursor: loadingOlder ? 'wait' : 'pointer', fontFamily: A.font,
            }}>{loadingOlder ? 'Loading…' : 'Load older activity'}</button>
          )}
        </div>
      </div>
    </div>
  );
}
