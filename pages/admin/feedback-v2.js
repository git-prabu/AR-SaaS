// pages/admin/feedback-v2.js
//
// ★ REDESIGN EXEMPLAR ★ — duplicate of /admin/feedback on the dark "ok-root"
// theme (via <OkShell>). Logic (stats, rating distribution, low-rated dish
// detection, filters, mark-read/note/delete, CSV export) copied verbatim from
// feedback.js — only the render is new. Original untouched.
import Head from 'next/head';
import { useEffect, useState, useMemo } from 'react';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import OkShell from '../../components/admin/OkShell';
import { exportRowsCsv } from '../../lib/csv';
import { getFeedback, markFeedbackRead, markAllFeedbackRead, updateFeedbackNote, deleteFeedback } from '../../lib/db';
import toast from 'react-hot-toast';

function Stars({ count, size = 14 }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(s => (
        <span key={s} style={{ fontSize: size, color: s <= count ? 'var(--gold)' : 'rgba(239,235,228,0.18)', lineHeight: 1 }}>★</span>
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
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  const d = new Date(seconds * 1000);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}
function formatDate(ts) {
  if (!ts) return '';
  const seconds = ts.seconds || ts._seconds;
  if (!seconds) return '';
  const d = new Date(seconds * 1000);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export default function FeedbackV2() {
  const { ready, isAdmin, rid, scopedDb, canView, userData, staffSession } = useFeatureAccess('feedback');
  const restaurantName = userData?.restaurantName || staffSession?.restaurantName || 'Your Restaurant';

  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [filter, setFilter] = useState('all');
  const [withCommentsOnly, setWithCommentsOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const [acting, setActing] = useState(null);
  const [bulkActing, setBulkActing] = useState(false);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const toggleExpanded = (id) => setExpandedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const load = () => {
    if (!rid || !canView) return;
    setLoading(true); setError(false);
    getFeedback(rid, { db: scopedDb })
      .then(data => { setFeedback(data || []); setLoading(false); })
      .catch(err => { console.error('getFeedback error:', err); setError(true); setLoading(false); });
  };
  useEffect(() => { load(); }, [rid, canView, scopedDb]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMarkRead = async (id) => {
    setActing(id);
    try { await markFeedbackRead(rid, id); setFeedback(prev => prev.map(f => f.id === id ? { ...f, isRead: true } : f)); }
    catch (e) { console.error('markFeedbackRead failed:', e); toast.error('Could not mark as read. Try again.'); }
    setActing(null);
  };
  const handleMarkAllRead = async () => {
    const unreadCount = feedback.filter(f => !f.isRead).length;
    if (unreadCount === 0) return;
    if (!confirm(`Mark ${unreadCount} unread review${unreadCount === 1 ? '' : 's'} as read?`)) return;
    setBulkActing(true);
    try { const n = await markAllFeedbackRead(rid); setFeedback(prev => prev.map(f => ({ ...f, isRead: true }))); toast.success(`Marked ${n} review${n === 1 ? '' : 's'} as read.`); }
    catch (e) { console.error('markAllFeedbackRead failed:', e); toast.error('Could not mark all as read. Try again.'); }
    setBulkActing(false);
  };
  const handleEditNote = async (id, existingNote) => {
    const next = window.prompt('Admin note (private — visible only to staff):', existingNote || '');
    if (next === null) return;
    const trimmed = next.trim();
    setActing(id);
    try { await updateFeedbackNote(rid, id, trimmed); setFeedback(prev => prev.map(f => f.id === id ? { ...f, adminNote: trimmed } : f)); toast.success(trimmed ? 'Note saved.' : 'Note cleared.'); }
    catch (e) { console.error('updateFeedbackNote failed:', e); toast.error('Could not save note. Try again.'); }
    setActing(null);
  };
  const handleDelete = async (id) => {
    if (!confirm('Delete this review? This cannot be undone.')) return;
    setActing(id);
    try { await deleteFeedback(rid, id); setFeedback(prev => prev.filter(f => f.id !== id)); toast.success('Review deleted.'); }
    catch (e) { console.error('deleteFeedback failed:', e); toast.error('Could not delete. Try again.'); }
    setActing(null);
  };

  const stats = useMemo(() => {
    const total = feedback.length;
    const sum = feedback.reduce((s, f) => s + (f.rating || 0), 0);
    const avg = total ? sum / total : 0;
    const happy = feedback.filter(f => (f.rating || 0) >= 4).length;
    const upset = feedback.filter(f => (f.rating || 0) > 0 && f.rating <= 2).length;
    const withComments = feedback.filter(f => f.comment && f.comment.trim()).length;
    const distribution = [5, 4, 3, 2, 1].map(r => ({ rating: r, count: feedback.filter(f => f.rating === r).length }));
    const maxCount = Math.max(...distribution.map(d => d.count), 1);
    return { total, avg, happy, upset, withComments, distribution, maxCount };
  }, [feedback]);

  const lowRatedDishes = useMemo(() => {
    const map = new Map();
    feedback.forEach(f => {
      if (!f.orderItems || !Array.isArray(f.orderItems) || !f.rating) return;
      f.orderItems.forEach(item => {
        if (!item?.name) return;
        const name = item.name;
        if (!map.has(name)) map.set(name, { name, ratings: [], lowCount: 0 });
        const entry = map.get(name);
        entry.ratings.push(f.rating);
        if (f.rating <= 2) entry.lowCount += 1;
      });
    });
    return [...map.values()].filter(d => d.lowCount >= 2)
      .map(d => ({ name: d.name, avgRating: (d.ratings.reduce((s, r) => s + r, 0) / d.ratings.length).toFixed(1), lowCount: d.lowCount, totalReviews: d.ratings.length }))
      .sort((a, b) => b.lowCount - a.lowCount || Number(a.avgRating) - Number(b.avgRating));
  }, [feedback]);

  const filtered = useMemo(() => {
    let result = feedback;
    if (filter !== 'all') result = result.filter(f => f.rating === Number(filter));
    if (withCommentsOnly) result = result.filter(f => f.comment && f.comment.trim());
    if (unreadOnly) result = result.filter(f => !f.isRead);
    const q = search.trim().toLowerCase();
    if (q) result = result.filter(f => {
      const c = (f.comment || '').toLowerCase();
      const t = String(f.tableNumber || '').toLowerCase();
      const items = (f.orderItems || []).map(i => (i?.name || '').toLowerCase()).join(' ');
      return c.includes(q) || t.includes(q) || items.includes(q);
    });
    return [...result].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [feedback, filter, withCommentsOnly, search, unreadOnly]);

  const exportCSV = () => {
    const fmt = (s) => { if (!s) return ['', '']; const d = new Date(s * 1000); return [d.toISOString().slice(0, 10), d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })]; };
    const rows = [
      ['Date', 'Time', 'Rating', 'Comment', 'Table', 'Order Items', 'Order Total (INR)', 'Admin Note'],
      ...filtered.map(f => { const [date, time] = fmt(f.createdAt?.seconds); return [date, time, f.rating || '', f.comment || '', f.tableNumber || '', (f.orderItems || []).map(i => `${i.qty || 1} x ${i.name || ''}`).join(' | '), Math.round(Number(f.orderTotal) || 0), f.adminNote || '']; }),
    ];
    exportRowsCsv(rows, `feedback-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  if (!ready) {
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Head><title>Feedback — HaloHelm</title></Head>
        <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 14 }}>Loading…</div>
      </div>
    );
  }
  if (!canView) {
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <Head><title>Feedback — HaloHelm</title></Head>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div>
          <div style={{ color: 'var(--tx)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>No access</div>
          <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.6 }}>Your role doesn’t include Feedback. Ask the owner to grant it.</div>
        </div>
      </div>
    );
  }

  const ghostBtn = { padding: '8px 16px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--tx)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
  const headRight = (
    <>
      <button onClick={load} disabled={loading} style={{ ...ghostBtn, opacity: loading ? 0.5 : 1 }}>↻ Refresh</button>
      <button onClick={exportCSV} style={ghostBtn}>↓ Export CSV</button>
    </>
  );

  return (
    <>
      <Head><title>Customer Feedback — HaloHelm</title></Head>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <OkShell active={null} eyebrow="Customers · reviews" title="Feedback" brand={restaurantName} headRight={headRight}>
        {/* Stat card */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '20px 24px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)', boxShadow: '0 0 8px rgba(196,168,109,0.6)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: 'var(--gold)' }}>Feedback</span>
            <div style={{ flex: 1, height: 1, background: 'var(--line-soft)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)' }}>All-time · {stats.total} review{stats.total === 1 ? '' : 's'}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <div style={{ padding: '16px 18px', borderRadius: 12, background: 'var(--card-2)', border: '1px solid var(--line)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--tx-3)', marginBottom: 8 }}>Average</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 28, color: 'var(--gold)', lineHeight: 1 }}>{stats.total ? stats.avg.toFixed(1) : '—'}</span>
                {stats.total > 0 && <span style={{ fontSize: 12, color: 'var(--tx-3)' }}>/ 5</span>}
              </div>
            </div>
            {[{ label: 'Total', value: stats.total, color: 'var(--tx)' }, { label: 'Happy (4-5★)', value: stats.happy, color: stats.happy > 0 ? 'var(--success)' : 'var(--tx)' }, { label: 'Upset (1-2★)', value: stats.upset, color: stats.upset > 0 ? 'var(--danger)' : 'var(--tx)' }].map(s => (
              <div key={s.label} style={{ padding: '16px 18px', borderRadius: 12, background: 'var(--card-2)', border: '1px solid var(--line)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--tx-3)', marginBottom: 8 }}>{s.label}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 28, lineHeight: 1, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Distribution + low-rated */}
        <div style={{ display: 'grid', gridTemplateColumns: lowRatedDishes.length > 0 ? 'repeat(auto-fit, minmax(300px, 1fr))' : '1fr', gap: 14, marginBottom: 14 }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '18px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: 'var(--gold)' }}>Rating breakdown</span>
            </div>
            {stats.total === 0 ? (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-3)', textAlign: 'center', padding: '20px 0' }}>No reviews yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {stats.distribution.map(d => {
                  const pct = (d.count / stats.maxCount) * 100;
                  const barColor = d.rating <= 2 ? 'var(--danger)' : d.rating === 3 ? 'var(--gold-dim)' : 'var(--gold)';
                  return (
                    <div key={d.rating} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, width: 64 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--tx)', width: 12 }}>{d.rating}</span>
                        <Stars count={d.rating} size={11} />
                      </div>
                      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--card-3)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 4, background: barColor, width: `${pct}%`, transition: 'width 0.3s' }} />
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--tx-2)', width: 28, textAlign: 'right' }}>{d.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {lowRatedDishes.length > 0 && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '18px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--danger)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: 'var(--danger)' }}>Needs attention</span>
                <div style={{ flex: 1, height: 1, background: 'var(--line-soft)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)' }}>{lowRatedDishes.length} dish{lowRatedDishes.length === 1 ? '' : 'es'}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', marginBottom: 10, lineHeight: 1.5 }}>Dishes with 2 or more reviews of 1-2 stars. Worth reviewing recipes or training.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                {lowRatedDishes.slice(0, 8).map(d => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(217,83,79,0.08)', border: '1px solid rgba(217,83,79,0.18)' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--danger)', fontWeight: 700 }}>{d.avgRating}★</span>
                      <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(217,83,79,0.16)', color: 'var(--danger)', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700 }}>{d.lowCount} low</span>
                    </div>
                  </div>
                ))}
                {lowRatedDishes.length > 8 && <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', textAlign: 'center', paddingTop: 4 }}>and {lowRatedDishes.length - 8} more…</div>}
              </div>
            </div>
          )}
        </div>

        {/* Filter bar */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {[{ key: 'all', label: 'All', count: stats.total }, ...stats.distribution.map(d => ({ key: String(d.rating), label: `${d.rating}★`, count: d.count }))].map(f => {
              const active = filter === f.key;
              return (
                <button key={f.key} onClick={() => setFilter(f.key)} style={{ padding: '6px 12px', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: active ? 700 : 600, background: active ? 'var(--accent)' : 'transparent', color: active ? 'var(--accent-ink)' : 'var(--tx-2)', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {f.label}
                  <span style={{ padding: '1px 6px', borderRadius: 10, background: active ? 'rgba(26,24,21,0.18)' : 'var(--card-3)', color: active ? 'var(--accent-ink)' : 'var(--tx-3)', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700 }}>{f.count}</span>
                </button>
              );
            })}
          </div>
          <span style={{ width: 1, height: 22, background: 'var(--line)', flexShrink: 0 }} />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', flexShrink: 0 }}>
            <input type="checkbox" checked={withCommentsOnly} onChange={e => setWithCommentsOnly(e.target.checked)} style={{ width: 14, height: 14, accentColor: 'var(--gold)', cursor: 'pointer' }} />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: withCommentsOnly ? 'var(--tx)' : 'var(--tx-3)' }}>With comments</span>
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', flexShrink: 0 }}>
            <input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)} style={{ width: 14, height: 14, accentColor: 'var(--gold)', cursor: 'pointer' }} />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: unreadOnly ? 'var(--tx)' : 'var(--tx-3)' }}>Unread only</span>
          </label>
          {isAdmin && (
            <button onClick={handleMarkAllRead} disabled={bulkActing || feedback.every(f => f.isRead)} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card-2)', color: feedback.every(f => f.isRead) ? 'var(--tx-3)' : 'var(--tx)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, cursor: bulkActing || feedback.every(f => f.isRead) ? 'not-allowed' : 'pointer', opacity: bulkActing ? 0.6 : 1, flexShrink: 0 }}>{bulkActing ? 'Marking…' : 'Mark all read'}</button>
          )}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search comments, table, or dish…" style={{ flex: 1, minWidth: 180, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card-2)', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx)', outline: 'none' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)' }}>{filtered.length} of {stats.total}</span>
        </div>

        {/* List */}
        {error ? (
          <div style={{ background: 'rgba(217,83,79,0.08)', border: '1px solid rgba(217,83,79,0.30)', borderRadius: 12, padding: '16px 18px', color: 'var(--danger)', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            ⚠ Failed to load feedback. Check your Firestore rules or network.
            <button onClick={load} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--danger)', color: '#fff', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Retry</button>
          </div>
        ) : loading ? (
          <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--line)', padding: 48, textAlign: 'center' }}>
            <div style={{ width: 30, height: 30, border: '3px solid var(--gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-3)' }}>Loading reviews…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--line)', padding: '56px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 30, marginBottom: 10 }}>⭐</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--tx)', marginBottom: 6 }}>{stats.total === 0 ? 'No feedback yet' : 'No matches for this filter'}</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-3)', maxWidth: 380, margin: '0 auto', lineHeight: 1.5 }}>{stats.total === 0 ? 'Customer reviews appear here after they rate their order.' : 'Try clearing search or selecting a different rating.'}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(f => {
              const accent = (f.rating || 0) >= 4 ? 'var(--gold)' : f.rating === 3 ? 'var(--line)' : 'var(--danger)';
              return (
                <div key={f.id} style={{ background: 'var(--card)', borderRadius: 14, border: '1px solid var(--line)', borderLeft: `3px solid ${accent}`, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: (f.comment || f.orderItems?.length) ? 12 : 0 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Stars count={f.rating} size={15} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--tx)' }}>{(f.rating || 0).toFixed(1)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {f.tableNumber && <span style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--card-3)', color: 'var(--tx-2)', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>Table {f.tableNumber}</span>}
                        {f.orderId && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-3)' }}>#{f.orderId.slice(-6)}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--tx-2)' }}>{timeAgo(f.createdAt)}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-3)', marginTop: 2 }}>{formatDate(f.createdAt)}</div>
                    </div>
                  </div>
                  {f.comment && f.comment.trim() && (
                    <div style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--line)', fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--tx)', lineHeight: 1.6, marginBottom: f.orderItems?.length ? 10 : 0 }}>“{f.comment}”</div>
                  )}
                  {f.orderItems && f.orderItems.length > 0 && (
                    expandedIds.has(f.id) ? (
                      <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--line)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: 'var(--gold)' }}>Order</div>
                          <button onClick={() => toggleExpanded(f.id)} style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', cursor: 'pointer', fontWeight: 600 }}>Hide ↑</button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {f.orderItems.map((item, i) => (
                            <span key={i} style={{ padding: '3px 10px', borderRadius: 6, background: 'var(--card-3)', border: '1px solid var(--line)', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--tx)' }}>{item.name}{item.qty > 1 ? <span style={{ color: 'var(--tx-3)', fontWeight: 500 }}> ×{item.qty}</span> : null}</span>
                          ))}
                        </div>
                        {f.orderTotal && <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700, color: 'var(--tx-3)', marginTop: 6 }}>Total: <span style={{ color: 'var(--tx)' }}>₹{f.orderTotal}</span></div>}
                      </div>
                    ) : (
                      <button onClick={() => toggleExpanded(f.id)} style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, color: 'var(--gold)', cursor: 'pointer', textAlign: 'left' }}>Show order ({f.orderItems.length} item{f.orderItems.length === 1 ? '' : 's'}) ↓</button>
                    )
                  )}
                  {f.adminNote && (
                    <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(196,168,109,0.10)', border: '1px solid rgba(196,168,109,0.24)', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx)', lineHeight: 1.5 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: 'var(--gold)', marginRight: 6 }}>Staff note</span>{f.adminNote}
                    </div>
                  )}
                  {isAdmin && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
                      {f.isRead ? (
                        <span style={{ padding: '3px 8px', borderRadius: 4, background: 'rgba(63,170,99,0.12)', color: 'var(--success)', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>✓ Read</span>
                      ) : (
                        <button onClick={() => handleMarkRead(f.id)} disabled={acting === f.id} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card-2)', color: 'var(--tx-2)', fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, cursor: acting === f.id ? 'not-allowed' : 'pointer', opacity: acting === f.id ? 0.5 : 1 }}>Mark as read</button>
                      )}
                      <button onClick={() => handleEditNote(f.id, f.adminNote)} disabled={acting === f.id} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card-2)', color: 'var(--tx-2)', fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, cursor: acting === f.id ? 'not-allowed' : 'pointer', opacity: acting === f.id ? 0.5 : 1 }}>{f.adminNote ? 'Edit note' : 'Add note'}</button>
                      <div style={{ flex: 1 }} />
                      <button onClick={() => handleDelete(f.id)} disabled={acting === f.id} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(217,83,79,0.25)', background: 'rgba(217,83,79,0.08)', color: 'var(--danger)', fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, cursor: acting === f.id ? 'not-allowed' : 'pointer', opacity: acting === f.id ? 0.5 : 1 }}>Delete</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </OkShell>
    </>
  );
}

FeedbackV2.getLayout = (page) => page;
