import Head from 'next/head';
import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getFeedback } from '../../lib/db';

// ═══ Aspire palette — same tokens as analytics/kitchen/waiter/staff/notifications ═══
const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER,
  cream: '#EDEDED',
  ink: '#1A1A1A',
  shell: '#FFFFFF',
  shellDarker: '#F8F8F8',
  warning: '#C4A86D',         // Antique gold — used for stars + accents
  warningDim: '#A08656',
  // Matte black tokens for the signature dark stat card
  forest: '#1A1A1A',
  forestDarker: '#2A2A2A',
  forestText: '#EAE7E3',
  forestTextMuted: 'rgba(234,231,227,0.55)',
  forestTextFaint: 'rgba(234,231,227,0.35)',
  forestSubtleBg: 'rgba(255,255,255,0.04)',
  forestBorder: '1px solid rgba(255,255,255,0.06)',
  success: '#3F9E5A',
  successDim: '#2E7E45',
  danger: '#D9534F',
  dangerDim: '#A03A37',
  mutedText: 'rgba(0,0,0,0.55)',
  faintText: 'rgba(0,0,0,0.38)',
  subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)',
  cardShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
};

// ═══ Stars — gold for filled, faint for empty (same palette as analytics) ═══
function Stars({ count, size = 14 }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(s => (
        <span key={s} style={{
          fontSize: size,
          color: s <= count ? A.warning : 'rgba(0,0,0,0.12)',
          lineHeight: 1,
        }}>★</span>
      ))}
    </span>
  );
}

// ═══ Time helpers ═══
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
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
}
function formatDate(ts) {
  if (!ts) return '';
  const seconds = ts.seconds || ts._seconds;
  if (!seconds) return '';
  const d = new Date(seconds * 1000);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) +
    ' · ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export default function AdminFeedback() {
  const { userData } = useAuth();
  const rid = userData?.restaurantId;
  const restaurantName = userData?.restaurantName || 'Your Restaurant';

  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // UI filters
  const [filter, setFilter] = useState('all');           // 'all' | '5' | '4' | '3' | '2' | '1'
  const [withCommentsOnly, setWithCommentsOnly] = useState(false);
  const [search, setSearch] = useState('');

  const load = () => {
    if (!rid) return;
    setLoading(true);
    setError(false);
    getFeedback(rid)
      .then(data => { setFeedback(data || []); setLoading(false); })
      .catch(err => {
        console.error('getFeedback error:', err);
        setError(true);
        setLoading(false);
      });
  };
  useEffect(() => { load(); }, [rid]);

  // ══ Stats ══════════════════════════════════════════════════════════════
  const stats = useMemo(() => {
    const total = feedback.length;
    const sum = feedback.reduce((s, f) => s + (f.rating || 0), 0);
    const avg = total ? sum / total : 0;
    const happy = feedback.filter(f => (f.rating || 0) >= 4).length;
    const upset = feedback.filter(f => (f.rating || 0) > 0 && f.rating <= 2).length;
    const withComments = feedback.filter(f => f.comment && f.comment.trim()).length;
    const distribution = [5, 4, 3, 2, 1].map(r => ({
      rating: r,
      count: feedback.filter(f => f.rating === r).length,
    }));
    const maxCount = Math.max(...distribution.map(d => d.count), 1);
    return { total, avg, happy, upset, withComments, distribution, maxCount };
  }, [feedback]);

  // ══ Low-rated dish detection ══════════════════════════════════════════════
  // Walks every feedback's orderItems[]; for each item, accumulates avg rating
  // and the count of low-rated (1-2 star) reviews mentioning that item.
  // We flag dishes with at least 2 low-rated reviews — a single bad review is
  // noise, but two means there's a pattern worth showing the owner.
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
    // Only dishes with 2+ low-rated reviews
    return [...map.values()]
      .filter(d => d.lowCount >= 2)
      .map(d => ({
        name: d.name,
        avgRating: (d.ratings.reduce((s, r) => s + r, 0) / d.ratings.length).toFixed(1),
        lowCount: d.lowCount,
        totalReviews: d.ratings.length,
      }))
      // Worst (most low-rated) first
      .sort((a, b) => b.lowCount - a.lowCount || Number(a.avgRating) - Number(b.avgRating));
  }, [feedback]);

  // ══ Filtered list ══
  const filtered = useMemo(() => {
    let result = feedback;
    if (filter !== 'all') result = result.filter(f => f.rating === Number(filter));
    if (withCommentsOnly) result = result.filter(f => f.comment && f.comment.trim());
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(f => {
        const c = (f.comment || '').toLowerCase();
        const t = String(f.tableNumber || '').toLowerCase();
        const items = (f.orderItems || []).map(i => (i?.name || '').toLowerCase()).join(' ');
        return c.includes(q) || t.includes(q) || items.includes(q);
      });
    }
    // Newest first
    return [...result].sort((a, b) =>
      (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
    );
  }, [feedback, filter, withCommentsOnly, search]);

  return (
    <AdminLayout>
      <Head><title>Customer Feedback — Advert Radical</title></Head>
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font }}>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
          @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
          .fb-card { transition: box-shadow 0.12s ease, transform 0.12s ease; }
          .fb-card:hover { box-shadow: 0 4px 18px rgba(38,52,49,0.06); transform: translateY(-1px); }
          .fb-filter-pill:hover:not(.active) { background: ${A.subtleBg}; color: ${A.ink}; }
          .fb-refresh-btn:hover { background: ${A.shellDarker}; }
        `}</style>

        {/* ═══ ASPIRE HEADER ═══ */}
        <div style={{ padding: '24px 28px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, marginBottom: 6, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Customers</span>
                <span style={{ opacity: 0.5 }}>›</span>
                <span style={{ color: A.mutedText }}>Feedback</span>
              </div>
              <div style={{ fontWeight: 600, fontSize: 28, color: A.ink, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                {restaurantName} <span style={{ color: A.mutedText, fontWeight: 500 }}>Reviews</span>
              </div>
              <div style={{ fontSize: 12, color: A.mutedText, marginTop: 4 }}>
                What your customers are saying. Auto-loads after each order with a rating prompt.
              </div>
            </div>
            <button onClick={load} disabled={loading} className="fb-refresh-btn" style={{
              padding: '8px 16px', borderRadius: 10, border: A.border, background: A.shell,
              color: A.ink, fontSize: 13, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer', fontFamily: A.font, opacity: loading ? 0.5 : 1,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              Refresh
            </button>
          </div>

          {/* ═══ FEEDBACK — matte-black signature stat card ═══ */}
          <div style={{
            background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
            borderRadius: 14, padding: '20px 24px', marginBottom: 14,
            border: A.forestBorder,
            boxShadow: '0 4px 16px rgba(38,52,49,0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: A.warning, animation: 'pulse 2s ease infinite', boxShadow: '0 0 8px rgba(196,168,109,0.6)' }} />
              <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>FEEDBACK</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(234,231,227,0.08)' }} />
              <span style={{ fontSize: 11, color: A.forestTextMuted, fontWeight: 500 }}>
                All-time · {stats.total} review{stats.total === 1 ? '' : 's'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {/* Average — special: the gold accent + stars below */}
              <div style={{
                padding: '16px 18px', borderRadius: 10,
                background: A.forestSubtleBg,
                border: A.forestBorder,
              }}>
                <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 8 }}>AVERAGE</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 28, color: A.warning, lineHeight: 1, letterSpacing: '-0.5px' }}>
                    {stats.total ? stats.avg.toFixed(1) : '—'}
                  </span>
                  {stats.total > 0 && (
                    <span style={{ fontSize: 12, color: A.forestTextMuted, fontWeight: 500 }}>/ 5</span>
                  )}
                </div>
              </div>
              {[
                { label: 'TOTAL',          value: stats.total,          accent: false },
                { label: 'HAPPY (4-5★)',   value: stats.happy,          accent: false, success: stats.happy > 0 },
                { label: 'UPSET (1-2★)',   value: stats.upset,          accent: false, danger: stats.upset > 0 },
              ].map(s => (
                <div key={s.label} style={{
                  padding: '16px 18px', borderRadius: 10,
                  background: A.forestSubtleBg,
                  border: A.forestBorder,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 8 }}>{s.label}</div>
                  <div style={{ fontWeight: 700, fontSize: 28, lineHeight: 1, letterSpacing: '-0.5px',
                    color: s.success ? A.success : (s.danger ? A.danger : A.forestText),
                  }}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ═══ Distribution + Low-rated dishes (side-by-side when both present) ═══ */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: lowRatedDishes.length > 0 ? '1fr 1fr' : '1fr',
            gap: 14, marginBottom: 14,
          }}>
            {/* Rating distribution histogram */}
            <div style={{
              background: A.shell, borderRadius: 14, padding: '18px 22px',
              border: A.border, boxShadow: A.cardShadow,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: A.warning, boxShadow: '0 0 6px rgba(196,168,109,0.35)' }} />
                <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>RATING BREAKDOWN</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(196,168,109,0.20)' }} />
              </div>
              {stats.total === 0 ? (
                <div style={{ fontSize: 13, color: A.faintText, textAlign: 'center', padding: '20px 0' }}>
                  No reviews yet
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {stats.distribution.map(d => {
                    const pct = (d.count / stats.maxCount) * 100;
                    // Bar color: muted neutral by default; a soft danger tint for 1-2★ to telegraph attention
                    const barColor = d.rating <= 2
                      ? A.danger
                      : d.rating === 3
                        ? A.warningDim
                        : A.warning;
                    return (
                      <div key={d.rating} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, width: 64 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: A.ink, fontFamily: "'JetBrains Mono', monospace", width: 12 }}>{d.rating}</span>
                          <Stars count={d.rating} size={11} />
                        </div>
                        <div style={{ flex: 1, height: 8, borderRadius: 4, background: A.subtleBg, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 4,
                            background: `linear-gradient(90deg, ${barColor}, ${barColor === A.warning ? A.warningDim : barColor})`,
                            width: `${pct}%`, transition: 'width 0.3s',
                          }} />
                        </div>
                        <span style={{
                          fontSize: 11, fontWeight: 700, color: A.mutedText, fontFamily: "'JetBrains Mono', monospace",
                          width: 28, textAlign: 'right',
                        }}>{d.count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Low-rated dishes — only renders if any qualify */}
            {lowRatedDishes.length > 0 && (
              <div style={{
                background: A.shell, borderRadius: 14, padding: '18px 22px',
                border: A.border, boxShadow: A.cardShadow,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: A.danger, boxShadow: '0 0 6px rgba(217,83,79,0.35)' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.danger }}>NEEDS ATTENTION</span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(217,83,79,0.20)' }} />
                  <span style={{ fontSize: 11, color: A.mutedText, fontWeight: 500 }}>
                    {lowRatedDishes.length} dish{lowRatedDishes.length === 1 ? '' : 'es'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: A.mutedText, marginBottom: 10, lineHeight: 1.5 }}>
                  Dishes with 2 or more reviews of 1-2 stars. Worth reviewing recipes or training.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                  {lowRatedDishes.slice(0, 8).map(d => (
                    <div key={d.name} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                      padding: '8px 12px', borderRadius: 8,
                      background: 'rgba(217,83,79,0.05)', border: '1px solid rgba(217,83,79,0.15)',
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: A.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.name}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: A.dangerDim, fontWeight: 700 }}>
                          {d.avgRating}★
                        </span>
                        <span style={{
                          padding: '2px 8px', borderRadius: 4,
                          background: 'rgba(217,83,79,0.12)', color: A.danger,
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                        }}>
                          {d.lowCount} low
                        </span>
                      </div>
                    </div>
                  ))}
                  {lowRatedDishes.length > 8 && (
                    <div style={{ fontSize: 11, color: A.faintText, textAlign: 'center', paddingTop: 4 }}>
                      and {lowRatedDishes.length - 8} more…
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ═══ Filter bar — pills + comment toggle + search ═══ */}
          <div style={{
            background: A.shell, border: A.border, borderRadius: 12,
            padding: '10px 14px', marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            boxShadow: A.cardShadow,
          }}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {[
                { key: 'all', label: 'All', count: stats.total },
                ...stats.distribution.map(d => ({ key: String(d.rating), label: `${d.rating}★`, count: d.count })),
              ].map(f => {
                const active = filter === f.key;
                return (
                  <button key={f.key} className={`fb-filter-pill ${active ? 'active' : ''}`}
                    onClick={() => setFilter(f.key)}
                    style={{
                      padding: '6px 12px', fontSize: 12, fontWeight: active ? 700 : 500,
                      background: active ? A.ink : 'transparent', color: active ? A.cream : A.mutedText,
                      border: 'none', borderRadius: 7, cursor: 'pointer', transition: 'all 0.15s',
                      fontFamily: A.font, display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}>
                    {f.label}
                    <span style={{
                      padding: '1px 6px', borderRadius: 10,
                      background: active ? 'rgba(237,237,237,0.18)' : A.subtleBg,
                      color: active ? A.cream : A.faintText,
                      fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                    }}>{f.count}</span>
                  </button>
                );
              })}
            </div>
            <span style={{ width: 1, height: 22, background: 'rgba(0,0,0,0.10)', flexShrink: 0 }} />
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
              <input
                type="checkbox"
                checked={withCommentsOnly}
                onChange={e => setWithCommentsOnly(e.target.checked)}
                style={{ width: 14, height: 14, accentColor: A.warning, cursor: 'pointer' }}
              />
              <span style={{ fontSize: 12, fontWeight: 600, color: withCommentsOnly ? A.ink : A.mutedText }}>
                With comments
              </span>
            </label>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search comments, table, or dish…"
              style={{
                flex: 1, minWidth: 180,
                padding: '7px 12px', borderRadius: 8,
                border: A.border, background: A.shellDarker,
                fontSize: 13, fontFamily: A.font, color: A.ink, outline: 'none',
              }}
              onFocus={e => e.target.style.background = A.shell}
              onBlur={e => e.target.style.background = A.shellDarker}
            />
            <span style={{ fontSize: 11, color: A.faintText, fontWeight: 500 }}>
              {filtered.length} of {stats.total}
            </span>
          </div>
        </div>

        {/* ═══ Feedback list ═══ */}
        <div style={{ padding: '0 28px 60px' }}>
          {error ? (
            <div style={{
              background: 'rgba(217,83,79,0.06)', border: '1px solid rgba(217,83,79,0.30)',
              borderRadius: 12, padding: '16px 18px',
              color: A.danger, fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
            }}>
              ⚠ Failed to load feedback. Check your Firestore rules or network.
              <button onClick={load} style={{
                padding: '7px 14px', borderRadius: 8, border: 'none', background: A.danger, color: A.shell,
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: A.font,
              }}>Retry</button>
            </div>
          ) : loading ? (
            <div style={{
              background: A.shell, borderRadius: 14, border: A.border, padding: '48px',
              textAlign: 'center', boxShadow: A.cardShadow,
            }}>
              <div style={{ width: 30, height: 30, border: `3px solid ${A.warning}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              <div style={{ fontSize: 13, color: A.mutedText, fontWeight: 600 }}>Loading reviews…</div>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{
              background: A.shell, borderRadius: 14, border: A.border, padding: '56px 32px',
              textAlign: 'center', boxShadow: A.cardShadow,
            }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: A.ink, marginBottom: 6 }}>
                {stats.total === 0 ? 'No feedback yet' : 'No matches for this filter'}
              </div>
              <div style={{ fontSize: 13, color: A.mutedText, maxWidth: 380, margin: '0 auto', lineHeight: 1.5 }}>
                {stats.total === 0
                  ? 'Customer reviews appear here after they rate their order. The rating prompt shows after the customer confirms payment.'
                  : 'Try clearing search, selecting a different rating, or turning off "With comments".'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map(f => {
                // Left-edge accent — gold for 4-5★, neutral for 3★, danger for 1-2★. Stays monochrome (no jewel tones).
                const accent = (f.rating || 0) >= 4 ? A.warning
                  : f.rating === 3 ? 'rgba(0,0,0,0.10)'
                  : A.danger;
                return (
                  <div key={f.id} className="fb-card" style={{
                    background: A.shell, borderRadius: 12,
                    border: A.border,
                    borderLeft: `3px solid ${accent}`,
                    padding: '16px 20px',
                    boxShadow: A.cardShadow,
                    animation: 'fadeUp 0.2s ease both',
                  }}>
                    {/* Top row: stars + table + order id  ⟷  time */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: f.comment ? 12 : (f.orderItems?.length ? 12 : 0) }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Stars count={f.rating} size={15} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: A.ink, fontFamily: "'JetBrains Mono', monospace" }}>
                            {(f.rating || 0).toFixed(1)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {f.tableNumber && (
                            <span style={{
                              padding: '2px 8px', borderRadius: 4,
                              background: A.subtleBg, color: A.mutedText,
                              fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                            }}>Table {f.tableNumber}</span>
                          )}
                          {f.orderId && (
                            <span style={{
                              fontSize: 10, color: A.faintText,
                              fontFamily: "'JetBrains Mono', monospace",
                            }}>#{f.orderId.slice(-6)}</span>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: A.mutedText, fontFamily: "'JetBrains Mono', monospace" }}>
                          {timeAgo(f.createdAt)}
                        </div>
                        <div style={{ fontSize: 10, color: A.faintText, marginTop: 2 }}>
                          {formatDate(f.createdAt)}
                        </div>
                      </div>
                    </div>

                    {/* Comment (if present) */}
                    {f.comment && f.comment.trim() && (
                      <div style={{
                        padding: '12px 16px', borderRadius: 10,
                        background: A.shellDarker,
                        border: A.border,
                        fontSize: 14, color: A.ink, lineHeight: 1.6,
                        marginBottom: f.orderItems?.length ? 10 : 0,
                      }}>
                        <span style={{ color: A.faintText, fontWeight: 700, marginRight: 4 }}>"</span>
                        {f.comment}
                        <span style={{ color: A.faintText, fontWeight: 700, marginLeft: 4 }}>"</span>
                      </div>
                    )}

                    {/* Order items (if attached) */}
                    {f.orderItems && f.orderItems.length > 0 && (
                      <div style={{
                        padding: '10px 14px', borderRadius: 10,
                        background: A.shellDarker, border: A.border,
                      }}>
                        <div style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.10em',
                          textTransform: 'uppercase', color: A.warningDim, marginBottom: 6,
                        }}>Order</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {f.orderItems.map((item, i) => (
                            <span key={i} style={{
                              padding: '3px 10px', borderRadius: 6,
                              background: A.shell, border: A.border,
                              fontSize: 12, fontWeight: 600, color: A.ink,
                            }}>
                              {item.name}{item.qty > 1 ? <span style={{ color: A.mutedText, fontWeight: 500 }}> ×{item.qty}</span> : null}
                            </span>
                          ))}
                        </div>
                        {f.orderTotal && (
                          <div style={{ fontSize: 11, fontWeight: 700, color: A.mutedText, marginTop: 6 }}>
                            Total: <span style={{ color: A.ink }}>₹{f.orderTotal}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}