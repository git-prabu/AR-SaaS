// components/layout/SuperAdminLayout.jsx
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import { useEffect } from 'react';

const navItems = [
  { href: '/superadmin',              label: 'Overview',    icon: '⊞' },
  { href: '/superadmin/restaurants',  label: 'Restaurants', icon: '🏪' },
  { href: '/superadmin/requests',     label: 'Requests',    icon: '📋' },
  { href: '/superadmin/analytics',    label: 'Analytics',   icon: '📊' },
];

export default function SuperAdminLayout({ children }) {
  const { user, userData, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) { router.push('/superadmin/login'); return; }
      if (userData && userData.role !== 'superadmin') {
        router.push('/admin');
      }
    }
  }, [user, userData, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isActive = (href) =>
    href === '/superadmin'
      ? router.pathname === '/superadmin'
      : router.pathname.startsWith(href);

  return (
    <div className="min-h-screen bg-bg-base font-body text-text-primary flex">
      <aside className="w-56 flex-shrink-0 border-r border-bg-border bg-bg-surface flex flex-col fixed inset-y-0 left-0 z-20">
        <div className="px-5 py-5 border-b border-bg-border">
          <Link href="/" className="font-display font-bold text-base">
            Advert <span className="gradient-text">Radical</span>
          </Link>
          <div className="text-xs text-brand mt-0.5 font-medium">Super Admin</div>
        </div>

        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm mb-1 transition-all ${
                isActive(item.href)
                  ? 'bg-brand/10 text-brand font-medium border border-brand/20'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-raised'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-bg-border">
          <div className="px-3 py-2 mb-2">
            <div className="text-xs font-medium text-text-primary truncate">{user.email}</div>
            <div className="text-xs text-brand">Super Admin</div>
          </div>
          <button
            onClick={signOut}
            className="w-full px-3 py-2 rounded-lg text-xs text-text-secondary hover:text-red-400 hover:bg-red-400/10 transition-all text-left"
          >
            Sign out →
          </button>
        </div>
      </aside>

      <main className="flex-1 ml-56 min-h-screen overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
