import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut as fbSignOut,
} from 'firebase/auth';
import { adminAuth } from '../lib/firebaseAuth';
import { createRestaurant, createUserDoc, getRestaurantBySubdomain, getUserData } from '../lib/db';
import { getPlan, normalizePlanId, TRIAL_DAYS } from '../lib/plans';
import toast from 'react-hot-toast';

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}

export default function Signup() {
  const router = useRouter();
  const { plan: planKey } = router.query;
  const activePlanKey = normalizePlanId(planKey);
  const plan = getPlan(activePlanKey);
  // Display-friendly price like "₹999/month" for the badge under the logo.
  const planPriceLabel = `${plan.priceDisplay}${plan.period}`;

  // Form fields
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [subdomainEdited, setSubdomainEdited] = useState(false);
  const [city, setCity] = useState('');

  // State
  const [step, setStep] = useState('form'); // 'form' | 'creating' | 'done' | 'verify'
  const [error, setError] = useState('');
  const [subdomainStatus, setSubdomainStatus] = useState(null); // null | 'checking' | 'available' | 'taken'
  // Google-auth state — when present, we skip password creation and use the
  // already-signed-in Firebase user. The form pre-fills name + email from the
  // Google profile but still asks for restaurant info (name/subdomain/phone/city).
  const [googleUser, setGoogleUser] = useState(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  // After-signup state for the "check your inbox" notice (email/password flow only).
  const [verifyEmail, setVerifyEmail] = useState('');

  // Auto-generate subdomain from restaurant name
  useEffect(() => {
    if (!subdomainEdited && restaurantName) {
      setSubdomain(slugify(restaurantName));
    }
  }, [restaurantName, subdomainEdited]);

  // Check subdomain availability (debounced)
  useEffect(() => {
    if (!subdomain || subdomain.length < 3) { setSubdomainStatus(null); return; }
    setSubdomainStatus('checking');
    const t = setTimeout(async () => {
      try {
        const existing = await getRestaurantBySubdomain(subdomain);
        setSubdomainStatus(existing ? 'taken' : 'available');
      } catch {
        setSubdomainStatus(null);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [subdomain]);

  // ── Google sign-up ─────────────────────────────────────────────────
  // Helper: handle a freshly-authed Google user. Either bounce to /admin if
  // they already have a restaurant doc, or pre-fill the form so they can
  // finish the restaurant info collection.
  const handleGoogleResult = async (fbUser) => {
    const existing = await getUserData(fbUser.uid);
    if (existing && existing.role === 'restaurant' && existing.restaurantId) {
      toast.success('Welcome back!');
      router.push('/admin');
      return;
    }
    // First time — pre-fill what Google gave us, reveal restaurant fields.
    setGoogleUser(fbUser);
    setOwnerName(fbUser.displayName || '');
    setEmail(fbUser.email || '');
  };

  // Detect mobile UA + touch capability. The previous popup-first +
  // redirect-fallback flow broke on mobile because the user-gesture
  // context is consumed by the popup attempt — by the time the catch
  // block tries signInWithRedirect, Chrome on Android has already
  // discarded the gesture and blocks the redirect too. Detecting
  // mobile upfront and going STRAIGHT to redirect sidesteps the issue
  // (redirect doesn't need an active gesture, just any user-initiated
  // event handler call). Desktop keeps the nicer popup UX.
  const isMobileDevice = () => {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const mobileUA = /android|iphone|ipad|ipod|opera mini|iemobile|blackberry|webos/i.test(ua);
    const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    return mobileUA || hasTouch;
  };

  const handleGoogleSignup = async () => {
    setError('');
    setGoogleBusy(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    // Mobile path — always redirect. No popup attempt, no race with
    // browser gesture timeout. The result is picked up by the
    // useEffect below on the page that loads after the redirect.
    if (isMobileDevice()) {
      try {
        await signInWithRedirect(adminAuth, provider);
        // Page navigates away — no further code runs here.
      } catch (redirErr) {
        console.error('Google signup (redirect) error:', redirErr);
        setError('Google sign-up failed. Please try again.');
        setGoogleBusy(false);
      }
      return;
    }

    // Desktop path — popup is nicer UX; fall back to redirect if a
    // strict popup blocker / iframe context blocks it.
    try {
      const result = await signInWithPopup(adminAuth, provider);
      await handleGoogleResult(result.user);
    } catch (err) {
      console.error('Google signup (popup) error:', err);
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        setGoogleBusy(false);
      } else if (err.code === 'auth/popup-blocked' || err.code === 'auth/web-storage-unsupported') {
        toast('Opening Google sign-in…');
        try {
          await signInWithRedirect(adminAuth, provider);
        } catch (redirErr) {
          console.error('Google signup (redirect) error:', redirErr);
          setError('Google sign-up failed. Please try again.');
          setGoogleBusy(false);
        }
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('Google sign-in is not enabled. Please contact support.');
        setGoogleBusy(false);
      } else {
        setError(err.message || 'Google sign-up failed. Please try again.');
        setGoogleBusy(false);
      }
    }
  };

  // After a redirect-based Google sign-up, Firebase persists the result so
  // calling getRedirectResult() on the page that loads after the redirect
  // returns the user. Returns null on normal page loads (no-op).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await getRedirectResult(adminAuth);
        if (cancelled || !result) return;
        setGoogleBusy(true);
        await handleGoogleResult(result.user);
      } catch (err) {
        console.error('getRedirectResult error:', err);
        if (!cancelled) setError('Google sign-up did not complete.');
      } finally {
        if (!cancelled) setGoogleBusy(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation — password only required for the email/password flow.
    if (!ownerName.trim()) { setError('Enter your name'); return; }
    if (!email.trim()) { setError('Enter your email'); return; }
    if (!googleUser && password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (!restaurantName.trim()) { setError('Enter your restaurant name'); return; }
    if (!subdomain || subdomain.length < 3) { setError('Subdomain must be at least 3 characters'); return; }
    if (subdomainStatus === 'taken') { setError('This subdomain is already taken'); return; }

    setStep('creating');

    try {
      // 1. Get the Firebase user. For Google flow they're already signed in;
      //    for email/password we create the account here.
      let fbUser;
      if (googleUser) {
        fbUser = googleUser;
      } else {
        const cred = await createUserWithEmailAndPassword(adminAuth, email.trim(), password);
        fbUser = cred.user;
      }
      const uid = fbUser.uid;

      // 2. Create restaurant document
      const trialEnd = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const ref = await createRestaurant({
        name: restaurantName.trim(),
        subdomain: subdomain.trim().toLowerCase(),
        ownerName: ownerName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        city: city.trim(),
        ownerUid: uid,
        plan: plan.id,
        maxItems: plan.maxItems,
        maxStorageMB: plan.maxStorageMB,
        isActive: true,
        paymentStatus: 'trial',
        trialEndsAt: trialEnd,
        // Track which provider created the account so the security page
        // knows whether to show "Change Password" or not.
        authProvider: googleUser ? 'google' : 'password',
      });

      // 3. Create user document (links user to restaurant)
      await createUserDoc(uid, {
        role: 'restaurant',
        email: email.trim(),
        name: ownerName.trim(),
        restaurantId: ref.id,
      });

      // 4. Send email verification — only for the email/password flow.
      //    Google accounts come pre-verified (Firebase trusts the Google
      //    identity) so calling sendEmailVerification on them is a no-op.
      if (!googleUser) {
        try {
          await sendEmailVerification(fbUser);
        } catch (err) {
          // Non-fatal — they can resend from /admin/settings/security later.
          console.warn('sendEmailVerification failed:', err?.message);
        }
      }

      // 5. Phase M — Fire-and-forget welcome email. We don't block the
      //    redirect on this: signup itself already succeeded, the email
      //    is ancillary. The endpoint is idempotent (stamps welcomeEmailSentAt
      //    on the restaurant doc) so a retry during a flaky network
      //    doesn't double-mail. We log failures to the console only.
      try {
        const idToken = await fbUser.getIdToken();
        fetch('/api/email/send-welcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        }).catch(err => console.warn('welcome email POST failed:', err?.message));
      } catch (err) {
        console.warn('idToken fetch for welcome email failed:', err?.message);
      }

      // 6. Show the right success screen. Email/password gets a verify-inbox
      //    notice; Google goes straight to "all set" since email is already
      //    verified.
      if (googleUser) {
        setStep('done');
        toast.success('Restaurant created!');
        setTimeout(() => router.push('/admin'), 1500);
      } else {
        setVerifyEmail(email.trim());
        setStep('verify');
        toast.success('Restaurant created — verify your email');
      }
    } catch (err) {
      console.error('Signup error:', err);
      setStep('form');
      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Try signing in instead.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password is too weak. Use at least 6 characters.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Invalid email address.');
      } else {
        setError(err.message || 'Something went wrong. Please try again.');
      }
    }
  };

  const inputStyle = {
    width: '100%', padding: '13px 16px', background: 'rgba(255,255,255,0.06)',
    border: '1.5px solid rgba(255,245,232,0.1)', borderRadius: 12, fontSize: 14,
    color: '#FFF5E8', fontFamily: 'Inter,sans-serif', outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  };
  const labelStyle = {
    display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(255,245,232,0.45)',
    letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6,
  };

  return (
    <>
      <Head>
        <title>Start Your Free Trial | HaloHelm</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Poppins:wght@600;700;800;900&display=swap" rel="stylesheet" />
      </Head>

      <div style={{ minHeight: '100vh', background: '#0C0A08', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', fontFamily: 'Inter,sans-serif' }}>
        <div style={{ width: '100%', maxWidth: 480 }}>

          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <Link href="/" style={{ textDecoration: 'none' }}>
              <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 900, fontSize: 22 }}>
                <span style={{ color: '#FFF5E8' }}>Halo</span>
                <span style={{ color: '#F79B3D', fontStyle: 'italic' }}>Helm</span>
              </span>
            </Link>
          </div>

          {/* Plan Badge */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 20px', borderRadius: 99, background: 'rgba(247,155,61,0.1)', border: '1px solid rgba(247,155,61,0.25)' }}>
              <span style={{ fontSize: 13, color: 'rgba(255,245,232,0.5)' }}>Selected plan:</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#F79B3D' }}>{plan.name} — {planPriceLabel}</span>
            </div>
          </div>

          {/* Creating / Done states */}
          {step === 'creating' && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ width: 48, height: 48, border: '3.5px solid #F79B3D', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 24px' }} />
              <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 18, color: '#FFF5E8', marginBottom: 8 }}>Setting up your restaurant...</div>
              <div style={{ fontSize: 13, color: 'rgba(255,245,232,0.4)' }}>This will just take a moment</div>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          )}

          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
              <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 22, color: '#FFF5E8', marginBottom: 8 }}>You're all set!</div>
              <div style={{ fontSize: 14, color: 'rgba(255,245,232,0.5)', marginBottom: 8 }}>Your {TRIAL_DAYS}-day free trial has started.</div>
              <div style={{ fontSize: 13, color: 'rgba(255,245,232,0.35)' }}>Redirecting to your dashboard...</div>
            </div>
          )}

          {step === 'verify' && (
            <div style={{ textAlign: 'center', padding: '48px 20px' }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>📬</div>
              <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 22, color: '#FFF5E8', marginBottom: 10 }}>Check your inbox</div>
              <div style={{ fontSize: 14, color: 'rgba(255,245,232,0.55)', marginBottom: 6, lineHeight: 1.55 }}>
                We sent a verification link to
              </div>
              <div style={{ fontSize: 14, color: '#F79B3D', fontWeight: 700, marginBottom: 24, wordBreak: 'break-all' }}>
                {verifyEmail}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,245,232,0.4)', marginBottom: 28, lineHeight: 1.6, maxWidth: 360, margin: '0 auto 28px' }}>
                Click the link in the email to verify your address. You can continue to your dashboard now and verify later from <span style={{ color: '#FFF5E8', fontWeight: 600 }}>Settings → Security</span>.
              </div>
              <button
                onClick={() => router.push('/admin')}
                style={{
                  padding: '14px 28px', borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg,#E05A3A,#F79B3D)', color: '#fff',
                  fontSize: 14, fontWeight: 700, fontFamily: 'Poppins,sans-serif',
                  boxShadow: '0 6px 24px rgba(224,90,58,0.4)',
                }}>
                Go to Dashboard →
              </button>
            </div>
          )}

          {/* Form */}
          {step === 'form' && (
            <form onSubmit={handleSubmit}>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,245,232,0.07)', borderRadius: 20, padding: '28px 24px' }}>

                <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 20, color: '#FFF5E8', marginBottom: 4, textAlign: 'center' }}>Start your free trial</div>
                <div style={{ fontSize: 13, color: 'rgba(255,245,232,0.4)', textAlign: 'center', marginBottom: 24 }}>{TRIAL_DAYS} days free. No credit card required.</div>

                {error && (
                  <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(224,90,58,0.12)', border: '1px solid rgba(224,90,58,0.3)', color: '#E05A3A', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
                    {error}
                  </div>
                )}

                {/* Google sign-up button — only shown BEFORE the user has
                    completed Google sign-in. Once they're authed via Google,
                    we hide it and show the Google-account chip below instead. */}
                {!googleUser && (
                  <>
                    <button
                      type="button"
                      onClick={handleGoogleSignup}
                      disabled={googleBusy}
                      style={{
                        width: '100%', padding: '13px 16px',
                        borderRadius: 12, border: '1.5px solid rgba(255,245,232,0.18)',
                        background: '#FFFFFF', color: '#1A1A1A',
                        fontSize: 14, fontWeight: 600, fontFamily: 'Inter,sans-serif',
                        cursor: googleBusy ? 'not-allowed' : 'pointer',
                        opacity: googleBusy ? 0.6 : 1,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                        marginBottom: 14, transition: 'transform 0.15s, box-shadow 0.15s',
                      }}
                    >
                      {/* Google "G" logo */}
                      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                        <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
                        <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.71H.957v2.332A8.997 8.997 0 0 0 9 18z" />
                        <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" />
                        <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" />
                      </svg>
                      {googleBusy ? 'Connecting…' : 'Sign up with Google'}
                    </button>

                    {/* Divider */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '14px 0 18px' }}>
                      <div style={{ flex: 1, height: 1, background: 'rgba(255,245,232,0.08)' }} />
                      <span style={{ fontSize: 11, color: 'rgba(255,245,232,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Or</span>
                      <div style={{ flex: 1, height: 1, background: 'rgba(255,245,232,0.08)' }} />
                    </div>
                  </>
                )}

                {/* When signed in via Google, show a chip instead of the auth fields */}
                {googleUser && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px', marginBottom: 18,
                    background: 'rgba(63,158,90,0.08)',
                    border: '1px solid rgba(63,158,90,0.30)',
                    borderRadius: 12,
                  }}>
                    <span style={{ fontSize: 18 }}>✓</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: 'rgba(255,245,232,0.55)', fontWeight: 600 }}>Signed in with Google</div>
                      <div style={{ fontSize: 13, color: '#FFF5E8', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{googleUser.email}</div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        try { await fbSignOut(adminAuth); } catch {}
                        setGoogleUser(null);
                        setOwnerName('');
                        setEmail('');
                      }}
                      style={{
                        background: 'transparent', border: 'none', color: 'rgba(255,245,232,0.45)',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 4,
                      }}
                    >
                      Change
                    </button>
                  </div>
                )}

                {/* Owner Name */}
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Your Name</label>
                  <input value={ownerName} onChange={e => setOwnerName(e.target.value)}
                    placeholder="e.g. Prabu" style={inputStyle} required />
                </div>

                {/* Email — read-only when signed in via Google (Google identity is the source of truth) */}
                {!googleUser && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Email</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com" style={inputStyle} required />
                  </div>
                )}

                {/* Password — only shown for the email/password flow */}
                {!googleUser && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Password</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="Min. 6 characters" style={inputStyle} required minLength={6} />
                  </div>
                )}

                {/* Phone */}
                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>Phone <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="e.g. 9876543210" style={inputStyle} />
                </div>

                <div style={{ height: 1, background: 'rgba(255,245,232,0.07)', margin: '0 -24px 20px' }} />

                {/* Restaurant Name */}
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Restaurant Name</label>
                  <input value={restaurantName} onChange={e => setRestaurantName(e.target.value)}
                    placeholder="e.g. The Spot" style={inputStyle} required />
                </div>

                {/* Subdomain */}
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Your Menu URL</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 0, background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,245,232,0.1)', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ padding: '13px 0 13px 14px', fontSize: 13, color: 'rgba(255,245,232,0.3)', whiteSpace: 'nowrap', flexShrink: 0 }}>HaloHelm.com/restaurant/</div>
                    <input
                      value={subdomain}
                      onChange={e => { setSubdomain(slugify(e.target.value)); setSubdomainEdited(true); }}
                      placeholder="your-restaurant"
                      style={{ ...inputStyle, border: 'none', background: 'transparent', borderRadius: 0, padding: '13px 14px 13px 0' }}
                      required minLength={3} maxLength={30}
                    />
                  </div>
                  {subdomainStatus === 'checking' && <div style={{ fontSize: 11, color: 'rgba(255,245,232,0.35)', marginTop: 4 }}>Checking availability...</div>}
                  {subdomainStatus === 'available' && <div style={{ fontSize: 11, color: '#2D8B4E', fontWeight: 600, marginTop: 4 }}>✓ Available</div>}
                  {subdomainStatus === 'taken' && <div style={{ fontSize: 11, color: '#E05A3A', fontWeight: 600, marginTop: 4 }}>✗ Already taken — try another</div>}
                </div>

                {/* City */}
                <div style={{ marginBottom: 24 }}>
                  <label style={labelStyle}>City <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
                  <input value={city} onChange={e => setCity(e.target.value)}
                    placeholder="e.g. Chennai" style={inputStyle} />
                </div>

                {/* Submit */}
                <button type="submit" disabled={subdomainStatus === 'taken' || subdomainStatus === 'checking'}
                  style={{
                    width: '100%', padding: '16px', borderRadius: 14, border: 'none', cursor: 'pointer',
                    background: 'linear-gradient(135deg,#E05A3A,#F79B3D)', color: '#fff',
                    fontSize: 16, fontWeight: 700, fontFamily: 'Poppins,sans-serif',
                    boxShadow: '0 6px 24px rgba(224,90,58,0.4)',
                    opacity: (subdomainStatus === 'taken' || subdomainStatus === 'checking') ? 0.5 : 1,
                    transition: 'opacity 0.2s',
                  }}>
                  Start {TRIAL_DAYS}-Day Free Trial →
                </button>
              </div>

              {/* Sign in link */}
              <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'rgba(255,245,232,0.35)' }}>
                Already have an account?{' '}
                <Link href="/admin/login" style={{ color: '#F79B3D', fontWeight: 600, textDecoration: 'none' }}>Sign in</Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
