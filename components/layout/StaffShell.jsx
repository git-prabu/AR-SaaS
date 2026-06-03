// components/layout/StaffShell.jsx
//
// Phase 8 (RBAC) Stage B — the chrome a non-owner staff member sees when
// they open an admin feature their role grants. Deliberately SEPARATE from
// AdminLayout (which stays owner-only and untouched) so the owner experience
// carries zero risk. The sidebar is filtered to the intersection of:
//   (a) the staffer's granted permissions (from their session/token), and
//   (b) STAFF_ENABLED — features whose pages have been converted to support
//       a staff login.
// So a staffer only ever sees links that actually work for them.
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect, useCallback } from 'react';
import { signOut } from 'firebase/auth';
import { staffAuth } from '../../lib/firebaseAuth';
import { doc, onSnapshot } from 'firebase/firestore';
import { staffDb } from '../../lib/firebase';
import { navSections, NavIcon } from './AdminLayout';
import MobilePullToRefresh from '../MobilePullToRefresh';
import PwaInstallPrompt from '../PwaInstallPrompt';
import { PERMISSION_ROUTES, STAFF_ENABLED } from '../../lib/permissions';
import { readStaffSession } from '../../lib/staffSession';
import { getSubscriptionStatus } from '../../lib/subscription';
import { canUseFeature } from '../../lib/plans';

const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
// route → permission key (PERMISSION_ROUTES is perm → route).
const ROUTE_PERM = Object.fromEntries(Object.entries(PERMISSION_ROUTES).map(([k, v]) => [v, k]));

// ── Phase C: staff-side subscription lock ──────────────────────────
// Mirrors the owner-side lock in AdminLayout but with staff-appropriate
// copy: a staffer can't pay, so the only action is "ask the owner".
function StaffSubscriptionLock() {
  return (
    <div style={{
      minHeight: 'calc(100vh - 40px)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px', background: '#EDEDED',
      fontFamily: INTER,
    }}>
      <div style={{
        maxWidth: 460, background: '#FFFFFF', borderRadius: 16, padding: '40px 36px',
        boxShadow: '0 4px 30px rgba(0,0,0,0.06)', textAlign: 'center',
      }}>
        <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 18 }}>🔒</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1A1A1A', marginBottom: 10, letterSpacing: '-0.4px' }}>
          Subscription expired
        </h1>
        <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.55)', lineHeight: 1.55 }}>
          This restaurant’s subscription ended more than 12 days ago, so the
          admin tools are paused. Please ask the owner / manager to renew —
          everything comes right back the moment payment goes through.
        </p>
      </div>
    </div>
  );
}

export default function StaffShell({ active, children }) {
  const router = useRouter();
  const [session, setSession] = useState(null);
  useEffect(() => { setSession(readStaffSession()); }, []);

  // Phase C — subscribe to the restaurant doc so the staff shell can lock
  // out the UI the moment the owner's subscription falls past grace. The
  // restaurant doc is publicly readable per firestore.rules, so staffDb
  // can pull it without elevated perms.
  const [restaurantDoc, setRestaurantDoc] = useState(null);
  useEffect(() => {
    if (!session?.restaurantId) { setRestaurantDoc(null); return; }
    const unsub = onSnapshot(doc(staffDb, 'restaurants', session.restaurantId), (snap) => {
      if (snap.exists()) setRestaurantDoc(snap.data());
    }, () => { /* fail open — staff still see the nav, lock just doesn't trigger */ });
    return unsub;
  }, [session?.restaurantId]);
  const isLocked = getSubscriptionStatus(restaurantDoc).state === 'expired';

  const perms = Array.isArray(session?.perms) ? session.perms : [];
  const enabled = new Set(STAFF_ENABLED);

  // Phase D — also gate by the restaurant's plan so a staff role granted
  // (e.g.) 'promotions' on a Starter restaurant doesn't see Promotions.
  // Fail-OPEN if the restaurant doc hasn't loaded yet to avoid hiding the
  // whole sidebar in the first 300 ms after mount.
  const planAllows = (pk) => !restaurantDoc || canUseFeature(restaurantDoc, pk);

  const sections = navSections.map(s => ({
    label: s.label,
    items: s.items.filter(it => {
      const pk = ROUTE_PERM[it.href];
      return pk && enabled.has(pk) && perms.includes(pk) && planAllows(pk);
    }),
  })).filter(s => s.items.length > 0);

  const logout = async () => {
    try { localStorage.removeItem('ar_staff_session'); } catch {}
    try { await signOut(staffAuth); } catch {}
    router.replace('/staff/login');
  };

  // Staff browse under clean /staff/* URLs (next.config rewrites serve the
  // matching /admin/* page). Map nav hrefs to /staff/* and match the active
  // item against the actual /staff URL (asPath), not the rewritten page path.
  const toStaff = (href) => (href || '').replace('/admin/', '/staff/');
  const activePath = (router.asPath || '').split('?')[0];
  const isActive = (href) => activePath === href || activePath.startsWith(href);

  // ─── Responsive sidebar (mirrors AdminLayout's pattern) ──────────────
  // Mobile experience BEFORE: <768px collapsed the sidebar into a static
  // horizontal-scrolling row at the top — staff had to swipe sideways
  // through every category. Replaced with: hamburger top-bar + slide-out
  // drawer + backdrop tap-to-close. Auto-closes on route change so a
  // tapped link doesn't leave the drawer open over the new page.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  useEffect(() => { if (isMobile) setSidebarOpen(false); }, [router.asPath, isMobile]);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // Aspire palette (mirrors AdminLayout's sidebar).
  const A_BG = '#FFFFFF', A_PAGE = '#EDEDED', A_INK = '#1A1A1A';
  const A_MUTED = 'rgba(0,0,0,0.55)', A_FAINT = 'rgba(0,0,0,0.38)';
  const A_HOVER = 'rgba(0,0,0,0.04)', A_BORDER = 'rgba(0,0,0,0.06)', A_GOLD = '#C4A86D';

  // ── Mobile bottom nav (UI Phase 2) ──────────────────────────────────
  // Most-used staff actions get a fixed bottom tab bar on mobile so
  // switching screens is one tap instead of "open drawer → scroll →
  // tap link". Priority list below — only slots the staffer actually
  // has permission for are shown. Always append a "More" slot that
  // re-opens the hamburger drawer for the long tail of features.
  //
  // Only renders on mobile (CSS-gated) AND only when the staffer has
  // at least one matching perm — otherwise the bar would be a single
  // "More" button which is just a worse hamburger.
  // ── Order & Kitchen station split (Phase A, 2026-06-03) ──
  // The 'orderKitchen' entry was replaced by two: 'orders' (waiter station,
  // now the highest-priority entry — most waiters use this all shift) and
  // 'kitchenStation' (new KDS). 'orders' previously meant the legacy
  // ledger; expandLegacyPerms() in lib/permissions.js grandfathers staff
  // who still have 'orderKitchen' in their session so this nav row matches.
  const BOTTOM_NAV_PRIORITY = [
    { perm: 'orders',         label: 'Orders',  href: '/staff/orders',        icon: 'M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z M6 17h12' },
    { perm: 'kitchenStation', label: 'Kitchen', href: '/staff/kitchen-new',   icon: 'M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z M6 17h12' },
    { perm: 'tables',         label: 'Tables',  href: '/staff/tables',        icon: 'M3 4h6v6H3zM11 4h6v6h-6zM3 12h6v6H3zM11 12h6v6h-6z' },
    { perm: 'newOrder',       label: 'New',     href: '/staff/new-order',     icon: 'M10 4v12M4 10h12' },
    { perm: 'payments',       label: 'Pay',     href: '/staff/payments',      icon: 'M3 6h14v8H3zM3 9h14' },
  ];
  const bottomTabs = BOTTOM_NAV_PRIORITY
    .filter(t => enabled.has(t.perm) && perms.includes(t.perm) && planAllows(t.perm));
  const showBottomNav = bottomTabs.length >= 1;

  return (
    <MobilePullToRefresh>
    <div style={{ minHeight: '100vh', background: A_PAGE, fontFamily: INTER, color: A_INK, display: 'flex' }}>
      <style>{`
        .slnk{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:8px;font-family:${INTER};
          font-size:13.5px;font-weight:500;text-decoration:none;color:${A_MUTED};margin-bottom:2px;letter-spacing:-0.1px;
          transition:background .15s,color .15s;}
        .slnk:hover{background:${A_HOVER};color:${A_INK};}
        .slnk .nav-icon{flex-shrink:0;opacity:0.75;display:inline-flex;align-items:center;justify-content:center;}
        .slnk.on{background:${A_GOLD};color:#fff;font-weight:600;}
        .slnk.on .nav-icon{opacity:1;}
        .staff-shell-aside{transition:transform 0.25s cubic-bezier(.4,0,.2,1);}
        .staff-mobile-topbar{display:none;}
        .staff-backdrop{display:none;}
        /* Mobile bottom nav — hidden on desktop. */
        .staff-bottom-nav{display:none;}
        @media(max-width:767px){
          .staff-shell-aside{transform:translateX(-100%);}
          .staff-shell-aside.open{transform:translateX(0);}
          .staff-shell-main{margin-left:0 !important;padding-top:56px !important;}
          .staff-mobile-topbar{
            display:flex;align-items:center;gap:12px;
            position:fixed;top:0;left:0;right:0;z-index:18;
            height:56px;padding:0 16px;
            background:${A_BG};
            border-bottom:1px solid ${A_BORDER};
          }
          .staff-backdrop{
            display:block;position:fixed;inset:0;z-index:19;
            background:rgba(0,0,0,0.35);
            backdrop-filter:blur(4px);
            -webkit-tap-highlight-color:transparent;
          }
          .slnk{padding:12px 14px;font-size:14px;}
          /* Bottom nav — fixed, full-width, safe-area-aware. */
          .staff-bottom-nav{
            display:flex;position:fixed;bottom:0;left:0;right:0;
            z-index:17;
            background:${A_BG};border-top:1px solid ${A_BORDER};
            padding:6px 4px calc(6px + env(safe-area-inset-bottom)) 4px;
            box-shadow:0 -4px 16px rgba(0,0,0,0.06);
          }
          .staff-bottom-nav .tab{
            flex:1;min-width:0;
            display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
            padding:6px 4px;border-radius:8px;
            border:none;background:transparent;color:${A_MUTED};
            font-family:${INTER};font-size:10.5px;font-weight:600;letter-spacing:0.02em;
            text-decoration:none;cursor:pointer;
            transition:color .15s, background .15s;
            -webkit-tap-highlight-color:transparent;
          }
          .staff-bottom-nav .tab:hover{background:${A_HOVER};color:${A_INK};}
          .staff-bottom-nav .tab.on{color:${A_INK};}
          .staff-bottom-nav .tab.on .tab-icon{color:${A_GOLD};}
          .staff-bottom-nav .tab-icon{width:22px;height:22px;color:${A_MUTED};transition:color .15s;}
          /* Reserve breathing room at the bottom of the main content so
             the last row isn't covered by the bottom nav. The bar's
             content area is ~56px + safe-area inset. */
          .staff-shell-main{padding-bottom:calc(64px + env(safe-area-inset-bottom)) !important;}
        }
      `}</style>

      {/* Mobile top bar — hamburger + brand. Visible only at <768px. */}
      <div className="staff-mobile-topbar">
        <button onClick={() => setSidebarOpen(o => !o)}
          style={{ background: 'none', border: 'none', color: A_INK, fontSize: 20, cursor: 'pointer', padding: '4px 6px', lineHeight: 1, minHeight: 44, minWidth: 44 }}
          aria-label="Toggle menu">
          ☰
        </button>
        <div style={{ fontFamily: INTER, fontWeight: 600, fontSize: 17, color: A_INK, letterSpacing: '-0.3px' }}>
          Halo<span style={{ color: A_GOLD, fontStyle: 'italic', fontWeight: 500 }}>Helm</span>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: A_MUTED, fontWeight: 600, textTransform: 'capitalize', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {session?.name || 'Staff'}
        </div>
      </div>

      {/* Backdrop — tap to close. Only renders on mobile when drawer open. */}
      {isMobile && sidebarOpen && (
        <div className="staff-backdrop" onClick={closeSidebar} />
      )}

      <aside className={`staff-shell-aside${sidebarOpen ? ' open' : ''}`} style={{
        width: 240, flexShrink: 0, background: A_BG, position: 'fixed', inset: '0 auto 0 0', zIndex: 20,
        borderRight: `1px solid ${A_BORDER}`, display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '24px 22px 16px' }}>
          <div style={{ fontWeight: 600, fontSize: 20, letterSpacing: '-0.4px', lineHeight: 1.1 }}>
            Halo<span style={{ color: A_GOLD, fontStyle: 'italic', fontWeight: 500 }}>Helm</span>
          </div>
          <div style={{ fontSize: 9, color: A_FAINT, marginTop: 6, fontWeight: 600, letterSpacing: '2.5px', textTransform: 'uppercase' }}>
            Staff Portal
          </div>
        </div>

        <nav style={{ flex: 1, padding: '4px 12px 12px', overflowY: 'auto' }}>
          {sections.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: 12.5, color: A_FAINT, lineHeight: 1.5 }}>
              No features are available to your role yet.
            </div>
          ) : sections.map(section => (
            <div key={section.label} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: A_FAINT, padding: '6px 14px 8px', textTransform: 'uppercase' }}>
                {section.label}
              </div>
              {section.items.map(item => (
                <Link key={item.href} href={toStaff(item.href)}
                  className={`slnk${isActive(toStaff(item.href)) ? ' on' : ''}`}
                  onClick={isMobile ? closeSidebar : undefined}>
                  <span className="nav-icon"><NavIcon name={item.icon} /></span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div style={{ padding: '12px 12px 18px', borderTop: `1px solid ${A_BORDER}` }}>
          <div style={{ padding: '12px 14px', marginBottom: 6, background: A_HOVER, borderRadius: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {session?.name || 'Staff'}
            </div>
            <div style={{ fontSize: 11, color: A_MUTED, marginTop: 3, fontWeight: 500, textTransform: 'capitalize' }}>
              {session?.restaurantName || 'Staff member'}
            </div>
          </div>
          <button onClick={logout}
            style={{ width: '100%', padding: '9px 14px', borderRadius: 8, border: 'none', background: 'transparent', fontSize: 12, fontFamily: INTER, color: A_MUTED, cursor: 'pointer', textAlign: 'left', fontWeight: 500 }}
            onMouseOver={e => { e.currentTarget.style.background = A_HOVER; e.currentTarget.style.color = A_INK; }}
            onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = A_MUTED; }}>
            Sign out →
          </button>
        </div>
      </aside>

      <main className="staff-shell-main" style={{ flex: 1, marginLeft: 240, minHeight: '100vh', overflowY: 'auto' }}>
        {isLocked ? <StaffSubscriptionLock /> : children}
        {/* Android/Chrome install prompt — shows automatically when the
            browser fires beforeinstallprompt. iOS Safari doesn't fire
            that event (a separate iOS Add-to-Home-Screen hint sits on
            /staff/login for that platform). */}
        <PwaInstallPrompt />
      </main>

      {/* Mobile bottom nav — fixed bar with up to 4 shortcuts + a
          "More" button that re-opens the hamburger drawer. CSS-gated
          to mobile widths; further hidden when the subscription lock
          is up (no point routing somewhere that's locked anyway) and
          when the staffer doesn't have any of the priority perms. */}
      {showBottomNav && !isLocked && (
        <nav className="staff-bottom-nav" aria-label="Quick navigation">
          {bottomTabs.map(t => {
            const on = isActive(t.href);
            return (
              <Link key={t.perm} href={t.href} className={`tab${on ? ' on' : ''}`}>
                <svg className="tab-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={t.icon} />
                </svg>
                <span>{t.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            className="tab"
            onClick={() => setSidebarOpen(o => !o)}
            aria-label="Open full menu"
          >
            <svg className="tab-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {/* three-dot ellipsis */}
              <circle cx="4" cy="10" r="1" />
              <circle cx="10" cy="10" r="1" />
              <circle cx="16" cy="10" r="1" />
            </svg>
            <span>More</span>
          </button>
        </nav>
      )}
    </div>
    </MobilePullToRefresh>
  );
}

StaffShell.getLayout = (page) => page;
