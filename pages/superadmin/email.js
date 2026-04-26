// pages/superadmin/email.js
//
// Super admin page for managing the sender Gmail used by the daily-summary
// cron. Lets you set/rotate the address, name, and App Password without a
// redeploy, plus a "Send test email" button to verify credentials.
//
// Security: the App Password lives in Firestore at systemConfig/email.
// Strict Firestore rule restricts read/write to superadmins only — see
// firestore.rules.

import Head from 'next/head';
import { useEffect, useState } from 'react';
import SuperAdminLayout from '../../components/layout/SuperAdminLayout';
import { useSuperAdminAuth } from '../../hooks/useAuth';
import { saDb } from '../../lib/saDb';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';

// ═══ Aspire palette ═══
const A = {
  font: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  cream: '#EDEDED',
  ink: '#1A1A1A',
  shell: '#FFFFFF',
  shellDarker: '#FAFAF8',
  warning: '#C4A86D',
  warningDim: '#A08656',
  success: '#3F9E5A',
  danger: '#D9534F',
  mutedText: 'rgba(0,0,0,0.55)',
  faintText: 'rgba(0,0,0,0.38)',
  subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)',
  borderStrong: '1px solid rgba(0,0,0,0.10)',
  cardShadow: '0 2px 10px rgba(0,0,0,0.03)',
  forest: '#1A1A1A',
  forestDarker: '#2A2A2A',
  forestText: '#EAE7E3',
  forestTextMuted: 'rgba(234,231,227,0.55)',
  forestTextFaint: 'rgba(234,231,227,0.35)',
  forestSubtleBg: 'rgba(255,255,255,0.04)',
  forestBorder: '1px solid rgba(255,255,255,0.06)',
};

const EMPTY = { senderEmail: '', senderName: 'Advert Radical', appPassword: '', enabled: true };

const inputStyle = {
  width: '100%', padding: '11px 14px', boxSizing: 'border-box',
  background: A.shell, border: '1px solid rgba(0,0,0,0.10)', borderRadius: 9,
  fontSize: 14, color: A.ink, fontFamily: A.font, outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

export default function SuperAdminEmail() {
  const { user } = useSuperAdminAuth();

  const [form, setForm] = useState(EMPTY);
  const [initial, setInitial] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Last-saved snapshot for the "updated at" footer line.
  const [updatedAt, setUpdatedAt] = useState(null);
  // Recipient for the "Send test email" button. Defaults to the logged-in
  // superadmin's auth email but can be overridden — useful when the auth
  // email isn't a real inbox (e.g. signup placeholder address).
  const [testRecipient, setTestRecipient] = useState('');
  useEffect(() => { if (user?.email && !testRecipient) setTestRecipient(user.email); }, [user]);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(saDb, 'systemConfig', 'email'));
        if (snap.exists()) {
          const d = snap.data();
          const next = {
            senderEmail: d.senderEmail || '',
            senderName:  d.senderName  || 'Advert Radical',
            appPassword: d.appPassword || '',
            enabled:     d.enabled !== false,
          };
          setForm(next);
          setInitial(next);
          setUpdatedAt(d.updatedAt || null);
        } else {
          setInitial(EMPTY);
        }
      } catch (e) {
        console.error('email config load:', e);
        toast.error('Could not load email config — check Firestore rules.');
      } finally { setLoading(false); }
    })();
  }, []);

  const isDirty = !!initial && JSON.stringify(form) !== JSON.stringify(initial);

  const handleSave = async () => {
    if (!form.senderEmail.trim()) return toast.error('Sender email is required');
    if (!/^[^\s@]+@gmail\.com$/i.test(form.senderEmail.trim())) {
      // Soft warning — Gmail SMTP only works for @gmail.com / @googlemail.com
      // accounts. If they're using Workspace, the address may be a custom
      // domain. We accept it but flag the gotcha.
      const proceed = confirm('Sender doesn\'t look like a @gmail.com address. Gmail SMTP only works for Gmail/Workspace accounts. Continue anyway?');
      if (!proceed) return;
    }
    if (!form.appPassword.trim() || form.appPassword.replace(/\s/g, '').length < 16) {
      return toast.error('App Password is required (16 characters from Google).');
    }
    setSaving(true);
    try {
      const payload = {
        senderEmail: form.senderEmail.trim(),
        senderName:  form.senderName.trim() || 'Advert Radical',
        appPassword: form.appPassword.replace(/\s/g, ''), // Google shows the password with spaces; Gmail SMTP rejects spaces
        enabled:     form.enabled !== false,
        updatedAt:   new Date().toISOString(),
      };
      await setDoc(doc(saDb, 'systemConfig', 'email'), payload, { merge: true });
      toast.success('Saved.');
      setInitial({
        senderEmail: payload.senderEmail,
        senderName:  payload.senderName,
        appPassword: payload.appPassword,
        enabled:     payload.enabled,
      });
      setForm({
        senderEmail: payload.senderEmail,
        senderName:  payload.senderName,
        appPassword: payload.appPassword,
        enabled:     payload.enabled,
      });
      setUpdatedAt(payload.updatedAt);
    } catch (e) {
      toast.error('Save failed: ' + e.message);
    } finally { setSaving(false); }
  };

  const handleTest = async () => {
    if (isDirty) return toast.error('Save changes first, then send test.');
    if (!form.senderEmail.trim()) return toast.error('Set sender email first.');
    if (!user) return toast.error('Not signed in.');
    const recipient = testRecipient.trim();
    if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      return toast.error('Enter a valid recipient email above.');
    }
    setTesting(true);
    try {
      // Force-refresh the ID token so a stale token never causes a spurious 401.
      const idToken = await user.getIdToken(true);
      const res = await fetch('/api/email/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ to: recipient }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        toast.success(`Test email sent to ${recipient}. Check the inbox (and spam folder).`);
      } else {
        toast.error('Send failed: ' + (data.error || `HTTP ${res.status}`));
      }
    } catch (e) {
      toast.error('Send failed: ' + e.message);
    } finally { setTesting(false); }
  };

  return (
    <SuperAdminLayout>
      <Head><title>Email Settings — Super Admin</title></Head>
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font }}>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          .em-inp:focus { border-color: ${A.warning} !important; box-shadow: 0 0 0 3px rgba(196,168,109,0.15); }
          .em-inp::placeholder { color: ${A.faintText}; }
        `}</style>

        <div style={{ padding: '24px 28px 60px', maxWidth: 760, margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, marginBottom: 6, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Super Admin</span>
              <span style={{ opacity: 0.5 }}>›</span>
              <span style={{ color: A.mutedText }}>Email Settings</span>
            </div>
            <div style={{ fontWeight: 600, fontSize: 26, color: A.ink, letterSpacing: '-0.4px', lineHeight: 1.1 }}>
              Email Settings
            </div>
            <div style={{ fontSize: 13, color: A.mutedText, marginTop: 4 }}>
              Sender Gmail used by the daily summary cron. Change anytime — no redeploy needed.
            </div>
          </div>

          {loading ? (
            <div style={{ background: A.shell, borderRadius: 14, padding: 60, textAlign: 'center', border: A.border, boxShadow: A.cardShadow }}>
              <div style={{ display: 'inline-block', width: 24, height: 24, border: `2px solid ${A.subtleBg}`, borderTopColor: A.warning, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : (
            <>
              {/* Status banner */}
              <div style={{
                background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
                borderRadius: 12, padding: '14px 20px', marginBottom: 18,
                border: A.forestBorder, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: form.enabled && initial?.senderEmail ? A.success : A.danger,
                    boxShadow: form.enabled && initial?.senderEmail ? '0 0 6px rgba(63,158,90,0.5)' : '0 0 6px rgba(217,83,79,0.5)',
                  }} />
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: form.enabled && initial?.senderEmail ? A.success : A.danger }}>
                    {form.enabled && initial?.senderEmail ? 'Sending Active' : initial?.senderEmail ? 'Disabled' : 'Not Configured'}
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 13, color: A.forestText, fontWeight: 500 }}>
                    {initial?.senderEmail
                      ? <>Sending from <strong>{initial.senderEmail}</strong> as <strong>{initial.senderName}</strong></>
                      : 'No sender configured yet — daily summary cron will skip until you set one.'}
                  </div>
                  {updatedAt && (
                    <div style={{ fontSize: 11, color: A.forestTextFaint, marginTop: 3 }}>
                      Last updated: {new Date(updatedAt).toLocaleString('en-IN')}
                    </div>
                  )}
                </div>
              </div>

              {/* Form card */}
              <div style={{
                background: A.shell, borderRadius: 14, padding: '22px 24px',
                border: A.border, boxShadow: A.cardShadow, marginBottom: 16,
              }}>
                <div style={{ marginBottom: 18 }}>
                  <Label>Sender email <Required /></Label>
                  <input className="em-inp" style={inputStyle}
                    type="email"
                    value={form.senderEmail}
                    onChange={e => setForm(f => ({ ...f, senderEmail: e.target.value }))}
                    placeholder="radical.notifications@gmail.com" />
                </div>

                <div style={{ marginBottom: 18 }}>
                  <Label>Sender name <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: A.faintText }}>(shown as "From")</span></Label>
                  <input className="em-inp" style={inputStyle}
                    value={form.senderName}
                    onChange={e => setForm(f => ({ ...f, senderName: e.target.value }))}
                    placeholder="Advert Radical" />
                </div>

                <div style={{ marginBottom: 18 }}>
                  <Label>Gmail App Password <Required /></Label>
                  <div style={{ position: 'relative' }}>
                    <input className="em-inp" style={{ ...inputStyle, paddingRight: 80, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em' }}
                      type={showPassword ? 'text' : 'password'}
                      value={form.appPassword}
                      onChange={e => setForm(f => ({ ...f, appPassword: e.target.value }))}
                      placeholder="16 characters from Google (spaces OK)" />
                    <button type="button" onClick={() => setShowPassword(s => !s)} style={{
                      position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                      padding: '5px 12px', borderRadius: 6,
                      border: A.border, background: A.shellDarker,
                      fontFamily: A.font, fontSize: 11, fontWeight: 600, color: A.mutedText, cursor: 'pointer',
                    }}>{showPassword ? 'Hide' : 'Show'}</button>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: A.faintText, lineHeight: 1.5 }}>
                    Get one at <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" style={{ color: A.warningDim, textDecoration: 'none' }}>myaccount.google.com/apppasswords</a> → 2-Step Verification must be on first.
                  </div>
                </div>

                <div style={{ marginBottom: 4, paddingTop: 6, borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                  <div onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', cursor: 'pointer',
                  }}>
                    <Toggle on={form.enabled} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: A.ink }}>Enable daily summary emails</div>
                      <div style={{ fontSize: 11, color: A.mutedText, marginTop: 2 }}>
                        Master switch — when off, the cron runs but skips sending. Useful for pausing without losing credentials.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Test recipient input + actions.
                  Recipient defaults to the superadmin's auth email, but can
                  be overridden — useful when the auth email is a placeholder
                  that doesn't actually receive mail. */}
              <div style={{
                background: A.shell, borderRadius: 14, padding: '18px 22px',
                border: A.border, boxShadow: A.cardShadow, marginBottom: 14,
              }}>
                <Label>Send test email to</Label>
                <input className="em-inp" style={inputStyle}
                  type="email"
                  value={testRecipient}
                  onChange={e => setTestRecipient(e.target.value)}
                  placeholder="your.personal.email@gmail.com" />
                <div style={{ marginTop: 6, fontSize: 11, color: A.faintText, lineHeight: 1.5 }}>
                  Where the "Send test email" button will deliver a one-off test message.
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={handleSave} disabled={saving || !isDirty} style={{
                  padding: '11px 22px', borderRadius: 10, border: 'none',
                  background: A.ink, color: A.cream,
                  fontFamily: A.font, fontSize: 13, fontWeight: 600, cursor: (saving || !isDirty) ? 'not-allowed' : 'pointer',
                  opacity: (saving || !isDirty) ? 0.5 : 1,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}>
                  {saving ? <><span style={{ width: 13, height: 13, border: `2px solid ${A.cream}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} /> Saving…</> : 'Save changes'}
                </button>
                <button onClick={handleTest} disabled={testing || isDirty || !initial?.senderEmail} style={{
                  padding: '11px 22px', borderRadius: 10,
                  border: A.borderStrong, background: A.shell,
                  color: A.ink, fontFamily: A.font, fontSize: 13, fontWeight: 600,
                  cursor: (testing || isDirty || !initial?.senderEmail) ? 'not-allowed' : 'pointer',
                  opacity: (testing || isDirty || !initial?.senderEmail) ? 0.5 : 1,
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}>
                  {testing ? <><span style={{ width: 13, height: 13, border: `2px solid ${A.ink}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} /> Sending…</> : 'Send test email'}
                </button>
                {isDirty && <span style={{ fontSize: 11, color: A.warningDim, fontWeight: 600 }}>● Unsaved changes</span>}
              </div>

              {/* Info card — quick how-to so the workflow is self-evident */}
              <div style={{
                marginTop: 28, background: A.shell, borderRadius: 14, padding: '20px 24px',
                border: A.border, boxShadow: A.cardShadow,
              }}>
                <div style={{ fontFamily: A.font, fontWeight: 700, fontSize: 12, color: A.warningDim, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
                  How daily emails work
                </div>
                <ol style={{ margin: 0, padding: '0 0 0 18px', fontSize: 13, color: A.mutedText, lineHeight: 1.7 }}>
                  <li>A Vercel cron job runs at <strong style={{ color: A.ink }}>midnight IST</strong> every day.</li>
                  <li>For each active restaurant, it queries the previous day's orders and builds a summary email.</li>
                  <li>Emails are sent from the address above to either the restaurant's <strong style={{ color: A.ink }}>Notifications email</strong> (Settings) or the admin's signup email.</li>
                  <li>Restaurants with no orders still get an email so they know the system is alive.</li>
                </ol>
              </div>
            </>
          )}
        </div>
      </div>
    </SuperAdminLayout>
  );
}
SuperAdminEmail.getLayout = (page) => page;

function Label({ children }) {
  return <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: A.mutedText, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 7, fontFamily: A.font }}>{children}</label>;
}
function Required() { return <span style={{ color: A.danger, fontWeight: 700 }}>*</span>; }
function Toggle({ on }) {
  return (
    <div style={{
      flexShrink: 0, width: 44, height: 24, borderRadius: 99,
      background: on ? A.success : 'rgba(0,0,0,0.18)',
      position: 'relative', transition: 'background 0.2s',
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: A.shell,
        position: 'absolute', top: 3, left: on ? 23 : 3,
        transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
      }} />
    </div>
  );
}
