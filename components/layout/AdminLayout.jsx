// components/layout/AdminLayout.jsx
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import { useEffect } from 'react';

const navItems = [
  { href: '/admin',              label: 'Overview',     icon: '⊞' },
  { href: '/admin/requests',     label: 'Requests',     icon: '📋' },
  { href: '/admin/analytics',    label: 'Analytics',    icon: '📊' },
  { href: '/admin/qrcode',       label: 'QR Code',      icon: '⬡' },
  { href: '/admin/offers',       label: 'Offers',       icon: '🎁' },
  { href: '/admin/subscription', label: 'Subscription', icon: '💳' },
];

export default function AdminLayout({ children }) {
  const { user, userData, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/admin/login');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isActive = (href) =>
    href === '/admin'
      ? router.pathname === '/admin'
      : router.pathname.startsWith(href);

  return (
    <div className="min-h-screen bg-bg-base font-body text-text-primary flex">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-bg-border bg-bg-surface flex flex-col fixed inset-y-0 left-0 z-20">
        <div className="px-5 py-5 border-b border-bg-border">
          <Link href="/" className="font-display font-bold text-base">
            Advert <span className="gradient-text">Radical</span>
          </Link>
          <div className="text-xs text-text-muted mt-0.5">Restaurant Portal</div>
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
            <div className="text-xs font-medium text-text-primary truncate">
              {userData?.restaurantName || userData?.email || user.email}
            </div>
            <div className="text-xs text-text-muted">Restaurant Admin</div>
          </div>
          <button
            onClick={signOut}
            className="w-full px-3 py-2 rounded-lg text-xs text-text-secondary hover:text-red-400 hover:bg-red-400/10 transition-all text-left"
          >
            Sign out →
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-56 min-h-screen overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
