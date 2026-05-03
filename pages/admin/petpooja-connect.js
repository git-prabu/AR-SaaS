// pages/admin/petpooja-connect.js
// Phase B (Petpooja hybrid) — onboarding wizard.
//
// Three states this page handles:
//
//   1. Plan check fails (not on Pro)
//      → render an upgrade prompt and a link to /admin/subscription.
//
//   2. Pro plan, not connected yet (posMode !== 'petpooja_hybrid')
//      → render the connect form: restID + apiKey + optional secret/token.
//        "Test connection" hits /api/petpooja/connect mode=test
//        "Connect" hits /api/petpooja/connect mode=save then triggers
//        an immediate /api/petpooja/menu-sync.
//
//   3. Pro plan, already connected (posMode === 'petpooja_hybrid')
//      → render the connected state: restID, last-sync timestamp,
//        sync-now button, recent log entries, disconnect button.
//
// All API calls authenticated via the user's Firebase idToken.

import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import ConfirmModal from '../../components/ConfirmModal';
import { canUsePetpoojaIntegration } from '../../lib/plans';
import { db } from '../../lib/firebase'; // client SDK — read-only
import { doc, onSnapshot, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import toast from 'react-hot-toast';

const A = {
  font: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  cream: '#EDEDED', ink: '#1A1A1A',
  shell: '#FFFFFF', shellDarker: '#FAFAF8',
  warning: '#C4A86D', warningDim: '#A08656',
  success: '#3F9E5A', danger: '#D9534F',
  mutedText: 'rgba(0,0,0,0.55)', faintText: 'rgba(0,0,0,0.38)',
  subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)',
  borderStrong: '1px solid rgba(0,0,0,0.10)',
  cardShadow: '0 2px 10px rgba(0,0,0,0.03)',
};

const inputStyle = {
  width: '100%', padding: '11px 14px', boxSizing: 'border-box',
  background: A.shell, border: '1px solid rgba(0,0,0,0.10)', borderRadius: 9,
  fontSize: 14, color: A.ink, fontFamily: A.font, outline: 'none',
};

export default function PetpoojaConnect() {
  const { user, userData } = useAuth();
  const rid = userData?.restaurantId;

  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);

  // Form state for the connect step.
  const [restID, setRestID] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Subscribe to the restaurant doc so we always have the freshest
  // posMode + petpoojaConfig (no stale state after Connect / Disconnect).
  useEffect(() => {
    if (!rid) return;
    const unsub = onSnapshot(doc(db, 'restaurants', rid), (snap) => {
      if (snap.exists()) setRestaurant({ id: snap.id, ...snap.data() });
      setLoading(false);
    }, (err) => {
      console.error('[petpooja-connect] subscription failed:', err);
      setLoading(false);
    });
    return unsub;
  }, [rid]);

  // Pull recent log entries when we're in connected state.
  useEffect(() => {
    if (!rid || restaurant?.posMode !== 'petpooja_hybrid') return;
    const fetchLogs = async () => {
      try {
        const q = query(
          collection(db, 'restaurants', rid, 'petpoojaLogs'),
          orderBy('createdAt', 'desc'),
          limit(20),
        );
        const snap = await getDocs(q);
        setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.warn('[petpooja-connect] log fetch failed:', err?.message);
      }
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, 8000);
    return () => clearInterval(interval);
  }, [rid, restaurant?.posMode]);

  // Plan gate — on the page itself. Server still enforces, but this
  // gives the user a clear UI message instead of a confusing 403.
  const planEligible = canUsePetpoojaIntegration(restaurant);

  // ── Handlers ─────────────────────────────────────────────────────
  const callApi = async (path, body) => {
    if (!user) throw new Error('Not signed in');
    const idToken = await user.getIdToken();
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.message || data.error || `HTTP ${res.status}`);
    }
    return data;
  };

  const handleTest = async () => {
    if (!restID.trim() || !apiKey.trim()) {
      toast.error('restID and apiKey are required.');
      return;
    }
    setBusy(true);
    setTestResult(null);
    try {
      const data = await callApi('/api/petpooja/connect', {
        restaurantId: rid,
        mode: 'test',
        restID: restID.trim(),
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        accessToken: accessToken.trim(),
      });
      if (data.ok) {
        setTestResult({ ok: true, restaurant: data.restaurant });
        toast.success(`Found "${data.restaurant?.name || 'your restaurant'}" — ${data.restaurant?.itemCount || 0} items, ${data.restaurant?.categoryCount || 0} categories.`);
      } else {
        setTestResult({ ok: false, error: data.error });
        toast.error(`Connection failed: ${data.error}`);
      }
    } catch (err) {
      setTestResult({ ok: false, error: err.message });
      toast.error(`Connection failed: ${err.message}`);
    } finally { setBusy(false); }
  };

  const handleConnect = async () => {
    if (!restID.trim() || !apiKey.trim()) {
      toast.error('restID and apiKey are required.');
      return;
    }
    setBusy(true);
    try {
      await callApi('/api/petpooja/connect', {
        restaurantId: rid,
        mode: 'save',
        restID: restID.trim(),
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        accessToken: accessToken.trim(),
      });
      toast.success('Connected. Pulling menu now…');
      // Trigger menu-sync immediately so the user sees their menu.
      try {
        const sync = await callApi('/api/petpooja/menu-sync', { restaurantId: rid });
        toast.success(`Menu synced — ${sync.itemCount || 0} items.`);
      } catch (err) {
        toast.error(`Menu sync failed: ${err.message}`);
      }
    } catch (err) {
      toast.error(`Connect failed: ${err.message}`);
    } finally { setBusy(false); }
  };

  const handleSyncNow = async () => {
    setBusy(true);
    try {
      const sync = await callApi('/api/petpooja/menu-sync', { restaurantId: rid });
      toast.success(`Menu synced — ${sync.itemCount || 0} items.`);
    } catch (err) {
      toast.error(`Sync failed: ${err.message}`);
    } finally { setBusy(false); }
  };

  const handleDisconnect = () => {
    setConfirmDialog({
      title: 'Disconnect Petpooja?',
      body: 'Your menu, orders, and history stay in Advert Radical. We just stop pushing new orders to Petpooja and unlock menu editing on your Items page. You can reconnect anytime.',
      confirmLabel: 'Disconnect',
      cancelLabel: 'Keep connected',
      destructive: true,
      onConfirm: async () => {
        try {
          await callApi('/api/petpooja/disconnect', { restaurantId: rid, reason: 'user-requested' });
          toast.success('Disconnected.');
        } catch (err) {
          toast.error(`Disconnect failed: ${err.message}`);
        }
      },
    });
  };

  // ── Renders ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <AdminLayout>
        <Head><title>Petpooja Integration — Admin</title></Head>
        <div style={{ padding: 32, fontFamily: A.font, color: A.mutedText }}>Loading…</div>
      </AdminLayout>
    );
  }

  // Plan check.
  if (!planEligible) {
    return (
      <AdminLayout>
        <Head><title>Petpooja Integration — Pro plan required</title></Head>
        <div style={{ padding: '32px 28px', maxWidth: 720, margin: '0 auto', fontFamily: A.font }}>
          <div style={{ fontSize: 11, color: A.faintText, letterSpacing: '0.05em', marginBottom: 6 }}>Admin · Integrations</div>
          <h1 style={{ fontSize: 26, fontWeight: 600, color: A.ink, letterSpacing: '-0.4px', margin: '0 0 16px' }}>Petpooja integration</h1>
          <div style={{ background: A.shell, border: A.borderStrong, borderRadius: 12, padding: 24, boxShadow: A.cardShadow }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(196,168,109,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🔌</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: A.ink, marginBottom: 6 }}>Pro plan required</div>
                <div style={{ fontSize: 13.5, color: A.mutedText, lineHeight: 1.6, marginBottom: 18 }}>
                  Petpooja hybrid integration is available on the <strong style={{ color: A.warningDim }}>Pro plan</strong>. Connect Petpooja to push your customer-facing orders straight into your existing POS — kitchen, billing, GST and aggregator integrations stay on Petpooja, the modern customer experience runs on Advert Radical.
                </div>
                <Link href="/admin/subscription" style={{ display: 'inline-block', padding: '10px 18px', borderRadius: 9, background: A.ink, color: A.shell, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
                  Upgrade to Pro
                </Link>
              </div>
            </div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // Already connected.
  if (restaurant?.posMode === 'petpooja_hybrid') {
    const cfg = restaurant.petpoojaConfig || {};
    const lastSyncMs = cfg.lastMenuSyncAt?.toDate
      ? cfg.lastMenuSyncAt.toDate().getTime()
      : (cfg.lastMenuSyncAt?.seconds ? cfg.lastMenuSyncAt.seconds * 1000 : null);
    const lastSyncLabel = lastSyncMs
      ? new Date(lastSyncMs).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
      : 'never';
    return (
      <AdminLayout>
        <Head><title>Petpooja Integration — Connected</title></Head>
        <div style={{ padding: '32px 28px', maxWidth: 920, margin: '0 auto', fontFamily: A.font }}>
          <div style={{ fontSize: 11, color: A.faintText, letterSpacing: '0.05em', marginBottom: 6 }}>Admin · Integrations</div>
          <h1 style={{ fontSize: 26, fontWeight: 600, color: A.ink, letterSpacing: '-0.4px', margin: '0 0 24px' }}>Petpooja integration</h1>

          <div style={{ background: A.shell, border: A.borderStrong, borderRadius: 12, padding: 24, marginBottom: 18, boxShadow: A.cardShadow }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: A.success, boxShadow: `0 0 0 4px ${A.success}22` }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: A.ink }}>Connected</div>
              <div style={{ marginLeft: 'auto', fontSize: 12, color: A.mutedText }}>restID: <code style={{ fontFamily: 'monospace' }}>{cfg.restID}</code></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
              <Stat label="Last menu sync" value={lastSyncLabel} />
              <Stat label="Sync errors (recent)" value={String(cfg.syncErrorCount || 0)} />
              <Stat label="Last error" value={cfg.lastSyncError || '—'} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={handleSyncNow} disabled={busy} style={btn(A.ink, A.shell, busy)}>
                {busy ? 'Syncing…' : 'Sync menu now'}
              </button>
              <button onClick={handleDisconnect} disabled={busy} style={btn('transparent', A.danger, busy, A.danger)}>
                Disconnect
              </button>
            </div>
          </div>

          {/* Recent activity */}
          <div style={{ background: A.shell, border: A.borderStrong, borderRadius: 12, padding: 24, boxShadow: A.cardShadow }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: A.ink, marginBottom: 12, letterSpacing: '0.02em' }}>Recent activity</div>
            {logs.length === 0 ? (
              <div style={{ fontSize: 13, color: A.mutedText }}>No log entries yet.</div>
            ) : (
              <div style={{ fontFamily: 'monospace', fontSize: 12, color: A.mutedText, maxHeight: 320, overflowY: 'auto' }}>
                {logs.map(l => {
                  const t = l.createdAt?.toDate ? l.createdAt.toDate().toLocaleTimeString('en-IN') : '—';
                  const status = l.ok === false ? '✖' : '✓';
                  const color = l.ok === false ? A.danger : A.success;
                  return (
                    <div key={l.id} style={{ padding: '6px 0', borderBottom: '1px dashed rgba(0,0,0,0.06)' }}>
                      <span style={{ color, fontWeight: 700, marginRight: 8 }}>{status}</span>
                      <span style={{ marginRight: 8 }}>{t}</span>
                      <span style={{ color: A.ink, marginRight: 8 }}>{l.kind}</span>
                      {l.error && <span style={{ color: A.danger }}>{l.error}</span>}
                      {!l.error && l.itemCount && <span>· {l.itemCount} items</span>}
                      {!l.error && l.orderId && <span>· order {String(l.orderId).slice(-6)}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <ConfirmModal
          open={!!confirmDialog}
          title={confirmDialog?.title}
          body={confirmDialog?.body}
          confirmLabel={confirmDialog?.confirmLabel}
          cancelLabel={confirmDialog?.cancelLabel}
          destructive={confirmDialog?.destructive}
          onConfirm={confirmDialog?.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      </AdminLayout>
    );
  }

  // Pro plan, not connected — show the form.
  return (
    <AdminLayout>
      <Head><title>Connect Petpooja — Admin</title></Head>
      <div style={{ padding: '32px 28px', maxWidth: 720, margin: '0 auto', fontFamily: A.font }}>
        <div style={{ fontSize: 11, color: A.faintText, letterSpacing: '0.05em', marginBottom: 6 }}>Admin · Integrations</div>
        <h1 style={{ fontSize: 26, fontWeight: 600, color: A.ink, letterSpacing: '-0.4px', margin: '0 0 8px' }}>Connect Petpooja</h1>
        <div style={{ fontSize: 13.5, color: A.mutedText, lineHeight: 1.6, marginBottom: 24 }}>
          Push customer-facing orders from Advert Radical straight into your Petpooja POS. Your kitchen, billing, GST and aggregator integrations keep working as-is. We pull your menu from Petpooja so you only edit it in one place.
        </div>

        <div style={{ background: A.shell, border: A.borderStrong, borderRadius: 12, padding: 24, marginBottom: 18, boxShadow: A.cardShadow }}>
          <Field label="Restaurant ID (restID)" hint="Per-restaurant identifier from your Petpooja dashboard.">
            <input value={restID} onChange={e => setRestID(e.target.value)} placeholder="e.g. xxxxxx" style={inputStyle} />
          </Field>
          <Field label="App Key" hint="32-char partner key issued by Petpooja.">
            <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="32-char string" style={inputStyle} />
          </Field>
          <Field label="App Secret" hint="40-char secret. Optional if your account uses a single key.">
            <input value={apiSecret} onChange={e => setApiSecret(e.target.value)} placeholder="40-char string (optional)" style={inputStyle} />
          </Field>
          <Field label="Access Token" hint="40-char token. Optional if your account uses a single key.">
            <input value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="40-char string (optional)" style={inputStyle} />
          </Field>

          {testResult && (
            <div style={{
              marginTop: 14, padding: '12px 14px', borderRadius: 9,
              background: testResult.ok ? 'rgba(63,158,90,0.08)' : 'rgba(217,83,79,0.08)',
              border: `1px solid ${testResult.ok ? 'rgba(63,158,90,0.25)' : 'rgba(217,83,79,0.25)'}`,
              fontSize: 13, color: testResult.ok ? A.success : A.danger,
            }}>
              {testResult.ok
                ? <>✓ Found <strong>{testResult.restaurant?.name || 'restaurant'}</strong> · {testResult.restaurant?.itemCount || 0} items · {testResult.restaurant?.categoryCount || 0} categories</>
                : <>✖ {testResult.error}</>}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <button onClick={handleTest} disabled={busy} style={btn('transparent', A.ink, busy, 'rgba(0,0,0,0.10)')}>
              Test connection
            </button>
            <button onClick={handleConnect} disabled={busy || !testResult?.ok} style={btn(A.ink, A.shell, busy || !testResult?.ok)}>
              Connect &amp; sync menu
            </button>
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: A.faintText }}>
            Tip: enter <code>mock_anything</code> as App Key + any restID to use mock mode for testing without real Petpooja credentials.
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: A.ink, marginBottom: 5, letterSpacing: '0.02em' }}>{label}</label>
      {children}
      {hint && <div style={{ marginTop: 4, fontSize: 11, color: A.faintText }}>{hint}</div>}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ background: A.subtleBg, padding: '10px 14px', borderRadius: 9 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: A.faintText, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: A.ink, fontWeight: 600, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

function btn(bg, fg, disabled, border) {
  return {
    padding: '10px 18px', borderRadius: 9,
    background: bg, color: fg,
    border: border ? `1.5px solid ${border}` : 'none',
    fontFamily: A.font, fontSize: 13, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
  };
}
