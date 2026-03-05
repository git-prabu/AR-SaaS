// pages/admin/analytics.js
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getAnalytics, getAllMenuItems } from '../../lib/db';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from 'recharts';

export default function AdminAnalytics() {
  const { userData }           = useAuth();
  const [analytics, setAnalytics] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [range, setRange]         = useState(30);

  const rid = userData?.restaurantId;

  useEffect(() => {
    if (!rid) return;
    Promise.all([getAnalytics(rid, range), getAllMenuItems(rid)]).then(([anal, items]) => {
      setAnalytics(anal);
      setMenuItems(items);
      setLoading(false);
    });
  }, [rid, range]);

  const totalVisits   = analytics.reduce((s, d) => s + (d.totalVisits   || 0), 0);
  const uniqueVisits  = analytics.reduce((s, d) => s + (d.uniqueVisitors || 0), 0);
  const repeatVisits  = analytics.reduce((s, d) => s + (d.repeatVisitors || 0), 0);

  const chartData = analytics.map(d => ({
    date:    d.date?.slice(5) || '', // MM-DD
    visits:  d.totalVisits   || 0,
    unique:  d.uniqueVisitors || 0,
    repeats: d.repeatVisitors || 0,
  }));

  // Sort items by views
  const topItems = [...menuItems]
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 8);

  const itemChartData = topItems.map(i => ({
    name:   i.name.length > 12 ? i.name.slice(0, 12) + '…' : i.name,
    views:  i.views   || 0,
    arViews: i.arViews || 0,
  }));

  const tooltipStyle = {
    backgroundColor: '#18181D',
    border: '1px solid #27272E',
    borderRadius: '10px',
    color: '#F2F2EE',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 12,
  };

  return (
    <AdminLayout>
      <Head><title>Analytics — Advert Radical</title></Head>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display font-bold text-2xl">Analytics</h1>
            <p className="text-text-secondary text-sm mt-1">Customer engagement and menu performance</p>
          </div>
          <div className="flex gap-2">
            {[7, 30, 90].map(d => (
              <button
                key={d}
                onClick={() => setRange(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  range === d
                    ? 'bg-brand text-white'
                    : 'bg-bg-surface border border-bg-border text-text-secondary hover:text-text-primary'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[1,2,3].map(i => <div key={i} className="h-28 skeleton" />)}
          </div>
        ) : (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <StatCard label="Total Visits"    value={totalVisits}  color="#FF6B35" icon="👁" />
              <StatCard label="Unique Visitors" value={uniqueVisits} color="#FFB347" icon="🧑" />
              <StatCard label="Repeat Visitors" value={repeatVisits} color="#8B5CF6" icon="🔄" />
            </div>

            {/* Visits chart */}
            <div className="bg-bg-surface border border-bg-border rounded-2xl p-6 mb-6">
              <h2 className="font-display font-semibold mb-5">Visits Over Time</h2>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="brandGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"   stopColor="#FF6B35" stopOpacity={0.3} />
                      <stop offset="95%"  stopColor="#FF6B35" stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272E" />
                  <XAxis dataKey="date" tick={{ fill: '#55555F', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#55555F', fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="visits"
                    stroke="#FF6B35"
                    strokeWidth={2}
                    fill="url(#brandGrad)"
                    name="Total Visits"
                  />
                  <Area
                    type="monotone"
                    dataKey="unique"
                    stroke="#FFB347"
                    strokeWidth={2}
                    fill="transparent"
                    name="Unique"
                    strokeDasharray="4 2"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Top items chart */}
            {itemChartData.length > 0 && (
              <div className="bg-bg-surface border border-bg-border rounded-2xl p-6">
                <h2 className="font-display font-semibold mb-5">Top Menu Items</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={itemChartData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272E" />
                    <XAxis dataKey="name" tick={{ fill: '#55555F', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#55555F', fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="views"   name="Item Views"    fill="#FF6B35" radius={[4,4,0,0]} />
                    <Bar dataKey="arViews" name="AR Launches"   fill="#FFB347" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>

                {/* Items table */}
                <div className="mt-5 space-y-2">
                  {topItems.map((item, i) => (
                    <div key={item.id} className="flex items-center gap-3 py-2 border-b border-bg-border last:border-0">
                      <span className="text-text-muted text-xs w-5 text-right">#{i+1}</span>
                      <div className="w-7 h-7 rounded-lg overflow-hidden bg-bg-raised flex-shrink-0">
                        {item.imageURL
                          ? <img src={item.imageURL} alt={item.name} className="w-full h-full object-cover" />
                          : <span className="w-full h-full flex items-center justify-center text-xs">🍽️</span>
                        }
                      </div>
                      <div className="flex-1 text-sm font-medium truncate">{item.name}</div>
                      <div className="text-xs text-text-secondary">{item.views || 0} views</div>
                      <div className="text-xs text-brand">{item.arViews || 0} AR</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}

AdminAnalytics.getLayout = (page) => page;

function StatCard({ label, value, color, icon }) {
  return (
    <div className="bg-bg-surface border border-bg-border rounded-2xl p-5">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xl">{icon}</span>
        <div className="w-2 h-2 rounded-full mt-1" style={{ background: color }} />
      </div>
      <div className="font-display font-bold text-3xl" style={{ color }}>{value}</div>
      <div className="text-text-muted text-xs mt-1">{label}</div>
    </div>
  );
}
