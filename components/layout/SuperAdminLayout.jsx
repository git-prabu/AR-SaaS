import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSuperAdminAuth } from '../../hooks/useAuth';
import { useEffect, useState } from 'react';

// ═══ Aspire palette — same tokens as AdminLayout / admin pages ═══
const A = {
  font: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  cream: '#EDEDED',
  ink: '#1A1A1A',
  shell: '#FFFFFF',
  shellDarker: '#FAFAF8',
  warning: '#C4A86D',
  warningDim: '#A08656',
  mutedText: 'rgba(0,0,0,0.55)',
  faintText: 'rgba(0,0,0,0.38)',
  subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)',
  borderStrong: '1px solid rgba(0,0,0,0.10)',
};

const navItems = [
  { href: '/superadmin',             label: 'Overview',       icon: 'chart' },
  { href: '/superadmin/restaurants', label: 'Restaurants',    icon: 'building' },
  { href: '/superadmin/requests',    label: 'Requests',       icon: 'inbox' },
  { href: '/superadmin/plans',       label: 'Plan Manager',   icon: 'crown' },
  { href: '/superadmin/email',       label: 'Email Settings', icon: 'mail' },
];

// Lucide-style SVG icons. Stroke = currentColor so they pick up nav text color.
const NavIcon = ({ name }) => {
  const props = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'chart':    return <svg {...props}><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/></svg>;
    case 'building': return <svg {...props}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h.01M15 9h.01M9 15h.01M15 15h.01"/></svg>;
    case 'inbox':    return <svg {...props}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/></svg>;
    case 'crown':    return <svg {...props}><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M5 20h14"/></svg>;
    case 'mail':     return <svg {...props}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>;
    default:         return <svg {...props}><circle cx="12" cy="12" r="3"/></svg>;
  }
};

export default function SuperAdminLayout({ children }) {
  const { user, userData, loading, signOut } = useSuperAdminAuth();
  const router = useRouter();

  // ─── Mobile sidebar state — mirrors AdminLayout pattern.
  // Sidebar slides in from the left on small screens; backdrop dismisses it.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => { if (isMobile) setSidebarOpen(false); }, [router.pathname, isMobile]);

  // Auth gate — redirect non-superadmins. Mirrors original behavior.
  useEffect(() => {
    if (!loading) {
      if (!user) { router.push('/superadmin/login'); return; }
      if (userData && userData.role !== 'superadmin') router.push('/admin');
    }
  }, [user, userData, loading, router]);

  if (loading || !user) return (
    <div style={{ minHeight: '100vh', background: A.cream, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: A.font }}>
      <div style={{ width: 32, height: 32, border: `3px solid ${A.warning}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const isActive = (href) => href === '/superadmin' ? router.pathname === '/superadmin' : router.pathname.startsWith(href);

  const SIDEBAR_W = 240;

  return (
    <div style={{ minHeight: '100vh', background: A.cream, fontFamily: A.font, color: A.ink, display: 'flex' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .sa-nlnk {
          display: flex; align-items: center; gap: 11px;
          padding: 9px 14px; border-radius: 9px;
          font-family: ${A.font}; font-size: 13px; font-weight: 500;
          text-decoration: none; color: ${A.mutedText};
          transition: all 0.15s; margin-bottom: 2px;
        }
        .sa-nlnk:hover { background: ${A.subtleBg}; color: ${A.ink}; }
        .sa-nlnk.on { background: ${A.subtleBg}; color: ${A.ink}; font-weight: 700; }
        .sa-nlnk.on .sa-iwrap { color: ${A.warning}; }
        .sa-iwrap {
          display: inline-flex; align-items: center; justify-content: center;
          width: 18px; height: 18px; color: ${A.faintText};
          transition: color 0.15s;
        }
        .sa-nlnk:hover .sa-iwrap { color: ${A.mutedText}; }
        .sa-mobile-topbar { display: none; }
        @media (max-width: 767px) {
          .sa-sidebar { transform: translateX(-100%); transition: transform 0.25s; }
          .sa-sidebar.open { transform: translateX(0); }
          .sa-main { margin-left: 0 !important; padding-top: 52px !important; }
          .sa-mobile-topbar { display: flex !important; }
          .sa-backdrop { display: block !important; }
        }
        .sa-backdrop {
          display: none; position: fixed; inset: 0;
          background: rgba(0,0,0,0.4); z-index: 15;
        }
      `}</style>

      {isMobile && sidebarOpen && (
        <div className="sa-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── White Aspire sidebar ── */}
      <aside className={`sa-sidebar${sidebarOpen ? ' open' : ''}`} style={{
        width: SIDEBAR_W, flexShrink: 0, background: A.shell,
        borderRight: A.border,
        display: 'flex', flexDirection: 'column',
        position: 'fixed', inset: '0 auto 0 0', zIndex: 20,
      }}>
        {/* Brand */}
        <div style={{ padding: '20px 22px 18px', borderBottom: A.border }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <div style={{ fontFamily: A.font, fontWeight: 700, fontSize: 18, color: A.ink, letterSpacing: '-0.3px' }}>
              Advert <span style={{ color: A.warning, fontStyle: 'italic' }}>Radical</span>
            </div>
          </Link>
          <div style={{ fontSize: 10, color: A.faintText, marginTop: 5, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase' }}>Super Admin</div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '14px 12px', overflowY: 'auto' }}>
          {navItems.map(item => (
            <Link key={item.href} href={item.href} className={`sa-nlnk${isActive(item.href) ? ' on' : ''}`}>
              <span className="sa-iwrap"><NavIcon name={item.icon} /></span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* User card + sign out */}
        <div style={{ padding: '12px', borderTop: A.border }}>
          <div style={{ padding: '10px 12px', marginBottom: 6, background: A.subtleBg, borderRadius: 9 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: A.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
            <div style={{ fontSize: 10, color: A.warningDim, marginTop: 3, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Super Admin</div>
          </div>
          <button onClick={signOut} style={{
            width: '100%', padding: '8px 12px', borderRadius: 9, border: 'none',
            background: 'transparent', fontSize: 12, color: A.mutedText, cursor: 'pointer',
            textAlign: 'left', fontFamily: A.font, fontWeight: 500,
          }}
            onMouseOver={e => { e.currentTarget.style.background = A.subtleBg; e.currentTarget.style.color = A.ink; }}
            onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = A.mutedText; }}>
            Sign out →
          </button>
        </div>
      </aside>

      {/* Mobile topbar — sidebar toggle button + brand wordmark.
          Hidden on desktop (where sidebar is always visible). */}
      <div className="sa-mobile-topbar" style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 18,
        height: 52, background: A.shell, borderBottom: A.border,
        alignItems: 'center', justifyContent: 'space-between', padding: '0 14px',
      }}>
        <button onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle menu" style={{
          width: 36, height: 36, borderRadius: 8, border: A.border,
          background: A.shell, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, color: A.ink, fontFamily: A.font,
        }}>☰</button>
        <div style={{ fontFamily: A.font, fontWeight: 700, fontSize: 14, color: A.ink }}>
          Advert <span style={{ color: A.warning, fontStyle: 'italic' }}>Radical</span>
        </div>
        <span style={{ width: 36 }} />
      </div>

      <main className="sa-main" style={{ flex: 1, marginLeft: SIDEBAR_W, minHeight: '100vh', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
