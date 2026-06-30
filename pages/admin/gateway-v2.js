// pages/admin/gateway-v2.js
//
// ★ REDESIGN EXEMPLAR ★ — duplicate of /admin/gateway on the dark "ok-root"
// theme (via <OkShell>). Logic (config load via /api/payment/config, UPI ID
// save, Auto-Confirm + Full Gateway tabs, provider credentials, webhook URLs,
// save) copied verbatim from gateway.js — only the render is new. Original
// untouched.
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import OkShell from '../../components/admin/OkShell';
import toast from 'react-hot-toast';
import { auth } from '../../lib/firebaseAuth';
import { getRestaurantById, updateRestaurant } from '../../lib/db';

const inputStyle = {
  width: '100%', padding: '10px 12px', boxSizing: 'border-box',
  background: 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 9,
  fontSize: 14, fontFamily: 'var(--font-body)', color: 'var(--tx)', outline: 'none',
};

function Card({ title, hint, children }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '18px 20px', marginBottom: 14 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--tx-2)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10 }}>{title}</div>
      {hint && <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)', lineHeight: 1.5, marginBottom: 12 }}>{hint}</div>}
      {children}
    </div>
  );
}
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'var(--tx-3)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}
const pickBtn = (sel) => ({ padding: '10px 16px', borderRadius: 9, background: sel ? 'var(--accent)' : 'var(--card-2)', color: sel ? 'var(--accent-ink)' : 'var(--tx-2)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600 });

export default function GatewayV2() {
  const { userData } = useAuth();
  const rid = userData?.restaurantId;
  const restaurantName = userData?.restaurantName || 'Your Restaurant';

  const [config, setConfig] = useState({
    provider: 'paytm', isActive: false,
    paytm: { merchantId: '', merchantKey: '', env: 'staging', websiteName: 'WEBSTAGING', industryType: 'Retail' },
    razorpay: { keyId: '', keySecret: '', webhookSecret: '', env: 'test' },
    autoConfirm: {
      provider: 'razorpay', isActive: false, previewMode: false,
      razorpay: { keyId: '', keySecret: '', webhookSecret: '' },
      paytm: { merchantId: '', merchantKey: '' },
      phonepe: { merchantId: '', saltKey: '', saltIndex: '1' },
    },
  });
  const [topTab, setTopTab] = useState('autoConfirm');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');

  const [upiId, setUpiId] = useState('');
  const [upiInitial, setUpiInitial] = useState('');
  const [upiSaving, setUpiSaving] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && rid) setWebhookUrl(`${window.location.origin}/api/payment/webhook?rid=${rid}`);
  }, [rid]);

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
            paytm: { merchantId: j.config.paytm?.merchantId || '', merchantKey: j.config.paytm?.merchantKey || '', env: j.config.paytm?.env || 'staging', websiteName: j.config.paytm?.websiteName || 'WEBSTAGING', industryType: j.config.paytm?.industryType || 'Retail' },
            razorpay: { keyId: j.config.razorpay?.keyId || '', keySecret: j.config.razorpay?.keySecret || '', webhookSecret: j.config.razorpay?.webhookSecret || '', env: j.config.razorpay?.env || 'test' },
            autoConfirm: {
              provider: j.config.autoConfirm?.provider || 'razorpay',
              isActive: !!j.config.autoConfirm?.isActive,
              previewMode: !!j.config.autoConfirm?.previewMode,
              razorpay: { keyId: j.config.autoConfirm?.razorpay?.keyId || '', keySecret: j.config.autoConfirm?.razorpay?.keySecret || '', webhookSecret: j.config.autoConfirm?.razorpay?.webhookSecret || '' },
              paytm: { merchantId: j.config.autoConfirm?.paytm?.merchantId || '', merchantKey: j.config.autoConfirm?.paytm?.merchantKey || '' },
              phonepe: { merchantId: j.config.autoConfirm?.phonepe?.merchantId || '', saltKey: j.config.autoConfirm?.phonepe?.saltKey || '', saltIndex: j.config.autoConfirm?.phonepe?.saltIndex || '1' },
            },
          });
        }
      } catch (e) { console.error('Failed to load gateway config:', e); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [rid]);

  useEffect(() => {
    if (!rid) return;
    let alive = true;
    (async () => {
      try {
        const r = await getRestaurantById(rid);
        if (!alive || !r) return;
        const saved = (r.upiId || '').trim();
        setUpiId(saved); setUpiInitial(saved);
      } catch (e) { console.error('[gateway] Failed to load UPI ID:', e); }
    })();
    return () => { alive = false; };
  }, [rid]);

  const saveUpi = async () => {
    if (!rid) return;
    const trimmed = upiId.trim();
    if (trimmed === upiInitial) { toast('No changes to save'); return; }
    setUpiSaving(true);
    try { await updateRestaurant(rid, { upiId: trimmed }); setUpiInitial(trimmed); toast.success(trimmed ? 'UPI ID saved' : 'UPI ID cleared'); }
    catch (e) { console.error('[gateway] UPI save failed:', e); toast.error('Could not save UPI: ' + (e?.message || 'unknown')); }
    finally { setUpiSaving(false); }
  };

  const save = async () => {
    if (!rid) return;
    setSaving(true);
    try {
      const u = auth.currentUser;
      if (!u) throw new Error('Not signed in');
      const idToken = await u.getIdToken();
      const r = await fetch('/api/payment/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken, config }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Save failed');
      toast.success('Gateway saved');
    } catch (e) { console.error(e); toast.error(e.message || 'Save failed'); }
    setSaving(false);
  };

  return (
    <>
      <Head><title>Payment Gateway | HaloHelm</title></Head>
      <OkShell active={null} eyebrow="Operations · payments setup" title="Payment Gateway" brand={restaurantName}>
        <div style={{ maxWidth: 720 }}>
          <p style={{ fontFamily: 'var(--font-body)', color: 'var(--tx-2)', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
            Two ways to handle customer UPI payments. <strong style={{ color: 'var(--tx)' }}>Auto-Confirm UPI</strong> uses the merchant account behind your existing soundbox (money stays with you, we just listen for the "paid" signal). <strong style={{ color: 'var(--tx)' }}>Full Gateway</strong> routes money through Razorpay/Paytm checkout for cards + UPI + netbanking (~2% fee, settled T+1).
          </p>

          {/* Direct UPI ID */}
          <Card title="UPI ID" hint="Your direct UPI ID (GPay / PhonePe / Paytm / any UPI app). The customer bill shows this as a Pay-by-UPI option — money lands in your account, no fee, no routing. Leave blank to hide UPI on the bill.">
            <Field label="UPI ID">
              <input value={upiId} onChange={e => setUpiId(e.target.value)} placeholder="e.g. yourrestaurant@ybl or 9876543210@paytm" style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} />
            </Field>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <button onClick={saveUpi} disabled={upiSaving || upiId.trim() === upiInitial}
                style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, cursor: (upiSaving || upiId.trim() === upiInitial) ? 'not-allowed' : 'pointer', opacity: (upiSaving || upiId.trim() === upiInitial) ? 0.5 : 1 }}>{upiSaving ? 'Saving…' : 'Save UPI ID'}</button>
              {upiInitial && upiId.trim() === upiInitial && <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>✓ Active</span>}
            </div>
          </Card>

          {/* Top tabs */}
          <div style={{ display: 'inline-flex', padding: 4, marginBottom: 20, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, gap: 4 }}>
            {[{ k: 'autoConfirm', label: 'Auto-Confirm UPI', badge: 'Recommended' }, { k: 'fullGateway', label: 'Full Gateway' }].map(t => {
              const sel = topTab === t.k;
              return (
                <button key={t.k} onClick={() => setTopTab(t.k)} style={{ padding: '9px 16px', borderRadius: 7, background: sel ? 'var(--accent)' : 'transparent', color: sel ? 'var(--accent-ink)' : 'var(--tx-2)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {t.label}
                  {t.badge && <span style={{ padding: '2px 7px', borderRadius: 99, fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, background: sel ? 'rgba(26,24,21,0.18)' : 'rgba(196,168,109,0.16)', color: sel ? 'var(--accent-ink)' : 'var(--gold)', letterSpacing: '.04em', textTransform: 'uppercase' }}>{t.badge}</span>}
                </button>
              );
            })}
          </div>

          {loading ? (
            <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: 32, textAlign: 'center', color: 'var(--tx-3)', fontFamily: 'var(--font-body)' }}>Loading…</div>
          ) : topTab === 'autoConfirm' ? (
            <AutoConfirmTab config={config} setConfig={setConfig} webhookUrl={webhookUrl} />
          ) : (
            <>
              <Card title="Provider">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[{ k: 'paytm', label: 'Paytm Business' }, { k: 'razorpay', label: 'Razorpay' }, { k: 'none', label: 'None (manual)' }].map(p => (
                    <button key={p.k} onClick={() => setConfig(c => ({ ...c, provider: p.k }))} style={pickBtn(config.provider === p.k)}>{p.label}</button>
                  ))}
                </div>
              </Card>

              {config.provider === 'razorpay' && (
                <Card title="Razorpay credentials" hint="Paste these from your Razorpay dashboard → Settings → API Keys (and Webhooks for the Webhook Secret). Test keys start with rzp_test_, live keys with rzp_live_.">
                  <Field label="Key ID"><input value={config.razorpay.keyId} onChange={e => setConfig(c => ({ ...c, razorpay: { ...c.razorpay, keyId: e.target.value.trim() } }))} placeholder="rzp_test_PLACEHOLDER_REPLACE_ME" style={inputStyle} /></Field>
                  <Field label={config.razorpay.keySecret?.startsWith('••••') ? 'Key Secret (saved — repaste to change)' : 'Key Secret'}><input value={config.razorpay.keySecret} onChange={e => setConfig(c => ({ ...c, razorpay: { ...c.razorpay, keySecret: e.target.value.trim() } }))} placeholder={config.razorpay.keySecret?.startsWith('••••') ? config.razorpay.keySecret : 'PLACEHOLDER_KEY_SECRET'} type="password" autoComplete="new-password" style={inputStyle} /></Field>
                  <Field label={config.razorpay.webhookSecret?.startsWith('••••') ? 'Webhook Secret (saved — repaste to change)' : 'Webhook Secret'}><input value={config.razorpay.webhookSecret} onChange={e => setConfig(c => ({ ...c, razorpay: { ...c.razorpay, webhookSecret: e.target.value.trim() } }))} placeholder={config.razorpay.webhookSecret?.startsWith('••••') ? config.razorpay.webhookSecret : 'PLACEHOLDER_WEBHOOK_SECRET'} type="password" autoComplete="new-password" style={inputStyle} /></Field>
                  <Field label="Environment">
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[{ k: 'test', label: 'Test mode' }, { k: 'live', label: 'Live mode' }].map(e => {
                        const sel = config.razorpay.env === e.k;
                        return <button key={e.k} type="button" onClick={() => setConfig(c => ({ ...c, razorpay: { ...c.razorpay, env: e.k } }))} style={{ padding: '8px 14px', borderRadius: 8, background: sel ? (e.k === 'live' ? 'var(--success)' : 'var(--gold)') : 'var(--card-2)', color: sel ? '#fff' : 'var(--tx-2)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600 }}>{e.label}</button>;
                      })}
                    </div>
                  </Field>
                </Card>
              )}

              {config.provider === 'paytm' && (
                <Card title="Paytm credentials">
                  <Field label="Merchant ID (MID)"><input value={config.paytm.merchantId} onChange={e => setConfig(c => ({ ...c, paytm: { ...c.paytm, merchantId: e.target.value.trim() } }))} placeholder="e.g. ABCXYZ12345" style={inputStyle} /></Field>
                  <Field label={config.paytm.merchantKey?.startsWith('••••') ? 'Merchant Key (saved — repaste to change)' : 'Merchant Key'}><input value={config.paytm.merchantKey} onChange={e => setConfig(c => ({ ...c, paytm: { ...c.paytm, merchantKey: e.target.value.trim() } }))} placeholder={config.paytm.merchantKey?.startsWith('••••') ? config.paytm.merchantKey : 'Paste from Paytm dashboard'} type="password" autoComplete="new-password" style={inputStyle} /></Field>
                  <Field label="Environment">
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[{ k: 'staging', label: 'Staging (test)' }, { k: 'production', label: 'Production' }].map(e => {
                        const sel = config.paytm.env === e.k;
                        return <button key={e.k} onClick={() => setConfig(c => ({ ...c, paytm: { ...c.paytm, env: e.k } }))} style={{ padding: '8px 14px', borderRadius: 8, background: sel ? (e.k === 'production' ? 'var(--success)' : 'var(--gold)') : 'var(--card-2)', color: sel ? '#fff' : 'var(--tx-2)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600 }}>{e.label}</button>;
                      })}
                    </div>
                  </Field>
                  <Field label="Website Name (Paytm-issued)"><input value={config.paytm.websiteName} onChange={e => setConfig(c => ({ ...c, paytm: { ...c.paytm, websiteName: e.target.value.trim() } }))} placeholder="WEBSTAGING (sandbox) or your assigned name" style={inputStyle} /></Field>
                </Card>
              )}

              <Card title="Webhook URL" hint="Copy this into the Callback / Webhook URL field in your Paytm Business dashboard. Required for auto-confirm to work.">
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, padding: '12px 14px', background: 'var(--card-2)', borderRadius: 9, color: 'var(--tx)', wordBreak: 'break-all', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span>{webhookUrl}</span>
                  <button onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success('Copied'); }} style={{ padding: '6px 10px', background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700 }}>Copy</button>
                </div>
              </Card>

              <Card title="Status">
                <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--tx)' }}>
                  <input type="checkbox" checked={config.isActive} onChange={e => setConfig(c => ({ ...c, isActive: e.target.checked }))} style={{ width: 18, height: 18, accentColor: 'var(--success)', cursor: 'pointer' }} />
                  <span style={{ fontWeight: 600 }}>Enable gateway for customer UPI payments</span>
                </label>
                <div style={{ marginTop: 6, fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)', lineHeight: 1.5 }}>When OFF, UPI taps stay on the manual flow. When ON, taps redirect to your gateway and auto-confirm.</div>
              </Card>
            </>
          )}

          {!loading && (
            <button onClick={save} disabled={saving} style={{ marginTop: 14, padding: '12px 24px', background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 10, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save Settings'}</button>
          )}
        </div>
      </OkShell>
    </>
  );
}

function AutoConfirmTab({ config, setConfig, webhookUrl }) {
  const ac = config.autoConfirm || {};
  const acProvider = ac.provider || 'razorpay';
  const acWebhook = (webhookUrl || '').replace('/api/payment/webhook', `/api/auto-confirm/${acProvider}`);
  const setAC = (next) => setConfig(c => ({ ...c, autoConfirm: typeof next === 'function' ? next(c.autoConfirm) : next }));

  return (
    <>
      <Card title="How this works" hint="Money flows directly customer-bank → your bank (or your existing soundbox merchant account). HaloHelm just listens for the webhook that says 'payment received' and marks the matching order paid.">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 0', flexWrap: 'wrap' }}>
          {['✓ Money stays with you', '✓ Auto-confirms on payment', '✓ Works with your soundbox'].map(t => (
            <div key={t} style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--success)', padding: '6px 10px', borderRadius: 8, background: 'rgba(63,170,99,0.10)', border: '1px solid rgba(63,170,99,0.26)' }}>{t}</div>
          ))}
        </div>
      </Card>

      <Card title="Provider">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[{ k: 'razorpay', label: 'Razorpay' }, { k: 'paytm', label: 'Paytm Business' }, { k: 'phonepe', label: 'PhonePe Business' }].map(p => (
            <button key={p.k} type="button" onClick={() => setAC(a => ({ ...a, provider: p.k }))} style={pickBtn(acProvider === p.k)}>{p.label}</button>
          ))}
        </div>
      </Card>

      {acProvider === 'razorpay' && (
        <Card title="Razorpay credentials" hint="Razorpay Dashboard → Settings → API Keys (Key ID + Key Secret) and Webhooks (Webhook Secret). Add a webhook subscribed to 'payment.captured' pointing to the URL below.">
          <Field label="Key ID"><input value={ac.razorpay?.keyId || ''} onChange={e => setAC(a => ({ ...a, razorpay: { ...a.razorpay, keyId: e.target.value.trim() } }))} placeholder="rzp_test_PLACEHOLDER_REPLACE_ME" style={inputStyle} /></Field>
          <Field label={ac.razorpay?.keySecret?.startsWith('••••') ? 'Key Secret (saved — repaste to change)' : 'Key Secret'}><input value={ac.razorpay?.keySecret || ''} onChange={e => setAC(a => ({ ...a, razorpay: { ...a.razorpay, keySecret: e.target.value.trim() } }))} placeholder={ac.razorpay?.keySecret?.startsWith('••••') ? ac.razorpay.keySecret : 'PLACEHOLDER_KEY_SECRET'} type="password" autoComplete="new-password" style={inputStyle} /></Field>
          <Field label={ac.razorpay?.webhookSecret?.startsWith('••••') ? 'Webhook Secret (saved — repaste to change)' : 'Webhook Secret'}><input value={ac.razorpay?.webhookSecret || ''} onChange={e => setAC(a => ({ ...a, razorpay: { ...a.razorpay, webhookSecret: e.target.value.trim() } }))} placeholder={ac.razorpay?.webhookSecret?.startsWith('••••') ? ac.razorpay.webhookSecret : 'PLACEHOLDER_WEBHOOK_SECRET'} type="password" autoComplete="new-password" style={inputStyle} /></Field>
        </Card>
      )}
      {acProvider === 'paytm' && (
        <Card title="Paytm Business credentials" hint="Paytm for Business dashboard → Developer Settings → API Keys. Add a webhook subscribed to 'Payment Status Update' pointing to the URL below.">
          <Field label="Merchant ID (MID)"><input value={ac.paytm?.merchantId || ''} onChange={e => setAC(a => ({ ...a, paytm: { ...a.paytm, merchantId: e.target.value.trim() } }))} placeholder="e.g. ABCXYZ12345" style={inputStyle} /></Field>
          <Field label={ac.paytm?.merchantKey?.startsWith('••••') ? 'Merchant Key (saved — repaste to change)' : 'Merchant Key'}><input value={ac.paytm?.merchantKey || ''} onChange={e => setAC(a => ({ ...a, paytm: { ...a.paytm, merchantKey: e.target.value.trim() } }))} placeholder={ac.paytm?.merchantKey?.startsWith('••••') ? ac.paytm.merchantKey : 'Paste from Paytm dashboard'} type="password" autoComplete="new-password" style={inputStyle} /></Field>
        </Card>
      )}
      {acProvider === 'phonepe' && (
        <Card title="PhonePe Business credentials" hint="PhonePe Business dashboard → Developer Settings → API Keys. Paste the Salt Key + Salt Index (typically '1').">
          <Field label="Merchant ID"><input value={ac.phonepe?.merchantId || ''} onChange={e => setAC(a => ({ ...a, phonepe: { ...a.phonepe, merchantId: e.target.value.trim() } }))} placeholder="e.g. MERCHANTUAT" style={inputStyle} /></Field>
          <Field label={ac.phonepe?.saltKey?.startsWith('••••') ? 'Salt Key (saved — repaste to change)' : 'Salt Key'}><input value={ac.phonepe?.saltKey || ''} onChange={e => setAC(a => ({ ...a, phonepe: { ...a.phonepe, saltKey: e.target.value.trim() } }))} placeholder={ac.phonepe?.saltKey?.startsWith('••••') ? ac.phonepe.saltKey : 'Paste from PhonePe dashboard'} type="password" autoComplete="new-password" style={inputStyle} /></Field>
          <Field label="Salt Index"><input value={ac.phonepe?.saltIndex || '1'} onChange={e => setAC(a => ({ ...a, phonepe: { ...a.phonepe, saltIndex: e.target.value.trim() } }))} placeholder="1" style={{ ...inputStyle, maxWidth: 100 }} /></Field>
        </Card>
      )}

      <Card title="Webhook URL" hint="Copy this and paste it into your provider's webhook configuration page. We verify the signature, match it to a pending order, and mark it paid automatically.">
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, padding: '12px 14px', background: 'var(--card-2)', borderRadius: 9, color: 'var(--tx)', wordBreak: 'break-all', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>{acWebhook}</span>
          <button type="button" onClick={() => { navigator.clipboard.writeText(acWebhook); toast.success('Copied'); }} style={{ padding: '6px 10px', background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700 }}>Copy</button>
        </div>
      </Card>

      <Card title="Status">
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--tx)' }}>
          <input type="checkbox" checked={!!ac.isActive} onChange={e => setAC(a => ({ ...a, isActive: e.target.checked }))} style={{ width: 18, height: 18, accentColor: 'var(--success)', cursor: 'pointer' }} />
          <span style={{ fontWeight: 600 }}>Enable Auto-Confirm UPI</span>
        </label>
        <div style={{ marginTop: 6, fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)', lineHeight: 1.5 }}>When ON, every UPI payment to your merchant account auto-confirms the matching order. When OFF, staff manually marks paid orders.</div>
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13 }}>
            <input type="checkbox" checked={!!ac.previewMode} onChange={e => setAC(a => ({ ...a, previewMode: e.target.checked }))} style={{ width: 16, height: 16, accentColor: 'var(--gold)', cursor: 'pointer', marginTop: 2, flexShrink: 0 }} />
            <div>
              <span style={{ fontWeight: 600, color: 'var(--gold)' }}>Preview auto-confirm UI (no real webhook)</span>
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--tx-3)', lineHeight: 1.5 }}>Forces the customer's bill modal to show the “Waiting for payment confirmation…” spinner — useful for demos. The 30-second “confirm manually” fallback still appears since no webhook fires in preview mode.</div>
            </div>
          </label>
        </div>
      </Card>
    </>
  );
}

GatewayV2.getLayout = (page) => page;
