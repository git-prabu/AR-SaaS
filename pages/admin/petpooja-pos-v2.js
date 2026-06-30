// pages/admin/petpooja-pos-v2.js
//
// ★ REDESIGN EXEMPLAR ★ — duplicate of /admin/petpooja-pos on the dark
// "ok-root" theme (via <OkShell>). Logic (restaurant subscribe, plan gate,
// test/connect/sync/disconnect API calls, logs) copied verbatim from
// petpooja-pos.js — only the render is new. Original untouched.
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import OkShell from '../../components/admin/OkShell';
import ConfirmModal from '../../components/ConfirmModal';
import { canUsePetpoojaIntegration } from '../../lib/plans';
import { db } from '../../lib/firebase';
import { doc, onSnapshot, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import toast from 'react-hot-toast';

const inputStyle = {
  width: '100%', padding: '11px 14px', boxSizing: 'border-box',
  background: 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 10,
  fontSize: 14, color: 'var(--tx)', fontFamily: 'var(--font-body)', outline: 'none',
};

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, color: 'var(--tx)', marginBottom: 5 }}>{label}</label>
      {children}
      {hint && <div style={{ marginTop: 4, fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)' }}>{hint}</div>}
    </div>
  );
}
function Stat({ label, value }) {
  return (
    <div style={{ background: 'var(--card-2)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--tx-3)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx)', fontWeight: 600, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}
function btn(primary, disabled, danger) {
  return {
    padding: '10px 18px', borderRadius: 10,
    background: danger ? 'transparent' : (primary ? 'var(--accent)' : 'var(--card)'),
    color: danger ? 'var(--danger)' : (primary ? 'var(--accent-ink)' : 'var(--tx)'),
    border: danger ? '1.5px solid rgba(217,83,79,0.4)' : (primary ? 'none' : '1px solid var(--line)'),
    fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
  };
}

export default function PetpoojaConnectV2() {
  const { user, userData } = useAuth();
  const rid = userData?.restaurantId;
  const restaurantName = userData?.restaurantName || 'Your Restaurant';

  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);

  const [restID, setRestID] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  useEffect(() => {
    if (!rid) return;
    const unsub = onSnapshot(doc(db, 'restaurants', rid), (snap) => {
      if (snap.exists()) setRestaurant({ id: snap.id, ...snap.data() });
      setLoading(false);
    }, (err) => { console.error('[petpooja-connect] subscription failed:', err); setLoading(false); });
    return unsub;
  }, [rid]);

  useEffect(() => {
    if (!rid || restaurant?.posMode !== 'petpooja_hybrid') return;
    const fetchLogs = async () => {
      try {
        const q = query(collection(db, 'restaurants', rid, 'petpoojaLogs'), orderBy('createdAt', 'desc'), limit(20));
        const snap = await getDocs(q);
        setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) { console.warn('[petpooja-connect] log fetch failed:', err?.message); }
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, 8000);
    return () => clearInterval(interval);
  }, [rid, restaurant?.posMode]);

  const planEligible = canUsePetpoojaIntegration(restaurant);

  const callApi = async (path, body) => {
    if (!user) throw new Error('Not signed in');
    const idToken = await user.getIdToken();
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${res.status}`);
    return data;
  };

  const handleTest = async () => {
    if (!restID.trim() || !apiKey.trim()) { toast.error('restID and apiKey are required.'); return; }
    setBusy(true); setTestResult(null);
    try {
      const data = await callApi('/api/petpooja/connect', { restaurantId: rid, mode: 'test', restID: restID.trim(), apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), accessToken: accessToken.trim() });
      if (data.ok) { setTestResult({ ok: true, restaurant: data.restaurant }); toast.success(`Found "${data.restaurant?.name || 'your restaurant'}" — ${data.restaurant?.itemCount || 0} items, ${data.restaurant?.categoryCount || 0} categories.`); }
      else { setTestResult({ ok: false, error: data.error }); toast.error(`Connection failed: ${data.error}`); }
    } catch (err) { setTestResult({ ok: false, error: err.message }); toast.error(`Connection failed: ${err.message}`); }
    finally { setBusy(false); }
  };

  const handleConnect = async () => {
    if (!restID.trim() || !apiKey.trim()) { toast.error('restID and apiKey are required.'); return; }
    setBusy(true);
    try {
      await callApi('/api/petpooja/connect', { restaurantId: rid, mode: 'save', restID: restID.trim(), apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), accessToken: accessToken.trim() });
      toast.success('Connected. Pulling menu now…');
      try { const sync = await callApi('/api/petpooja/menu-sync', { restaurantId: rid }); toast.success(`Menu synced — ${sync.itemCount || 0} items.`); }
      catch (err) { toast.error(`Menu sync failed: ${err.message}`); }
    } catch (err) { toast.error(`Connect failed: ${err.message}`); }
    finally { setBusy(false); }
  };

  const handleSyncNow = async () => {
    setBusy(true);
    try { const sync = await callApi('/api/petpooja/menu-sync', { restaurantId: rid }); toast.success(`Menu synced — ${sync.itemCount || 0} items.`); }
    catch (err) { toast.error(`Sync failed: ${err.message}`); }
    finally { setBusy(false); }
  };

  const handleDisconnect = () => {
    setConfirmDialog({
      title: 'Disconnect Petpooja?',
      body: 'Your menu, orders, and history stay in HaloHelm. We just stop pushing new orders to Petpooja and unlock menu editing on your Items page. You can reconnect anytime.',
      confirmLabel: 'Disconnect', cancelLabel: 'Keep connected', destructive: true,
      onConfirm: async () => {
        try { await callApi('/api/petpooja/disconnect', { restaurantId: rid, reason: 'user-requested' }); toast.success('Disconnected.'); }
        catch (err) { toast.error(`Disconnect failed: ${err.message}`); }
      },
    });
  };

  if (loading) {
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Head><title>Petpooja POS — HaloHelm</title></Head>
        <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  // Plan gate.
  if (!planEligible) {
    return (
      <>
        <Head><title>Petpooja POS — Pro plan required</title></Head>
        <OkShell active={null} eyebrow="Integrations" title="Petpooja POS" brand={restaurantName}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: 24, maxWidth: 720 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(196,168,109,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🔌</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--tx)', marginBottom: 6 }}>Pro plan required</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--tx-3)', lineHeight: 1.6, marginBottom: 18 }}>Petpooja hybrid integration is available on the <strong style={{ color: 'var(--gold)' }}>Pro plan</strong>. Connect Petpooja to push your customer-facing orders straight into your existing POS — kitchen, billing, GST and aggregator integrations stay on Petpooja, the modern customer experience runs on HaloHelm.</div>
                <Link href="/admin/subscription" style={{ display: 'inline-block', padding: '10px 18px', borderRadius: 10, background: 'var(--accent)', color: 'var(--accent-ink)', textDecoration: 'none', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700 }}>Upgrade to Pro</Link>
              </div>
            </div>
          </div>
        </OkShell>
      </>
    );
  }

  // Connected.
  if (restaurant?.posMode === 'petpooja_hybrid') {
    const cfg = restaurant.petpoojaConfig || {};
    const lastSyncMs = cfg.lastMenuSyncAt?.toDate ? cfg.lastMenuSyncAt.toDate().getTime() : (cfg.lastMenuSyncAt?.seconds ? cfg.lastMenuSyncAt.seconds * 1000 : null);
    const lastSyncLabel = lastSyncMs ? new Date(lastSyncMs).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'never';
    return (
      <>
        <Head><title>Petpooja POS — Connected</title></Head>
        <OkShell active={null} eyebrow="Integrations · connected" title="Petpooja POS" brand={restaurantName}>
          <div style={{ maxWidth: 920 }}>
            <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: 24, marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 0 4px rgba(63,170,99,0.18)' }} />
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--tx)' }}>Connected</div>
                <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)' }}>restID: <code style={{ fontFamily: 'var(--font-mono)' }}>{cfg.restID}</code></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
                <Stat label="Last menu sync" value={lastSyncLabel} />
                <Stat label="Sync errors (recent)" value={String(cfg.syncErrorCount || 0)} />
                <Stat label="Last error" value={cfg.lastSyncError || '—'} />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={handleSyncNow} disabled={busy} style={btn(true, busy)}>{busy ? 'Syncing…' : 'Sync menu now'}</button>
                <button onClick={handleDisconnect} disabled={busy} style={btn(false, busy, true)}>Disconnect</button>
              </div>
            </div>

            <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: 24 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--tx)', marginBottom: 12 }}>Recent activity</div>
              {logs.length === 0 ? (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-3)' }}>No log entries yet.</div>
              ) : (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--tx-3)', maxHeight: 320, overflowY: 'auto' }}>
                  {logs.map(l => {
                    const t = l.createdAt?.toDate ? l.createdAt.toDate().toLocaleTimeString('en-IN') : '—';
                    const status = l.ok === false ? '✖' : '✓';
                    const color = l.ok === false ? 'var(--danger)' : 'var(--success)';
                    return (
                      <div key={l.id} style={{ padding: '6px 0', borderBottom: '1px dashed var(--line)' }}>
                        <span style={{ color, fontWeight: 700, marginRight: 8 }}>{status}</span>
                        <span style={{ marginRight: 8 }}>{t}</span>
                        <span style={{ color: 'var(--tx)', marginRight: 8 }}>{l.kind}</span>
                        {l.error && <span style={{ color: 'var(--danger)' }}>{l.error}</span>}
                        {!l.error && l.itemCount && <span>· {l.itemCount} items</span>}
                        {!l.error && l.orderId && <span>· order {String(l.orderId).slice(-6)}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <ConfirmModal open={!!confirmDialog} title={confirmDialog?.title} body={confirmDialog?.body} confirmLabel={confirmDialog?.confirmLabel} cancelLabel={confirmDialog?.cancelLabel} destructive={confirmDialog?.destructive} onConfirm={confirmDialog?.onConfirm} onCancel={() => setConfirmDialog(null)} />
        </OkShell>
      </>
    );
  }

  // Connect form.
  return (
    <>
      <Head><title>Petpooja POS — Connect</title></Head>
      <OkShell active={null} eyebrow="Integrations · connect" title="Petpooja POS" brand={restaurantName}>
        <div style={{ maxWidth: 720 }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--tx-3)', lineHeight: 1.6, marginBottom: 20 }}>
            Push customer-facing orders from HaloHelm straight into your Petpooja POS. Your kitchen, billing, GST and aggregator integrations keep working as-is. We pull your menu from Petpooja so you only edit it in one place.
          </div>
          <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: 24 }}>
            <Field label="Restaurant ID (restID)" hint="Per-restaurant identifier from your Petpooja dashboard."><input value={restID} onChange={e => setRestID(e.target.value)} placeholder="e.g. xxxxxx" style={inputStyle} /></Field>
            <Field label="App Key" hint="32-char partner key issued by Petpooja."><input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="32-char string" style={inputStyle} /></Field>
            <Field label="App Secret" hint="40-char secret. Optional if your account uses a single key."><input value={apiSecret} onChange={e => setApiSecret(e.target.value)} placeholder="40-char string (optional)" style={inputStyle} /></Field>
            <Field label="Access Token" hint="40-char token. Optional if your account uses a single key."><input value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="40-char string (optional)" style={inputStyle} /></Field>

            {testResult && (
              <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, background: testResult.ok ? 'rgba(63,170,99,0.10)' : 'rgba(217,83,79,0.10)', border: `1px solid ${testResult.ok ? 'rgba(63,170,99,0.28)' : 'rgba(217,83,79,0.28)'}`, fontFamily: 'var(--font-body)', fontSize: 13, color: testResult.ok ? 'var(--success)' : 'var(--danger)' }}>
                {testResult.ok ? <>✓ Found <strong>{testResult.restaurant?.name || 'restaurant'}</strong> · {testResult.restaurant?.itemCount || 0} items · {testResult.restaurant?.categoryCount || 0} categories</> : <>✖ {testResult.error}</>}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button onClick={handleTest} disabled={busy} style={btn(false, busy)}>Test connection</button>
              <button onClick={handleConnect} disabled={busy || !testResult?.ok} style={btn(true, busy || !testResult?.ok)}>Connect &amp; sync menu</button>
            </div>
            <div style={{ marginTop: 12, fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)' }}>Tip: enter <code style={{ fontFamily: 'var(--font-mono)' }}>mock_anything</code> as App Key + any restID to use mock mode for testing without real Petpooja credentials.</div>
          </div>
        </div>
      </OkShell>
    </>
  );
}

PetpoojaConnectV2.getLayout = (page) => page;
