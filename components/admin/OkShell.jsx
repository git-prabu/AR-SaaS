// components/admin/OkShell.jsx
//
// Shared chrome for the redesigned "-v2" admin pages. Renders the dark
// ok-root theme with the full labelled sidebar (<OkSidebar> — every v2 page,
// grouped) + a workspace header (eyebrow + title + live clock + optional
// right-side controls). The active link is auto-detected from the route, so
// pages don't need to pass an `active` key (the prop is accepted but ignored
// for backwards-compatibility with existing call sites).
//
// PRESENTATIONAL ONLY — no auth. Each page runs its own useFeatureAccess
// gate and renders <OkShell> only once ready.
//
// Props:
//   eyebrow   — small mono line above the title
//   title     — the big heading
//   brand     — restaurant name (drives the logo + avatar initial)
//   headRight — optional JSX on the right of the header (toggles, filters…)
//   scroll    — when true (default) children scroll; false = page-managed scroll
//   children  — the workspace content.
import { useEffect, useState } from 'react';
import OkSidebar, { okClockIcon } from './OkSidebar';
import AdminBanners from './AdminBanners';

function fmtClock(d) {
  const h = d.getHours() % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = d.getHours() < 12 ? 'AM' : 'PM';
  return `${h}:${m} ${ampm}`;
}

export default function OkShell({ eyebrow, title, brand, headRight, scroll = true, children }) {
  const [clockNow, setClockNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setClockNow(new Date()), 30000); return () => clearInterval(id); }, []);

  return (
    <div className="ok-root">
      <div className="okv-shell">
        <OkSidebar brand={brand} />
        <main className="workspace">
          <AdminBanners />
          <div className="ws-head">
            <div className="ws-title">
              {eyebrow ? <div className="ws-eyebrow">{eyebrow}</div> : null}
              <h1 className="ws-h1">{title}</h1>
            </div>
            {headRight ? <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>{headRight}</div> : null}
            <div className="ws-clock" style={headRight ? { marginLeft: 14 } : undefined}>{okClockIcon}{fmtClock(clockNow)}</div>
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
