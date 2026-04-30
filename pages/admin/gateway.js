// pages/admin/gateway.js
// Phase H — Restaurant admin sets up their own payment gateway.
// Currently supports Paytm Business; the layout is provider-agnostic
// so adding Razorpay/PhonePe later is just dropping in a new tab.
//
// What the admin does here:
//   1. Pick a provider (Paytm)
//   2. Paste their Merchant ID + Merchant Key
//   3. Choose Staging vs Production
//   4. Copy the webhook URL into their Paytm dashboard
//   5. Toggle "Enable gateway" — once ON, customer UPI taps go through
//      the gateway and auto-confirm via webhook (Phase I/J)

import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import toast from 'react-hot-toast';
import { auth } from '../../lib/firebase';

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
  shadowCard: '0 2px 10px rgba(38,52,49,0.03)',
};

export default function AdminGatewayPage() {
  const { userData } = useAuth();
  const rid = userData?.restaurantId;
  const [config, setConfig] = useState({
    provider: 'paytm',
    isActive: false,
    paytm: { merchantId: '', merchantKey: '', env: 'staging', websiteName: 'WEBSTAGING', industryType: 'Retail' },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined' && rid) {
      const origin = window.location.origin;
      setWebhookUrl(`${origin}/api/payment/webhook?rid=${rid}`);
    }
  }, [rid]);

  // Load current config via API (server-side reads with Admin SDK so
  // merchantKey can be masked).
  useEffect(() => {
    if (!rid) return;
    let alive = true;
    (async () => {
      try {
        const u = auth.currentUser;
        if (!u) { setLoading(false); return; }
        const idToken = await u.getIdToken();
        const r = await fetch(`/api/payment/config?idToken=${encodeURIComponent(idToken)}`);
        const j = await r.json();
        if (!alive) return;
        if (j.config) {
          setConfig({
            provider: j.config.provider || 'paytm',
            isActive: !!j.config.isActive,
            paytm: {
              merchantId:   j.config.paytm?.merchantId   || '',
              merchantKey:  j.config.paytm?.merchantKey  || '',
              env:          j.config.paytm?.env          || 'staging',
              websiteName:  j.config.paytm?.websiteName  || 'WEBSTAGING',
              industryType: j.config.paytm?.industryType || 'Retail',
            },
          });
        }
      } catch (e) {
        console.error('Failed to load gateway config:', e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [rid]);

  const save = async () => {
    if (!rid) return;
    setSaving(true);
    try {
      const u = auth.currentUser;
      if (!u) throw new Error('Not signed in');
      const idToken = await u.getIdToken();
      const r = await fetch('/api/payment/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, config }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Save failed');
      toast.success('Gateway saved');
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Save failed');
    }
    setSaving(false);
  };

  return (
    <AdminLayout>
      <Head><title>Payment Gateway | Advert Radical</title></Head>
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font, padding: '24px 28px' }}>
        <div style={{ maxWidth: 720 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, marginBottom: 6, letterSpacing: '0.05em' }}>
            Operations &nbsp;›&nbsp; <span style={{ color: A.mutedText }}>Payment Gateway</span>
          </div>
          <h1 style={{ fontWeight: 600, fontSize: 28, color: A.ink, letterSpacing: '-0.5px', marginBottom: 6 }}>
            Payment Gateway
          </h1>
          <p style={{ color: A.mutedText, fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
            Connect your own Paytm Business merchant account. Customers who tap UPI on the bill modal
            will be redirected to your gateway, and we auto-confirm the payment via webhook — no more
            manually marking UPI orders paid.
          </p>

          {loading ? (
            <div style={{ background: A.shell, border: A.border, borderRadius: 14, padding: 32, textAlign: 'center', color: A.mutedText }}>
              Loading…
            </div>
          ) : (
            <>
              {/* Provider picker (only Paytm for now) */}
              <Card title="Provider">
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { k: 'paytm', label: 'Paytm Business' },
                    { k: 'none',  label: 'None (manual)' },
                  ].map(p => {
                    const sel = config.provider === p.k;
                    return (
                      <button key={p.k} onClick={() => setConfig(c => ({ ...c, provider: p.k }))}
                        style={{
                          padding: '10px 16px', borderRadius: 8,
                          background: sel ? A.ink : A.subtleBg,
                          color: sel ? A.cream : A.mutedText,
                          border: 'none', cursor: 'pointer',
                          fontFamily: A.font, fontSize: 13, fontWeight: 600,
                        }}>{p.label}</button>
                    );
                  })}
                </div>
              </Card>

              {config.provider === 'paytm' && (
                <Card title="Paytm credentials">
                  <Field label="Merchant ID (MID)">
                    <input value={config.paytm.merchantId}
                      onChange={e => setConfig(c => ({ ...c, paytm: { ...c.paytm, merchantId: e.target.value.trim() } }))}
                      placeholder="e.g. ABCXYZ12345"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label={config.paytm.merchantKey?.startsWith('••••') ? 'Merchant Key (saved — repaste to change)' : 'Merchant Key'}>
                    <input value={config.paytm.merchantKey}
                      onChange={e => setConfig(c => ({ ...c, paytm: { ...c.paytm, merchantKey: e.target.value.trim() } }))}
                      placeholder={config.paytm.merchantKey?.startsWith('••••') ? config.paytm.merchantKey : 'Paste from Paytm dashboard'}
                      type="password" autoComplete="new-password"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Environment">
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[
                        { k: 'staging',    label: 'Staging (test)' },
                        { k: 'production', label: 'Production' },
                      ].map(e => {
                        const sel = config.paytm.env === e.k;
                        return (
                          <button key={e.k} onClick={() => setConfig(c => ({ ...c, paytm: { ...c.paytm, env: e.k } }))}
                            style={{
                              padding: '8px 14px', borderRadius: 7,
                              background: sel ? (e.k === 'production' ? A.success : A.warning) : A.subtleBg,
                              color: sel ? A.shell : A.mutedText,
                              border: 'none', cursor: 'pointer',
                              fontFamily: A.font, fontSize: 12, fontWeight: 600,
                            }}>{e.label}</button>
                        );
                      })}
                    </div>
                  </Field>
                  <Field label="Website Name (Paytm-issued)">
                    <input value={config.paytm.websiteName}
                      onChange={e => setConfig(c => ({ ...c, paytm: { ...c.paytm, websiteName: e.target.value.trim() } }))}
                      placeholder="WEBSTAGING (sandbox) or your assigned name"
                      style={inputStyle}
                    />
                  </Field>
                </Card>
              )}

              {/* Webhook URL */}
              <Card title="Webhook URL"
                hint="Copy this into the Callback / Webhook URL field in your Paytm Business dashboard. Required for auto-confirm to work.">
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 13, padding: '12px 14px',
                  background: A.subtleBg, borderRadius: 8, color: A.ink, wordBreak: 'break-all',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                }}>
                  <span>{webhookUrl}</span>
                  <button onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success('Copied'); }}
                    style={{ padding: '6px 10px', background: A.ink, color: A.cream, border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                    Copy
                  </button>
                </div>
              </Card>

              {/* Active toggle */}
              <Card title="Status">
                <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontSize: 14 }}>
                  <input type="checkbox" checked={config.isActive}
                    onChange={e => setConfig(c => ({ ...c, isActive: e.target.checked }))}
                    style={{ width: 18, height: 18, accentColor: A.success, cursor: 'pointer' }}
                  />
                  <span style={{ fontWeight: 600 }}>Enable gateway for customer UPI payments</span>
                </label>
                <div style={{ marginTop: 6, fontSize: 12, color: A.mutedText, lineHeight: 1.5 }}>
                  When OFF, UPI taps stay on the manual flow (admin marks paid via /admin/payments
                  or /admin/waiter). When ON, taps redirect to your gateway and auto-confirm.
                </div>
              </Card>

              <button onClick={save} disabled={saving}
                style={{
                  marginTop: 14, padding: '12px 24px', background: A.ink, color: A.cream,
                  border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14,
                  fontFamily: A.font, cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}>
                {saving ? 'Saving…' : 'Save Settings'}
              </button>
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

function Card({ title, hint, children }) {
  return (
    <div style={{
      background: A.shell, border: A.border, borderRadius: 14,
      padding: '18px 20px', marginBottom: 14, boxShadow: A.shadowCard,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: A.mutedText, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 10 }}>
        {title}
      </div>
      {hint && <div style={{ fontSize: 12, color: A.mutedText, lineHeight: 1.5, marginBottom: 12 }}>{hint}</div>}
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: A.faintText, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '10px 12px', boxSizing: 'border-box',
  background: A.shell, border: '1px solid rgba(0,0,0,0.10)', borderRadius: 8,
  fontSize: 14, fontFamily: A.font, color: A.ink, outline: 'none',
};
