// pages/admin/security.js
//
// Account security panel for restaurant admins. Three things live here:
//   1. Change Password — only shown for accounts created with email/password
//      (Google accounts don't have one to rotate). Requires re-auth with the
//      current password before updatePassword() — this is a Firebase rule,
//      not optional, because password change is a "recent login" operation.
//   2. Change Email — uses verifyBeforeUpdateEmail() so the new email is only
//      adopted AFTER the user clicks a verification link sent to it. This
//      prevents typos from locking them out forever (the old email keeps
//      working until they verify the new one). Also re-auth required.
//   3. Email verification status — banner with a "Resend" button if the
//      account hasn't been verified yet.
//
// We intentionally don't update the Firestore restaurants/{rid} email field
// here on email change, because verifyBeforeUpdateEmail is async — storing
// the pending new email in Firestore early would create a confusing
// mismatch if the user never clicks the verification link.
//
// W2 (16 May 2026): the users/{uid}.email field IS now auto-synced —
// hooks/useAuth.js writes it back to match firebaseUser.email on every
// onAuthStateChanged event after the verification link is clicked. This
// matters because lib/dailySummary.js falls back to users.email when a
// restaurant hasn't set notificationsEmail; previously summaries kept
// going to the old address indefinitely.
import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  updatePassword,
  verifyBeforeUpdateEmail,
  sendEmailVerification,
} from 'firebase/auth';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import toast from 'react-hot-toast';

const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER,
  cream: '#EDEDED',
  ink: '#1A1A1A',
  shell: '#FFFFFF',
  shellDarker: '#F8F8F8',
  warning: '#C4A86D',
  warningDim: '#A08656',
  success: '#3F9E5A',
  danger: '#D9534F',
  mutedText: 'rgba(0,0,0,0.55)',
  faintText: 'rgba(0,0,0,0.38)',
  subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)',
  borderStrong: '1px solid rgba(0,0,0,0.10)',
  cardShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
};

const labelStyle = {
  display: 'block',
  fontSize: 11, fontWeight: 700,
  color: A.mutedText,
  letterSpacing: '0.05em', textTransform: 'uppercase',
  marginBottom: 6,
};
const inputStyle = {
  width: '100%',
  padding: '10px 13px',
  background: A.shellDarker,
  border: A.border,
  borderRadius: 9,
  fontSize: 13,
  color: A.ink,
  fontFamily: INTER,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s, background 0.15s',
};

function Card({ title, subtitle, children, footer }) {
  return (
    <div style={{
      background: A.shell, borderRadius: 14, border: A.border, boxShadow: A.cardShadow,
      marginBottom: 18, overflow: 'hidden',
    }}>
      <div style={{ padding: '20px 24px 8px' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: A.ink, marginBottom: 4, letterSpacing: '-0.2px' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 13, color: A.mutedText, lineHeight: 1.5 }}>{subtitle}</div>}
      </div>
      <div style={{ padding: '12px 24px 20px' }}>{children}</div>
      {footer && (
        <div style={{ padding: '12px 24px', background: A.subtleBg, borderTop: A.border }}>{footer}</div>
      )}
    </div>
  );
}

function PrimaryBtn({ children, onClick, disabled, type = 'button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '10px 20px', borderRadius: 9, border: 'none',
        background: A.ink, color: A.cream,
        fontSize: 13, fontWeight: 600, fontFamily: A.font,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'transform 0.15s, opacity 0.15s',
      }}>
      {children}
    </button>
  );
}

export default function SecuritySettings() {
  const { user, userData, loading } = useAuth();
  const router = useRouter();

  // Detect which provider this account uses. Firebase puts the primary
  // provider first in providerData. 'password' = email/password account,
  // 'google.com' = Google sign-in.
  const providerId = user?.providerData?.[0]?.providerId || 'password';
  const isGoogle = providerId === 'google.com';

  // ── Change password state ───────────────────────────────────────────
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);

  // ── Change email state ──────────────────────────────────────────────
  const [emailPwd, setEmailPwd] = useState(''); // current password for reauth (email/password accounts only)
  const [newEmail, setNewEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);

  // ── Verification state ──────────────────────────────────────────────
  const [verifyBusy, setVerifyBusy] = useState(false);

  // Redirect to login if no auth user once loading resolves.
  useEffect(() => {
    if (!loading && !user) router.push('/admin/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <AdminLayout>
        <div style={{ padding: 40, fontFamily: A.font, color: A.mutedText }}>Loading…</div>
      </AdminLayout>
    );
  }

  // ── Handlers ────────────────────────────────────────────────────────
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPwd.length < 6) { toast.error('New password must be at least 6 characters.'); return; }
    if (newPwd !== confirmPwd) { toast.error('Passwords do not match.'); return; }
    if (!currentPwd) { toast.error('Enter your current password.'); return; }

    setPwdBusy(true);
    try {
      // Re-auth with current password — required by Firebase for password updates.
      const cred = EmailAuthProvider.credential(user.email, currentPwd);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPwd);
      toast.success('Password updated.');
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (err) {
      console.error('change password error:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        toast.error('Current password is incorrect.');
      } else if (err.code === 'auth/weak-password') {
        toast.error('New password is too weak.');
      } else {
        toast.error('Could not update password.');
      }
    } finally {
      setPwdBusy(false);
    }
  };

  const handleChangeEmail = async (e) => {
    e.preventDefault();
    const target = newEmail.trim().toLowerCase();
    if (!target) { toast.error('Enter a new email.'); return; }
    if (target === (user.email || '').toLowerCase()) { toast.error('That is already your current email.'); return; }
    if (!isGoogle && !emailPwd) { toast.error('Enter your current password.'); return; }

    setEmailBusy(true);
    try {
      // Re-auth — Google accounts pop the Google chooser; password accounts use the password.
      if (isGoogle) {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await reauthenticateWithPopup(user, provider);
      } else {
        const cred = EmailAuthProvider.credential(user.email, emailPwd);
        await reauthenticateWithCredential(user, cred);
      }

      // verifyBeforeUpdateEmail sends a verification link to the NEW email.
      // The email is only swapped on Firebase's side after the user clicks
      // that link — so the old email stays usable until then. Safer than the
      // legacy updateEmail() which swapped immediately on a typo'd address.
      await verifyBeforeUpdateEmail(user, target);
      toast.success(`Verification link sent to ${target}. Click it to finish the change.`);
      setNewEmail(''); setEmailPwd('');
    } catch (err) {
      console.error('change email error:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        toast.error('Current password is incorrect.');
      } else if (err.code === 'auth/email-already-in-use') {
        toast.error('That email is already used by another account.');
      } else if (err.code === 'auth/invalid-email') {
        toast.error('That email looks invalid.');
      } else if (err.code === 'auth/popup-closed-by-user') {
        // Silent.
      } else if (err.code === 'auth/requires-recent-login') {
        toast.error('Please sign out and sign back in, then try again.');
      } else {
        toast.error('Could not change email.');
      }
    } finally {
      setEmailBusy(false);
    }
  };

  const handleResendVerification = async () => {
    setVerifyBusy(true);
    try {
      await sendEmailVerification(user);
      toast.success('Verification email sent. Check your inbox.');
    } catch (err) {
      console.error('resend verification error:', err);
      if (err.code === 'auth/too-many-requests') {
        toast.error('Too many requests. Try again in a few minutes.');
      } else {
        toast.error('Could not send verification email.');
      }
    } finally {
      setVerifyBusy(false);
    }
  };

  return (
    <>
      <Head><title>Security — HaloHelm</title></Head>
      <AdminLayout>
        <div style={{ padding: '32px 28px', maxWidth: 720, margin: '0 auto', fontFamily: A.font, color: A.ink }}>

          {/* Page header */}
          <div style={{ marginBottom: 24 }}>
            <Link href="/admin/business-info" style={{ fontSize: 12, color: A.mutedText, textDecoration: 'none', fontWeight: 600 }}>
              ← Back to Business Info
            </Link>
            <div style={{ fontSize: 26, fontWeight: 700, color: A.ink, letterSpacing: '-0.4px', marginTop: 8, marginBottom: 4 }}>
              Account Security
            </div>
            <div style={{ fontSize: 14, color: A.mutedText, lineHeight: 1.55 }}>
              Manage how you sign in and recover your account.
            </div>
          </div>

          {/* Current account chip */}
          <div style={{
            background: A.shell, border: A.border, borderRadius: 14,
            boxShadow: A.cardShadow, padding: '16px 20px', marginBottom: 18,
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: isGoogle ? '#FFFFFF' : A.ink,
              border: isGoogle ? A.borderStrong : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              {isGoogle ? (
                <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden="true">
                  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
                  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.71H.957v2.332A8.997 8.997 0 0 0 9 18z" />
                  <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" />
                  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" />
                </svg>
              ) : (
                <span style={{ color: A.cream, fontSize: 18, fontWeight: 700 }}>@</span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: A.faintText, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
                Signed in as
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: A.ink, wordBreak: 'break-all' }}>
                {user.email}
              </div>
              <div style={{ fontSize: 12, color: A.mutedText, marginTop: 2 }}>
                via {isGoogle ? 'Google' : 'Email & password'}
              </div>
            </div>
          </div>

          {/* Email verification status */}
          {!user.emailVerified && (
            <div style={{
              background: 'rgba(196,168,109,0.10)', border: '1px solid rgba(196,168,109,0.35)',
              borderRadius: 12, padding: '14px 18px', marginBottom: 18,
              display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: A.warningDim, marginBottom: 2 }}>
                  Email not verified
                </div>
                <div style={{ fontSize: 12, color: A.mutedText, lineHeight: 1.5 }}>
                  Verifying your email lets you reset your password if you ever lose it.
                </div>
              </div>
              <button
                onClick={handleResendVerification}
                disabled={verifyBusy}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none',
                  background: A.warning, color: A.ink,
                  fontSize: 12, fontWeight: 700, fontFamily: A.font,
                  cursor: verifyBusy ? 'not-allowed' : 'pointer',
                  opacity: verifyBusy ? 0.6 : 1, whiteSpace: 'nowrap',
                }}>
                {verifyBusy ? 'Sending…' : 'Send verification email'}
              </button>
            </div>
          )}
          {user.emailVerified && (
            <div style={{
              background: 'rgba(63,158,90,0.08)', border: '1px solid rgba(63,158,90,0.30)',
              borderRadius: 12, padding: '12px 18px', marginBottom: 18,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 14, color: A.success }}>✓</span>
              <span style={{ fontSize: 13, color: A.success, fontWeight: 600 }}>Email verified</span>
            </div>
          )}

          {/* Change Password — only for password-provider accounts */}
          {!isGoogle && (
            <Card
              title="Change password"
              subtitle="Pick something at least 6 characters long, and that you don't reuse on other sites."
            >
              <form onSubmit={handleChangePassword}>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Current password</label>
                  <input
                    type="password"
                    value={currentPwd}
                    onChange={e => setCurrentPwd(e.target.value)}
                    style={inputStyle}
                    autoComplete="current-password"
                    required
                  />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>New password</label>
                  <input
                    type="password"
                    value={newPwd}
                    onChange={e => setNewPwd(e.target.value)}
                    style={inputStyle}
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label style={labelStyle}>Confirm new password</label>
                  <input
                    type="password"
                    value={confirmPwd}
                    onChange={e => setConfirmPwd(e.target.value)}
                    style={inputStyle}
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                </div>
                <PrimaryBtn type="submit" disabled={pwdBusy}>
                  {pwdBusy ? 'Updating…' : 'Update password'}
                </PrimaryBtn>
              </form>
            </Card>
          )}

          {/* Google accounts: show a note instead of the password form */}
          {isGoogle && (
            <Card
              title="Password"
              subtitle="Your account uses Google sign-in, so there's no password stored here. Manage your password in your Google account settings."
            >
              <a
                href="https://myaccount.google.com/security"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block', padding: '10px 18px', borderRadius: 9,
                  background: A.subtleBg, border: A.border, color: A.ink,
                  fontSize: 13, fontWeight: 600, textDecoration: 'none',
                }}>
                Open Google Account Security ↗
              </a>
            </Card>
          )}

          {/* Change Email */}
          <Card
            title="Change email"
            subtitle="We'll send a verification link to the new address. Your email won't change until you click that link — your old email keeps working until then."
          >
            <form onSubmit={handleChangeEmail}>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>New email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  style={inputStyle}
                  placeholder="you@example.com"
                  required
                />
              </div>
              {!isGoogle && (
                <div style={{ marginBottom: 18 }}>
                  <label style={labelStyle}>Confirm with current password</label>
                  <input
                    type="password"
                    value={emailPwd}
                    onChange={e => setEmailPwd(e.target.value)}
                    style={inputStyle}
                    autoComplete="current-password"
                    required
                  />
                </div>
              )}
              {isGoogle && (
                <div style={{
                  fontSize: 12, color: A.mutedText, marginBottom: 18, lineHeight: 1.5,
                  padding: 12, background: A.subtleBg, borderRadius: 8, border: A.border,
                }}>
                  You'll be asked to confirm via the Google sign-in popup before the change is sent.
                </div>
              )}
              <PrimaryBtn type="submit" disabled={emailBusy}>
                {emailBusy ? 'Sending…' : 'Send verification link'}
              </PrimaryBtn>
            </form>
          </Card>

        </div>
      </AdminLayout>
    </>
  );
}

// Bypass _app.js's default getLayout — AdminLayout is rendered directly above.
SecuritySettings.getLayout = (page) => page;
