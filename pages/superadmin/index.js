// pages/superadmin/index.js
import Head from 'next/head';
import { useEffect, useState } from 'react';
import SuperAdminLayout from '../../components/layout/SuperAdminLayout';
import { getAllRestaurants, getAllPendingRequests } from '../../lib/db';
import Link from 'next/link';

export default function SuperAdminDashboard() {
  const [restaurants, setRestaurants] = useState([]);
  const [pending,     setPending]     = useState([]);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    Promise.all([getAllRestaurants(), getAllPendingRequests()]).then(([r, p]) => {
      setRestaurants(r);
      setPending(p);
      setLoading(false);
    });
  }, []);

  const active   = restaurants.filter(r => r.isActive).length;
  const inactive = restaurants.filter(r => !r.isActive).length;
  const totalItems = restaurants.reduce((s, r) => s + (r.itemsUsed || 0), 0);

  return (
    <SuperAdminLayout>
      <Head><title>Super Admin — Advert Radical</title></Head>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="font-display font-bold text-2xl">Platform Overview</h1>
          <p className="text-text-secondary text-sm mt-1">Advert Radical Admin Dashboard</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Restaurants', value: restaurants.length, icon: '🏪', color: '#FF6B35' },
            { label: 'Active',            value: active,             icon: '✅', color: '#22C55E' },
            { label: 'Pending Requests',  value: pending.length,    icon: '📋', color: '#FFB347' },
            { label: 'Total AR Items',    value: totalItems,         icon: '🥗', color: '#8B5CF6' },
          ].map(s => (
            <div key={s.label} className="bg-bg-surface border border-bg-border rounded-2xl p-5">
              <div className="text-2xl mb-2">{s.icon}</div>
              <div className="font-display font-bold text-2xl" style={{ color: s.color }}>{s.value}</div>
              <div className="text-text-muted text-xs mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Pending requests */}
        {pending.length > 0 && (
          <div className="bg-bg-surface border border-yellow-400/20 rounded-2xl p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-semibold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                Pending Requests ({pending.length})
              </h2>
              <Link href="/superadmin/requests" className="text-xs text-brand hover:underline">
                View all →
              </Link>
            </div>
            <div className="space-y-3">
              {pending.slice(0, 5).map(req => (
                <div key={req.id} className="flex items-center gap-3 py-2 border-b border-bg-border last:border-0">
                  <div className="w-8 h-8 rounded-lg overflow-hidden bg-bg-raised flex-shrink-0">
                    {req.imageURL
                      ? <img src={req.imageURL} alt={req.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-xs">🍽️</div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{req.name}</div>
                    <div className="text-xs text-text-muted">{req.restaurantName}</div>
                  </div>
                  <Link href="/superadmin/requests" className="text-xs text-brand hover:underline flex-shrink-0">
                    Review →
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent restaurants */}
        <div className="bg-bg-surface border border-bg-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold">Recent Restaurants</h2>
            <Link href="/superadmin/restaurants" className="text-xs text-brand hover:underline">
              View all →
            </Link>
          </div>
          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-10 skeleton" />)}</div>
          ) : (
            <div className="space-y-2">
              {restaurants.slice(0, 6).map(r => (
                <div key={r.id} className="flex items-center gap-3 py-2 border-b border-bg-border last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.name}</div>
                    <div className="text-xs text-text-muted">{r.subdomain}.advertradical.com</div>
                  </div>
                  <span className="text-xs text-text-muted capitalize">{r.plan}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs border ${
                    r.isActive
                      ? 'bg-green-400/10 text-green-400 border-green-400/20'
                      : 'bg-bg-raised text-text-muted border-bg-border'
                  }`}>
                    {r.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </SuperAdminLayout>
  );
}

SuperAdminDashboard.getLayout = (page) => page;
