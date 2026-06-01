// pages/staff/login.js — kitchen / waiter staff login.
// Flow:
//   1. Enter restaurant code (subdomain), username, 4-6 digit PIN.
//   2. Client resolves subdomain → restaurantId via getRestaurantBySubdomain.
//   3. Client POSTs to /api/staff/login with { restaurantId, username, pin }.
//   4. Server verifies PIN (bcrypt), returns Firebase custom token with
//      claims { role, rid, staffId, kind: 'staff' }.
//   5. Client signs in via signInWithCustomToken(staffAuth, token) — this
//      establishes the persistent Firebase session on staffApp.
//   6. Client also stores a metadata blob in localStorage.ar_staff_session
//      so kitchen.js and waiter.js (which currently read from localStorage
//      to gate access) keep working without modification.
//   7. Redirect to /admin/kitchen or /admin/waiter based on role.
import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { signOut } from 'firebase/auth';
import { useStaffAuth } from '../../hooks/useStaffAuth';
import PwaInstallPrompt from '../../components/PwaInstallPrompt';
import { adminAuth, superAdminAuth } from '../../lib/firebaseAuth';
import { getRestaurantBySubdomain } from '../../lib/db';
import { computeStaffLanding } from '../../lib/permissions';
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
};

export default function StaffLogin() {
  const router = useRouter();
  const { signInWithToken } = useStaffAuth();
  const [subdomain, setSubdomain] = useState('');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  // iOS Add-to-Home-Screen hint. iOS Safari does NOT fire the
  // beforeinstallprompt event that <PwaInstallPrompt /> listens for —
  // so on iPhones the staff would never see an install prompt at all.
  // We show a small one-line hint (visible only on iOS Safari, only
  // when not already installed) telling them to tap Share → Add to
  // Home Screen. Stored-dismissal in localStorage so a staffer who
  // already installed (or said no thanks) doesn't keep seeing it.
  const [showIosHint, setShowIosHint] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Stamp this device as "staff intent" — used by /admin/login to
    // auto-redirect a staff member who installed the OLD PWA (when
    // the static manifest still pointed to /admin) back to the right
    // sign-in screen instead of stranding them on the owner login.
    try { localStorage.setItem('ar_last_login_intent', 'staff'); } catch {}
    try {
      // Already installed? Don't nag.
      if (window.matchMedia?.('(display-mode: standalone)').matches) return;
      if (window.navigator?.standalone === true) return;
      // Dismissed before? Don't show again.
      if (localStorage.getItem('ar_staff_ios_hint_dismissed') === '1') return;
    } catch {}
    const ua = (navigator.userAgent || '').toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isSafari = /safari/.test(ua) && !/crios|fxios|edgios/.test(ua);
    if (isIOS && isSafari) setShowIosHint(true);
  }, []);
  const dismissIosHint = () => {
    setShowIosHint(false);
    try { localStorage.setItem('ar_staff_ios_hint_dismissed', '1'); } catch {}
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanSubdomain = subdomain.trim().toLowerCase();
    if (!cleanSubdomain) { toast.error('Enter your restaurant code.'); return; }
    if (!username.trim()) { toast.error('Enter your username.'); return; }
    if (!pin.trim() || pin.trim().length < 4) { toast.error('Enter your 4-6 digit PIN.'); return; }

    setLoading(true);
    try {
      // Step 1: resolve subdomain to restaurantId
      const restaurant = await getRestaurantBySubdomain(cleanSubdomain);
      if (!restaurant) {
        toast.error(`Restaurant "${cleanSubdomain}" not found.`);
        setLoading(false);
        return;
      }

      // Step 2: server-side PIN verification, returns a Firebase custom token
      const res = await fetch('/api/staff/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: restaurant.id,
          username: username.trim(),
          pin: pin.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Login failed.');
        setLoading(false);
        return;
      }

      // Step 2.5 (18 May 2026): kill any active admin / superadmin
      // sessions on the SAME browser BEFORE the staff session
      // takes effect. Without this, /admin/kitchen and /admin/waiter
      // see `userData?.restaurantId` from the lingering admin
      // session and treat the user as admin instead of routing them
      // through the staff path (which is what was happening when
      // Prabu reported "staff login giving them access to all").
      // signOut is silent if no session exists, so this is safe
      // even when the user has never signed in as admin.
      try { await signOut(adminAuth); }      catch {}
      try { await signOut(superAdminAuth); } catch {}

      // Step 3: sign in to the staff Firebase app (so Firestore rules see claims)
      await signInWithToken(data.token);

      // Step 4: metadata blob for kitchen.js/waiter.js + StaffShell. Now
      // also carries the staffer's resolved permissions + roleId (Phase 8)
      // so the staff UI can gate nav/pages. (The authoritative copy lives in
      // the token claims, read by Firestore rules.)
      try {
        localStorage.setItem('ar_staff_session', JSON.stringify({
          staffId: data.staffId,
          name: data.name,
          role: data.role,
          restaurantId: data.restaurantId,
          restaurantName: restaurant.name,
          perms: Array.isArray(data.perms) ? data.perms : [],
          roleId: data.roleId || null,
          kind: 'staff',
          loggedInAt: new Date().toISOString(),
        }));
      } catch {}

      toast.success(`Welcome, ${data.name}!`);

      // Step 5: redirect. A staffer with a custom access role lands on the
      // staff home hub (StaffShell with their permitted nav — never the bare
      // kitchen screen), where they can see + reach everything their role
      // grants. Pure station staff (no custom role) go straight to their
      // dedicated kitchen / waiter screen as before.
      //
      // Important: send them to /staff/kitchen and /staff/waiter (NOT
      // /admin/kitchen / /admin/waiter). The next.config.js afterFiles
      // rewrite serves the same admin/kitchen.js / admin/waiter.js
      // page content under those /staff/ URLs, but the visible URL
      // stays inside the installed staff PWA's manifest scope
      // ("/staff/"). Without this, iOS Safari treats the navigation
      // as "out of scope" and pops the page out into an in-app Safari
      // sheet (the brown "Done" bar at top of screen) — and tapping
      // Done in that sheet kills the session. Same risk on Android
      // Chrome (opens Custom Tab look). Keeping the URL in scope
      // keeps the user inside the PWA shell.
      const landing = data.roleId
        ? '/staff/home'
        : (data.role === 'kitchen' ? '/staff/kitchen' : data.role === 'waiter' ? '/staff/waiter' : '/staff/home');
      router.push(landing);
    } catch (err) {
      console.error('Staff login error:', err);
      toast.error('Login failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Staff Sign In — HaloHelm</title>
      </Head>

      <div style={{ minHeight: '100vh', background: A.cream, fontFamily: A.font, color: A.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <style>{`
          @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
          @keyframes spin { to { transform: rotate(360deg); } }
          .staff-input:focus { border-color: ${A.ink}; box-shadow: 0 0 0 3px rgba(0,0,0,0.04); }
          .staff-submit:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(0,0,0,0.14); }
          .staff-submit:disabled { opacity: 0.5; cursor: not-allowed; }
        `}</style>

        <div style={{ width: '100%', maxWidth: 420, animation: 'fadeUp 0.4s ease both' }}>
          {/* iOS Safari install hint — desktop-style toast at the top
              telling iPhone staff how to add the app to their home
              screen. Hidden after dismissal. */}
          {showIosHint && (
            <div style={{
              background: 'rgba(26,26,26,0.95)', color: A.cream,
              borderRadius: 12, padding: '12px 14px', marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 12,
              boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
              fontFamily: A.font, fontSize: 12.5, lineHeight: 1.45,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>Add to Home Screen</div>
                <div style={{ opacity: 0.75 }}>
                  Tap the <strong>Share</strong> button below, then choose <strong>Add to Home Screen</strong> — the app launches straight into staff sign-in.
                </div>
              </div>
              <button onClick={dismissIosHint}
                aria-label="Dismiss"
                style={{ background: 'none', border: 'none', color: A.cream, opacity: 0.6, fontSize: 18, cursor: 'pointer', padding: 4, lineHeight: 1 }}>
                ×
              </button>
            </div>
          )}

          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <Link href="/" style={{ textDecoration: 'none' }}>
              <div style={{ fontFamily: A.font, fontWeight: 600, fontSize: 22, color: A.ink, letterSpacing: '-0.4px' }}>
                Halo<span style={{ color: A.warning, fontStyle: 'italic', fontWeight: 500 }}>Helm</span>
              </div>
            </Link>
            <div style={{ fontSize: 11, fontWeight: 600, color: A.faintText, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 10 }}>
              Staff Portal
            </div>
          </div>

          <div style={{
            background: A.shell, borderRadius: 14, border: A.border,
            padding: '32px 28px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
          }}>
            <div style={{ marginBottom: 26 }}>
              <div style={{ fontSize: 22, fontWeight: 600, color: A.ink, letterSpacing: '-0.4px', lineHeight: 1.15, marginBottom: 6 }}>
                Sign in to your station.
              </div>
              <div style={{ fontSize: 13, color: A.mutedText, lineHeight: 1.55 }}>
                Kitchen or waiter staff only. Ask your manager for your username and PIN.
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: A.faintText, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 7 }}>
                  Restaurant Code
                </label>
                <input
                  className="staff-input" type="text"
                  value={subdomain} onChange={e => setSubdomain(e.target.value)}
                  placeholder="e.g. taj" autoComplete="off" autoCapitalize="none" required
                  style={{
                    width: '100%', padding: '12px 14px', boxSizing: 'border-box',
                    background: A.shell, border: A.borderStrong, borderRadius: 10,
                    fontSize: 14, color: A.ink, fontFamily: A.font, outline: 'none',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: A.faintText, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 7 }}>
                  Username
                </label>
                <input
                  className="staff-input" type="text"
                  value={username} onChange={e => setUsername(e.target.value)}
                  placeholder="e.g. rajesh" autoComplete="username" autoCapitalize="none" required
                  style={{
                    width: '100%', padding: '12px 14px', boxSizing: 'border-box',
                    background: A.shell, border: A.borderStrong, borderRadius: 10,
                    fontSize: 14, color: A.ink, fontFamily: A.font, outline: 'none',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                />
              </div>

              <div style={{ marginBottom: 26 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: A.faintText, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 7 }}>
                  PIN
                </label>
                <input
                  className="staff-input" type="password" inputMode="numeric" pattern="[0-9]*"
                  value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="4-6 digits" autoComplete="current-password" required
                  style={{
                    width: '100%', padding: '12px 14px', boxSizing: 'border-box',
                    background: A.shell, border: A.borderStrong, borderRadius: 10,
                    fontSize: 18, color: A.ink, fontFamily: "'JetBrains Mono', monospace",
                    letterSpacing: '0.3em', outline: 'none',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                />
              </div>

              <button
                className="staff-submit" type="submit" disabled={loading}
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
          </div>

          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: A.faintText }}>
            Owner? <Link href="/admin/login" style={{ color: A.warning, fontWeight: 600, textDecoration: 'none' }}>Admin sign-in →</Link>
          </div>
        </div>
      </div>
      {/* Android/Chrome Install button — fires when browser supports
          beforeinstallprompt (iPhones use the hint at the top instead). */}
      <PwaInstallPrompt />
    </>
  );
}

// Bypass AdminLayout — staff login is a standalone page.
StaffLogin.getLayout = (page) => page;
