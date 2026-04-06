import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getFeedback } from '../../lib/db';
import toast from 'react-hot-toast';
import { ADMIN_STYLES as S } from '../../lib/utils';

function Stars({ count }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2, fontSize: 16 }}>
      {[1, 2, 3, 4, 5].map(s => (
        <span key={s} style={{ opacity: s <= count ? 1 : 0.2 }}>{s <= count ? '⭐' : '☆'}</span>
      ))}
    </span>
  );
}

function timeAgo(ts) {
  if (!ts) return '';
  const seconds = ts.seconds || ts._seconds;
  if (!seconds) return '';
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const d = new Date(seconds * 1000);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}

function formatDate(ts) {
  if (!ts) return '';
  const seconds = ts.seconds || ts._seconds;
  if (!seconds) return '';
  const d = new Date(seconds * 1000);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export default function AdminFeedback() {
  const { userData } = useAuth();
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all' | '5' | '4' | '3' | '2' | '1'

  const rid = userData?.restaurantId;

  const loadFeedback = () => {
    if (!rid) return;
    setLoading(true);
    setError(false);
    getFeedback(rid)
      .then(data => { setFeedback(data); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  };

  useEffect(() => { loadFeedback(); }, [rid]);

  // Stats
  const total = feedback.length;
  const avg = total ? (feedback.reduce((s, f) => s + (f.rating || 0), 0) / total).toFixed(1) : '0.0';
  const distribution = [5, 4, 3, 2, 1].map(r => ({
    rating: r,
    count: feedback.filter(f => f.rating === r).length,
  }));
  const maxCount = Math.max(...distribution.map(d => d.count), 1);

  const filtered = filter === 'all' ? feedback : feedback.filter(f => f.rating === Number(filter));

  return (
    <AdminLayout>
      <Head><title>Customer Feedback | Advert Radical</title></Head>
      <div style={{ padding: '32px 28px 60px', maxWidth: 900, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={S.h1}>Customer Feedback</h1>
            <div style={S.sub}>See what your customers are saying</div>
          </div>
          <button onClick={loadFeedback} disabled={loading}
            style={{ padding: '8px 18px', borderRadius: 10, border: '1.5px solid rgba(42,31,16,0.12)', background: '#fff', color: '#1E1B18', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'Inter,sans-serif', opacity: loading ? 0.5 : 1 }}>
            Refresh
          </button>
        </div>

        {/* Stats Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
          {/* Average Rating Card */}
          <div style={{ ...S.card, padding: '22px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 42, fontWeight: 800, fontFamily: 'Poppins,sans-serif', color: '#F79B3D', lineHeight: 1 }}>{avg}</div>
            <Stars count={Math.round(Number(avg))} />
            <div style={{ fontSize: 12, color: 'rgba(42,31,16,0.45)', marginTop: 6 }}>{total} review{total !== 1 ? 's' : ''} total</div>
          </div>

          {/* Distribution Card */}
          <div style={{ ...S.card, padding: '18px 22px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(42,31,16,0.45)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>Rating Breakdown</div>
            {distribution.map(d => (
              <div key={d.rating} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#1E1B18', width: 16, textAlign: 'right' }}>{d.rating}</span>
                <span style={{ fontSize: 12 }}>⭐</span>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(42,31,16,0.06)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 4, background: d.rating >= 4 ? '#5A9A78' : d.rating === 3 ? '#F79B3D' : '#E05A3A', width: `${(d.count / maxCount) * 100}%`, transition: 'width 0.3s' }} />
                </div>
                <span style={{ fontSize: 12, color: 'rgba(42,31,16,0.5)', width: 28, textAlign: 'right' }}>{d.count}</span>
              </div>
            ))}
          </div>

          {/* Quick Stats */}
          <div style={{ ...S.card, padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(42,31,16,0.45)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Quick Stats</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(90,154,120,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>😊</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#1E1B18' }}>{feedback.filter(f => f.rating >= 4).length}</div>
                <div style={{ fontSize: 11, color: 'rgba(42,31,16,0.45)' }}>Happy customers (4-5 stars)</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(224,90,58,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>😟</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#1E1B18' }}>{feedback.filter(f => f.rating <= 2).length}</div>
                <div style={{ fontSize: 11, color: 'rgba(42,31,16,0.45)' }}>Need attention (1-2 stars)</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(247,155,61,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>💬</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#1E1B18' }}>{feedback.filter(f => f.comment && f.comment.trim()).length}</div>
                <div style={{ fontSize: 11, color: 'rgba(42,31,16,0.45)' }}>With comments</div>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {['all', '5', '4', '3', '2', '1'].map(f => {
            const isOn = filter === f;
            const label = f === 'all' ? `All (${total})` : `${'⭐'.repeat(Number(f))} (${distribution.find(d => d.rating === Number(f))?.count || 0})`;
            return (
              <button key={f} onClick={() => setFilter(f)}
                style={{
                  padding: '7px 14px', borderRadius: 10, border: 'none', fontSize: 12, fontWeight: 600,
                  background: isOn ? '#1E1B18' : 'rgba(42,31,16,0.06)',
                  color: isOn ? '#FFF5E8' : 'rgba(42,31,16,0.55)',
                  cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'Inter,sans-serif',
                }}>
                {label}
              </button>
            );
          })}
        </div>

        {/* Feedback List */}
        {error ? (
          <div style={{ ...S.card, padding: '60px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 17, color: '#1E1B18', marginBottom: 6 }}>
              Failed to load feedback
            </div>
            <div style={{ fontSize: 13, color: 'rgba(42,31,16,0.45)', maxWidth: 280, margin: '0 auto 16px' }}>
              Something went wrong. Please try again.
            </div>
            <button onClick={loadFeedback}
              style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: '#F79B3D', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
              Retry
            </button>
          </div>
        ) : loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'rgba(42,31,16,0.35)' }}>
            <div style={{ width: 32, height: 32, border: '3px solid #F79B3D', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            Loading feedback...
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ ...S.card, padding: '60px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{filter === 'all' ? '📝' : '🔍'}</div>
            <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 17, color: '#1E1B18', marginBottom: 6 }}>
              {filter === 'all' ? 'No feedback yet' : 'No reviews for this rating'}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(42,31,16,0.45)', maxWidth: 280, margin: '0 auto' }}>
              {filter === 'all' ? 'Customer reviews will appear here once they submit feedback after placing an order.' : 'Try a different filter to see more reviews.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map(f => (
              <div key={f.id} style={{ ...S.card, padding: '18px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: f.comment ? 10 : 0 }}>
                  <div>
                    <Stars count={f.rating} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                      {f.tableNumber && (
                        <span style={{ padding: '3px 9px', borderRadius: 6, background: 'rgba(90,154,120,0.1)', color: '#2D6B4E', fontSize: 11, fontWeight: 700 }}>
                          Table {f.tableNumber}
                        </span>
                      )}
                      {f.orderId && (
                        <span style={{ fontSize: 11, color: 'rgba(42,31,16,0.35)', fontFamily: 'monospace' }}>
                          #{f.orderId.slice(-6)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 11, color: 'rgba(42,31,16,0.4)', fontWeight: 500 }}>{timeAgo(f.createdAt)}</div>
                    <div style={{ fontSize: 10, color: 'rgba(42,31,16,0.3)', marginTop: 2 }}>{formatDate(f.createdAt)}</div>
                  </div>
                </div>
                {f.comment && f.comment.trim() && (
                  <div style={{
                    padding: '12px 16px', borderRadius: 12, marginBottom: (f.orderItems && f.orderItems.length > 0) ? 10 : 0,
                    background: f.rating >= 4 ? 'rgba(90,154,120,0.06)' : f.rating <= 2 ? 'rgba(224,90,58,0.06)' : 'rgba(247,155,61,0.06)',
                    border: `1px solid ${f.rating >= 4 ? 'rgba(90,154,120,0.12)' : f.rating <= 2 ? 'rgba(224,90,58,0.12)' : 'rgba(247,155,61,0.12)'}`,
                    fontSize: 14, color: '#1E1B18', lineHeight: 1.6, fontStyle: 'italic',
                  }}>
                    "{f.comment}"
                  </div>
                )}
                {/* Order items */}
                {f.orderItems && f.orderItems.length > 0 && (
                  <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(42,31,16,0.025)', border: '1px solid rgba(42,31,16,0.06)', marginTop: (!f.comment || !f.comment.trim()) ? 10 : 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(42,31,16,0.4)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>🛒 Order</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {f.orderItems.map((item, i) => (
                        <span key={i} style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(247,155,61,0.08)', border: '1px solid rgba(247,155,61,0.15)', fontSize: 12, fontWeight: 600, color: '#1E1B18' }}>
                          {item.name} {item.qty > 1 ? `×${item.qty}` : ''}
                        </span>
                      ))}
                    </div>
                    {f.orderTotal && (
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(42,31,16,0.5)', marginTop: 6 }}>Total: ₹{f.orderTotal}</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </AdminLayout>
  );
}
