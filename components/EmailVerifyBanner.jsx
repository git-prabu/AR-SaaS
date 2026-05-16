// components/EmailVerifyBanner.jsx
//
// A persistent thin banner that shows across every admin page when the
// signed-in admin's email isn't yet verified. Nudges them to click the
// verification link sent at signup (which they often skip) without
// blocking them from using the rest of the app.
//
// Self-dismissible: clicking the X hides it for the rest of the session
// (sessionStorage, not localStorage — comes back on the next browser
// session so users who genuinely forgot are reminded again).
//
// The "Resend" button calls Firebase Auth's sendEmailVerification on the
// CURRENT user — so the link in the new email is fresh + lands in their
// inbox right then. Disabled for 60 seconds after a send to avoid spam.

import { useState, useEffect } from 'react';
import { sendEmailVerification } from 'firebase/auth';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

const DISMISS_KEY = 'ar_email_verify_dismissed';

const A = {
  warning:    '#C4A86D',
  warningDim: '#A08656',
  warningBg:  'rgba(196,168,109,0.12)',
  warningBd:  'rgba(196,168,109,0.35)',
  ink:        '#1A1A1A',
  faintText:  'rgba(0,0,0,0.42)',
};

export default function EmailVerifyBanner() {
  const { user, loading } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  // Cooldown timer — disable Resend for 60s after a successful send to
  // avoid hammering Firebase's quota + spamming the user's inbox.
  const [cooldown, setCooldown] = useState(0);

  // Restore dismissed state from sessionStorage on mount so navigating
  // between admin pages doesn't bring the banner back every time.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') setDismissed(true);
    } catch {}
  }, []);

  // Cooldown countdown (1s tick).
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Hide cases — order matters:
  // 1. Still loading auth state → don't flash the banner
  // 2. No user → not signed in, banner doesn't apply
  // 3. User's email already verified → done, nothing to nudge about
  // 4. Google-auth users → Firebase marks them verified automatically,
  //    so user.emailVerified is true. No-op naturally via case #3.
  // 5. User dismissed in this session → respect that
  if (loading || !user || user.emailVerified || dismissed) return null;

  const handleResend = async () => {
    if (sending || cooldown > 0) return;
    setSending(true);
    try {
      await sendEmailVerification(user);
      toast.success('Verification email sent. Check your inbox.');
      setCooldown(60); // 60s before they can resend again
    } catch (err) {
      console.error('[verify-banner] resend failed:', err);
      if (err?.code === 'auth/too-many-requests') {
        toast.error('Too many requests. Try again in a few minutes.');
        setCooldown(120);
      } else {
        toast.error('Could not send. Try again later.');
      }
    } finally {
      setSending(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch {}
  };

  return (
    <div style={{
      width: '100%',
      background: A.warningBg,
      borderBottom: `1px solid ${A.warningBd}`,
      padding: '10px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
      fontFamily: "'Inter', -apple-system, sans-serif",
      fontSize: 13,
      color: A.ink,
      // Don't print this banner if the admin prints a report etc.
      position: 'relative',
      zIndex: 10,
    }}
    className="no-print">
      <span style={{
        flexShrink: 0,
        width: 22, height: 22, borderRadius: '50%',
        background: A.warning, color: '#FFFFFF',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700,
      }} aria-hidden="true">!</span>

      <span style={{ flex: 1, minWidth: 0, lineHeight: 1.45 }}>
        <strong>Verify your email</strong>{' '}
        <span style={{ color: A.faintText }}>
          — we sent a link to <strong style={{ color: A.warningDim }}>{user.email}</strong>.
          Verify so you can reset your password if you ever forget it.
        </span>
      </span>

      <button
        type="button"
        onClick={handleResend}
        disabled={sending || cooldown > 0}
        style={{
          flexShrink: 0,
          padding: '6px 12px', borderRadius: 7, border: 'none',
          background: cooldown > 0 ? 'rgba(0,0,0,0.06)' : A.warning,
          color: cooldown > 0 ? A.faintText : '#FFFFFF',
          fontSize: 12, fontWeight: 700, letterSpacing: '0.01em',
          cursor: sending || cooldown > 0 ? 'not-allowed' : 'pointer',
          fontFamily: "'Inter', -apple-system, sans-serif",
          transition: 'opacity 0.15s',
        }}>
        {sending ? 'Sending…'
          : cooldown > 0 ? `Resend in ${cooldown}s`
          : 'Resend'}
      </button>

      <button
        type="button"
        onClick={handleDismiss}
        title="Dismiss until next session"
        style={{
          flexShrink: 0,
          width: 24, height: 24, borderRadius: 6,
          background: 'transparent', border: 'none',
          color: A.faintText, fontSize: 16, lineHeight: 1,
          cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
        ×
      </button>
    </div>
  );
}
