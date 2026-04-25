import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/router';
import { useSuperAdminAuth } from '../../hooks/useAuth';
import { getUserData } from '../../lib/saDb';
import toast from 'react-hot-toast';

// ═══ Aspire palette — same tokens as admin/login + admin pages ═══
const A = {
  font: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  cream: '#EDEDED',
  ink: '#1A1A1A',
  shell: '#FFFFFF',
  warning: '#C4A86D',
  warningDim: '#A08656',
  success: '#3F9E5A',
  danger: '#D9534F',
  mutedText: 'rgba(0,0,0,0.55)',
  faintText: 'rgba(0,0,0,0.38)',
  subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)',
  borderStrong: '1px solid rgba(0,0,0,0.10)',
  // Matte-black tokens for the signature card
  forest: '#1A1A1A',
  forestDarker: '#2A2A2A',
  forestText: '#EAE7E3',
  forestTextMuted: 'rgba(234,231,227,0.55)',
  forestTextFaint: 'rgba(234,231,227,0.35)',
  forestSubtleBg: 'rgba(255,255,255,0.04)',
  forestBorder: '1px solid rgba(255,255,255,0.06)',
};

export default function SuperAdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signOut } = useSuperAdminAuth();
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const cred = await signIn(email, password);
      const userData = await getUserData(cred.user.uid);
      if (!userData || userData.role !== 'superadmin') {
        await signOut(); toast.error('Access denied.'); setLoading(false); return;
      }
      toast.success('Welcome, Admin!'); router.push('/superadmin');
    } catch (err) {
      toast.error(err.code === 'auth/invalid-credential' ? 'Invalid email or password.' : 'Login failed.'); setLoading(false);
    }
  };

  return (
    <>
      <Head><title>Super Admin — Advert Radical</title></Head>
      <div style={{
        minHeight: '100vh', background: A.cream, fontFamily: A.font,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 24px',
      }}>
        <style>{`
          @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
          @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
          .sa-input {
            width: 100%; padding: 12px 14px; box-sizing: border-box;
            background: ${A.shell};
            border: ${A.borderStrong}; border-radius: 10px;
            font-size: 14px; font-family: ${A.font};
            color: ${A.ink}; outline: none;
            transition: border-color 0.15s, box-shadow 0.15s;
          }
          .sa-input:focus {
            border-color: ${A.warning};
            box-shadow: 0 0 0 3px rgba(196,168,109,0.18);
          }
          .sa-input::placeholder { color: ${A.faintText}; }
          .sa-btn {
            width: 100%; padding: 13px 16px; border-radius: 10px; border: none;
            background: ${A.ink}; color: ${A.cream};
            font-family: ${A.font}; font-weight: 600; font-size: 14px;
            cursor: pointer; transition: all 0.15s;
            box-shadow: 0 2px 8px rgba(0,0,0,0.10);
            letterSpacing: '0.01em';
          }
          .sa-btn:hover:not(:disabled) { background: #2A2A2A; box-shadow: 0 4px 14px rgba(0,0,0,0.15); }
          .sa-btn:disabled { opacity: 0.5; cursor: not-allowed; }
          .sa-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
          @media (max-width: 860px) {
            .sa-grid { grid-template-columns: 1fr; }
            .sa-preview { display: none !important; }
          }
        `}</style>

        <div style={{
          width: '100%', maxWidth: 920,
          background: A.shell, borderRadius: 16, overflow: 'hidden',
          border: A.border, boxShadow: '0 12px 40px rgba(0,0,0,0.08)',
          animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both',
        }}>
          <div className="sa-grid">
            {/* ── Left preview panel — matte black "ACCESS LOG" signature card ── */}
            <div className="sa-preview" style={{
              background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
              padding: '40px 36px',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              minHeight: 480,
              position: 'relative',
            }}>
              <div>
                {/* Brand */}
                <Link href="/" style={{ textDecoration: 'none' }}>
                  <div style={{ fontFamily: A.font, fontWeight: 700, fontSize: 20, color: A.forestText, letterSpacing: '-0.3px' }}>
                    Advert <span style={{ color: A.warning, fontStyle: 'italic' }}>Radical</span>
                  </div>
                </Link>
                <div style={{ fontSize: 10, color: A.warning, marginTop: 6, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Super Admin Console</div>
              </div>

              {/* Mid: pulsing access-log indicator + copy */}
              <div style={{ marginTop: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: A.warning, animation: 'pulse 2s ease infinite', boxShadow: '0 0 8px rgba(196,168,109,0.6)' }} />
                  <span style={{ fontFamily: A.font, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: A.warning }}>Access Log Active</span>
                </div>
                <div style={{ fontFamily: A.font, fontSize: 18, fontWeight: 600, color: A.forestText, lineHeight: 1.4, letterSpacing: '-0.2px', marginBottom: 10 }}>
                  Internal access only.
                </div>
                <div style={{ fontFamily: A.font, fontSize: 13, color: A.forestTextMuted, lineHeight: 1.6 }}>
                  Every login attempt is recorded. Use only the credentials issued
                  to platform administrators.
                </div>
              </div>

              {/* Bottom: timestamp footer */}
              <div style={{ fontSize: 10, color: A.forestTextFaint, fontWeight: 500, letterSpacing: '0.04em' }}>
                {new Date().toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>

            {/* ── Right form panel ── */}
            <div style={{ padding: '40px 44px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontFamily: A.font, fontSize: 11, fontWeight: 600, color: A.warningDim, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Sign in
                </div>
                <h1 style={{ fontFamily: A.font, fontWeight: 600, fontSize: 26, color: A.ink, letterSpacing: '-0.4px', margin: 0, lineHeight: 1.2 }}>Super Admin</h1>
                <p style={{ fontSize: 13, color: A.mutedText, lineHeight: 1.6, marginTop: 8, marginBottom: 0 }}>
                  Platform-level access for plan and restaurant management.
                </p>
              </div>

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: A.faintText, marginBottom: 7, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Email</label>
                  <input className="sa-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@advertradical.com" required />
                </div>
                <div style={{ marginBottom: 22 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: A.faintText, marginBottom: 7, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Password</label>
                  <input className="sa-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
                </div>
                <button type="submit" className="sa-btn" disabled={loading}>
                  {loading ? 'Verifying…' : 'Access Dashboard →'}
                </button>
              </form>

              <div style={{ textAlign: 'center', marginTop: 22 }}>
                <Link href="/" style={{ fontSize: 12, color: A.faintText, textDecoration: 'none', transition: 'color 0.15s', fontFamily: A.font }}
                  onMouseOver={e => e.currentTarget.style.color = A.mutedText}
                  onMouseOut={e => e.currentTarget.style.color = A.faintText}>
                  ← Back to homepage
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
