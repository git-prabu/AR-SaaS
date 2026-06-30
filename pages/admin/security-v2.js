// pages/admin/security-v2.js
//
// ★ REDESIGN EXEMPLAR ★ — duplicate of /admin/security on the dark "ok-root"
// theme (via <OkShell>). Owner-only. Auth logic (re-auth, updatePassword,
// verifyBeforeUpdateEmail, sendEmailVerification) copied verbatim from
// security.js — only the render is new. Original untouched.
import Head from 'next/head';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import {
  EmailAuthProvider, GoogleAuthProvider, reauthenticateWithCredential,
  reauthenticateWithPopup, updatePassword, verifyBeforeUpdateEmail, sendEmailVerification,
} from 'firebase/auth';
import { useAuth } from '../../hooks/useAuth';
import OkShell from '../../components/admin/OkShell';
import toast from 'react-hot-toast';

const labelStyle = { display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--tx-3)', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 6 };
const inputStyle = { width: '100%', padding: '10px 13px', background: 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 10, fontSize: 13, color: 'var(--tx)', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' };

function Card({ title, subtitle, children }) {
  return (
    <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--line)', marginBottom: 18, overflow: 'hidden' }}>
      <div style={{ padding: '20px 24px 8px' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--tx)', marginBottom: 4 }}>{title}</div>
        {subtitle && <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-3)', lineHeight: 1.5 }}>{subtitle}</div>}
      </div>
      <div style={{ padding: '12px 24px 20px' }}>{children}</div>
    </div>
  );
}

function PrimaryBtn({ children, onClick, disabled, type = 'button' }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      {children}
    </button>
  );
}

export default function SecurityV2() {
  const { user, userData, loading } = useAuth();
  const router = useRouter();
  const restaurantName = userData?.restaurantName || 'Your Restaurant';

  const providerId = user?.providerData?.[0]?.providerId || 'password';
  const isGoogle = providerId === 'google.com';

  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);

  const [emailPwd, setEmailPwd] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);

  const [verifyBusy, setVerifyBusy] = useState(false);

  useEffect(() => { if (!loading && !user) router.push('/admin/login'); }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Head><title>Security — HaloHelm</title></Head>
        <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPwd.length < 6) { toast.error('New password must be at least 6 characters.'); return; }
    if (newPwd !== confirmPwd) { toast.error('Passwords do not match.'); return; }
    if (!currentPwd) { toast.error('Enter your current password.'); return; }
    setPwdBusy(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPwd);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPwd);
      toast.success('Password updated.');
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (err) {
      console.error('change password error:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') toast.error('Current password is incorrect.');
      else if (err.code === 'auth/weak-password') toast.error('New password is too weak.');
      else toast.error('Could not update password.');
    } finally { setPwdBusy(false); }
  };

  const handleChangeEmail = async (e) => {
    e.preventDefault();
    const target = newEmail.trim().toLowerCase();
    if (!target) { toast.error('Enter a new email.'); return; }
    if (target === (user.email || '').toLowerCase()) { toast.error('That is already your current email.'); return; }
    if (!isGoogle && !emailPwd) { toast.error('Enter your current password.'); return; }
    setEmailBusy(true);
    try {
      if (isGoogle) {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await reauthenticateWithPopup(user, provider);
      } else {
        const cred = EmailAuthProvider.credential(user.email, emailPwd);
        await reauthenticateWithCredential(user, cred);
      }
      await verifyBeforeUpdateEmail(user, target);
      toast.success(`Verification link sent to ${target}. Click it to finish the change.`);
      setNewEmail(''); setEmailPwd('');
    } catch (err) {
      console.error('change email error:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') toast.error('Current password is incorrect.');
      else if (err.code === 'auth/email-already-in-use') toast.error('That email is already used by another account.');
      else if (err.code === 'auth/invalid-email') toast.error('That email looks invalid.');
      else if (err.code === 'auth/popup-closed-by-user') { /* silent */ }
      else if (err.code === 'auth/requires-recent-login') toast.error('Please sign out and sign back in, then try again.');
      else toast.error('Could not change email.');
    } finally { setEmailBusy(false); }
  };

  const handleResendVerification = async () => {
    setVerifyBusy(true);
    try {
      await sendEmailVerification(user);
      toast.success('Verification email sent. Check your inbox.');
    } catch (err) {
      console.error('resend verification error:', err);
      if (err.code === 'auth/too-many-requests') toast.error('Too many requests. Try again in a few minutes.');
      else toast.error('Could not send verification email.');
    } finally { setVerifyBusy(false); }
  };

  return (
    <>
      <Head><title>Security — HaloHelm</title></Head>
      <OkShell active={null} eyebrow="Account · sign-in & recovery" title="Account Security" brand={restaurantName}>
        <div style={{ maxWidth: 720 }}>
          {/* Current account chip */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '16px 20px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: isGoogle ? '#fff' : 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {isGoogle ? (
                <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" /><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.71H.957v2.332A8.997 8.997 0 0 0 9 18z" /><path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" /><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" /></svg>
              ) : (
                <span style={{ color: 'var(--accent-ink)', fontSize: 18, fontWeight: 700 }}>@</span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--tx-3)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>Signed in as</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--tx)', wordBreak: 'break-all' }}>{user.email}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)', marginTop: 2 }}>via {isGoogle ? 'Google' : 'Email & password'}</div>
            </div>
          </div>

          {/* Email verification status */}
          {!user.emailVerified && (
            <div style={{ background: 'rgba(196,168,109,0.12)', border: '1px solid rgba(196,168,109,0.35)', borderRadius: 12, padding: '14px 18px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--gold)', marginBottom: 2 }}>Email not verified</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)', lineHeight: 1.5 }}>Verifying your email lets you reset your password if you ever lose it.</div>
              </div>
              <button onClick={handleResendVerification} disabled={verifyBusy} style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, cursor: verifyBusy ? 'not-allowed' : 'pointer', opacity: verifyBusy ? 0.6 : 1, whiteSpace: 'nowrap' }}>{verifyBusy ? 'Sending…' : 'Send verification email'}</button>
            </div>
          )}
          {user.emailVerified && (
            <div style={{ background: 'rgba(63,170,99,0.10)', border: '1px solid rgba(63,170,99,0.30)', borderRadius: 12, padding: '12px 18px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14, color: 'var(--success)' }}>✓</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>Email verified</span>
            </div>
          )}

          {/* Change password */}
          {!isGoogle && (
            <Card title="Change password" subtitle="Pick something at least 6 characters long, and that you don't reuse on other sites.">
              <form onSubmit={handleChangePassword}>
                <div style={{ marginBottom: 14 }}><label style={labelStyle}>Current password</label><input type="password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} style={inputStyle} autoComplete="current-password" required /></div>
                <div style={{ marginBottom: 14 }}><label style={labelStyle}>New password</label><input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} style={inputStyle} autoComplete="new-password" minLength={6} required /></div>
                <div style={{ marginBottom: 18 }}><label style={labelStyle}>Confirm new password</label><input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} style={inputStyle} autoComplete="new-password" minLength={6} required /></div>
                <PrimaryBtn type="submit" disabled={pwdBusy}>{pwdBusy ? 'Updating…' : 'Update password'}</PrimaryBtn>
              </form>
            </Card>
          )}
          {isGoogle && (
            <Card title="Password" subtitle="Your account uses Google sign-in, so there's no password stored here. Manage your password in your Google account settings.">
              <a href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', padding: '10px 18px', borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--line)', color: 'var(--tx)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Open Google Account Security ↗</a>
            </Card>
          )}

          {/* Change email */}
          <Card title="Change email" subtitle="We'll send a verification link to the new address. Your email won't change until you click that link — your old email keeps working until then.">
            <form onSubmit={handleChangeEmail}>
              <div style={{ marginBottom: 14 }}><label style={labelStyle}>New email</label><input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} style={inputStyle} placeholder="you@example.com" required /></div>
              {!isGoogle && (
                <div style={{ marginBottom: 18 }}><label style={labelStyle}>Confirm with current password</label><input type="password" value={emailPwd} onChange={e => setEmailPwd(e.target.value)} style={inputStyle} autoComplete="current-password" required /></div>
              )}
              {isGoogle && (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)', marginBottom: 18, lineHeight: 1.5, padding: 12, background: 'var(--card-2)', borderRadius: 10, border: '1px solid var(--line)' }}>You'll be asked to confirm via the Google sign-in popup before the change is sent.</div>
              )}
              <PrimaryBtn type="submit" disabled={emailBusy}>{emailBusy ? 'Sending…' : 'Send verification link'}</PrimaryBtn>
            </form>
          </Card>
        </div>
      </OkShell>
    </>
  );
}

SecurityV2.getLayout = (page) => page;
