import Head from 'next/head';
import { useEffect, useState } from 'react';
import SuperAdminLayout from '../../components/layout/SuperAdminLayout';
import { getAllRestaurants, getAllPendingRequests } from '../../lib/saDb';
import Link from 'next/link';

// ═══ Aspire palette — same tokens as admin pages ═══
const A = {
  font: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  cream: '#EDEDED',
  ink: '#1A1A1A',
  shell: '#FFFFFF',
  shellDarker: '#FAFAF8',
  warning: '#C4A86D',
  warningDim: '#A08656',
  success: '#3F9E5A',
  danger: '#D9534F',
  mutedText: 'rgba(0,0,0,0.55)',
  faintText: 'rgba(0,0,0,0.38)',
  subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)',
  cardShadow: '0 2px 10px rgba(0,0,0,0.03)',
  // Matte-black signature card tokens
  forest: '#1A1A1A',
  forestDarker: '#2A2A2A',
  forestText: '#EAE7E3',
  forestTextMuted: 'rgba(234,231,227,0.55)',
  forestTextFaint: 'rgba(234,231,227,0.35)',
  forestSubtleBg: 'rgba(255,255,255,0.04)',
  forestBorder: '1px solid rgba(255,255,255,0.06)',
};

export default function SuperAdminDashboard() {
  const [restaurants, setRestaurants] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getAllRestaurants(), getAllPendingRequests()]).then(([r, p]) => {
      setRestaurants(r); setPending(p); setLoading(false);
    });
  }, []);

  const active = restaurants.filter(r => r.isActive).length;
  const totalItems = restaurants.reduce((s, r) => s + (r.itemsUsed || 0), 0);

  // Matte-black signature stats. `accent: true` lights the value in gold; otherwise cream.
  const stats = [
    { label: 'Restaurants', value: restaurants.length, accent: false },
    { label: 'Active',      value: active,             accent: false, color: A.success },
    { label: 'Pending',     value: pending.length,     accent: true },
    { label: 'AR Items',    value: totalItems,         accent: false },
  ];

  return (
    <SuperAdminLayout>
      <Head><title>Super Admin — Advert Radical</title></Head>
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font }}>
        <style>{`
          @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>

        {/* Header */}
        <div style={{ padding: '24px 28px 0' }}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, marginBottom: 6, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Super Admin</span>
              <span style={{ opacity: 0.5 }}>›</span>
              <span style={{ color: A.mutedText }}>Overview</span>
            </div>
            <div style={{ fontWeight: 600, fontSize: 28, color: A.ink, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
              Platform <span style={{ color: A.mutedText, fontWeight: 500 }}>Overview</span>
            </div>
            <div style={{ fontSize: 13, color: A.mutedText, marginTop: 4 }}>
              Advert Radical · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>

          {/* ── PLATFORM TODAY — matte black signature card ── */}
          <div style={{
            background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
            borderRadius: 14, padding: '20px 24px', marginBottom: 14,
            border: A.forestBorder, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: A.warning, animation: 'pulse 2s ease infinite', boxShadow: '0 0 8px rgba(196,168,109,0.6)' }} />
              <span style={{ fontFamily: A.font, fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>PLATFORM</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(234,231,227,0.08)' }} />
              <span style={{ fontFamily: A.font, fontSize: 11, color: A.forestTextMuted, fontWeight: 500 }}>Live</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {stats.map(s => (
                <div key={s.label} style={{
                  padding: '16px 18px', borderRadius: 10,
                  background: A.forestSubtleBg, border: A.forestBorder,
                }}>
                  <div style={{ fontFamily: A.font, fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 8 }}>{s.label}</div>
                  <div style={{ fontFamily: A.font, fontWeight: 700, fontSize: 28, color: s.color || (s.accent ? A.warning : A.forestText), lineHeight: 1, letterSpacing: '-0.5px' }}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding: '0 28px 60px' }}>
          {/* Pending requests — only when there are some */}
          {pending.length > 0 && (
            <div style={{
              background: A.shell, borderRadius: 14, padding: '20px 24px',
              border: A.border, boxShadow: A.cardShadow, marginBottom: 14,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: A.warning, animation: 'pulse 2s ease infinite', boxShadow: '0 0 6px rgba(196,168,109,0.5)' }} />
                  <span style={{ fontFamily: A.font, fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>Pending Requests</span>
                  <span style={{ fontFamily: A.font, fontSize: 11, color: A.faintText }}>· {pending.length}</span>
                </div>
                <Link href="/superadmin/requests" style={{ fontFamily: A.font, fontSize: 12, fontWeight: 600, color: A.ink, textDecoration: 'none' }}>View all →</Link>
              </div>
              {pending.slice(0, 5).map((req, i) => (
                <div key={req.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 0',
                  borderTop: i > 0 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, overflow: 'hidden', background: A.subtleBg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: A.faintText, fontSize: 12 }}>
                    {req.imageURL
                      ? <img src={req.imageURL} alt={req.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : '—'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: A.font, fontSize: 13, fontWeight: 600, color: A.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{req.name}</div>
                    <div style={{ fontFamily: A.font, fontSize: 11, color: A.mutedText }}>{req.restaurantName}</div>
                  </div>
                  <Link href="/superadmin/requests" style={{ fontFamily: A.font, fontSize: 12, fontWeight: 600, color: A.warningDim, textDecoration: 'none', flexShrink: 0 }}>Review →</Link>
                </div>
              ))}
            </div>
          )}

          {/* Recent restaurants */}
          <div style={{
            background: A.shell, borderRadius: 14, padding: '20px 24px',
            border: A.border, boxShadow: A.cardShadow,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontFamily: A.font, fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>Recent Restaurants</div>
              <Link href="/superadmin/restaurants" style={{ fontFamily: A.font, fontSize: 12, fontWeight: 600, color: A.ink, textDecoration: 'none' }}>View all →</Link>
            </div>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0' }}>
                <div style={{ width: 24, height: 24, border: `2.5px solid ${A.warning}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              </div>
            ) : restaurants.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 13, color: A.mutedText }}>No restaurants yet</div>
            ) : (
              restaurants.slice(0, 7).map((r, i) => (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 0',
                  borderTop: i > 0 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link href={`/superadmin/restaurant/${r.id}`} style={{
                      fontFamily: A.font, fontSize: 13, fontWeight: 600, color: A.ink,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      display: 'block', textDecoration: 'none', transition: 'color 0.15s',
                    }}
                      onMouseOver={e => e.currentTarget.style.color = A.warningDim}
                      onMouseOut={e => e.currentTarget.style.color = A.ink}>
                      {r.name}
                    </Link>
                    <div style={{ fontFamily: A.font, fontSize: 11, color: A.faintText }}>{r.subdomain}.advertradical.com</div>
                  </div>
                  <span style={{ fontFamily: A.font, fontSize: 11, color: A.mutedText, textTransform: 'capitalize', marginRight: 8 }}>{r.plan}</span>
                  <span style={{
                    padding: '3px 10px', borderRadius: 20,
                    fontFamily: A.font, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                    background: r.isActive ? 'rgba(63,158,90,0.10)' : A.subtleBg,
                    color: r.isActive ? A.success : A.faintText,
                    border: `1px solid ${r.isActive ? 'rgba(63,158,90,0.20)' : 'rgba(0,0,0,0.06)'}`,
                  }}>
                    {r.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </SuperAdminLayout>
  );
}
SuperAdminDashboard.getLayout = (page) => page;
