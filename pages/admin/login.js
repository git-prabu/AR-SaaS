// pages/admin/login.js — Aspire-palette restaurant admin login.
// Two-panel layout: editorial marketing preview on the left (with the same
// matte-black signature card pattern used across the admin chrome), sign-in
// form on the right. Collapses to single-panel below 900px.
import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import { getUserData } from '../../lib/db';
import toast from 'react-hot-toast';

const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER,
  cream: '#EDEDED',
  ink: '#1A1A1A',
  shell: '#FFFFFF',
  warning: '#C4A86D',
  warningDim: '#A08656',
  mutedText: 'rgba(0,0,0,0.55)',
  faintText: 'rgba(0,0,0,0.38)',
  border: '1px solid rgba(0,0,0,0.06)',
  borderStrong: '1px solid rgba(0,0,0,0.10)',
  // Matte-black signature-card tokens (matches analytics LIVE TODAY)
  forest: '#1A1A1A',
  forestDarker: '#2A2A2A',
  forestText: '#EAE7E3',
  forestTextMuted: 'rgba(234,231,227,0.55)',
  forestTextFaint: 'rgba(234,231,227,0.35)',
  forestSubtleBg: 'rgba(255,255,255,0.04)',
  forestBorder: '1px solid rgba(255,255,255,0.06)',
};

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signOut } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const cred = await signIn(email, password);
      const userData = await getUserData(cred.user.uid);
      if (!userData || userData.role !== 'restaurant') {
        await signOut();
        toast.error('Access denied. Restaurant accounts only.');
        setLoading(false);
        return;
      }
      toast.success('Welcome back!');
      router.push('/admin');
    } catch (err) {
      toast.error(err.code === 'auth/invalid-credential' ? 'Invalid email or password.' : 'Login failed.');
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Sign In — Advert Radical</title>
      </Head>

      <div style={{ minHeight: '100vh', background: A.cream, fontFamily: A.font, color: A.ink, display: 'flex' }}>
        <style>{`
          @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
          @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
          @keyframes spin { to { transform: rotate(360deg); } }
          .login-input:focus {
            border-color: ${A.ink};
            box-shadow: 0 0 0 3px rgba(0,0,0,0.04);
          }
          .login-submit:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 8px 24px rgba(0,0,0,0.14);
          }
          .login-submit:disabled { opacity: 0.5; cursor: not-allowed; }
          .login-mobile-brand { display: none; }
          @media (max-width: 900px) {
            .login-left { display: none !important; }
            .login-right { flex: 1 1 auto !important; padding: 28px 20px !important; }
            .login-mobile-brand { display: block; }
          }
        `}</style>

        {/* LEFT — editorial preview on cream */}
        <div className="login-left" style={{
          flex: '0 0 55%', minHeight: '100vh',
          display: 'flex', flexDirection: 'column',
          padding: '48px 60px',
          borderRight: A.border,
          justifyContent: 'space-between',
          animation: 'fadeUp 0.4s ease both',
        }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <div style={{ fontFamily: A.font, fontWeight: 600, fontSize: 22, color: A.ink, letterSpacing: '-0.4px' }}>
              Advert <span style={{ color: A.warning, fontStyle: 'italic', fontWeight: 500 }}>Radical</span>
            </div>
          </Link>

          <div style={{ maxWidth: 540 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: A.faintText, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>
              Restaurant Portal
            </div>
            <div style={{ fontSize: 40, fontWeight: 600, color: A.ink, lineHeight: 1.1, letterSpacing: '-0.8px', marginBottom: 14 }}>
              Manage your <span style={{ color: A.warning, fontStyle: 'italic', fontWeight: 500 }}>AR menu</span><br />from anywhere.
            </div>
            <div style={{ fontSize: 15, color: A.mutedText, marginBottom: 36, lineHeight: 1.55, maxWidth: 440 }}>
              Update dishes, track orders, manage waiter calls, and grow your revenue — all in one dashboard.
            </div>

            {/* Matte-black LIVE OVERVIEW preview card */}
            <div style={{
              background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
              borderRadius: 14, padding: '20px 24px',
              border: A.forestBorder,
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              maxWidth: 480,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: A.warning, boxShadow: '0 0 8px rgba(196,168,109,0.60)', animation: 'pulse 2s ease infinite' }} />
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: A.warning }}>LIVE OVERVIEW</span>
                <span style={{ flex: 1, height: 1, background: 'rgba(234,231,227,0.08)' }} />
                <span style={{ fontSize: 10, color: A.forestTextFaint, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Today</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
                {[
                  { label: 'AR Views', value: '1,240', trend: '+18%', color: A.warning },
                  { label: 'Orders',   value: '382',   trend: '+9%',  color: A.forestText },
                  { label: 'Rating',   value: '4.8',   trend: 'Top',  color: A.warning },
                ].map(s => (
                  <div key={s.label} style={{ padding: '12px 14px', borderRadius: 8, background: A.forestSubtleBg, border: A.forestBorder }}>
                    <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontWeight: 700, fontSize: 20, lineHeight: 1, color: s.color, letterSpacing: '-0.3px' }}>{s.value}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: s.color, marginTop: 4 }}>{s.trend}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: 'rgba(0,0,0,0.28)', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 10 }}>Weekly AR views</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 48 }}>
                  {[32, 52, 38, 68, 60, 94, 72].map((h, i) => (
                    <div key={i} style={{
                      flex: 1, borderRadius: 3,
                      height: `${h}%`,
                      background: i === 5 ? A.warning : 'rgba(234,231,227,0.12)',
                    }} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
                  {['M','T','W','T','F','S','S'].map((d, i) => (
                    <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, fontWeight: 600, color: i === 5 ? A.warning : A.forestTextFaint }}>{d}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 40, paddingTop: 24, borderTop: A.border, maxWidth: 540 }}>
            {[
              { num: '500+',  label: 'Restaurants' },
              { num: '↑ 28%', label: 'Avg order value' },
              { num: '5 min', label: 'Setup time' },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontWeight: 700, fontSize: 22, color: A.ink, letterSpacing: '-0.4px', lineHeight: 1 }}>{s.num}</div>
                <div style={{ fontSize: 12, color: A.mutedText, marginTop: 5, fontWeight: 500 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — sign-in form */}
        <div className="login-right" style={{
          flex: '0 0 45%', minHeight: '100vh',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '48px 56px',
          animation: 'fadeUp 0.5s ease both',
        }}>
          <div style={{ width: '100%', maxWidth: 420 }}>
            <div className="login-mobile-brand">
              <Link href="/" style={{ textDecoration: 'none' }}>
                <div style={{ fontFamily: A.font, fontWeight: 600, fontSize: 20, color: A.ink, letterSpacing: '-0.4px', marginBottom: 32 }}>
                  Advert <span style={{ color: A.warning, fontStyle: 'italic', fontWeight: 500 }}>Radical</span>
                </div>
              </Link>
            </div>

            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: A.faintText, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
                Restaurant Admin
              </div>
              <div style={{ fontSize: 28, fontWeight: 600, color: A.ink, letterSpacing: '-0.5px', lineHeight: 1.1, marginBottom: 8 }}>
                Welcome back.
              </div>
              <div style={{ fontSize: 14, color: A.mutedText, lineHeight: 1.55 }}>
                Sign in to your restaurant admin account.
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: A.faintText, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Email address
                </label>
                <input
                  className="login-input" type="email"
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="your@restaurant.com" required
                  style={{
                    width: '100%', padding: '13px 15px', boxSizing: 'border-box',
                    background: A.shell, border: A.borderStrong, borderRadius: 10,
                    fontSize: 14, color: A.ink, fontFamily: A.font, outline: 'none',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                />
              </div>
              <div style={{ marginBottom: 28 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: A.faintText, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Password
                </label>
                <input
                  className="login-input" type="password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required
                  style={{
                    width: '100%', padding: '13px 15px', boxSizing: 'border-box',
                    background: A.shell, border: A.borderStrong, borderRadius: 10,
                    fontSize: 14, color: A.ink, fontFamily: A.font, outline: 'none',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                />
              </div>
              <button
                className="login-submit" type="submit" disabled={loading}
                style={{
                  width: '100%', padding: '14px',
                  borderRadius: 10, border: 'none',
                  background: A.ink, color: A.cream,
                  fontSize: 14, fontWeight: 600, fontFamily: A.font,
                  letterSpacing: '0.01em', cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  transition: 'transform 0.15s, box-shadow 0.15s, opacity 0.15s',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                {loading ? (
                  <>
                    <span style={{ width: 14, height: 14, border: `2px solid ${A.cream}`, borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                    Signing in…
                  </>
                ) : 'Sign in →'}
              </button>
            </form>

            <div style={{ marginTop: 28, paddingTop: 24, borderTop: A.border, textAlign: 'center' }}>
              <span style={{ fontSize: 13, color: A.mutedText }}>Not a restaurant yet? </span>
              <Link href="/signup?plan=growth" style={{ fontSize: 13, color: A.warning, fontWeight: 600, textDecoration: 'none' }}>
                Start free trial →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
