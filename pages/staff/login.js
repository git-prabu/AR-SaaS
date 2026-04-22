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
import { useState } from 'react';
import { useRouter } from 'next/router';
import { useStaffAuth } from '../../hooks/useStaffAuth';
import { getRestaurantBySubdomain } from '../../lib/db';
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

      // Step 3: sign in to the staff Firebase app (so Firestore rules see claims)
      await signInWithToken(data.token);

      // Step 4: metadata blob for kitchen.js/waiter.js localStorage check (compat)
      try {
        localStorage.setItem('ar_staff_session', JSON.stringify({
          staffId: data.staffId,
          name: data.name,
          role: data.role,
          restaurantId: data.restaurantId,
          restaurantName: restaurant.name,
          loggedInAt: new Date().toISOString(),
        }));
      } catch {}

      toast.success(`Welcome, ${data.name}!`);

      // Step 5: redirect by role
      if (data.role === 'kitchen')      router.push('/admin/kitchen');
      else if (data.role === 'waiter')  router.push('/admin/waiter');
      else                               router.push('/');
    } catch (err) {
      console.error('Staff login error:', err);
      toast.error('Login failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Staff Sign In — Advert Radical</title>
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
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <Link href="/" style={{ textDecoration: 'none' }}>
              <div style={{ fontFamily: A.font, fontWeight: 600, fontSize: 22, color: A.ink, letterSpacing: '-0.4px' }}>
                Advert <span style={{ color: A.warning, fontStyle: 'italic', fontWeight: 500 }}>Radical</span>
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
    </>
  );
}

// Bypass AdminLayout — staff login is a standalone page.
StaffLogin.getLayout = (page) => page;
