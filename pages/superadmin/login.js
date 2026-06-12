import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/router';
import {
  getMultiFactorResolver,
  TotpMultiFactorGenerator,
  multiFactor,
  sendEmailVerification,
  sendPasswordResetEmail,
} from 'firebase/auth';
import QRCode from 'qrcode';
import { superAdminAuth } from '../../lib/firebaseAuth';
import { useSuperAdminAuth } from '../../hooks/useAuth';
import { getUserData } from '../../lib/saDb';
import toast from 'react-hot-toast';

// ── TOTP 2FA (2026-06-11 audit #10) ──────────────────────────────────
// The superadmin account controls every restaurant, so password-only
// login was the platform's single point of total takeover. Flow:
//
//   1. CHALLENGE — if the Firebase user has a TOTP factor enrolled,
//      signInWithEmailAndPassword throws auth/multi-factor-auth-required
//      and we ask for the 6-digit authenticator code. This is enforced
//      by Firebase itself once enrolled — no env flag can bypass it.
//   2. ENROLLMENT — gated on NEXT_PUBLIC_SA_MFA_ENFORCE === 'true'.
//      When on and the signed-in superadmin has no TOTP factor yet, we
//      block the redirect and walk them through enrollment (QR code +
//      first code). Env-gated so deploying this code changes nothing
//      until Prabu (a) enables TOTP MFA in Firebase Console and
//      (b) sets the flag — see SETUP_MFA.md.
//
// Recovery if the authenticator is lost: Firebase Console →
// Authentication → Users → the superadmin user → remove the MFA
// factor, then re-enroll at next login. (Console access = Google
// account, which has its own recovery.)
const MFA_ENFORCE = process.env.NEXT_PUBLIC_SA_MFA_ENFORCE === 'true';

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
  // stage: 'password' → 'totp-challenge' (enrolled users) or
  //        'totp-enroll' (enforcement on, not yet enrolled)
  const [stage, setStage] = useState('password');
  const [code, setCode] = useState('');
  const [mfaResolver, setMfaResolver] = useState(null);
  const [totpSecret, setTotpSecret] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const { signIn, signOut } = useSuperAdminAuth();
  const router = useRouter();

  // Post-password gate shared by the initial sign-in and the TOTP
  // challenge path: verify the superadmin role, then either enrol
  // (enforcement on + no factor yet) or proceed to the dashboard.
  const afterSignIn = async (user) => {
    const userData = await getUserData(user.uid);
    if (!userData || userData.role !== 'superadmin') {
      await signOut(); toast.error('Access denied.'); setLoading(false);
      setStage('password');
      return;
    }
    const enrolled = multiFactor(user).enrolledFactors || [];
    if (MFA_ENFORCE && enrolled.length === 0) {
      // Block the dashboard until an authenticator is enrolled.
      try {
        const session = await multiFactor(user).getSession();
        const secret = await TotpMultiFactorGenerator.generateSecret(session);
        setTotpSecret(secret);
        const otpauth = secret.generateQrCodeUrl(email || user.email || 'superadmin', 'HaloHelm');
        try { setQrDataUrl(await QRCode.toDataURL(otpauth, { margin: 1, width: 220 })); } catch {}
        setStage('totp-enroll');
        setLoading(false);
      } catch (err) {
        if (err?.code === 'auth/operation-not-allowed') {
          // TOTP provider not yet enabled in Firebase Console — don't
          // lock the owner out of his own console over a half-done
          // setup. Let him in, loudly.
          toast.error('2FA enforcement is on but TOTP isn\'t enabled in Firebase Console yet — see SETUP_MFA.md. Letting you in WITHOUT 2FA.', { duration: 8000 });
          router.push('/superadmin');
        } else if (err?.code === 'auth/unverified-email') {
          // Firebase requires a VERIFIED email before second factors can
          // be enrolled (the verified inbox is the MFA recovery anchor).
          // Send the verification link and explain the loop. We sign out
          // so the half-authenticated session doesn't linger.
          try { await sendEmailVerification(user); } catch {}
          toast.error(
            `Your email (${user.email}) must be verified before 2FA can be set up. ` +
            'We just sent a verification link — click it, then sign in again.',
            { duration: 10000 }
          );
          await signOut();
          setLoading(false);
          setStage('password');
        } else {
          console.error('TOTP enrollment setup failed:', err);
          toast.error('Could not start 2FA setup: ' + (err?.message || err?.code || 'unknown'));
          setLoading(false);
        }
      }
      return;
    }
    toast.success('Welcome, Admin!'); router.push('/superadmin');
  };

  // Recovery path (12 Jun 2026): the superadmin login had NO forgot-
  // password flow — a lost password was a dead end. Standard Firebase
  // reset email; same response either way so account existence can't
  // be probed from this form.
  const handleForgotPassword = async () => {
    const target = email.trim();
    if (!target) { toast.error('Type your email above first, then tap Forgot password.'); return; }
    try {
      await sendPasswordResetEmail(superAdminAuth, target);
    } catch (err) {
      // Swallow user-not-found etc. — identical messaging by design.
      console.warn('reset email:', err?.code);
    }
    toast.success(`If an account exists for ${target}, a password-reset link is on its way.`, { duration: 7000 });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const cred = await signIn(email, password);
      await afterSignIn(cred.user);
    } catch (err) {
      if (err?.code === 'auth/multi-factor-auth-required') {
        // Account has a TOTP factor — Firebase demands the code.
        setMfaResolver(getMultiFactorResolver(superAdminAuth, err));
        setStage('totp-challenge');
        setLoading(false);
        return;
      }
      toast.error(err.code === 'auth/invalid-credential' ? 'Invalid email or password.' : 'Login failed.'); setLoading(false);
    }
  };

  // Stage 2a — enrolled user typed their authenticator code.
  const handleChallenge = async (e) => {
    e.preventDefault();
    if (!mfaResolver || code.trim().length !== 6) return;
    setLoading(true);
    try {
      const hint = mfaResolver.hints.find(h => h.factorId === TotpMultiFactorGenerator.FACTOR_ID) || mfaResolver.hints[0];
      const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code.trim());
      const cred = await mfaResolver.resolveSignIn(assertion);
      setCode('');
      await afterSignIn(cred.user);
    } catch (err) {
      toast.error(err?.code === 'auth/invalid-verification-code'
        ? 'Wrong code. Check your authenticator app and try again.'
        : 'Verification failed: ' + (err?.message || err?.code || 'unknown'));
      setLoading(false);
    }
  };

  // Stage 2b — first-time enrollment: verify the first code from the
  // authenticator app, then attach the factor to the account.
  const handleEnroll = async (e) => {
    e.preventDefault();
    if (!totpSecret || code.trim().length !== 6) return;
    setLoading(true);
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(totpSecret, code.trim());
      await multiFactor(superAdminAuth.currentUser).enroll(assertion, 'Authenticator app');
      toast.success('2FA enabled. From now on, login needs your authenticator code.');
      setCode(''); setTotpSecret(null); setQrDataUrl(null);
      router.push('/superadmin');
    } catch (err) {
      toast.error(err?.code === 'auth/invalid-verification-code'
        ? 'Wrong code. Scan the QR again or re-type the code from your app.'
        : 'Enrollment failed: ' + (err?.message || err?.code || 'unknown'));
      setLoading(false);
    }
  };

  return (
    <>
      <Head><title>Super Admin — HaloHelm</title></Head>
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
                    Halo<span style={{ color: A.warning, fontStyle: 'italic' }}>Helm</span>
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
              {stage === 'password' && (
                <>
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
                      <input className="sa-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@HaloHelm.com" required />
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: A.faintText, marginBottom: 7, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Password</label>
                      <input className="sa-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
                    </div>
                    <div style={{ textAlign: 'right', marginBottom: 16 }}>
                      <button type="button" onClick={handleForgotPassword} style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        fontSize: 12, fontWeight: 600, color: A.warningDim, fontFamily: A.font,
                      }}>Forgot password?</button>
                    </div>
                    <button type="submit" className="sa-btn" disabled={loading}>
                      {loading ? 'Verifying…' : 'Access Dashboard →'}
                    </button>
                  </form>
                </>
              )}

              {stage === 'totp-challenge' && (
                <>
                  <div style={{ marginBottom: 28 }}>
                    <div style={{ fontFamily: A.font, fontSize: 11, fontWeight: 600, color: A.warningDim, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                      Two-factor authentication
                    </div>
                    <h1 style={{ fontFamily: A.font, fontWeight: 600, fontSize: 26, color: A.ink, letterSpacing: '-0.4px', margin: 0, lineHeight: 1.2 }}>Enter your code</h1>
                    <p style={{ fontSize: 13, color: A.mutedText, lineHeight: 1.6, marginTop: 8, marginBottom: 0 }}>
                      Open your authenticator app and type the 6-digit code for HaloHelm.
                    </p>
                  </div>
                  <form onSubmit={handleChallenge}>
                    <div style={{ marginBottom: 22 }}>
                      <input
                        className="sa-input" inputMode="numeric" autoFocus
                        value={code}
                        onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="123456"
                        style={{ fontSize: 24, letterSpacing: '0.4em', textAlign: 'center', fontFamily: "'JetBrains Mono', monospace" }}
                      />
                    </div>
                    <button type="submit" className="sa-btn" disabled={loading || code.length !== 6}>
                      {loading ? 'Verifying…' : 'Verify →'}
                    </button>
                  </form>
                  <button
                    onClick={() => { setStage('password'); setCode(''); setMfaResolver(null); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', marginTop: 16, fontSize: 12, color: A.faintText, fontFamily: A.font }}
                  >← Use a different account</button>
                </>
              )}

              {stage === 'totp-enroll' && (
                <>
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontFamily: A.font, fontSize: 11, fontWeight: 600, color: A.warningDim, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                      One-time setup
                    </div>
                    <h1 style={{ fontFamily: A.font, fontWeight: 600, fontSize: 24, color: A.ink, letterSpacing: '-0.4px', margin: 0, lineHeight: 1.2 }}>Protect this account</h1>
                    <p style={{ fontSize: 13, color: A.mutedText, lineHeight: 1.6, marginTop: 8, marginBottom: 0 }}>
                      Scan this QR with Google Authenticator (or any authenticator app),
                      then enter the 6-digit code it shows.
                    </p>
                  </div>
                  {qrDataUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={qrDataUrl} alt="Scan with your authenticator app"
                      style={{ width: 180, height: 180, alignSelf: 'center', borderRadius: 10, border: A.borderStrong, marginBottom: 12 }} />
                  ) : null}
                  {totpSecret?.secretKey && (
                    <div style={{
                      fontSize: 11, color: A.mutedText, textAlign: 'center', marginBottom: 16,
                      fontFamily: "'JetBrains Mono', monospace", wordBreak: 'break-all', lineHeight: 1.5,
                    }}>
                      Can't scan? Enter manually: <b>{totpSecret.secretKey}</b>
                      <br />
                      <span style={{ color: A.danger }}>Write this key down somewhere safe — it's your backup if you lose the phone.</span>
                    </div>
                  )}
                  <form onSubmit={handleEnroll}>
                    <div style={{ marginBottom: 18 }}>
                      <input
                        className="sa-input" inputMode="numeric" autoFocus
                        value={code}
                        onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="123456"
                        style={{ fontSize: 24, letterSpacing: '0.4em', textAlign: 'center', fontFamily: "'JetBrains Mono', monospace" }}
                      />
                    </div>
                    <button type="submit" className="sa-btn" disabled={loading || code.length !== 6}>
                      {loading ? 'Enabling…' : 'Enable 2FA →'}
                    </button>
                  </form>
                </>
              )}

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
