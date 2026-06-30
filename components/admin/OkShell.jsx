// components/admin/OkShell.jsx
//
// Shared chrome for the redesigned "-v2" admin pages. Renders the dark
// `.pos` desktop shell from the Orders / Kitchen-Station look: a left nav
// rail + a workspace with a header (eyebrow + title + live clock + optional
// right-side controls). The .ok-root / .pos / .rail / .ws-* classes live in
// styles/order-kitchen.css, which is imported globally in pages/_app.js, so
// every page that uses this shell gets the same theme tokens + light/dark
// toggle (via useOkTheme, which flips data-theme on <body>).
//
// PRESENTATIONAL ONLY — it does no auth. Each page runs its own
// useFeatureAccess(permKey) gate and renders <OkShell> only once ready, so
// RBAC / plan-gating is unchanged from the original pages.
//
// Props:
//   active    — rail key to highlight: orders|kitchen|tables|analytics|reports|activity|menu
//   eyebrow   — small mono line above the title (e.g. "Good evening · The Spot")
//   title     — the big ws-h1 heading
//   brand     — restaurant name (drives the rail logo + avatar initials)
//   headRight — optional JSX rendered on the right of the header (toggles, filters…)
//   scroll    — when true (default) children are wrapped in a scrolling region;
//               pass false for pages that manage their own scroll (e.g. a
//               floor-layout with its own panes).
//   children  — the workspace content.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import useOkTheme from '../../hooks/useOkTheme';

// 24px stroke icons, currentColor so the rail's active/hover colours apply.
const Icon = {
  orders:  (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3h8l1 4H7l1-4Z"/><path d="M7 7v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7"/><path d="M10 11h4M10 15h4"/></svg>),
  kitchen: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M7 14a4 4 0 1 1 1-7.9 4 4 0 0 1 8 0A4 4 0 1 1 17 14"/><path d="M7 14v5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-5"/></svg>),
  tables:  (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>),
  analytics:(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 16l4-5 3 3 4-6"/></svg>),
  reports: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>),
  activity:(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0M4 2C2.8 3.7 2 5.7 2 8M22 8c0-2.3-.8-4.3-2-6"/></svg>),
  menu:    (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3v8a2 2 0 0 0 2 2h0V3M8 3v18"/><path d="M16 3c-1.5 1-2 3-2 5s.5 4 2 5v8"/></svg>),
  clock:   (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>),
};

// Rail order. Orders + Kitchen point at the existing already-themed pages;
// the rest point at their redesigned -v2 counterparts; Menu still links to
// the original (not yet redesigned).
const RAIL = [
  { key: 'orders',    label: 'Orders',   href: '/admin/orders',          icon: Icon.orders },
  { key: 'kitchen',   label: 'Kitchen',  href: '/admin/kitchen-new',     icon: Icon.kitchen },
  { key: 'tables',    label: 'Tables',   href: '/admin/tables-v2',       icon: Icon.tables },
  { key: 'analytics', label: 'Stats',    href: '/admin/analytics-v2',    icon: Icon.analytics },
  { key: 'reports',   label: 'Reports',  href: '/admin/reports-v2',      icon: Icon.reports },
  { key: 'activity',  label: 'Activity', href: '/admin/activity-log-v2', icon: Icon.activity },
  { key: 'menu',      label: 'Menu',     href: '/admin/items',           icon: Icon.menu },
];

function fmtClock(d) {
  const h = d.getHours() % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = d.getHours() < 12 ? 'AM' : 'PM';
  return `${h}:${m} ${ampm}`;
}

export default function OkShell({ active, eyebrow, title, brand, headRight, scroll = true, children }) {
  const { toggle, isLight } = useOkTheme();
  const [clockNow, setClockNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setClockNow(new Date()), 30000); return () => clearInterval(id); }, []);

  const initial = (brand || 'HH').trim()[0]?.toUpperCase() || 'H';

  return (
    <div className="ok-root">
      <div className="pos">
        <aside className="rail">
          <div className="rail-logo">
            <b>{initial}</b>
            <small>HALOHELM</small>
          </div>
          <div className="rail-nav">
            {RAIL.map(n => (
              <Link key={n.key} href={n.href} className={`rail-btn ${active === n.key ? 'on' : ''}`} title={n.label} style={{ textDecoration: 'none' }}>
                {n.icon}<span>{n.label}</span>
              </Link>
            ))}
          </div>
          <div className="rail-foot">
            <button className="rail-btn" onClick={toggle} title={isLight ? 'Switch to dark' : 'Switch to light'} style={{ height: 44 }}>
              <span style={{ fontSize: 18 }}>{isLight ? '🌙' : '☀️'}</span>
            </button>
            <div className="rail-avatar">{initial}</div>
          </div>
        </aside>

        <main className="workspace">
          <div className="ws-head">
            <div className="ws-title">
              {eyebrow ? <div className="ws-eyebrow">{eyebrow}</div> : null}
              <h1 className="ws-h1">{title}</h1>
            </div>
            {headRight ? <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>{headRight}</div> : null}
            <div className="ws-clock" style={headRight ? { marginLeft: 14 } : undefined}>{Icon.clock}{fmtClock(clockNow)}</div>
          </div>

          {scroll === false ? children : (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '2px 30px 34px' }}>
              {children}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
