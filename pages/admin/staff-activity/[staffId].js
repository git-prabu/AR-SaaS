// pages/admin/staff-activity/[staffId].js
//
// Per-staff ACTIVITY DASHBOARD (13 Jun 2026) — owner approved a
// reference design (employee dashboard: profile hero, stat tiles,
// score gauge, trend graphs, task list) and asked for the staff
// accountability trail in that shape. Replaces the slide-over drawer
// as the destination of the "Activity" button on /admin/staff.
//
// Layout (Aspire palette + the matte-black hero language the admin
// already uses on /admin/staff's TEAM card):
//   ┌ profile hero (avatar, role, last login) ┬ team-share gauge ┐
//   ├ period chips + 4 stat tiles (Orders · Settled ₹ · Items · Cancels)
//   ├ recent-activity timeline (filterable)   ┬ 3 daily sparklines ┘
//
// Data: ONE query — staffActivity for the whole team, last 14 days
// (at >= since, single-field index). From it we derive: this staff's
// tiles + timeline, daily sparkline buckets, and the share-of-team
// gauge (this staff's settled ₹ ÷ team settled ₹, 7d) — an honest
// "score" rather than an invented one.
//
// Access: owner + staff managers (useFeatureAccess('staff') — same
// trust tier as the roster + the trail's read rule).

import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import {
  collection, query, where, orderBy, limit, getDocs, Timestamp,
} from 'firebase/firestore';
import FeatureShell from '../../../components/layout/FeatureShell';
import { useFeatureAccess } from '../../../hooks/useFeatureAccess';
import { getStaffMembers } from '../../../lib/db';

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

// ── Tiny hand-rolled sparkline (no chart lib on this page) ─────────
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

// ── Semi-circle gauge (share of team settlements) ──────────────────
function Gauge({ pct }) {
  const R = 64, CX = 80, CY = 78, SW = 13;
  const clamped = Math.max(0, Math.min(100, pct));
  const circ = Math.PI * R; // semicircle length
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

export default function StaffActivityDashboard() {
  const router = useRouter();
  const staffId = typeof router.query.staffId === 'string' ? router.query.staffId : null;
  const { ready, isAdmin, rid, scopedDb, canView } = useFeatureAccess('staff');

  const [member, setMember] = useState(null);
  const [entries, setEntries] = useState([]);   // whole-team, last 14d
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('7d');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!ready || !canView || !rid || !staffId) return;
    let alive = true;
    (async () => {
      try {
        const [roster, snap] = await Promise.all([
          getStaffMembers(rid, { db: scopedDb }),
          getDocs(query(
            collection(scopedDb, 'restaurants', rid, 'staffActivity'),
            where('at', '>=', Timestamp.fromDate(new Date(Date.now() - 14 * 86400000))),
            orderBy('at', 'desc'),
            limit(1000),
          )),
        ]);
        if (!alive) return;
        setMember(roster.find(s => s.id === staffId) || null);
        setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.warn('staff dashboard load failed:', e?.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [ready, canView, rid, scopedDb, staffId]);

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

    // Team share (fixed 7d window, independent of the tile period):
    // this staff's settled ₹ ÷ everyone's settled ₹.
    const since7 = Date.now() - 7 * 86400000;
    const settled = (list) => list
      .filter(e => e.action === 'table_settled' && ms(e) >= since7)
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const myShare = settled(mine);
    const teamTotal = settled(entries);
    const sharePct = teamTotal > 0 ? Math.round((myShare / teamTotal) * 100) : null;

    // Daily sparkline buckets — last 14 calendar days, oldest → newest.
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
    <div style={{
      background: A.shell, border: A.border, borderRadius: 12,
      padding: '14px 16px', boxShadow: A.cardShadow,
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: A.faintText }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.4px', marginTop: 4, color: danger && value !== 0 && value !== '₹0' ? A.danger : A.ink }}>{value}</div>
    </div>
  );

  const sparkCard = (label, values, color, fmt) => (
    <div style={{
      background: A.shell, border: A.border, borderRadius: 12,
      padding: '14px 16px', boxShadow: A.cardShadow,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.faintText }}>{label}</div>
        <div style={{ fontSize: 12, color: A.mutedText, marginTop: 2 }}>
          {fmt(values.reduce((s, v) => s + v, 0))} · 14 days
        </div>
      </div>
      <Sparkline values={values} color={color} />
    </div>
  );

  return (
    <FeatureShell ready={ready} isAdmin={isAdmin} active="/admin/staff" permKey="staff" planAllowsFeature={true}>
      <Head><title>Staff Activity — HaloHelm</title></Head>
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font, padding: '24px 28px' }}>
        <div style={{ maxWidth: 1060, margin: '0 auto' }}>

          {/* Breadcrumb / back */}
          <button onClick={() => router.push('/admin/staff')} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            fontSize: 12.5, fontWeight: 600, color: A.mutedText, fontFamily: A.font,
            marginBottom: 14,
          }}>← Staff</button>

          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: A.faintText }}>Loading activity…</div>
          ) : !member ? (
            <div style={{ padding: 60, textAlign: 'center', color: A.faintText }}>
              Staff member not found. <button onClick={() => router.push('/admin/staff')} style={{ color: A.warningDim, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Back to Staff</button>
            </div>
          ) : (
            <>
              {/* ═══ Hero row: profile + gauge ═══ */}
              <div className="ar-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 14, marginBottom: 14 }}>
                {/* Profile card — matte-black signature */}
                <div style={{
                  background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
                  borderRadius: 14, padding: '22px 24px', border: A.forestBorder,
                  display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
                }}>
                  <div style={{
                    width: 72, height: 72, borderRadius: '50%', flexShrink: 0,
                    background: `linear-gradient(135deg, ${A.warning}, #C2562B)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 28, fontWeight: 800, color: '#1A1815',
                    boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
                  }}>{(member.name || '?')[0].toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: A.warning }}>
                      {greeting} · staff activity
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: A.forestText, letterSpacing: '-0.4px', marginTop: 3 }}>
                      {member.name}
                    </div>
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

                {/* Team-share gauge */}
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
                      : <>of the team's settled amount (7 days) · {rupee(computed.myShare)}</>}
                  </div>
                </div>
              </div>

              {/* ═══ Period chips ═══ */}
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

              {/* ═══ Stat tiles ═══ */}
              <div className="ar-tile-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 8 }}>
                {tile('Orders placed', computed.tiles.placed)}
                {tile('Settled', rupee(computed.tiles.settledAmt))}
                {tile('Items bumped', computed.tiles.bumped)}
                {tile('Cancellations', computed.tiles.cancelled, true)}
              </div>
              <div style={{ fontSize: 11.5, color: A.faintText, marginBottom: 16 }}>
                {computed.tiles.payments} payments · {computed.tiles.calls} calls resolved · {computed.tiles.prints} prints · {computed.tiles.logins} logins
              </div>

              {/* ═══ Lower grid: timeline + sparklines ═══ */}
              <div className="ar-lower-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 14, alignItems: 'start' }}>
                {/* Timeline */}
                <div style={{
                  background: A.shell, border: A.border, borderRadius: 14,
                  boxShadow: A.cardShadow, padding: '16px 18px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: A.warningDim }}>
                      Recent activity
                    </span>
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
                </div>

                {/* Statistics — sparkline cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: A.warningDim, paddingLeft: 2 }}>
                    Statistics
                  </div>
                  {sparkCard('Orders / day', computed.buckets.map(b => b.orders), A.warning, n => `${n} orders`)}
                  {sparkCard('Settled / day', computed.buckets.map(b => b.amount), A.success, n => rupee(n))}
                  {sparkCard('Items / day', computed.buckets.map(b => b.items), '#6E8EAF', n => `${n} items`)}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Responsive: stack the grids on phones */}
        <style jsx>{`
          @media (max-width: 860px) {
            :global(.ar-hero-grid) { grid-template-columns: 1fr !important; }
            :global(.ar-lower-grid) { grid-template-columns: 1fr !important; }
            :global(.ar-tile-grid-4) { grid-template-columns: 1fr 1fr !important; }
          }
        `}</style>
      </div>
    </FeatureShell>
  );
}

// FeatureShell is applied explicitly — skip the default layout.
StaffActivityDashboard.getLayout = (page) => page;
