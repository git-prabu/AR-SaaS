// pages/admin/login.js — Aspire-palette restaurant admin login.
// Two-panel layout: editorial marketing preview on the left (with the same
// matte-black signature card pattern used across the admin chrome), sign-in
// form on the right. Collapses to single-panel below 900px.
import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import {
  sendPasswordResetEmail,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut as fbSignOut,
} from 'firebase/auth';
import { useAuth } from '../../hooks/useAuth';
import { adminAuth } from '../../lib/firebaseAuth';
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
  // True the moment we detect the page is being loaded inside an installed
  // PWA (Add-to-Home-Screen / Install App). Used to show the prominent
  // "Continue to Staff Sign-in" banner at the top so a staff member whose
  // PWA opened admin/login by accident has a giant, impossible-to-miss
  // tap target — even if the auto-redirect below didn't fire (e.g. no
  // localStorage flag because the PWA was installed before that code
  // shipped, or fetched manifest doesn't carry "staff" markers).
  const [showStandaloneBanner, setShowStandaloneBanner] = useState(false);

  // Staff PWA recovery — owners who installed the app BEFORE the staff
  // manifest fix landed end up here when they tap the installed icon,
  // even if they're staff trying to reach /staff/login. Detect that
  // case and bounce them automatically. Multiple detection methods so
  // at least one works regardless of how Chrome / iOS Safari behave:
  //
  //   1. localStorage flag (set when this device has ever visited
  //      /staff/login — most reliable when present)
  //   2. Manifest <link> href ending in 'staff-manifest.json' — kicks
  //      in if the PWA was reinstalled after the fix
  //   3. Fetched manifest content showing scope/name/start_url that
  //      indicate "Staff" — defense in depth for weird caching
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let didRedirect = false;
    const goStaff = () => {
      if (didRedirect) return;
      didRedirect = true;
      // Hard navigation (not router.replace) — Next.js client routing
      // sometimes silently no-ops inside a standalone PWA whose
      // service worker is mid-update. A real navigation always wins.
      window.location.replace('/staff/login');
    };
    try {
      const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches
        || window.navigator?.standalone === true;
      if (!isStandalone) return;
      // Flip on the standalone banner regardless of which detection
      // path matches below — even if we CAN'T auto-redirect (no
      // localStorage flag, no staff manifest markers), at least give
      // the user a giant tap target labelled "Staff Sign-in".
      setShowStandaloneBanner(true);

      // (1) Cheap localStorage check first.
      if (localStorage.getItem('ar_last_login_intent') === 'staff') {
        goStaff();
        return;
      }

      // (2) Manifest link href tells us which manifest the page is
      // currently advertising. If staff, redirect.
      const link = document.querySelector('link[rel="manifest"]');
      const href = link?.href || '';
      if (href.includes('staff-manifest')) {
        goStaff();
        return;
      }

      // (3) Fetch manifest content and inspect — catches old PWAs whose
      // baked-in manifest is named "HaloHelm Staff" even though the
      // server is now serving /manifest.json for this admin route.
      if (href) {
        fetch(href).then(r => r.ok ? r.json() : null).then(m => {
          if (!m) return;
          const name = String(m.name || '').toLowerCase();
          const sname = String(m.short_name || '').toLowerCase();
          const scope = String(m.scope || '');
          const start = String(m.start_url || '');
          if (
            name.includes('staff') || sname.includes('staff') ||
            scope.includes('/staff') || start.includes('/staff')
          ) goStaff();
        }).catch(() => {});
      }
    } catch { /* fail-open: stay on admin login */ }
  }, [router]);

  // Forgot-password inline panel state
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);

  // Google sign-in state
  const [googleBusy, setGoogleBusy] = useState(false);

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

  // Forgot password — sends a reset link to the email Firebase has on file.
  // Only works for accounts created with email+password (Google accounts
  // don't have a password to reset; they're told to use "Sign in with Google").
  const handleForgot = async (e) => {
    e.preventDefault();
    const target = (forgotEmail || email).trim();
    if (!target) { toast.error('Enter your email first.'); return; }
    setForgotBusy(true);
    try {
      await sendPasswordResetEmail(adminAuth, target);
      toast.success('Reset link sent — check your inbox.');
      setShowForgot(false);
      setForgotEmail('');
    } catch (err) {
      console.error('forgot password error:', err);
      // We DON'T leak "user not found" — that would let attackers probe
      // for valid emails. Always show the same generic success-ish message.
      // (Firebase errors here are usually rate-limit or invalid-email.)
      if (err.code === 'auth/invalid-email') {
        toast.error('That email looks invalid.');
      } else if (err.code === 'auth/too-many-requests') {
        toast.error('Too many attempts. Try again in a few minutes.');
      } else {
        // Show success even if user-not-found to prevent enumeration.
        toast.success('If an account exists, a reset link was sent.');
        setShowForgot(false);
        setForgotEmail('');
      }
    } finally {
      setForgotBusy(false);
    }
  };

  // Helper: route a freshly-authed Google user. Shared between popup and
  // redirect flows so the post-auth logic stays in one place.
  const routeAfterGoogle = async (firebaseUser) => {
    const userData = await getUserData(firebaseUser.uid);
    if (!userData || userData.role !== 'restaurant' || !userData.restaurantId) {
      // Not a registered restaurant — sign out and route to signup.
      try { await fbSignOut(adminAuth); } catch {}
      toast.error("No restaurant linked to that Google account. Sign up first.");
      router.push('/signup?plan=growth');
      return;
    }
    toast.success('Welcome back!');
    router.push('/admin');
  };

  // Detect mobile — same reasoning as signup.js: popup-first +
  // redirect-fallback breaks on mobile browsers because the user
  // gesture is consumed by the popup attempt. Going straight to
  // redirect on mobile sidesteps the entire popup-blocker dance.
  const isMobileDevice = () => {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const mobileUA = /android|iphone|ipad|ipod|opera mini|iemobile|blackberry|webos/i.test(ua);
    const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    return mobileUA || hasTouch;
  };

  // Google sign-in — popup on desktop (nicer UX), redirect on mobile
  // (more reliable). Both flows funnel through routeAfterGoogle().
  const handleGoogleSignIn = async () => {
    setGoogleBusy(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    if (isMobileDevice()) {
      try {
        await signInWithRedirect(adminAuth, provider);
      } catch (redirErr) {
        console.error('Google sign-in (redirect) error:', redirErr);
        toast.error('Google sign-in failed. Please try again.');
        setGoogleBusy(false);
      }
      return;
    }

    try {
      const result = await signInWithPopup(adminAuth, provider);
      await routeAfterGoogle(result.user);
    } catch (err) {
      console.error('Google sign-in (popup) error:', err);
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        setGoogleBusy(false);
      } else if (err.code === 'auth/popup-blocked' || err.code === 'auth/web-storage-unsupported') {
        toast('Opening Google sign-in…');
        try {
          await signInWithRedirect(adminAuth, provider);
        } catch (redirErr) {
          console.error('Google sign-in (redirect) error:', redirErr);
          toast.error('Google sign-in failed. Please try again.');
          setGoogleBusy(false);
        }
      } else if (err.code === 'auth/operation-not-allowed') {
        toast.error('Google sign-in is not enabled. Contact support.');
        setGoogleBusy(false);
      } else {
        toast.error('Google sign-in failed.');
        setGoogleBusy(false);
      }
    }
  };

  // After a redirect-based Google sign-in, Firebase persists the result so
  // calling getRedirectResult() on the page that loads after the redirect
  // returns the user. Returns null if there's no pending redirect (i.e.
  // normal page load), so this is a no-op in that case.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await getRedirectResult(adminAuth);
        if (cancelled || !result) return;
        setGoogleBusy(true);
        await routeAfterGoogle(result.user);
      } catch (err) {
        console.error('getRedirectResult error:', err);
        if (!cancelled) toast.error('Google sign-in did not complete.');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Head>
        <title>Sign In — HaloHelm</title>
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
              Halo<span style={{ color: A.warning, fontStyle: 'italic', fontWeight: 500 }}>Helm</span>
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
                  Halo<span style={{ color: A.warning, fontStyle: 'italic', fontWeight: 500 }}>Helm</span>
                </div>
              </Link>
            </div>

            {/* Standalone-PWA recovery banner — only renders when the
                page is being loaded inside an installed app shell.
                Most owners install the admin PWA from a desktop browser
                and don't see this; staff who installed from
                /staff/login and somehow ended up here get an
                impossible-to-miss button. Plain <a> with a real href
                so it works even if React/Next routing is broken. */}
            {showStandaloneBanner && (
              /* eslint-disable-next-line @next/next/no-html-link-for-pages --
                 intentional plain <a>: full navigation must work even when
                 Next client routing is broken inside a stale-SW PWA. */
              <a
                href="/staff/login"
                onClick={() => {
                  try { localStorage.setItem('ar_last_login_intent', 'staff'); } catch {}
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 12, padding: '16px 18px', marginBottom: 22,
                  borderRadius: 12,
                  background: A.ink, color: A.cream,
                  textDecoration: 'none',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                  border: '1px solid rgba(196,168,109,0.30)',
                }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: A.warning, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 4 }}>
                    Staff member?
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>
                    Continue to Staff Sign-in
                  </div>
                  <div style={{ fontSize: 11.5, color: 'rgba(234,231,227,0.65)', marginTop: 3, lineHeight: 1.4 }}>
                    Kitchen, waiter and captain staff sign in here, not above.
                  </div>
                </div>
                <span style={{ fontSize: 22, color: A.warning, flexShrink: 0 }}>→</span>
              </a>
            )}

            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: A.faintText, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
                Restaurant Admin
              </div>
              <div style={{ fontSize: 28, fontWeight: 600, color: A.ink, letterSpacing: '-0.5px', lineHeight: 1.1, marginBottom: 8 }}>
                Welcome back.
              </div>
              <div style={{ fontSize: 14, color: A.mutedText, lineHeight: 1.55, marginBottom: 14 }}>
                Sign in to your restaurant admin account.
              </div>
              {/* Staff sign-in shortcut. Plain <a> instead of Next.js
                  <Link> because client-side routing inside a standalone
                  PWA (with a service worker mid-update) can silently
                  no-op the click — owner reported this exact symptom.
                  A real href= triggers a full navigation that always
                  works. Also stamps the staff-intent flag on click so
                  next launch of the PWA auto-redirects without any
                  user effort. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
                  intentional plain <a>; see comment above. */}
              <a href="/staff/login"
                onClick={() => {
                  try { localStorage.setItem('ar_last_login_intent', 'staff'); } catch {}
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 8,
                  background: A.cream, border: A.border,
                  fontSize: 12.5, fontWeight: 600, color: A.warningDim,
                  textDecoration: 'none',
                }}>
                Looking for staff sign-in? <span style={{ marginLeft: 2 }}>→</span>
              </a>
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

              {/* Forgot password link — toggles an inline mini-form below. */}
              <div style={{ marginTop: 14, textAlign: 'right' }}>
                <button
                  type="button"
                  onClick={() => { setShowForgot(s => !s); setForgotEmail(email); }}
                  style={{
                    background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
                    fontSize: 12, fontWeight: 600, color: A.mutedText, fontFamily: A.font,
                  }}>
                  Forgot password?
                </button>
              </div>

              {showForgot && (
                <div style={{
                  marginTop: 14, padding: 16,
                  background: A.subtleBg, border: A.border, borderRadius: 10,
                }}>
                  <div style={{ fontSize: 12, color: A.mutedText, lineHeight: 1.5, marginBottom: 10 }}>
                    Enter your email — we'll send a reset link.
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      placeholder="you@restaurant.com"
                      style={{
                        flex: 1, padding: '10px 12px', boxSizing: 'border-box',
                        background: A.shell, border: A.borderStrong, borderRadius: 8,
                        fontSize: 13, color: A.ink, fontFamily: A.font, outline: 'none',
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleForgot}
                      disabled={forgotBusy}
                      style={{
                        padding: '10px 16px', borderRadius: 8, border: 'none',
                        background: A.warning, color: A.ink,
                        fontSize: 13, fontWeight: 600, fontFamily: A.font,
                        cursor: forgotBusy ? 'not-allowed' : 'pointer',
                        opacity: forgotBusy ? 0.6 : 1, whiteSpace: 'nowrap',
                      }}>
                      {forgotBusy ? 'Sending…' : 'Send link'}
                    </button>
                  </div>
                </div>
              )}
            </form>

            {/* OR divider + Google sign-in */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 16px' }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.08)' }} />
              <span style={{ fontSize: 11, color: A.faintText, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Or</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.08)' }} />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleBusy}
              style={{
                width: '100%', padding: '13px',
                borderRadius: 10, border: A.borderStrong,
                background: A.shell, color: A.ink,
                fontSize: 14, fontWeight: 600, fontFamily: A.font,
                cursor: googleBusy ? 'not-allowed' : 'pointer',
                opacity: googleBusy ? 0.6 : 1,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}>
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.71H.957v2.332A8.997 8.997 0 0 0 9 18z" />
                <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" />
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" />
              </svg>
              {googleBusy ? 'Connecting…' : 'Sign in with Google'}
            </button>

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
