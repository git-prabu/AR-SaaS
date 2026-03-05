// pages/admin/index.js — Restaurant Admin Overview
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getRestaurantById, getMenuItems, getRequests, getAnalytics } from '../../lib/db';
import Link from 'next/link';

export default function AdminDashboard() {
  const { userData } = useAuth();
  const [restaurant, setRestaurant] = useState(null);
  const [menuItems,  setMenuItems]  = useState([]);
  const [requests,   setRequests]   = useState([]);
  const [analytics,  setAnalytics]  = useState([]);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    if (!userData?.restaurantId) return;
    const rid = userData.restaurantId;
    Promise.all([
      getRestaurantById(rid),
      getMenuItems(rid),
      getRequests(rid),
      getAnalytics(rid, 7),
    ]).then(([r, items, reqs, anal]) => {
      setRestaurant(r);
      setMenuItems(items);
      setRequests(reqs);
      setAnalytics(anal);
      setLoading(false);
    });
  }, [userData]);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  const totalVisits   = analytics.reduce((s, d) => s + (d.totalVisits || 0), 0);
  const pendingCount  = requests.filter(r => r.status === 'pending').length;
  const storageUsedPct = restaurant
    ? Math.round(((restaurant.storageUsedMB || 0) / (restaurant.maxStorageMB || 500)) * 100)
    : 0;
  const itemsPct = restaurant
    ? Math.round(((restaurant.itemsUsed || 0) / (restaurant.maxItems || 10)) * 100)
    : 0;

  const planColors = { basic: '#8E8E9A', pro: '#FF6B35', premium: '#FFB347' };
  const planColor  = planColors[restaurant?.plan] || '#8E8E9A';

  return (
    <AdminLayout>
      <Head><title>Dashboard — Advert Radical</title></Head>

      <div className="p-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="font-display font-bold text-2xl">
              {restaurant?.name || 'Your Restaurant'}
            </h1>
            <p className="text-text-secondary text-sm mt-1">
              {restaurant?.subdomain}.advertradical.com
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="px-3 py-1 rounded-full text-xs font-semibold capitalize"
              style={{ background: planColor + '20', color: planColor, border: `1px solid ${planColor}40` }}
            >
              {restaurant?.plan || 'basic'} plan
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              restaurant?.isActive
                ? 'bg-green-400/10 text-green-400 border border-green-400/20'
                : 'bg-red-400/10 text-red-400 border border-red-400/20'
            }`}>
              {restaurant?.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Visits (7d)',  value: totalVisits,          icon: '👁' },
            { label: 'Menu Items',   value: restaurant?.itemsUsed || menuItems.length, icon: '🍽️' },
            { label: 'Pending Requests', value: pendingCount, icon: '📋' },
            { label: 'Plan',         value: (restaurant?.plan || 'basic').toUpperCase(), icon: '💳' },
          ].map(s => (
            <div key={s.label} className="bg-bg-surface border border-bg-border rounded-2xl p-5">
              <div className="text-2xl mb-2">{s.icon}</div>
              <div className="font-display font-bold text-2xl">{s.value}</div>
              <div className="text-text-muted text-xs mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Usage bars */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <div className="bg-bg-surface border border-bg-border rounded-2xl p-5">
            <div className="flex justify-between text-sm mb-3">
              <span className="font-medium">Storage Used</span>
              <span className="text-text-secondary">
                {restaurant?.storageUsedMB || 0} / {restaurant?.maxStorageMB || 500} MB
              </span>
            </div>
            <div className="w-full h-2 bg-bg-raised rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${storageUsedPct}%`,
                  background: storageUsedPct > 80 ? '#EF4444' : 'linear-gradient(90deg, #FF6B35, #FFB347)',
                }}
              />
            </div>
            <div className="text-xs text-text-muted mt-1.5">{storageUsedPct}% used</div>
          </div>

          <div className="bg-bg-surface border border-bg-border rounded-2xl p-5">
            <div className="flex justify-between text-sm mb-3">
              <span className="font-medium">AR Items Used</span>
              <span className="text-text-secondary">
                {restaurant?.itemsUsed || 0} / {restaurant?.maxItems || 10} items
              </span>
            </div>
            <div className="w-full h-2 bg-bg-raised rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${itemsPct}%`,
                  background: itemsPct > 80 ? '#EF4444' : 'linear-gradient(90deg, #FF6B35, #FFB347)',
                }}
              />
            </div>
            <div className="text-xs text-text-muted mt-1.5">{itemsPct}% used</div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          <Link href="/admin/requests"
            className="bg-bg-surface border border-bg-border rounded-2xl p-5 hover:border-brand/30 transition-all card-lift block">
            <div className="text-2xl mb-2">➕</div>
            <div className="font-semibold text-sm">Add Menu Item</div>
            <div className="text-xs text-text-muted mt-1">Submit a new item request</div>
          </Link>
          <Link href="/admin/analytics"
            className="bg-bg-surface border border-bg-border rounded-2xl p-5 hover:border-brand/30 transition-all card-lift block">
            <div className="text-2xl mb-2">📈</div>
            <div className="font-semibold text-sm">View Analytics</div>
            <div className="text-xs text-text-muted mt-1">Visits, views, AR interactions</div>
          </Link>
          <Link href="/admin/qrcode"
            className="bg-bg-surface border border-bg-border rounded-2xl p-5 hover:border-brand/30 transition-all card-lift block">
            <div className="text-2xl mb-2">⬡</div>
            <div className="font-semibold text-sm">Download QR Code</div>
            <div className="text-xs text-text-muted mt-1">Print for tables and menus</div>
          </Link>
          <Link href="/admin/offers"
            className="bg-bg-surface border border-bg-border rounded-2xl p-5 hover:border-brand/30 transition-all card-lift block">
            <div className="text-2xl mb-2">🎁</div>
            <div className="font-semibold text-sm">Create Offer</div>
            <div className="text-xs text-text-muted mt-1">Add a promo banner</div>
          </Link>
        </div>

        {/* Recent requests */}
        {requests.length > 0 && (
          <div className="bg-bg-surface border border-bg-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-semibold">Recent Requests</h2>
              <Link href="/admin/requests" className="text-xs text-brand hover:underline">View all →</Link>
            </div>
            <div className="space-y-3">
              {requests.slice(0, 4).map(req => (
                <div key={req.id} className="flex items-center gap-4 py-2 border-b border-bg-border last:border-0">
                  <div className="w-8 h-8 rounded-lg overflow-hidden bg-bg-raised flex-shrink-0">
                    {req.imageURL
                      ? <img src={req.imageURL} alt={req.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-sm">🍽️</div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{req.name}</div>
                    <div className="text-xs text-text-muted">
                      {req.createdAt?.seconds
                        ? new Date(req.createdAt.seconds * 1000).toLocaleDateString()
                        : 'Just now'}
                    </div>
                  </div>
                  <StatusBadge status={req.status} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

AdminDashboard.getLayout = (page) => page;

function StatusBadge({ status }) {
  const styles = {
    pending:  'bg-yellow-400/10 text-yellow-400 border-yellow-400/20',
    approved: 'bg-green-400/10  text-green-400  border-green-400/20',
    rejected: 'bg-red-400/10    text-red-400    border-red-400/20',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles.pending} capitalize`}>
      {status}
    </span>
  );
}
