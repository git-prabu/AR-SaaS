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
import { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { staffAuth } from '../../lib/firebaseAuth';
import { navSections, NavIcon } from './AdminLayout';
import { PERMISSION_ROUTES, STAFF_ENABLED } from '../../lib/permissions';
import { readStaffSession } from '../../lib/staffSession';

const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
// route → permission key (PERMISSION_ROUTES is perm → route).
const ROUTE_PERM = Object.fromEntries(Object.entries(PERMISSION_ROUTES).map(([k, v]) => [v, k]));

export default function StaffShell({ active, children }) {
  const router = useRouter();
  const [session, setSession] = useState(null);
  useEffect(() => { setSession(readStaffSession()); }, []);

  const perms = Array.isArray(session?.perms) ? session.perms : [];
  const enabled = new Set(STAFF_ENABLED);

  const sections = navSections.map(s => ({
    label: s.label,
    items: s.items.filter(it => {
      const pk = ROUTE_PERM[it.href];
      return pk && enabled.has(pk) && perms.includes(pk);
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

  // Aspire palette (mirrors AdminLayout's sidebar).
  const A_BG = '#FFFFFF', A_PAGE = '#EDEDED', A_INK = '#1A1A1A';
  const A_MUTED = 'rgba(0,0,0,0.55)', A_FAINT = 'rgba(0,0,0,0.38)';
  const A_HOVER = 'rgba(0,0,0,0.04)', A_BORDER = 'rgba(0,0,0,0.06)', A_GOLD = '#C4A86D';

  return (
    <div style={{ minHeight: '100vh', background: A_PAGE, fontFamily: INTER, color: A_INK, display: 'flex' }}>
      <style>{`
        .slnk{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:8px;font-family:${INTER};
          font-size:13.5px;font-weight:500;text-decoration:none;color:${A_MUTED};margin-bottom:2px;letter-spacing:-0.1px;
          transition:background .15s,color .15s;}
        .slnk:hover{background:${A_HOVER};color:${A_INK};}
        .slnk .nav-icon{flex-shrink:0;opacity:0.75;display:inline-flex;align-items:center;justify-content:center;}
        .slnk.on{background:${A_GOLD};color:#fff;font-weight:600;}
        .slnk.on .nav-icon{opacity:1;}
        @media(max-width:767px){
          .staff-shell-aside{position:static !important;width:100% !important;height:auto !important;flex-direction:row !important;overflow-x:auto;}
          .staff-shell-main{margin-left:0 !important;}
        }
      `}</style>

      <aside className="staff-shell-aside" style={{
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
                <Link key={item.href} href={toStaff(item.href)} className={`slnk${isActive(toStaff(item.href)) ? ' on' : ''}`}>
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
        {children}
      </main>
    </div>
  );
}

StaffShell.getLayout = (page) => page;
