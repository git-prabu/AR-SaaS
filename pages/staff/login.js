import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getRestaurantById, verifyStaffLogin } from '../../lib/db';

export default function StaffLogin() {
  const router = useRouter();
  const { rid } = router.query;

  const [restaurant, setRestaurant] = useState(null);
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fetchingRestaurant, setFetchingRestaurant] = useState(true);

  // Load restaurant name
  useEffect(() => {
    if (!rid) return;
    getRestaurantById(rid)
      .then(r => setRestaurant(r))
      .catch(() => {})
      .finally(() => setFetchingRestaurant(false));
  }, [rid]);

  // Check if already logged in
  useEffect(() => {
    try {
      const s = localStorage.getItem('ar_staff_session');
      if (!s) return;
      const session = JSON.parse(s);
      const hours = (Date.now() - new Date(session.loggedInAt).getTime()) / 3600000;
      if (hours < 12) {
        router.replace(session.role === 'kitchen' ? '/admin/kitchen' : '/admin/waiter');
      } else {
        localStorage.removeItem('ar_staff_session');
      }
    } catch {}
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!rid) { setError('Invalid login link. Ask your manager for the correct link.'); return; }
    if (!username.trim() || !pin.trim()) { setError('Enter your username and PIN.'); return; }

    setLoading(true);
    setError('');
    try {
      const staff = await verifyStaffLogin(rid, username.trim().toLowerCase(), pin.trim());
      if (!staff) {
        setError('Incorrect username or PIN. Try again.');
        setLoading(false);
        return;
      }
      // Save session
      localStorage.setItem('ar_staff_session', JSON.stringify({
        restaurantId: rid,
        restaurantName: restaurant?.name || '',
        staffId: staff.id,
        name: staff.name,
        role: staff.role,
        loggedInAt: new Date().toISOString(),
      }));
      router.replace(staff.role === 'kitchen' ? '/admin/kitchen' : '/admin/waiter');
    } catch (e) {
      setError('Login failed. Please try again.');
      setLoading(false);
    }
  };

  if (!rid && typeof window !== 'undefined') {
    return (
      <div style={{ minHeight: '100vh', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', color: '#fff' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
          <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 20, marginBottom: 8 }}>Invalid Login Link</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Please use the link provided by your restaurant manager.</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head><title>Staff Login | Advert Radical</title></Head>
      <div style={{
        minHeight: '100vh', background: 'linear-gradient(135deg,#0F0F0F 0%,#1A1612 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        fontFamily: 'Inter,sans-serif',
      }}>
        <div style={{ width: '100%', maxWidth: 380 }}>

          {/* Logo + Restaurant */}
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 900, fontSize: 22, marginBottom: 6 }}>
              <span style={{ color: '#fff' }}>Advert </span>
              <span style={{ color: '#F79B3D' }}>Radical</span>
            </div>
            {fetchingRestaurant ? (
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading…</div>
            ) : restaurant ? (
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, fontWeight: 600 }}>{restaurant.name}</div>
            ) : (
              <div style={{ color: '#E05A3A', fontSize: 13 }}>Restaurant not found</div>
            )}
          </div>

          {/* Card */}
          <div style={{
            background: '#1C1C1C', borderRadius: 20, padding: '32px 28px',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 20, color: '#fff', marginBottom: 6 }}>
              Staff Login
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 28 }}>
              Enter your username and PIN to continue
            </div>

            <form onSubmit={handleLogin}>
              {/* Username */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoCapitalize="none"
                  autoComplete="username"
                  placeholder="e.g. kitchen1"
                  style={{
                    width: '100%', padding: '13px 16px', borderRadius: 12, fontSize: 15,
                    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                    color: '#fff', outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* PIN */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                  PIN
                </label>
                <input
                  type="password"
                  value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  placeholder="4-6 digit PIN"
                  style={{
                    width: '100%', padding: '13px 16px', borderRadius: 12, fontSize: 20,
                    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                    color: '#fff', outline: 'none', boxSizing: 'border-box', letterSpacing: '0.3em',
                  }}
                />
              </div>

              {/* Error */}
              {error && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(224,90,58,0.12)', border: '1px solid rgba(224,90,58,0.3)', color: '#E05A3A', fontSize: 13, marginBottom: 16 }}>
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !username || !pin}
                style={{
                  width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                  background: 'linear-gradient(135deg,#F79B3D,#F48A1E)',
                  color: '#fff', fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: (!username || !pin) ? 0.5 : 1,
                  fontFamily: 'Poppins,sans-serif',
                }}
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          </div>

          <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>
            Lost your credentials? Ask your restaurant manager.
          </div>
        </div>
      </div>
    </>
  );
}
