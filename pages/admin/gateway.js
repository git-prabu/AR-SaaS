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
import { auth } from '../../lib/firebaseAuth';
import { getRestaurantById, updateRestaurant } from '../../lib/db';

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
    // Razorpay placeholder credentials — user fills these in from
    // their Razorpay dashboard (Settings → API Keys + Webhooks). The
    // placeholder text is visible in the input; the form uses real
    // values once the admin types/pastes them.
    razorpay: { keyId: '', keySecret: '', webhookSecret: '', env: 'test' },
    // Auto-Confirm UPI — the no-routing, restaurant-keeps-the-money flow.
    // Independent of the full-gateway provider/credentials above.
    autoConfirm: {
      provider: 'razorpay',                                                       // 'razorpay' | 'paytm' | 'phonepe' | 'none'
      isActive: false,
      previewMode: false,                                                         // Forces customer-page waiting UI for demos
      razorpay: { keyId: '', keySecret: '', webhookSecret: '' },
      paytm:    { merchantId: '', merchantKey: '' },
      phonepe:  { merchantId: '', saltKey: '', saltIndex: '1' },
    },
  });
  // Top-level tabs: Auto-Confirm UPI (new, recommended) vs Full Gateway
  // (legacy Razorpay/Paytm routed-money — kept but de-emphasised).
  const [topTab, setTopTab] = useState('autoConfirm'); // 'autoConfirm' | 'fullGateway'
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');

  // Direct UPI ID — the simplest payment channel. Moved here from
  // /admin/business-info → UPI PAYMENT (relocated for context). Stored on
  // the restaurant doc as `upiId`, NOT inside the gateway config
  // (which only holds Paytm/Razorpay/PhonePe credentials). Independent
  // of the Auto-Confirm and Full Gateway tabs below — those can stay
  // off and the bill still shows this UPI ID for direct customer pay.
  const [upiId, setUpiId] = useState('');
  const [upiInitial, setUpiInitial] = useState('');
  const [upiSaving, setUpiSaving] = useState(false);

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
            razorpay: {
              keyId:         j.config.razorpay?.keyId         || '',
              keySecret:     j.config.razorpay?.keySecret     || '',
              webhookSecret: j.config.razorpay?.webhookSecret || '',
              env:           j.config.razorpay?.env           || 'test',
            },
            autoConfirm: {
              provider: j.config.autoConfirm?.provider || 'razorpay',
              isActive: !!j.config.autoConfirm?.isActive,
              previewMode: !!j.config.autoConfirm?.previewMode,
              razorpay: {
                keyId:         j.config.autoConfirm?.razorpay?.keyId         || '',
                keySecret:     j.config.autoConfirm?.razorpay?.keySecret     || '',
                webhookSecret: j.config.autoConfirm?.razorpay?.webhookSecret || '',
              },
              paytm: {
                merchantId:    j.config.autoConfirm?.paytm?.merchantId  || '',
                merchantKey:   j.config.autoConfirm?.paytm?.merchantKey || '',
              },
              phonepe: {
                merchantId: j.config.autoConfirm?.phonepe?.merchantId || '',
                saltKey:    j.config.autoConfirm?.phonepe?.saltKey    || '',
                saltIndex:  j.config.autoConfirm?.phonepe?.saltIndex  || '1',
              },
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

  // Load the saved UPI ID from the restaurant doc separately — it lives
  // on the doc itself, not inside the gateway config blob.
  useEffect(() => {
    if (!rid) return;
    let alive = true;
    (async () => {
      try {
        const r = await getRestaurantById(rid);
        if (!alive || !r) return;
        const saved = (r.upiId || '').trim();
        setUpiId(saved);
        setUpiInitial(saved);
      } catch (e) {
        console.error('[gateway] Failed to load UPI ID:', e);
      }
    })();
    return () => { alive = false; };
  }, [rid]);

  const saveUpi = async () => {
    if (!rid) return;
    const trimmed = upiId.trim();
    if (trimmed === upiInitial) { toast('No changes to save'); return; }
    setUpiSaving(true);
    try {
      await updateRestaurant(rid, { upiId: trimmed });
      setUpiInitial(trimmed);
      toast.success(trimmed ? 'UPI ID saved' : 'UPI ID cleared');
    } catch (e) {
      console.error('[gateway] UPI save failed:', e);
      toast.error('Could not save UPI: ' + (e?.message || 'unknown'));
    } finally {
      setUpiSaving(false);
    }
  };

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
      <Head><title>Payment Gateway | HaloHelm</title></Head>
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font, padding: '24px 28px' }}>
        <div style={{ maxWidth: 720 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, marginBottom: 6, letterSpacing: '0.05em' }}>
            Operations &nbsp;›&nbsp; <span style={{ color: A.mutedText }}>Payment Gateway</span>
          </div>
          <h1 style={{ fontWeight: 600, fontSize: 28, color: A.ink, letterSpacing: '-0.5px', marginBottom: 6 }}>
            Payment Gateway
          </h1>
          <p style={{ color: A.mutedText, fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
            Two ways to handle customer UPI payments. <strong>Auto-Confirm UPI</strong> uses the
            merchant account behind your existing soundbox (money stays with you, we just listen for
            the "paid" signal). <strong>Full Gateway</strong> routes money through Razorpay/Paytm
            checkout for cards + UPI + netbanking (~2% fee, settled T+1).
          </p>

          {/* ─── Direct UPI ID (always visible — simplest payment channel) ───
              Moved here from /admin/business-info → UPI PAYMENT. Sits above the
              tabs because every restaurant needs this regardless of which
              gateway they pick, and the Razorpay/Paytm flows already
              reference it as a fallback when their gateway credentials
              aren't configured. */}
          <Card title="UPI ID"
            hint="Your direct UPI ID (GPay / PhonePe / Paytm / any UPI app). The customer bill shows this as a Pay-by-UPI option — money lands in your account, no fee, no routing. Leave blank to hide UPI on the bill.">
            <Field label="UPI ID">
              <input
                value={upiId}
                onChange={e => setUpiId(e.target.value)}
                placeholder="e.g. yourrestaurant@ybl or 9876543210@paytm"
                style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }}
              />
            </Field>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <button
                onClick={saveUpi}
                disabled={upiSaving || upiId.trim() === upiInitial}
                style={{
                  padding: '9px 18px', borderRadius: 8, border: 'none',
                  background: A.ink, color: A.cream,
                  fontSize: 13, fontWeight: 700, fontFamily: A.font,
                  cursor: (upiSaving || upiId.trim() === upiInitial) ? 'not-allowed' : 'pointer',
                  opacity: (upiSaving || upiId.trim() === upiInitial) ? 0.5 : 1,
                }}
              >
                {upiSaving ? 'Saving…' : 'Save UPI ID'}
              </button>
              {upiInitial && upiId.trim() === upiInitial && (
                <span style={{ fontSize: 11, color: A.success, fontWeight: 600 }}>
                  ✓ Active
                </span>
              )}
            </div>
          </Card>

          {/* Top-level tabs */}
          <div style={{
            display: 'inline-flex', padding: 4, marginBottom: 20,
            background: A.subtleBg, borderRadius: 10, gap: 4,
          }}>
            {[
              { k: 'autoConfirm', label: 'Auto-Confirm UPI', badge: 'Recommended' },
              { k: 'fullGateway', label: 'Full Gateway' },
            ].map(t => {
              const sel = topTab === t.k;
              return (
                <button key={t.k} onClick={() => setTopTab(t.k)}
                  style={{
                    padding: '9px 16px', borderRadius: 7,
                    background: sel ? A.shell : 'transparent',
                    color: sel ? A.ink : A.mutedText,
                    border: 'none', cursor: 'pointer',
                    fontFamily: A.font, fontSize: 13, fontWeight: 600,
                    boxShadow: sel ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                  }}>
                  {t.label}
                  {t.badge && (
                    <span style={{
                      padding: '2px 7px', borderRadius: 99, fontSize: 10, fontWeight: 700,
                      background: sel ? 'rgba(196,168,109,0.18)' : 'rgba(196,168,109,0.12)',
                      color: A.warningDim, letterSpacing: '0.04em', textTransform: 'uppercase',
                    }}>{t.badge}</span>
                  )}
                </button>
              );
            })}
          </div>

          {loading ? (
            <div style={{ background: A.shell, border: A.border, borderRadius: 14, padding: 32, textAlign: 'center', color: A.mutedText }}>
              Loading…
            </div>
          ) : topTab === 'autoConfirm' ? (
            <AutoConfirmTab
              config={config}
              setConfig={setConfig}
              webhookUrl={webhookUrl}
              rid={rid}
            />
          ) : (
            <>
              {/* Provider picker — Paytm or Razorpay */}
              <Card title="Provider">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[
                    { k: 'paytm',    label: 'Paytm Business' },
                    { k: 'razorpay', label: 'Razorpay' },
                    { k: 'none',     label: 'None (manual)' },
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

              {config.provider === 'razorpay' && (
                <Card title="Razorpay credentials"
                  hint="Paste these from your Razorpay dashboard → Settings → API Keys (and Webhooks for the Webhook Secret). Test keys start with rzp_test_, live keys with rzp_live_. Until real keys are saved, customer UPI taps will fall back to direct UPI ID (if set in Settings).">
                  <Field label="Key ID">
                    <input value={config.razorpay.keyId}
                      onChange={e => setConfig(c => ({ ...c, razorpay: { ...c.razorpay, keyId: e.target.value.trim() } }))}
                      placeholder="rzp_test_PLACEHOLDER_REPLACE_ME"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label={config.razorpay.keySecret?.startsWith('••••') ? 'Key Secret (saved — repaste to change)' : 'Key Secret'}>
                    <input value={config.razorpay.keySecret}
                      onChange={e => setConfig(c => ({ ...c, razorpay: { ...c.razorpay, keySecret: e.target.value.trim() } }))}
                      placeholder={config.razorpay.keySecret?.startsWith('••••') ? config.razorpay.keySecret : 'PLACEHOLDER_KEY_SECRET'}
                      type="password" autoComplete="new-password"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label={config.razorpay.webhookSecret?.startsWith('••••') ? 'Webhook Secret (saved — repaste to change)' : 'Webhook Secret'}>
                    <input value={config.razorpay.webhookSecret}
                      onChange={e => setConfig(c => ({ ...c, razorpay: { ...c.razorpay, webhookSecret: e.target.value.trim() } }))}
                      placeholder={config.razorpay.webhookSecret?.startsWith('••••') ? config.razorpay.webhookSecret : 'PLACEHOLDER_WEBHOOK_SECRET'}
                      type="password" autoComplete="new-password"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Environment">
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[
                        { k: 'test', label: 'Test mode' },
                        { k: 'live', label: 'Live mode' },
                      ].map(e => {
                        const sel = config.razorpay.env === e.k;
                        return (
                          <button key={e.k} type="button" onClick={() => setConfig(c => ({ ...c, razorpay: { ...c.razorpay, env: e.k } }))}
                            style={{
                              padding: '8px 14px', borderRadius: 7,
                              background: sel ? (e.k === 'live' ? A.success : A.warning) : A.subtleBg,
                              color: sel ? A.shell : A.mutedText,
                              border: 'none', cursor: 'pointer',
                              fontFamily: A.font, fontSize: 12, fontWeight: 600,
                            }}>{e.label}</button>
                        );
                      })}
                    </div>
                  </Field>
                  <div style={{
                    marginTop: 12, padding: '10px 12px',
                    background: 'rgba(196,168,109,0.10)', border: '1px solid rgba(196,168,109,0.35)',
                    borderRadius: 8, fontSize: 12, color: A.warningDim, lineHeight: 1.5,
                  }}>
                    Razorpay needs the Key ID + Key Secret to create payment orders. The
                    Webhook Secret lets us verify the auto-confirmation event from
                    Razorpay's servers — set both in your Razorpay Webhooks tab pointing
                    to the URL below.
                  </div>
                </Card>
              )}

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
            </>
          )}

          {/* Save button — shared across both tabs (POST sends the
              entire config object so both sets of settings persist on
              every save). */}
          {!loading && (
            <button onClick={save} disabled={saving}
              style={{
                marginTop: 14, padding: '12px 24px', background: A.ink, color: A.cream,
                border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14,
                fontFamily: A.font, cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1,
              }}>
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

// ─── Auto-Confirm UPI tab ─────────────────────────────────────────
// Independent of the full-gateway provider. Restaurant connects the
// merchant account behind their existing soundbox (Razorpay / Paytm
// Business / PhonePe Business), pastes the API keys + webhook secret,
// toggles "Enable" and saves. From then on, every UPI payment to
// their VPA fires a webhook to /api/auto-confirm/<provider>?rid=X
// which marks the corresponding order paid automatically.
function AutoConfirmTab({ config, setConfig, webhookUrl, rid }) {
  const ac = config.autoConfirm || {};
  const acProvider = ac.provider || 'razorpay';
  const acWebhook = (webhookUrl || '').replace('/api/payment/webhook', `/api/auto-confirm/${acProvider}`);
  const setAC = (next) => setConfig(c => ({ ...c, autoConfirm: typeof next === 'function' ? next(c.autoConfirm) : next }));

  return (
    <>
      <Card title="How this works"
        hint="Money flows directly customer-bank → your bank (or your existing soundbox merchant account). HaloHelm just listens for the webhook that says 'payment received' and marks the matching order paid. Zero MDR for direct UPI on Paytm Business / PhonePe Business. ~0% for Razorpay Smart Collect direct UPI.">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 0' }}>
          {['✓ Money stays with you', '✓ Auto-confirms on payment', '✓ Works with your soundbox'].map(t => (
            <div key={t} style={{
              fontSize: 12, fontWeight: 600, color: A.success,
              padding: '6px 10px', borderRadius: 7,
              background: 'rgba(63,158,90,0.08)', border: '1px solid rgba(63,158,90,0.25)',
            }}>{t}</div>
          ))}
        </div>
      </Card>

      <Card title="Provider">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { k: 'razorpay', label: 'Razorpay'        },
            { k: 'paytm',    label: 'Paytm Business'  },
            { k: 'phonepe',  label: 'PhonePe Business'},
          ].map(p => {
            const sel = acProvider === p.k;
            return (
              <button key={p.k} type="button"
                onClick={() => setAC(a => ({ ...a, provider: p.k }))}
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

      {acProvider === 'razorpay' && (
        <Card title="Razorpay credentials"
          hint="Razorpay Dashboard → Settings → API Keys (Key ID + Key Secret) and Webhooks (Webhook Secret). Add a webhook subscribed to 'payment.captured' pointing to the URL shown below.">
          <Field label="Key ID">
            <input value={ac.razorpay?.keyId || ''}
              onChange={e => setAC(a => ({ ...a, razorpay: { ...a.razorpay, keyId: e.target.value.trim() } }))}
              placeholder="rzp_test_PLACEHOLDER_REPLACE_ME"
              style={inputStyle} />
          </Field>
          <Field label={ac.razorpay?.keySecret?.startsWith('••••') ? 'Key Secret (saved — repaste to change)' : 'Key Secret'}>
            <input value={ac.razorpay?.keySecret || ''}
              onChange={e => setAC(a => ({ ...a, razorpay: { ...a.razorpay, keySecret: e.target.value.trim() } }))}
              placeholder={ac.razorpay?.keySecret?.startsWith('••••') ? ac.razorpay.keySecret : 'PLACEHOLDER_KEY_SECRET'}
              type="password" autoComplete="new-password"
              style={inputStyle} />
          </Field>
          <Field label={ac.razorpay?.webhookSecret?.startsWith('••••') ? 'Webhook Secret (saved — repaste to change)' : 'Webhook Secret'}>
            <input value={ac.razorpay?.webhookSecret || ''}
              onChange={e => setAC(a => ({ ...a, razorpay: { ...a.razorpay, webhookSecret: e.target.value.trim() } }))}
              placeholder={ac.razorpay?.webhookSecret?.startsWith('••••') ? ac.razorpay.webhookSecret : 'PLACEHOLDER_WEBHOOK_SECRET'}
              type="password" autoComplete="new-password"
              style={inputStyle} />
          </Field>
        </Card>
      )}

      {acProvider === 'paytm' && (
        <Card title="Paytm Business credentials"
          hint="Paytm for Business dashboard → Developer Settings → API Keys. Add a webhook subscribed to 'Payment Status Update' pointing to the URL below.">
          <Field label="Merchant ID (MID)">
            <input value={ac.paytm?.merchantId || ''}
              onChange={e => setAC(a => ({ ...a, paytm: { ...a.paytm, merchantId: e.target.value.trim() } }))}
              placeholder="e.g. ABCXYZ12345"
              style={inputStyle} />
          </Field>
          <Field label={ac.paytm?.merchantKey?.startsWith('••••') ? 'Merchant Key (saved — repaste to change)' : 'Merchant Key'}>
            <input value={ac.paytm?.merchantKey || ''}
              onChange={e => setAC(a => ({ ...a, paytm: { ...a.paytm, merchantKey: e.target.value.trim() } }))}
              placeholder={ac.paytm?.merchantKey?.startsWith('••••') ? ac.paytm.merchantKey : 'Paste from Paytm dashboard'}
              type="password" autoComplete="new-password"
              style={inputStyle} />
          </Field>
        </Card>
      )}

      {acProvider === 'phonepe' && (
        <Card title="PhonePe Business credentials"
          hint="PhonePe Business dashboard → Developer Settings → API Keys. Paste the Salt Key + Salt Index (typically '1'). Configure the webhook URL below in the Payouts → Webhooks section.">
          <Field label="Merchant ID">
            <input value={ac.phonepe?.merchantId || ''}
              onChange={e => setAC(a => ({ ...a, phonepe: { ...a.phonepe, merchantId: e.target.value.trim() } }))}
              placeholder="e.g. MERCHANTUAT"
              style={inputStyle} />
          </Field>
          <Field label={ac.phonepe?.saltKey?.startsWith('••••') ? 'Salt Key (saved — repaste to change)' : 'Salt Key'}>
            <input value={ac.phonepe?.saltKey || ''}
              onChange={e => setAC(a => ({ ...a, phonepe: { ...a.phonepe, saltKey: e.target.value.trim() } }))}
              placeholder={ac.phonepe?.saltKey?.startsWith('••••') ? ac.phonepe.saltKey : 'Paste from PhonePe dashboard'}
              type="password" autoComplete="new-password"
              style={inputStyle} />
          </Field>
          <Field label="Salt Index">
            <input value={ac.phonepe?.saltIndex || '1'}
              onChange={e => setAC(a => ({ ...a, phonepe: { ...a.phonepe, saltIndex: e.target.value.trim() } }))}
              placeholder="1"
              style={{ ...inputStyle, maxWidth: 100 }} />
          </Field>
        </Card>
      )}

      <Card title="Webhook URL"
        hint="Copy this and paste it into your provider's webhook configuration page. The provider will POST here whenever a customer payment is received — we verify the signature, match it to a pending order, and mark it paid automatically.">
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 13, padding: '12px 14px',
          background: A.subtleBg, borderRadius: 8, color: A.ink, wordBreak: 'break-all',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <span>{acWebhook}</span>
          <button type="button" onClick={() => { navigator.clipboard.writeText(acWebhook); toast.success('Copied'); }}
            style={{ padding: '6px 10px', background: A.ink, color: A.cream, border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
            Copy
          </button>
        </div>
      </Card>

      <Card title="Status">
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontSize: 14 }}>
          <input type="checkbox" checked={!!ac.isActive}
            onChange={e => setAC(a => ({ ...a, isActive: e.target.checked }))}
            style={{ width: 18, height: 18, accentColor: A.success, cursor: 'pointer' }}
          />
          <span style={{ fontWeight: 600 }}>Enable Auto-Confirm UPI</span>
        </label>
        <div style={{ marginTop: 6, fontSize: 12, color: A.mutedText, lineHeight: 1.5 }}>
          When ON, every UPI payment to your merchant account auto-confirms the matching order
          (customer's screen flips to "Payment Confirmed" within seconds, no staff action needed).
          When OFF, you stay on the existing flow where staff manually marks paid orders.
        </div>

        {/* Preview mode — flips the customer-page UI to show the
            auto-confirm waiting state without requiring a real merchant
            webhook. Useful for demos / pitch screenshots / sanity-
            checking the UX. The 30s manual-confirm fallback still
            appears since no real webhook fires in preview mode. */}
        <div style={{
          marginTop: 16, paddingTop: 14,
          borderTop: A.border,
        }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={!!ac.previewMode}
              onChange={e => setAC(a => ({ ...a, previewMode: e.target.checked }))}
              style={{ width: 16, height: 16, accentColor: A.warning, cursor: 'pointer', marginTop: 2, flexShrink: 0 }}
            />
            <div>
              <span style={{ fontWeight: 600, color: A.warningDim }}>
                Preview auto-confirm UI (no real webhook)
              </span>
              <div style={{ marginTop: 4, fontSize: 12, color: A.mutedText, lineHeight: 1.5 }}>
                Forces the customer's bill modal to show the &ldquo;Waiting for payment
                confirmation…&rdquo; spinner instead of the trust button — even without a
                real merchant account configured. Useful for demos and pitch screenshots.
                The 30-second &ldquo;confirm manually&rdquo; fallback still appears since
                no webhook fires in preview mode.
              </div>
            </div>
          </label>
        </div>
      </Card>
    </>
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
