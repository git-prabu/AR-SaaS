// components/admin/OkSidebar.jsx
//
// The full labelled navigation sidebar for the redesigned "-v2" admin pages.
// Lists every v2 page grouped into sections, auto-highlighting the current
// route. Self-contained: it injects its own scoped `.okv-*` styles, so any
// page can use it by wrapping content in `<div className="okv-shell">` and
// dropping <OkSidebar/> as the first child (the second child is the
// `<main className="workspace">`). Used by both OkShell and tables-v2.
//
// Theme tokens (var(--rail/gold/accent/…)) come from styles/order-kitchen.css.
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useRef, useEffect, useLayoutEffect } from 'react';
import useOkTheme from '../../hooks/useOkTheme';

// useLayoutEffect on the client (restore scroll BEFORE paint = no flicker),
// plain useEffect on the server to avoid the SSR warning.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
const NAV_SCROLL_KEY = 'ar_okv_nav_scroll';

const svg = (children) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const I = {
  home:    svg(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /></>),
  orders:  svg(<><path d="M8 3h8l1 4H7z" /><path d="M7 7v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7" /><path d="M10 11h4M10 15h4" /></>),
  kitchen: svg(<><path d="M7 14a4 4 0 1 1 1-7.9 4 4 0 0 1 8 0A4 4 0 1 1 17 14" /><path d="M7 14v5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-5" /></>),
  tables:  svg(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>),
  card:    svg(<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>),
  activity:svg(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>),
  plus:    svg(<path d="M12 5v14M5 12h14" />),
  chart:   svg(<><path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 16l4-5 3 3 4-6" /></>),
  clock:   svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  utensils:svg(<><path d="M6 3v7a2 2 0 0 0 4 0V3" /><path d="M8 10v11" /><path d="M16 3c-1.5 1-2 3-2 5s.5 4 2 5v8" /></>),
  tag:     svg(<><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10z" /><circle cx="7" cy="7" r="1.3" /></>),
  users:   svg(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9" /></>),
  star:    svg(<path d="M12 3l2.7 5.5 6 .9-4.3 4.2 1 6L12 16.8 6.6 19.6l1-6L3.3 9.4l6-.9z" />),
  calendar:svg(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" /></>),
  hourglass:svg(<path d="M6 2h12M6 22h12M7 2c0 5 5 5 5 10 0-5 5-5 5-10M7 22c0-5 5-5 5-10 0 5 5 5 5 10" />),
  megaphone:svg(<><path d="m3 11 15-4v10L3 13z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></>),
  receipt: svg(<><path d="M5 3v18l2-1 2 1 2-1 2 1 2-1 2 1V3l-2 1-2-1-2 1-2-1-2 1z" /><path d="M9 8h6M9 12h5" /></>),
  truck:   svg(<><rect x="1" y="6" width="13" height="11" rx="1" /><path d="M14 9h4l3 3v5h-7" /><circle cx="6" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" /></>),
  lock:    svg(<><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>),
  key:     svg(<><circle cx="8" cy="15" r="4" /><path d="M10.8 12.2 20 3M17 6l3 3" /></>),
  qr:      svg(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 14v7h-7" /></>),
  plug:    svg(<><path d="M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-10 0z" /><path d="M12 16v6" /></>),
  gear:    svg(<><circle cx="12" cy="12" r="3" /><path d="M19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 0 1-4 0v-.2A1.7 1.7 0 0 0 7 19.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 0 1 0-4h.2A1.7 1.7 0 0 0 4.8 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1H21a2 2 0 0 1 0 4h-.2a1.7 1.7 0 0 0-1.4 1z" /></>),
  globe:   svg(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" /></>),
  shield:  svg(<path d="M12 2 4 5v6c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V5z" />),
  help:    svg(<><circle cx="12" cy="12" r="9" /><path d="M9.6 9a2.4 2.4 0 1 1 3.3 2.2c-.8.4-1 .9-1 1.6" /><path d="M12 17h.01" /></>),
  crown:   svg(<path d="M3 7l4 5 5-7 5 7 4-5v11H3z" />),
  layout:  svg(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>),
  pulse:   svg(<path d="M3 12h4l2-7 4 14 2-7h6" />),
  sliders: svg(<><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></>),
};
export const okClockIcon = I.clock;

const NAV = [
  { section: 'Operations', items: [
    { label: 'Dashboard',  href: '/admin/index-v2',              icon: 'home' },
    { label: 'Floor',      href: '/admin/orders',                icon: 'layout' },
    { label: 'Waiter',     href: '/admin/orders?station=waiter', icon: 'activity' },
    { label: 'Kitchen',    href: '/admin/kitchen-new',           icon: 'kitchen' },
    { label: 'Tables',     href: '/admin/tables-v2',             icon: 'tables' },
    { label: 'Manage Layout', href: '/admin/manage-layout-v2',   icon: 'sliders' },
    { label: 'Payments',   href: '/admin/payments-v2',           icon: 'card' },
    { label: 'Activity',   href: '/admin/activity-log-v2',       icon: 'pulse' },
    { label: 'New Order',  href: '/admin/new-order-v2',          icon: 'plus' },
  ]},
  { section: 'Insights', items: [
    { label: 'Analytics',  href: '/admin/analytics-v2',    icon: 'chart' },
    { label: 'Reports',    href: '/admin/reports-v2',      icon: 'clock' },
  ]},
  { section: 'Catalog', items: [
    { label: 'Menu Items', href: '/admin/items-v2',        icon: 'utensils' },
    { label: 'Add Items',  href: '/admin/requests-v2',     icon: 'plus' },
    { label: 'Promotions', href: '/admin/promotions-v2',   icon: 'tag' },
  ]},
  { section: 'Guests', items: [
    { label: 'Customers',   href: '/admin/customers-v2',    icon: 'users' },
    { label: 'Feedback',    href: '/admin/feedback-v2',     icon: 'star' },
    { label: 'Reservations',href: '/admin/reservations-v2', icon: 'calendar' },
    { label: 'Waitlist',    href: '/admin/waitlist-v2',     icon: 'hourglass' },
    { label: 'Marketing',   href: '/admin/campaigns-v2',    icon: 'megaphone' },
  ]},
  { section: 'Purchases', items: [
    { label: 'Expenses',   href: '/admin/expenses-v2',     icon: 'receipt' },
    { label: 'Vendors',    href: '/admin/vendors-v2',      icon: 'truck' },
    { label: 'Day Close',  href: '/admin/day-close-v2',    icon: 'lock' },
  ]},
  { section: 'Team', items: [
    { label: 'Staff',      href: '/admin/staff-v2',        icon: 'users' },
    { label: 'Roles',      href: '/admin/roles-v2',        icon: 'key' },
  ]},
  { section: 'Setup', items: [
    { label: 'QR & Tables',     href: '/admin/qrcode-v2',        icon: 'qr' },
    { label: 'Payment Gateway', href: '/admin/gateway-v2',       icon: 'card' },
    { label: 'Petpooja POS',    href: '/admin/petpooja-pos-v2',  icon: 'plug' },
    { label: 'Business Info',   href: '/admin/business-info-v2', icon: 'gear' },
    { label: 'Connect Google',  href: '/admin/google-v2',        icon: 'globe' },
    { label: 'Security',        href: '/admin/security-v2',      icon: 'shield' },
    { label: 'Help',            href: '/admin/help-v2',          icon: 'help' },
  ]},
  { section: 'Account', items: [
    { label: 'Subscription', href: '/admin/subscription-v2', icon: 'crown' },
  ]},
];

const OKV_CSS = `
.ok-root .okv-shell { display: grid; grid-template-columns: 224px 1fr; height: 100vh; background: var(--surface); }
.ok-root .okv-rail { background: var(--rail); border-right: 1px solid rgba(0,0,0,0.3); display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
.ok-root .okv-logo { display: flex; align-items: center; gap: 11px; padding: 16px 18px 10px; text-decoration: none; flex-shrink: 0; }
.ok-root .okv-logo b { width: 38px; height: 38px; border-radius: 11px; background: linear-gradient(150deg,#2A2722,#161310); border: 1px solid rgba(196,168,109,0.3); color: var(--gold); font-family: var(--font-display); font-weight: 800; font-size: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 6px 18px rgba(0,0,0,0.4); }
.ok-root .okv-logo .okv-wordmark { display: flex; flex-direction: column; line-height: 1; }
.ok-root .okv-logo .okv-wordmark strong { font-family: var(--font-display); font-weight: 700; font-size: 15px; color: #EFEBE4; letter-spacing: -0.01em; }
.ok-root .okv-logo .okv-wordmark small { font-family: var(--font-mono); font-size: 8px; letter-spacing: 0.2em; color: rgba(239,235,228,0.4); margin-top: 3px; }
.ok-root .okv-nav { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 12px 14px; }
.ok-root .okv-nav::-webkit-scrollbar { width: 7px; }
.ok-root .okv-nav::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.09); border-radius: 4px; }
.ok-root .okv-label { font-family: var(--font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(239,235,228,0.32); padding: 13px 10px 5px; }
.ok-root .okv-link { display: flex; align-items: center; gap: 11px; padding: 8px 11px; border-radius: 10px; text-decoration: none; color: rgba(239,235,228,0.6); font-family: var(--font-display); font-weight: 600; font-size: 13px; transition: background .15s, color .15s; margin-bottom: 1px; }
.ok-root .okv-link:hover { background: rgba(255,255,255,0.05); color: #EFEBE4; }
.ok-root .okv-link.on { background: var(--accent); color: var(--accent-ink); box-shadow: 0 6px 16px var(--accent-glow); }
.ok-root .okv-ic { display: inline-flex; width: 18px; height: 18px; flex-shrink: 0; }
.ok-root .okv-ic svg { width: 18px; height: 18px; }
.ok-root .okv-tx { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ok-root .okv-foot { flex-shrink: 0; display: flex; align-items: center; gap: 10px; padding: 11px 16px; border-top: 1px solid rgba(255,255,255,0.06); }
.ok-root .okv-toggle { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 9px; border-radius: 10px; background: var(--card); border: 1px solid var(--line); color: var(--tx-2); font-family: var(--font-display); font-weight: 600; font-size: 12px; cursor: pointer; }
.ok-root .okv-toggle:hover { background: var(--card-2); }
.ok-root .okv-avatar { width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg,var(--gold),var(--saffron)); display: flex; align-items: center; justify-content: center; font-family: var(--font-display); font-weight: 700; font-size: 15px; color: #1A1815; flex-shrink: 0; box-shadow: 0 4px 12px rgba(0,0,0,0.4); }
@media (max-width: 900px) {
  .ok-root .okv-shell { grid-template-columns: 62px 1fr; }
  .ok-root .okv-tx, .ok-root .okv-label, .ok-root .okv-logo .okv-wordmark, .ok-root .okv-toggle .okv-tlbl { display: none; }
  .ok-root .okv-link { justify-content: center; padding: 11px 0; }
  .ok-root .okv-logo { justify-content: center; padding: 16px 0 10px; }
  .ok-root .okv-foot { flex-direction: column; }
  .ok-root .okv-toggle { width: 38px; flex: none; }
}
`;

export default function OkSidebar({ brand }) {
  const router = useRouter();
  const { toggle, isLight } = useOkTheme();
  const initial = (brand || 'HH').trim()[0]?.toUpperCase() || 'H';
  // Floor + Waiter both live on /admin/orders, split by the ?station query.
  const isOn = (it) => {
    const base = it.href.split('?')[0];
    if (base === '/admin/orders') {
      if (router.pathname !== '/admin/orders') return false;
      return it.href.includes('station=waiter') === (router.query.station === 'waiter');
    }
    return router.pathname === base || router.pathname.startsWith(base + '/');
  };

  // Preserve the nav's scroll position across route changes. Each page renders
  // its own OkShell → OkSidebar, so the sidebar remounts on every navigation
  // and would otherwise jump back to the top. Save on scroll, restore on mount.
  const navRef = useRef(null);
  useIsoLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;
    try {
      const s = sessionStorage.getItem(NAV_SCROLL_KEY);
      if (s != null) el.scrollTop = parseInt(s, 10) || 0;
    } catch { /* sessionStorage blocked — ignore */ }
    const save = () => { try { sessionStorage.setItem(NAV_SCROLL_KEY, String(el.scrollTop)); } catch {} };
    el.addEventListener('scroll', save, { passive: true });
    return () => el.removeEventListener('scroll', save);
  }, []);

  return (
    <>
      <style>{OKV_CSS}</style>
      <aside className="okv-rail">
        <Link href="/admin/index-v2" className="okv-logo" title="HaloHelm">
          <b>{initial}</b>
          <span className="okv-wordmark"><strong>HaloHelm</strong><small>NEW DESIGN · V2</small></span>
        </Link>
        <nav className="okv-nav" ref={navRef}>
          {NAV.map(group => (
            <div key={group.section}>
              <div className="okv-label">{group.section}</div>
              {group.items.map(it => (
                <Link key={it.href} href={it.href} className={`okv-link ${isOn(it) ? 'on' : ''}`} title={it.label}>
                  <span className="okv-ic">{I[it.icon]}</span>
                  <span className="okv-tx">{it.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="okv-foot">
          <button className="okv-toggle" onClick={toggle} title={isLight ? 'Switch to dark' : 'Switch to light'}>
            <span>{isLight ? '🌙' : '☀️'}</span><span className="okv-tlbl">{isLight ? 'Dark' : 'Light'}</span>
          </button>
          <div className="okv-avatar">{initial}</div>
        </div>
      </aside>
    </>
  );
}
