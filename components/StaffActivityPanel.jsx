// components/StaffActivityPanel.jsx
//
// Per-staff activity content (13 Jun 2026). Extracted from the
// /admin/staff-activity/[staffId] page so the SAME view renders in two
// places without duplication:
//   - the full page (deep-link / bookmark)             → embedded={false}
//   - the click-a-card overlay on /admin/staff          → embedded
//
// Self-fetches: one query for the whole team's staffActivity (last 14
// days, single-field `at` range index) + the roster if `member` isn't
// supplied. From it: this staff's tiles + timeline, daily sparkline
// buckets, and the team-share gauge (this staff's settled ₹ ÷ team
// settled ₹, 7d — an honest number, not an invented score).

import { useEffect, useMemo, useState } from 'react';
import {
  collection, query, where, orderBy, limit, getDocs, Timestamp,
} from 'firebase/firestore';
import { getStaffMembers } from '../lib/db';

const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER,
  cream: '#EDEDED', ink: '#1A1A1A', shell: '#FFFFFF',
  warning: '#C4A86D', warningDim: '#A08656',
  success: '#3F9E5A', danger: '#D9534F',
  mutedText: 'rgba(0,0,0,0.55)', faintText: 'rgba(0,0,0,0.38)',
  subtleBg: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.06)',
  cardShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
  forest: '#1A1A1A', forestDarker: '#2A2A2A',
  forestText: '#EAE7E3', forestTextMuted: 'rgba(234,231,227,0.55)',
  forestBorder: '1px solid rgba(255,255,255,0.06)',
};

const ACTION_META = {
  login:           { icon: '🔑', label: 'Logged in',             group: 'logins' },
  order_placed:    { icon: '🧾', label: 'Placed order',          group: 'orders' },
  order_cancelled: { icon: '⛔', label: 'Cancelled order',       group: 'orders', danger: true },
  order_served:    { icon: '✅', label: 'Closed order (served)',  group: 'orders' },
  item_ready:      { icon: '🍳', label: 'Marked item ready',     group: 'kitchen' },
  item_served:     { icon: '🍽', label: 'Marked item served',    group: 'kitchen' },
  payment_marked:  { icon: '💰', label: 'Marked payment',        group: 'money' },
  table_settled:   { icon: '🤝', label: 'Settled table',         group: 'money' },
  call_resolved:   { icon: '🔔', label: 'Resolved call',         group: 'orders' },
  bill_printed:    { icon: '🖨', label: 'Printed bill',          group: 'prints' },
  kot_printed:     { icon: '📠', label: 'Printed KOT',           group: 'prints' },
};
const FILTERS = [
  { id: 'all', label: 'All' }, { id: 'orders', label: 'Orders' },
  { id: 'money', label: 'Money' }, { id: 'kitchen', label: 'Kitchen' },
  { id: 'prints', label: 'Prints' }, { id: 'logins', label: 'Logins' },
];
const PERIODS = [
  { id: 'today', label: 'Today', days: 0 },
  { id: '7d', label: '7 days', days: 7 },
  { id: '14d', label: '14 days', days: 14 },
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

function Sparkline({ values, color }) {
  const W = 120, H = 36, P = 3;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => {
    const x = P + (i * (W - 2 * P)) / Math.max(values.length - 1, 1);
    const y = H - P - (v / max) * (H - 2 * P);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Gauge({ pct }) {
  const R = 64, CX = 80, CY = 78, SW = 13;
  const clamped = Math.max(0, Math.min(100, pct));
  const circ = Math.PI * R;
  return (
    <svg width="160" height="92" viewBox="0 0 160 92">
      <path d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
        fill="none" stroke="rgba(234,231,227,0.12)" strokeWidth={SW} strokeLinecap="round" />
      <path d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
        fill="none" stroke={A.warning} strokeWidth={SW} strokeLinecap="round"
        strokeDasharray={`${(clamped / 100) * circ} ${circ}`} />
    </svg>
  );
}

export default function StaffActivityPanel({ rid, scopedDb, staffId, member: memberProp, embedded = false, onClose }) {
  const [member, setMember] = useState(memberProp || null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('7d');
  const [filter, setFilter] = useState('all');

  useEffect(() => { if (memberProp) setMember(memberProp); }, [memberProp]);

  useEffect(() => {
    if (!rid || !staffId || !scopedDb) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const tasks = [getDocs(query(
          collection(scopedDb, 'restaurants', rid, 'staffActivity'),
          where('at', '>=', Timestamp.fromDate(new Date(Date.now() - 14 * 86400000))),
          orderBy('at', 'desc'),
          limit(1000),
        ))];
        if (!memberProp) tasks.push(getStaffMembers(rid, { db: scopedDb }));
        const [snap, roster] = await Promise.all(tasks);
        if (!alive) return;
        if (roster) setMember(roster.find(s => s.id === staffId) || null);
        setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.warn('staff activity load failed:', e?.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [rid, scopedDb, staffId, memberProp]);

  const computed = useMemo(() => {
    const mine = entries.filter(e => e.staffId === staffId);
    const days = PERIODS.find(p => p.id === period)?.days ?? 7;
    const start = days === 0
      ? (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })()
      : Date.now() - days * 86400000;
    const ms = (e) => (e.at?.toMillis ? e.at.toMillis() : 0);
    const inPeriod = mine.filter(e => ms(e) >= start);
    const count = (a) => inPeriod.filter(e => e.action === a).length;

    const tiles = {
      placed: count('order_placed'),
      settledAmt: inPeriod.filter(e => e.action === 'table_settled')
        .reduce((s, e) => s + (Number(e.amount) || 0), 0),
      bumped: count('item_ready') + count('item_served'),
      cancelled: count('order_cancelled'),
      payments: count('payment_marked') + count('table_settled'),
      calls: count('call_resolved'),
      prints: count('bill_printed') + count('kot_printed'),
      logins: count('login'),
    };

    const since7 = Date.now() - 7 * 86400000;
    const settled = (list) => list
      .filter(e => e.action === 'table_settled' && ms(e) >= since7)
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const myShare = settled(mine);
    const teamTotal = settled(entries);
    const sharePct = teamTotal > 0 ? Math.round((myShare / teamTotal) * 100) : null;

    const buckets = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const lo = d.getTime(), hi = lo + 86400000;
      const dayMine = mine.filter(e => ms(e) >= lo && ms(e) < hi);
      buckets.push({
        orders: dayMine.filter(e => e.action === 'order_placed').length,
        amount: dayMine.filter(e => e.action === 'table_settled')
          .reduce((s, e) => s + (Number(e.amount) || 0), 0),
        items: dayMine.filter(e => e.action === 'item_ready' || e.action === 'item_served').length,
      });
    }

    const timeline = inPeriod.filter(e =>
      filter === 'all' || ACTION_META[e.action]?.group === filter);

    return { tiles, sharePct, myShare, buckets, timeline };
  }, [entries, staffId, period, filter]);

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  })();

  const tile = (label, value, danger) => (
    <div style={{ background: A.shell, border: A.border, borderRadius: 12, padding: '14px 16px', boxShadow: A.cardShadow }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: A.faintText }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.4px', marginTop: 4, color: danger && value !== 0 && value !== '₹0' ? A.danger : A.ink }}>{value}</div>
    </div>
  );

  const sparkCard = (label, values, color, fmt) => (
    <div style={{ background: A.shell, border: A.border, borderRadius: 12, padding: '14px 16px', boxShadow: A.cardShadow, display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.faintText }}>{label}</div>
        <div style={{ fontSize: 12, color: A.mutedText, marginTop: 2 }}>{fmt(values.reduce((s, v) => s + v, 0))} · 14 days</div>
      </div>
      <Sparkline values={values} color={color} />
    </div>
  );

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: A.faintText, fontFamily: A.font }}>Loading activity…</div>;
  }
  if (!member) {
    return <div style={{ padding: 60, textAlign: 'center', color: A.faintText, fontFamily: A.font }}>Staff member not found.</div>;
  }

  return (
    <div style={{ fontFamily: A.font }}>
      {/* Hero row */}
      <div className="sap-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 14, marginBottom: 14 }}>
        <div style={{
          background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
          borderRadius: 14, padding: '22px 24px', border: A.forestBorder,
          display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
            background: member.photoUrl ? '#000' : `linear-gradient(135deg, ${A.warning}, #C2562B)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, fontWeight: 800, color: '#1A1815',
            boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
          }}>
            {member.photoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={member.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (member.name || '?')[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: A.warning }}>
              {greeting} · staff activity
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: A.forestText, letterSpacing: '-0.4px', marginTop: 3 }}>{member.name}</div>
            <div style={{ fontSize: 12.5, color: A.forestTextMuted, marginTop: 5, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <span>@{member.username}</span>
              <span style={{ textTransform: 'capitalize' }}>{member.role}</span>
              <span>{member.isActive === false ? '⛔ Disabled' : '🟢 Active'}</span>
            </div>
            <div style={{ fontSize: 11.5, color: A.forestTextMuted, marginTop: 6 }}>
              Last login: {member.lastLoginAt?.toDate
                ? member.lastLoginAt.toDate().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                : 'never'}
              {typeof member.loginCount === 'number' ? ` · ${member.loginCount} logins total` : ''}
            </div>
          </div>
        </div>

        <div style={{
          background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
          borderRadius: 14, padding: '18px 20px 14px', border: A.forestBorder,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          <div style={{ position: 'relative' }}>
            <Gauge pct={computed.sharePct ?? 0} />
            <div style={{ position: 'absolute', inset: '38px 0 0', textAlign: 'center' }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: A.forestText, lineHeight: 1 }}>
                {computed.sharePct == null ? '—' : computed.sharePct + '%'}
              </div>
              <div style={{ fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: A.forestTextMuted, marginTop: 3 }}>team share</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: A.forestTextMuted, textAlign: 'center', marginTop: 8, lineHeight: 1.5 }}>
            {computed.sharePct == null
              ? 'No settlements recorded by the team in the last 7 days'
              : <>of the team&apos;s settled amount (7 days) · {rupee(computed.myShare)}</>}
          </div>
        </div>
      </div>

      {/* Period chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {PERIODS.map(p => (
          <button key={p.id} onClick={() => setPeriod(p.id)} style={{
            padding: '7px 16px', borderRadius: 999, cursor: 'pointer', fontFamily: A.font,
            fontSize: 12.5, fontWeight: 600,
            border: period === p.id ? `1.5px solid ${A.warning}` : A.border,
            background: period === p.id ? 'rgba(196,168,109,0.12)' : A.shell,
            color: period === p.id ? A.warningDim : A.mutedText,
          }}>{p.label}</button>
        ))}
      </div>

      {/* Tiles */}
      <div className="sap-tile-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 8 }}>
        {tile('Orders placed', computed.tiles.placed)}
        {tile('Settled', rupee(computed.tiles.settledAmt))}
        {tile('Items bumped', computed.tiles.bumped)}
        {tile('Cancellations', computed.tiles.cancelled, true)}
      </div>
      <div style={{ fontSize: 11.5, color: A.faintText, marginBottom: 16 }}>
        {computed.tiles.payments} payments · {computed.tiles.calls} calls resolved · {computed.tiles.prints} prints · {computed.tiles.logins} logins
      </div>

      {/* Lower grid: timeline + sparklines */}
      <div className="sap-lower-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 14, alignItems: 'start' }}>
        <div style={{ background: A.shell, border: A.border, borderRadius: 14, boxShadow: A.cardShadow, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: A.warningDim }}>Recent activity</span>
            <div style={{ flex: 1 }} />
            {FILTERS.map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{
                padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: A.font,
                fontSize: 11, fontWeight: 600,
                border: filter === f.id ? `1.5px solid ${A.warning}` : A.border,
                background: filter === f.id ? 'rgba(196,168,109,0.12)' : A.shell,
                color: filter === f.id ? A.warningDim : A.mutedText,
              }}>{f.label}</button>
            ))}
          </div>
          {computed.timeline.length === 0 ? (
            <div style={{ padding: 28, textAlign: 'center', color: A.faintText, fontSize: 13, lineHeight: 1.6 }}>
              No activity in this period{filter !== 'all' ? ' for this filter' : ''}.<br />
              The trail records from 13 Jun 2026 onwards — it fills up as the team works.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 520, overflowY: 'auto' }}>
              {computed.timeline.map(e => {
                const meta = ACTION_META[e.action] || { icon: '•', label: e.action };
                return (
                  <div key={e.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '8px 10px', borderRadius: 9,
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
                      <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 700, color: A.success, fontFamily: "'JetBrains Mono', monospace" }}>{rupee(e.amount)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: A.warningDim, paddingLeft: 2 }}>Statistics</div>
          {sparkCard('Orders / day', computed.buckets.map(b => b.orders), A.warning, n => `${n} orders`)}
          {sparkCard('Settled / day', computed.buckets.map(b => b.amount), A.success, n => rupee(n))}
          {sparkCard('Items / day', computed.buckets.map(b => b.items), '#6E8EAF', n => `${n} items`)}
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 860px) {
          :global(.sap-hero-grid) { grid-template-columns: 1fr !important; }
          :global(.sap-lower-grid) { grid-template-columns: 1fr !important; }
          :global(.sap-tile-grid) { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </div>
  );
}
