// pages/admin/qrcode-v2.js
//
// ★ REDESIGN EXEMPLAR ★ — duplicate of /admin/qrcode on the dark "ok-root"
// theme (via <OkShell>). Logic (main QR + per-table QR generation with
// localStorage persistence, table-session activate/clear, real-time sessions
// listener) copied verbatim from qrcode.js — only the chrome is re-themed.
// The QR preview cards keep their own Light/Gold/Dark style colours (that's
// the QR's actual printed appearance, not the page theme). Original untouched.
import Head from 'next/head';
import { useEffect, useState, useMemo } from 'react';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import OkShell from '../../components/admin/OkShell';
import { getRestaurantById, activateTableSession, clearTableSession, isSessionValid } from '../../lib/db';
import { collection, onSnapshot } from 'firebase/firestore';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';

const SIZES = [
  { label: 'Small', value: 256, desc: 'Table card' },
  { label: 'Medium', value: 512, desc: 'Menu insert' },
  { label: 'Large', value: 1024, desc: 'Print / poster' },
];
const TABLE_QR_STORAGE_KEY = (rid) => `qr_tables_v1_${rid}`;
function formatTimeAgo(ms) {
  if (!ms) return '';
  const diff = Date.now() - ms;
  if (diff < 45_000) return 'just now';
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
  return `${Math.floor(diff / 86_400_000)} days ago`;
}
const STYLES = [
  { label: 'Light', bg: '#FFFFFF', fg: '#1A1A1A', border: '#E8E4DE' },
  { label: 'Gold', bg: '#FAF6EC', fg: '#A08656', border: '#E5D9B6' },
  { label: 'Dark', bg: '#1A1A1A', fg: '#C4A86D', border: '#2A2A2A' },
];

const ghostBtn = { padding: '8px 14px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--tx)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const goldBtn = { padding: '8px 16px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const sectionHead = (label, dotColor = 'var(--gold)') => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
    <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor }} />
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: dotColor }}>{label}</span>
    <div style={{ flex: 1, height: 1, background: 'var(--line-soft)' }} />
  </div>
);

export default function QRCodeV2() {
  const { ready, rid, scopedDb, canView, userData, staffSession } = useFeatureAccess('qrcode');
  const restaurantName = userData?.restaurantName || staffSession?.restaurantName || 'Your Restaurant';

  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);

  const [qrDataURL, setQrDataURL] = useState(null);
  const [selectedSize, setSelectedSize] = useState(SIZES[1]);
  const [selectedStyle, setSelectedStyle] = useState(STYLES[0]);
  const [generating, setGenerating] = useState(false);

  const [tableCount, setTableCount] = useState(12);
  const [tableQRs, setTableQRs] = useState([]);
  const [generatingTables, setGeneratingTables] = useState(false);
  const [tablesDone, setTablesDone] = useState(false);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [persistedStyle, setPersistedStyle] = useState(null);

  const [sessions, setSessions] = useState({});
  const [activating, setActivating] = useState(null);
  const [clearing, setClearing] = useState(null);
  const [sessionHours, setSessionHours] = useState(2);
  const [activatingAll, setActivatingAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 60000); return () => clearInterval(t); }, []);

  useEffect(() => {
    if (!rid || !canView) return;
    getRestaurantById(rid, { db: scopedDb }).then(r => { setRestaurant(r); setLoading(false); }).catch(err => { console.error('qrcode load error:', err); setLoading(false); });
  }, [rid, canView, scopedDb]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (restaurant?.subdomain) generateQR(); }, [restaurant, selectedSize, selectedStyle]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!rid || !canView) return;
    const unsub = onSnapshot(collection(scopedDb, 'restaurants', rid, 'tableSessions'), (snap) => {
      const map = {};
      snap.docs.forEach(d => { map[d.data().tableNumber] = d.data(); });
      setSessions(map);
    });
    return unsub;
  }, [rid, canView, scopedDb]);

  useEffect(() => {
    if (!rid || typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(TABLE_QR_STORAGE_KEY(rid));
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed?.tableQRs) || parsed.tableQRs.length === 0) return;
      setTableQRs(parsed.tableQRs);
      setTableCount(Number(parsed.tableCount) || parsed.tableQRs.length);
      setGeneratedAt(Number(parsed.generatedAt) || null);
      setPersistedStyle(parsed.style || null);
      setTablesDone(true);
    } catch { /* no saved set */ }
  }, [rid]);

  const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://halohelm.com';
  const getMenuURL = (table = null, sid = null) => {
    const base = `${BASE_URL}/restaurant/${restaurant?.subdomain || ''}`;
    if (!table) return base;
    return sid ? `${base}?table=${table}&sid=${sid}` : `${base}?table=${table}`;
  };
  const getTableURL = (tableNum) => { if (!restaurant?.subdomain) return ''; return `${BASE_URL}/r/${restaurant.subdomain}/${tableNum}`; };

  const generateQR = async () => {
    if (!restaurant?.subdomain) return;
    setGenerating(true);
    try {
      const dataURL = await QRCode.toDataURL(getMenuURL(), { width: selectedSize.value, margin: 3, color: { dark: selectedStyle.fg, light: selectedStyle.bg }, errorCorrectionLevel: 'H' });
      setQrDataURL(dataURL);
    } catch { toast.error('Failed to generate QR code'); }
    finally { setGenerating(false); }
  };

  const generateTableQRs = async () => {
    if (!restaurant?.subdomain || generatingTables) return;
    setGeneratingTables(true); setTableQRs([]); setTablesDone(false);
    try {
      const results = [];
      for (let t = 1; t <= tableCount; t++) {
        const dataURL = await QRCode.toDataURL(getTableURL(t), { width: 512, margin: 3, color: { dark: selectedStyle.fg, light: selectedStyle.bg }, errorCorrectionLevel: 'H' });
        results.push({ table: t, dataURL });
        setTableQRs([...results]);
      }
      setTablesDone(true);
      const now = Date.now();
      const styleLabel = selectedStyle.label;
      setGeneratedAt(now); setPersistedStyle(styleLabel);
      try { if (typeof window !== 'undefined') localStorage.setItem(TABLE_QR_STORAGE_KEY(rid), JSON.stringify({ tableCount, style: styleLabel, generatedAt: now, tableQRs: results })); }
      catch (e) { console.warn('[qrcode] could not persist tableQRs:', e?.message); }
      toast.success(`Generated ${tableCount} table QR codes!`);
    } catch { toast.error('Failed to generate table QR codes'); }
    finally { setGeneratingTables(false); }
  };

  const downloadQR = () => { if (!qrDataURL) return; const link = document.createElement('a'); link.download = `${restaurant.subdomain}-ar-menu-qr-${selectedSize.value}px.png`; link.href = qrDataURL; link.click(); toast.success('QR code downloaded!'); };
  const downloadTableQR = (item) => { const link = document.createElement('a'); link.download = `${restaurant.subdomain}-table-${item.table}-qr.png`; link.href = item.dataURL; link.click(); };
  const copyURL = () => { navigator.clipboard.writeText(getMenuURL()); toast.success('Menu URL copied!'); };

  const printQR = () => {
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>${restaurant.name} — AR Menu QR</title><style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:${selectedStyle.bg};font-family:Inter,Arial,sans-serif;padding:40px}.card{background:${selectedStyle.bg};border:2px solid ${selectedStyle.border};border-radius:18px;padding:40px;text-align:center;max-width:480px}img{width:320px;height:320px;border-radius:10px}h1{font-size:24px;font-weight:600;color:${selectedStyle.fg};margin-top:24px;letter-spacing:-0.4px}p{font-size:13px;color:${selectedStyle.fg}99;margin-top:6px}.badge{display:inline-block;margin-top:14px;padding:5px 14px;background:${selectedStyle.fg}18;border:1px solid ${selectedStyle.fg}30;border-radius:6px;font-size:11px;font-weight:700;color:${selectedStyle.fg};letter-spacing:0.05em;text-transform:uppercase}</style></head><body><div class="card"><img src="${qrDataURL}" alt="QR Code"/><h1>${restaurant.name}</h1><p>Scan to view our menu in Augmented Reality</p><div class="badge">AR Menu</div></div></body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  const printAllTableQRs = () => {
    if (!tableQRs.length) return;
    const cards = tableQRs.map(item => `<div class="card"><img src="${item.dataURL}" alt="Table ${item.table}"/><div class="table-num">Table ${item.table}</div><div class="rest-name">${restaurant.name}</div><div class="hint">Scan to view menu in AR</div></div>`).join('');
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>${restaurant.name} — Table QR Codes</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:${selectedStyle.bg};font-family:Inter,Arial,sans-serif;padding:24px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;max-width:900px;margin:0 auto}.card{background:${selectedStyle.bg};border:2px solid ${selectedStyle.border};border-radius:14px;padding:18px;text-align:center;break-inside:avoid}img{width:160px;height:160px;border-radius:6px}.table-num{font-size:18px;font-weight:700;color:${selectedStyle.fg};margin-top:10px}.rest-name{font-size:11px;color:${selectedStyle.fg}99;margin-top:3px;font-weight:500}.hint{font-size:10px;color:${selectedStyle.fg}66;margin-top:6px}@media print{@page{margin:10mm}}</style></head><body><div class="grid">${cards}</div></body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 600);
  };

  const handleActivate = async (tableNum) => { setActivating(tableNum); try { await activateTableSession(rid, tableNum, sessionHours, { db: scopedDb }); toast.success(`Table ${tableNum} activated for ${sessionHours}h`); } catch { toast.error('Failed to activate'); } finally { setActivating(null); } };
  const handleClear = async (tableNum) => { setClearing(tableNum); try { await clearTableSession(rid, tableNum, { db: scopedDb }); toast.success(`Table ${tableNum} cleared`); } catch { toast.error('Failed to clear'); } finally { setClearing(null); } };
  const handleActivateAll = async () => { setActivatingAll(true); try { for (let i = 1; i <= tableCount; i++) await activateTableSession(rid, String(i), sessionHours, { db: scopedDb }); toast.success(`All ${tableCount} tables activated for ${sessionHours}h`); } catch { toast.error('Failed to activate all'); } finally { setActivatingAll(false); } };
  const handleClearAll = async () => { if (!confirm(`Clear all ${tableCount} table sessions?`)) return; setClearingAll(true); try { for (let i = 1; i <= tableCount; i++) await clearTableSession(rid, String(i), { db: scopedDb }); toast.success('All tables cleared'); } catch { toast.error('Failed to clear all'); } finally { setClearingAll(false); } };

  const sessionStats = useMemo(() => {
    let active = 0, expiring = 0;
    for (let i = 1; i <= tableCount; i++) {
      const s = sessions[String(i)];
      if (!isSessionValid(s)) continue;
      const expiresAt = s?.expiresAt ? new Date(s.expiresAt) : null;
      const minsLeft = expiresAt ? Math.round((expiresAt - Date.now()) / 60000) : 0;
      if (minsLeft < 30) expiring++;
      active++;
    }
    return { active, expiring, inactive: tableCount - active };
  }, [sessions, tableCount]);

  if (!ready) {
    return (<div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><Head><title>QR Codes — HaloHelm</title></Head><div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 14 }}>Loading…</div></div>);
  }
  if (!canView) {
    return (<div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}><Head><title>QR Codes — HaloHelm</title></Head><div style={{ textAlign: 'center', maxWidth: 360 }}><div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div><div style={{ color: 'var(--tx)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>No access</div><div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.6 }}>Your role doesn’t include QR Codes. Ask the owner to grant it.</div></div></div>);
  }

  return (
    <>
      <Head><title>QR Codes — HaloHelm</title></Head>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes ok-pulse{0%,100%{opacity:1}50%{opacity:.35}}@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>
      <OkShell active={null} eyebrow="Setup · menu & table QR codes" title="QR Codes" brand={restaurantName}>
        {/* TABLES stat card */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '20px 24px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: 'var(--gold)' }}>Tables</span>
            <div style={{ flex: 1, height: 1, background: 'var(--line-soft)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)' }}>Live · {tableCount} table{tableCount === 1 ? '' : 's'}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            {[{ label: 'Configured', value: tableCount, color: 'var(--tx)' }, { label: 'Active', value: sessionStats.active, color: sessionStats.active > 0 ? 'var(--success)' : 'var(--tx)' }, { label: 'Expiring', value: sessionStats.expiring, color: sessionStats.expiring > 0 ? 'var(--gold)' : 'var(--tx)' }, { label: 'Inactive', value: sessionStats.inactive, color: 'var(--tx)' }].map(s => (
              <div key={s.label} style={{ padding: '16px 18px', borderRadius: 12, background: 'var(--card-2)', border: '1px solid var(--line)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--tx-3)', marginBottom: 8 }}>{s.label}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 28, lineHeight: 1, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--line)', padding: 48, textAlign: 'center' }}>
            <div style={{ width: 30, height: 30, border: '3px solid var(--gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-3)' }}>Loading…</div>
          </div>
        ) : (
          <>
            {/* Main QR generator */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, marginBottom: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ background: selectedStyle.bg, borderRadius: 16, padding: 28, border: `2px solid ${selectedStyle.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 200, height: 200, borderRadius: 10, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: selectedStyle.bg }}>
                    {generating ? <div style={{ width: 30, height: 30, border: `3px solid ${selectedStyle.fg}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> : qrDataURL && <img src={qrDataURL} alt="QR Code" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: selectedStyle.fg, marginBottom: 4 }}>{restaurant?.name}</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: selectedStyle.fg + '99' }}>Scan to view in Augmented Reality</div>
                    <div style={{ display: 'inline-block', marginTop: 8, padding: '3px 10px', background: selectedStyle.fg + '18', border: `1px solid ${selectedStyle.fg}30`, borderRadius: 5, fontSize: 10, fontWeight: 700, color: selectedStyle.fg, letterSpacing: '.06em', textTransform: 'uppercase' }}>AR Menu</div>
                  </div>
                </div>
                <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--line)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--tx-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getMenuURL()}</div>
                  <button onClick={copyURL} style={{ ...goldBtn, padding: '6px 14px', fontSize: 11 }}>Copy</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button onClick={downloadQR} disabled={!qrDataURL || generating} style={{ ...goldBtn, padding: 11, fontSize: 13, opacity: (!qrDataURL || generating) ? 0.5 : 1 }}>Download</button>
                  <button onClick={printQR} disabled={!qrDataURL} style={{ ...ghostBtn, padding: 11, fontSize: 13 }}>Print</button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--line)', padding: '18px 20px' }}>
                  {sectionHead('Size')}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {SIZES.map(sz => {
                      const active = selectedSize.value === sz.value;
                      return (
                        <div key={sz.value} onClick={() => setSelectedSize(sz)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 9, border: `1px solid ${active ? 'var(--gold)' : 'var(--line)'}`, background: active ? 'rgba(196,168,109,0.08)' : 'var(--card-2)', cursor: 'pointer' }}>
                          <div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--tx)' }}>{sz.label}</div>
                            <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', marginTop: 1 }}>{sz.desc}</div>
                          </div>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)', fontWeight: 700 }}>{sz.value}px</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--line)', padding: '18px 20px' }}>
                  {sectionHead('Color style')}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {STYLES.map(st => {
                      const active = selectedStyle.label === st.label;
                      return (
                        <div key={st.label} onClick={() => setSelectedStyle(st)} style={{ flex: 1, padding: '12px 8px', borderRadius: 9, border: `2px solid ${active ? 'var(--gold)' : 'var(--line)'}`, background: st.bg, cursor: 'pointer', textAlign: 'center' }}>
                          <div style={{ width: 24, height: 24, borderRadius: 6, background: st.fg, margin: '0 auto 6px' }} />
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, color: st.fg }}>{st.label}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--line)', padding: '18px 20px' }}>
                  {sectionHead('Quick info')}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {[{ label: 'Subdomain', value: restaurant?.subdomain, mono: true }, { label: 'Plan', value: restaurant?.plan || 'Basic', cap: true }, { label: 'Restaurant', value: restaurant?.name }].map(s => (
                      <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', fontWeight: 500 }}>{s.label}</span>
                        <span style={{ fontFamily: s.mono ? 'var(--font-mono)' : 'var(--font-display)', fontSize: 12, fontWeight: 700, color: 'var(--tx)', textTransform: s.cap ? 'capitalize' : 'none', maxWidth: 160, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Per-table QR codes */}
            <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--line)', padding: '22px 26px', marginBottom: 14 }}>
              {sectionHead('Per-table QR codes')}
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)', marginBottom: 16, lineHeight: 1.5 }}>Each QR links to your menu with the table number pre-filled — no manual selection needed.</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '12px 16px', borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--line)', marginBottom: 16 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--tx-3)', letterSpacing: '.04em', textTransform: 'uppercase' }}>Tables</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => setTableCount(c => Math.max(1, c - 1))} style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--line)', background: 'var(--card)', fontSize: 16, fontWeight: 700, color: 'var(--tx)', cursor: 'pointer' }}>−</button>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16, color: 'var(--tx)', minWidth: 32, textAlign: 'center' }}>{tableCount}</span>
                  <button onClick={() => setTableCount(c => Math.min(50, c + 1))} style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--line)', background: 'var(--card)', fontSize: 16, fontWeight: 700, color: 'var(--tx)', cursor: 'pointer' }}>+</button>
                </div>
                <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', lineHeight: 1.45 }}>
                  {tableQRs.length > 0 && generatedAt ? (<>Generated {formatTimeAgo(generatedAt)} · {tableQRs.length} table{tableQRs.length === 1 ? '' : 's'}{persistedStyle ? ` · ${persistedStyle} style` : ''}{persistedStyle && persistedStyle !== selectedStyle.label && (<><br /><span style={{ color: 'var(--gold)', fontWeight: 600 }}>Picker now shows {selectedStyle.label} — click Generate to re-create.</span></>)}</>) : (<>Tables 1 – {tableCount} · uses current color style</>)}
                </span>
                {tablesDone && tableQRs.length > 0 && <button onClick={printAllTableQRs} style={ghostBtn}>Print All</button>}
                <button onClick={generateTableQRs} disabled={generatingTables} style={{ ...goldBtn, opacity: generatingTables ? 0.7 : 1 }}>{generatingTables ? 'Generating…' : '⚡ Generate QR Codes'}</button>
              </div>
              {tableQRs.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                  {tableQRs.map(item => (
                    <div key={item.table} style={{ borderRadius: 12, border: `2px solid ${selectedStyle.border}`, background: selectedStyle.bg, padding: '12px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, animation: 'fadeIn 0.2s ease' }}>
                      <img src={item.dataURL} alt={`Table ${item.table}`} style={{ width: 100, height: 100, borderRadius: 6 }} />
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: selectedStyle.fg }}>Table {item.table}</div>
                      <button onClick={() => downloadTableQR(item)} style={{ width: '100%', padding: '5px 0', borderRadius: 6, border: 'none', background: selectedStyle.fg + '18', color: selectedStyle.fg, fontSize: 10, fontWeight: 700, cursor: 'pointer', letterSpacing: '.04em', textTransform: 'uppercase' }}>Download</button>
                    </div>
                  ))}
                  {generatingTables && Array.from({ length: tableCount - tableQRs.length }, (_, i) => (
                    <div key={`ph-${i}`} style={{ borderRadius: 12, border: '2px dashed var(--line)', background: 'var(--card-2)', padding: '12px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 160 }}>
                      <div style={{ width: 22, height: 22, border: '2px solid var(--card-3)', borderTopColor: 'var(--gold)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <div style={{ fontSize: 34, marginBottom: 10 }}>▦</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--tx)', marginBottom: 4 }}>Set your table count and hit Generate</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)', maxWidth: 460, margin: '0 auto', lineHeight: 1.5 }}>Each QR encodes a stable redirect URL — print once, paste on the table forever. Clear &amp; Activate rotates the security token without invalidating the printed QR.</div>
                </div>
              )}
            </div>

            {/* Table session manager */}
            <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--line)', padding: '22px 26px' }}>
              {sectionHead('Table session manager', 'var(--success)')}
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)', marginBottom: 16, lineHeight: 1.5 }}>Activate a table when guests sit down. Only active sessions can view the menu and place orders. The printed QR keeps working forever; Clear &amp; Activate just rotates the security token.</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px', borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--line)', marginBottom: 14 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--tx-3)', letterSpacing: '.04em', textTransform: 'uppercase' }}>Session</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[1, 2, 3, 4, 6].map(h => {
                    const active = sessionHours === h;
                    return <button key={h} onClick={() => setSessionHours(h)} style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: active ? 'var(--accent)' : 'transparent', color: active ? 'var(--accent-ink)' : 'var(--tx-2)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{h}h</button>;
                  })}
                </div>
                <span style={{ flex: 1 }} />
                <button onClick={handleActivateAll} disabled={activatingAll || clearingAll} style={{ ...goldBtn, opacity: activatingAll ? 0.7 : 1 }}>{activatingAll ? 'Activating…' : '⚡ Activate All'}</button>
                <button onClick={handleClearAll} disabled={activatingAll || clearingAll} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(217,83,79,0.30)', background: 'rgba(217,83,79,0.08)', color: 'var(--danger)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, cursor: clearingAll ? 'not-allowed' : 'pointer', opacity: clearingAll ? 0.7 : 1 }}>{clearingAll ? 'Clearing…' : 'Clear All'}</button>
              </div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
                {[{ color: 'var(--success)', label: 'Active — guests can order' }, { color: 'var(--gold)', label: 'Expiring soon (< 30 min)' }, { color: 'var(--tx-3)', label: 'Inactive / Not started' }].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', fontWeight: 500 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: l.color, display: 'inline-block' }} />{l.label}
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                {Array.from({ length: tableCount }, (_, i) => {
                  const tableNum = String(i + 1);
                  const session = sessions[tableNum];
                  const valid = isSessionValid(session);
                  const expiresAt = session?.expiresAt ? new Date(session.expiresAt) : null;
                  const minsLeft = expiresAt ? Math.round((expiresAt - Date.now()) / 60000) : 0;
                  const expiringSoon = valid && minsLeft < 30;
                  const dotColor = valid ? (expiringSoon ? 'var(--gold)' : 'var(--success)') : 'var(--tx-3)';
                  const accentBorder = valid ? (expiringSoon ? 'rgba(196,168,109,0.30)' : 'rgba(63,170,99,0.25)') : 'var(--line)';
                  const accentBg = valid ? (expiringSoon ? 'rgba(196,168,109,0.06)' : 'rgba(63,170,99,0.06)') : 'var(--card-2)';
                  return (
                    <div key={tableNum} style={{ borderRadius: 10, border: `1px solid ${accentBorder}`, background: accentBg, padding: '12px 11px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--tx)' }}>Table {tableNum}</span>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor }} />
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: valid ? (expiringSoon ? 'var(--gold)' : 'var(--success)') : 'var(--tx-3)', letterSpacing: '.04em', textTransform: 'uppercase' }}>
                        {valid ? (expiringSoon ? `Expires in ${minsLeft}m` : `Active · ${minsLeft}m left`) : (session?.isActive === false ? 'Cleared' : 'Not activated')}
                      </div>
                      {valid && session?.sid && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--tx-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>sid: {session.sid}</div>}
                      {valid && <button onClick={() => { navigator.clipboard.writeText(getTableURL(tableNum)); toast.success(`Table ${tableNum} URL copied!`); }} style={{ width: '100%', padding: '5px 0', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--tx)', fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, cursor: 'pointer', letterSpacing: '.04em', textTransform: 'uppercase' }}>Copy URL</button>}
                      {valid ? (
                        <button disabled={clearing === tableNum} onClick={() => handleClear(tableNum)} style={{ width: '100%', padding: '6px 0', borderRadius: 6, border: '1px solid rgba(217,83,79,0.30)', background: 'rgba(217,83,79,0.08)', color: 'var(--danger)', fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, cursor: 'pointer', letterSpacing: '.04em', textTransform: 'uppercase' }}>{clearing === tableNum ? '…' : '✕ Clear'}</button>
                      ) : (
                        <button disabled={activating === tableNum} onClick={() => handleActivate(tableNum)} style={{ width: '100%', padding: '6px 0', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, cursor: 'pointer', letterSpacing: '.04em', textTransform: 'uppercase' }}>{activating === tableNum ? '…' : '⚡ Activate'}</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </OkShell>
    </>
  );
}

QRCodeV2.getLayout = (page) => page;
