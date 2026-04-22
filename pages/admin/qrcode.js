import Head from 'next/head';
import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getRestaurantById, activateTableSession, clearTableSession, isSessionValid } from '../../lib/db';
import { db } from '../../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';

// ═══ Aspire palette — same tokens as analytics/staff/notifications/feedback/requests ═══
const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER,
  cream: '#EDEDED',
  ink: '#1A1A1A',
  shell: '#FFFFFF',
  shellDarker: '#F8F8F8',
  warning: '#C4A86D',         // gold
  warningDim: '#A08656',
  forest: '#1A1A1A',
  forestDarker: '#2A2A2A',
  forestText: '#EAE7E3',
  forestTextMuted: 'rgba(234,231,227,0.55)',
  forestTextFaint: 'rgba(234,231,227,0.35)',
  forestSubtleBg: 'rgba(255,255,255,0.04)',
  forestBorder: '1px solid rgba(255,255,255,0.06)',
  success: '#3F9E5A',
  successDim: '#2E7E45',
  danger: '#D9534F',
  dangerDim: '#A03A37',
  mutedText: 'rgba(0,0,0,0.55)',
  faintText: 'rgba(0,0,0,0.38)',
  subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)',
  cardShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
};

// ═══ QR generation options ═══
const SIZES = [
  { label: 'Small',  value: 256,  desc: 'Table card' },
  { label: 'Medium', value: 512,  desc: 'Menu insert' },
  { label: 'Large',  value: 1024, desc: 'Print / poster' },
];

// Color styles — Light/Gold/Dark to fit the Aspire palette consistently.
// (Original "Coral" replaced with Gold so the previewed QR card matches the
// rest of the redesigned admin chrome.)
const STYLES = [
  { label: 'Light', bg: '#FFFFFF', fg: '#1A1A1A', border: '#E8E4DE' },
  { label: 'Gold',  bg: '#FAF6EC', fg: '#A08656', border: '#E5D9B6' },
  { label: 'Dark',  bg: '#1A1A1A', fg: '#C4A86D', border: '#2A2A2A' },
];

export default function AdminQRCode() {
  const { userData } = useAuth();
  const rid = userData?.restaurantId;
  const restaurantName = userData?.restaurantName || 'Your Restaurant';

  // ─── State ─────────────────────────────────────────────────────────
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);

  // Main QR
  const [qrDataURL, setQrDataURL] = useState(null);
  const [selectedSize, setSelectedSize] = useState(SIZES[1]);
  const [selectedStyle, setSelectedStyle] = useState(STYLES[0]);
  const [generating, setGenerating] = useState(false);

  // Per-table QRs
  const [tableCount, setTableCount] = useState(12);
  const [tableQRs, setTableQRs] = useState([]);   // [{ table, dataURL }]
  const [generatingTables, setGeneratingTables] = useState(false);
  const [tablesDone, setTablesDone] = useState(false);

  // Table sessions
  const [sessions, setSessions] = useState({}); // { tableNum: sessionDoc }
  const [activating, setActivating] = useState(null);
  const [clearing, setClearing] = useState(null);
  const [sessionHours, setSessionHours] = useState(3);
  const [activatingAll, setActivatingAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  // Tick every 60s so "minutes left" stays fresh without refetching
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 60000);
    return () => clearInterval(t);
  }, []);

  // ─── Load restaurant ───────────────────────────────────────────────
  useEffect(() => {
    if (!rid) return;
    getRestaurantById(rid)
      .then(r => { setRestaurant(r); setLoading(false); })
      .catch(err => { console.error('qrcode load error:', err); setLoading(false); });
  }, [rid]);

  // ─── Auto-regenerate main QR when style/size/restaurant changes ─────
  useEffect(() => { if (restaurant?.subdomain) generateQR(); }, [restaurant, selectedSize, selectedStyle]);

  // ─── Real-time table sessions listener ─────────────────────────────
  useEffect(() => {
    if (!rid) return;
    const unsub = onSnapshot(collection(db, 'restaurants', rid, 'tableSessions'), (snap) => {
      const map = {};
      snap.docs.forEach(d => { map[d.data().tableNumber] = d.data(); });
      setSessions(map);
    });
    return unsub;
  }, [rid]);

  // ─── Reset table QRs when style changes so they stay in sync ───────
  useEffect(() => { setTableQRs([]); setTablesDone(false); }, [selectedStyle]);

  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://ar-saa-s-kbzn.vercel.app';

  const getMenuURL = (table = null, sid = null) => {
    const base = `${BASE_URL}/restaurant/${restaurant?.subdomain || ''}`;
    if (!table) return base;
    return sid ? `${base}?table=${table}&sid=${sid}` : `${base}?table=${table}`;
  };

  // Get working URL for a table using its current active session sid
  const getTableURL = (tableNum) => {
    const session = sessions[String(tableNum)];
    const sid = isSessionValid(session) ? session.sid : null;
    return getMenuURL(tableNum, sid);
  };

  const generateQR = async () => {
    if (!restaurant?.subdomain) return;
    setGenerating(true);
    try {
      const dataURL = await QRCode.toDataURL(getMenuURL(), {
        width: selectedSize.value, margin: 3,
        color: { dark: selectedStyle.fg, light: selectedStyle.bg },
        errorCorrectionLevel: 'H',
      });
      setQrDataURL(dataURL);
    } catch { toast.error('Failed to generate QR code'); }
    finally { setGenerating(false); }
  };

  const generateTableQRs = async () => {
    if (!restaurant?.subdomain || generatingTables) return;
    setGeneratingTables(true);
    setTableQRs([]);
    setTablesDone(false);
    try {
      const results = [];
      for (let t = 1; t <= tableCount; t++) {
        const dataURL = await QRCode.toDataURL(getTableURL(t), {
          width: 512, margin: 3,
          color: { dark: selectedStyle.fg, light: selectedStyle.bg },
          errorCorrectionLevel: 'H',
        });
        results.push({ table: t, dataURL });
        setTableQRs([...results]); // progressive update
      }
      setTablesDone(true);
      toast.success(`Generated ${tableCount} table QR codes!`);
    } catch { toast.error('Failed to generate table QR codes'); }
    finally { setGeneratingTables(false); }
  };

  const downloadQR = () => {
    if (!qrDataURL) return;
    const link = document.createElement('a');
    link.download = `${restaurant.subdomain}-ar-menu-qr-${selectedSize.value}px.png`;
    link.href = qrDataURL;
    link.click();
    toast.success('QR code downloaded!');
  };

  const downloadTableQR = (item) => {
    const link = document.createElement('a');
    link.download = `${restaurant.subdomain}-table-${item.table}-qr.png`;
    link.href = item.dataURL;
    link.click();
  };

  const copyURL = () => {
    navigator.clipboard.writeText(getMenuURL());
    toast.success('Menu URL copied!');
  };

  const printQR = () => {
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>${restaurant.name} — AR Menu QR</title><style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:${selectedStyle.bg};font-family:Inter,Arial,sans-serif;padding:40px}.card{background:${selectedStyle.bg};border:2px solid ${selectedStyle.border};border-radius:18px;padding:40px;text-align:center;max-width:480px}img{width:320px;height:320px;border-radius:10px}h1{font-size:24px;font-weight:600;color:${selectedStyle.fg};margin-top:24px;letter-spacing:-0.4px}p{font-size:13px;color:${selectedStyle.fg}99;margin-top:6px}.badge{display:inline-block;margin-top:14px;padding:5px 14px;background:${selectedStyle.fg}18;border:1px solid ${selectedStyle.fg}30;border-radius:6px;font-size:11px;font-weight:700;color:${selectedStyle.fg};letter-spacing:0.05em;text-transform:uppercase}</style></head><body><div class="card"><img src="${qrDataURL}" alt="QR Code"/><h1>${restaurant.name}</h1><p>Scan to view our menu in Augmented Reality</p><div class="badge">AR Menu</div></div></body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  const printAllTableQRs = () => {
    if (!tableQRs.length) return;
    const cards = tableQRs.map(item => `
      <div class="card">
        <img src="${item.dataURL}" alt="Table ${item.table}"/>
        <div class="table-num">Table ${item.table}</div>
        <div class="rest-name">${restaurant.name}</div>
        <div class="hint">Scan to view menu in AR</div>
      </div>
    `).join('');
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>${restaurant.name} — Table QR Codes</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{background:${selectedStyle.bg};font-family:Inter,Arial,sans-serif;padding:24px}
        .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;max-width:900px;margin:0 auto}
        .card{background:${selectedStyle.bg};border:2px solid ${selectedStyle.border};border-radius:14px;padding:18px;text-align:center;break-inside:avoid}
        img{width:160px;height:160px;border-radius:6px}
        .table-num{font-size:18px;font-weight:700;color:${selectedStyle.fg};margin-top:10px;letter-spacing:-0.2px}
        .rest-name{font-size:11px;color:${selectedStyle.fg}99;margin-top:3px;font-weight:500}
        .hint{font-size:10px;color:${selectedStyle.fg}66;margin-top:6px}
        @media print{@page{margin:10mm}}
      </style>
    </head><body><div class="grid">${cards}</div></body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 600);
  };

  const handleActivate = async (tableNum) => {
    setActivating(tableNum);
    try {
      await activateTableSession(rid, tableNum, sessionHours);
      toast.success(`Table ${tableNum} activated for ${sessionHours}h`);
    } catch { toast.error('Failed to activate'); }
    finally { setActivating(null); }
  };

  const handleClear = async (tableNum) => {
    setClearing(tableNum);
    try {
      await clearTableSession(rid, tableNum);
      toast.success(`Table ${tableNum} cleared`);
    } catch { toast.error('Failed to clear'); }
    finally { setClearing(null); }
  };

  const handleActivateAll = async () => {
    setActivatingAll(true);
    try {
      for (let i = 1; i <= tableCount; i++) {
        await activateTableSession(rid, String(i), sessionHours);
      }
      toast.success(`All ${tableCount} tables activated for ${sessionHours}h`);
    } catch { toast.error('Failed to activate all'); }
    finally { setActivatingAll(false); }
  };

  const handleClearAll = async () => {
    if (!confirm(`Clear all ${tableCount} table sessions?`)) return;
    setClearingAll(true);
    try {
      for (let i = 1; i <= tableCount; i++) {
        await clearTableSession(rid, String(i));
      }
      toast.success('All tables cleared');
    } catch { toast.error('Failed to clear all'); }
    finally { setClearingAll(false); }
  };

  // ─── Stats for the header card ─────────────────────────────────────
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

  // ═════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════
  return (
    <AdminLayout>
      <Head><title>QR Codes — Advert Radical</title></Head>
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font }}>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
          @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
          .qr-card { transition: box-shadow 0.12s ease; }
          .qr-card:hover { box-shadow: 0 4px 18px rgba(38,52,49,0.06); }
          .qr-action-btn:hover:not(:disabled) { transform: translateY(-1px); }
          .qr-pick-row:hover { background: ${A.shellDarker}; }
        `}</style>

        {/* ═══ HEADER ═══ */}
        <div style={{ padding: '24px 28px 0' }}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, marginBottom: 6, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Setup</span>
              <span style={{ opacity: 0.5 }}>›</span>
              <span style={{ color: A.mutedText }}>QR Codes</span>
            </div>
            <div style={{ fontWeight: 600, fontSize: 28, color: A.ink, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
              {restaurantName} <span style={{ color: A.mutedText, fontWeight: 500 }}>QR Codes</span>
            </div>
            <div style={{ fontSize: 12, color: A.mutedText, marginTop: 4 }}>
              Generate QR codes for your menu and tables. Manage which tables are active for ordering.
            </div>
          </div>

          {/* ═══ TABLES — matte-black signature stat card ═══ */}
          <div style={{
            background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
            borderRadius: 14, padding: '20px 24px', marginBottom: 14,
            border: A.forestBorder,
            boxShadow: '0 4px 16px rgba(38,52,49,0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: A.warning, animation: 'pulse 2s ease infinite', boxShadow: '0 0 8px rgba(196,168,109,0.6)' }} />
              <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>TABLES</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(234,231,227,0.08)' }} />
              <span style={{ fontSize: 11, color: A.forestTextMuted, fontWeight: 500 }}>
                Live · {tableCount} table{tableCount === 1 ? '' : 's'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'CONFIGURED', value: tableCount,             color: A.forestText },
                { label: 'ACTIVE',     value: sessionStats.active,    color: sessionStats.active   > 0 ? A.success : A.forestText },
                { label: 'EXPIRING',   value: sessionStats.expiring,  color: sessionStats.expiring > 0 ? A.warning : A.forestText },
                { label: 'INACTIVE',   value: sessionStats.inactive,  color: A.forestText },
              ].map(s => (
                <div key={s.label} style={{
                  padding: '16px 18px', borderRadius: 10,
                  background: A.forestSubtleBg,
                  border: A.forestBorder,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 8 }}>
                    {s.label}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 28, lineHeight: 1, letterSpacing: '-0.5px', color: s.color }}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ═══ MAIN CONTENT ═══ */}
        <div style={{ padding: '0 28px 60px' }}>
          {loading ? (
            <div style={{
              background: A.shell, borderRadius: 14, border: A.border, padding: '48px',
              textAlign: 'center', boxShadow: A.cardShadow,
            }}>
              <div style={{ width: 30, height: 30, border: `3px solid ${A.warning}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              <div style={{ fontSize: 13, color: A.mutedText, fontWeight: 600 }}>Loading…</div>
            </div>
          ) : (
            <>
              {/* ═══ SECTION 1: MAIN QR GENERATOR ═══ */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>

                {/* LEFT — QR Preview + URL + Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* QR Preview Card — uses selected style colors */}
                  <div style={{
                    background: selectedStyle.bg,
                    borderRadius: 14, padding: 28,
                    border: `2px solid ${selectedStyle.border}`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
                    boxShadow: A.cardShadow,
                  }}>
                    <div style={{
                      width: 200, height: 200, borderRadius: 10, overflow: 'hidden',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: selectedStyle.bg,
                    }}>
                      {generating ? (
                        <div style={{ width: 30, height: 30, border: `3px solid ${selectedStyle.fg}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      ) : qrDataURL && (
                        <img src={qrDataURL} alt="QR Code" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      )}
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: A.font, fontWeight: 600, fontSize: 16, color: selectedStyle.fg, marginBottom: 4, letterSpacing: '-0.3px' }}>
                        {restaurant?.name}
                      </div>
                      <div style={{ fontSize: 11, color: selectedStyle.fg + '99' }}>
                        Scan to view in Augmented Reality
                      </div>
                      <div style={{
                        display: 'inline-block', marginTop: 8,
                        padding: '3px 10px',
                        background: selectedStyle.fg + '18',
                        border: `1px solid ${selectedStyle.fg}30`,
                        borderRadius: 5,
                        fontSize: 10, fontWeight: 700, color: selectedStyle.fg,
                        letterSpacing: '0.06em', textTransform: 'uppercase',
                      }}>
                        AR Menu
                      </div>
                    </div>
                  </div>

                  {/* URL bar */}
                  <div style={{
                    background: A.shell, borderRadius: 12, border: A.border,
                    padding: '10px 14px',
                    display: 'flex', alignItems: 'center', gap: 10,
                    boxShadow: A.cardShadow,
                  }}>
                    <div style={{ flex: 1, fontSize: 12, color: A.mutedText, fontFamily: "'JetBrains Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {getMenuURL()}
                    </div>
                    <button onClick={copyURL} className="qr-action-btn" style={{
                      padding: '6px 14px', borderRadius: 7,
                      border: 'none', background: A.ink, color: A.cream,
                      fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      fontFamily: A.font, transition: 'all 0.15s',
                    }}>Copy</button>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button onClick={downloadQR} disabled={!qrDataURL || generating} className="qr-action-btn" style={{
                      padding: '11px', borderRadius: 10, border: 'none',
                      background: A.ink, color: A.cream,
                      fontSize: 13, fontWeight: 700, fontFamily: A.font,
                      cursor: 'pointer', opacity: (!qrDataURL || generating) ? 0.5 : 1,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      transition: 'all 0.15s',
                    }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      Download
                    </button>
                    <button onClick={printQR} disabled={!qrDataURL} className="qr-action-btn" style={{
                      padding: '11px', borderRadius: 10,
                      border: A.border, background: A.shell, color: A.ink,
                      fontSize: 13, fontWeight: 700, fontFamily: A.font,
                      cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      transition: 'all 0.15s',
                    }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                      Print
                    </button>
                  </div>
                </div>

                {/* RIGHT — Options (Size, Style, Quick Stats) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Size picker */}
                  <div style={{
                    background: A.shell, borderRadius: 14,
                    border: A.border, padding: '18px 20px',
                    boxShadow: A.cardShadow,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: A.warning }} />
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warningDim }}>SIZE</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {SIZES.map(sz => {
                        const active = selectedSize.value === sz.value;
                        return (
                          <div key={sz.value} className="qr-pick-row" onClick={() => setSelectedSize(sz)} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 14px', borderRadius: 9,
                            border: `1px solid ${active ? A.warning : 'rgba(0,0,0,0.06)'}`,
                            background: active ? 'rgba(196,168,109,0.06)' : A.shellDarker,
                            cursor: 'pointer', transition: 'all 0.15s',
                          }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: A.ink }}>{sz.label}</div>
                              <div style={{ fontSize: 11, color: A.mutedText, marginTop: 1 }}>{sz.desc}</div>
                            </div>
                            <span style={{ fontSize: 11, color: A.faintText, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{sz.value}px</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Style picker */}
                  <div style={{
                    background: A.shell, borderRadius: 14,
                    border: A.border, padding: '18px 20px',
                    boxShadow: A.cardShadow,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: A.warning }} />
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warningDim }}>COLOR STYLE</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {STYLES.map(st => {
                        const active = selectedStyle.label === st.label;
                        return (
                          <div key={st.label} onClick={() => setSelectedStyle(st)} style={{
                            flex: 1, padding: '12px 8px', borderRadius: 9,
                            border: `2px solid ${active ? A.warning : 'rgba(0,0,0,0.06)'}`,
                            background: st.bg,
                            cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
                          }}>
                            <div style={{ width: 24, height: 24, borderRadius: 6, background: st.fg, margin: '0 auto 6px' }} />
                            <div style={{ fontSize: 11, fontWeight: 700, color: st.fg }}>{st.label}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Quick Stats */}
                  <div style={{
                    background: A.shell, borderRadius: 14,
                    border: A.border, padding: '18px 20px',
                    boxShadow: A.cardShadow,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: A.warning }} />
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warningDim }}>QUICK INFO</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                      {[
                        { label: 'Subdomain', value: restaurant?.subdomain, mono: true },
                        { label: 'Plan',      value: restaurant?.plan || 'Basic', cap: true },
                        { label: 'Restaurant', value: restaurant?.name },
                      ].map(s => (
                        <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: 11, color: A.mutedText, fontWeight: 500 }}>{s.label}</span>
                          <span style={{
                            fontSize: 12, fontWeight: 700, color: A.ink,
                            fontFamily: s.mono ? "'JetBrains Mono', monospace" : A.font,
                            textTransform: s.cap ? 'capitalize' : 'none',
                            maxWidth: 160, textAlign: 'right',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* ═══ SECTION 2: PER-TABLE QR CODES ═══ */}
              <div style={{
                background: A.shell, borderRadius: 14,
                border: A.border, padding: '22px 26px',
                boxShadow: A.cardShadow,
                marginBottom: 14,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: A.warning, boxShadow: '0 0 6px rgba(196,168,109,0.35)' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>PER-TABLE QR CODES</span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(196,168,109,0.20)' }} />
                </div>
                <div style={{ fontSize: 12, color: A.mutedText, marginBottom: 16, lineHeight: 1.5 }}>
                  Each QR links to your menu with the table number pre-filled — no manual selection needed.
                </div>

                {/* Table count + actions row */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                  padding: '12px 16px', borderRadius: 10,
                  background: A.shellDarker, border: A.border,
                  marginBottom: 16,
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: A.mutedText, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    Tables
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button onClick={() => setTableCount(c => Math.max(1, c - 1))} style={{
                      width: 28, height: 28, borderRadius: 7,
                      border: A.border, background: A.shell,
                      fontSize: 16, fontWeight: 700, color: A.ink,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>−</button>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 16, color: A.ink,
                      minWidth: 32, textAlign: 'center',
                    }}>{tableCount}</span>
                    <button onClick={() => setTableCount(c => Math.min(50, c + 1))} style={{
                      width: 28, height: 28, borderRadius: 7,
                      border: A.border, background: A.shell,
                      fontSize: 16, fontWeight: 700, color: A.ink,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>+</button>
                  </div>
                  <span style={{ fontSize: 11, color: A.faintText, flex: 1, minWidth: 0 }}>
                    Tables 1 – {tableCount} · uses current color style
                  </span>
                  {tablesDone && tableQRs.length > 0 && (
                    <button onClick={printAllTableQRs} className="qr-action-btn" style={{
                      padding: '8px 14px', borderRadius: 8,
                      border: A.border, background: A.shell, color: A.ink,
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      fontFamily: A.font, transition: 'all 0.15s',
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                      Print All
                    </button>
                  )}
                  <button onClick={generateTableQRs} disabled={generatingTables} className="qr-action-btn" style={{
                    padding: '8px 16px', borderRadius: 8,
                    border: 'none', background: A.ink, color: A.cream,
                    fontSize: 12, fontWeight: 700, cursor: generatingTables ? 'not-allowed' : 'pointer',
                    fontFamily: A.font, opacity: generatingTables ? 0.7 : 1,
                    display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
                  }}>
                    {generatingTables ? (
                      <>
                        <span style={{ width: 11, height: 11, border: `2px solid ${A.cream}`, borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                        Generating…
                      </>
                    ) : (
                      <>⚡ Generate QR Codes</>
                    )}
                  </button>
                </div>

                {/* Table QR grid */}
                {tableQRs.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                    {tableQRs.map(item => (
                      <div key={item.table} style={{
                        borderRadius: 12,
                        border: `2px solid ${selectedStyle.border}`,
                        background: selectedStyle.bg,
                        padding: '12px 10px',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                        animation: 'fadeIn 0.2s ease',
                      }}>
                        <img src={item.dataURL} alt={`Table ${item.table}`} style={{ width: 100, height: 100, borderRadius: 6 }} />
                        <div style={{
                          fontWeight: 700, fontSize: 13, color: selectedStyle.fg,
                          fontFamily: A.font, letterSpacing: '-0.2px',
                        }}>
                          Table {item.table}
                        </div>
                        <button onClick={() => downloadTableQR(item)} style={{
                          width: '100%', padding: '5px 0', borderRadius: 6,
                          border: 'none',
                          background: selectedStyle.fg + '18', color: selectedStyle.fg,
                          fontSize: 10, fontWeight: 700, cursor: 'pointer',
                          letterSpacing: '0.04em', textTransform: 'uppercase',
                        }}>
                          Download
                        </button>
                      </div>
                    ))}
                    {generatingTables && Array.from({ length: tableCount - tableQRs.length }, (_, i) => (
                      <div key={`placeholder-${i}`} style={{
                        borderRadius: 12,
                        border: `2px dashed rgba(0,0,0,0.08)`,
                        background: A.shellDarker,
                        padding: '12px 10px',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        minHeight: 160,
                      }}>
                        <div style={{ width: 22, height: 22, border: `2px solid ${A.subtleBg}`, borderTopColor: A.warning, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '32px 0' }}>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={A.faintText} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 10px', display: 'block' }}>
                      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v3M14 20h3v1M21 20v1" />
                    </svg>
                    <div style={{ fontSize: 14, fontWeight: 600, color: A.ink, marginBottom: 4 }}>
                      Set your table count and hit Generate
                    </div>
                    <div style={{ fontSize: 12, color: A.mutedText }}>
                      Each QR will encode your menu URL + table number automatically
                    </div>
                  </div>
                )}
              </div>

              {/* ═══ SECTION 3: TABLE SESSION MANAGER ═══ */}
              <div style={{
                background: A.shell, borderRadius: 14,
                border: A.border, padding: '22px 26px',
                boxShadow: A.cardShadow,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: A.success, boxShadow: '0 0 6px rgba(63,158,90,0.35)' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.successDim }}>TABLE SESSION MANAGER</span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(63,158,90,0.20)' }} />
                  <span style={{ fontSize: 11, color: A.mutedText, fontWeight: 500 }}>
                    Real-time
                  </span>
                </div>
                <div style={{ fontSize: 12, color: A.mutedText, marginBottom: 16, lineHeight: 1.5 }}>
                  Activate a table when guests sit down. Only active sessions can view the menu and place orders — prevents fake orders from outside the restaurant.
                </div>

                {/* Session duration + Activate/Clear All */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                  padding: '12px 16px', borderRadius: 10,
                  background: A.shellDarker, border: A.border,
                  marginBottom: 14,
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: A.mutedText, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    Session
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[1, 2, 3, 4, 6].map(h => {
                      const active = sessionHours === h;
                      return (
                        <button key={h} onClick={() => setSessionHours(h)} style={{
                          padding: '6px 12px', borderRadius: 7,
                          border: 'none',
                          background: active ? A.ink : 'transparent',
                          color: active ? A.cream : A.mutedText,
                          fontSize: 12, fontWeight: 700,
                          cursor: 'pointer', fontFamily: A.font,
                          transition: 'all 0.15s',
                        }}>
                          {h}h
                        </button>
                      );
                    })}
                  </div>
                  <span style={{ flex: 1 }} />
                  <button onClick={handleActivateAll} disabled={activatingAll || clearingAll} className="qr-action-btn" style={{
                    padding: '8px 16px', borderRadius: 8,
                    border: 'none', background: A.ink, color: A.cream,
                    fontSize: 12, fontWeight: 700, cursor: activatingAll ? 'not-allowed' : 'pointer',
                    fontFamily: A.font, opacity: activatingAll ? 0.7 : 1,
                    display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
                  }}>
                    {activatingAll ? (
                      <>
                        <span style={{ width: 11, height: 11, border: `2px solid ${A.cream}`, borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                        Activating…
                      </>
                    ) : '⚡ Activate All'}
                  </button>
                  <button onClick={handleClearAll} disabled={activatingAll || clearingAll} className="qr-action-btn" style={{
                    padding: '8px 14px', borderRadius: 8,
                    border: `1px solid rgba(217,83,79,0.30)`,
                    background: 'rgba(217,83,79,0.06)', color: A.dangerDim,
                    fontSize: 12, fontWeight: 700, cursor: clearingAll ? 'not-allowed' : 'pointer',
                    fontFamily: A.font, opacity: clearingAll ? 0.7 : 1,
                    display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
                  }}>
                    {clearingAll ? 'Clearing…' : 'Clear All'}
                  </button>
                </div>

                {/* Legend */}
                <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
                  {[
                    { color: A.success, label: 'Active — guests can order' },
                    { color: A.warning, label: 'Expiring soon (< 30 min)' },
                    { color: 'rgba(0,0,0,0.20)', label: 'Inactive / Not started' },
                  ].map(l => (
                    <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: A.mutedText, fontWeight: 500 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: l.color, display: 'inline-block' }} />
                      {l.label}
                    </div>
                  ))}
                </div>

                {/* Session grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                  {Array.from({ length: tableCount }, (_, i) => {
                    const tableNum = String(i + 1);
                    const session = sessions[tableNum];
                    const valid = isSessionValid(session);
                    const expiresAt = session?.expiresAt ? new Date(session.expiresAt) : null;
                    const minsLeft = expiresAt ? Math.round((expiresAt - Date.now()) / 60000) : 0;
                    const expiringSoon = valid && minsLeft < 30;
                    const dotColor = valid ? (expiringSoon ? A.warning : A.success) : 'rgba(0,0,0,0.20)';
                    const accentBg = valid ? (expiringSoon ? 'rgba(196,168,109,0.05)' : 'rgba(63,158,90,0.05)') : A.shellDarker;
                    const accentBorder = valid ? (expiringSoon ? 'rgba(196,168,109,0.30)' : 'rgba(63,158,90,0.25)') : 'rgba(0,0,0,0.06)';

                    return (
                      <div key={tableNum} style={{
                        borderRadius: 10,
                        border: `1px solid ${accentBorder}`,
                        background: accentBg,
                        padding: '12px 11px',
                        display: 'flex', flexDirection: 'column', gap: 7,
                      }}>
                        {/* Table number + status dot */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: A.ink, letterSpacing: '-0.2px' }}>
                            Table {tableNum}
                          </span>
                          <span style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: dotColor,
                            boxShadow: valid ? `0 0 6px ${dotColor}` : 'none',
                          }} />
                        </div>

                        {/* Status text */}
                        <div style={{
                          fontSize: 10, fontWeight: 700,
                          color: valid ? (expiringSoon ? A.warningDim : A.successDim) : A.faintText,
                          letterSpacing: '0.04em', textTransform: 'uppercase',
                        }}>
                          {valid
                            ? expiringSoon
                              ? `Expires in ${minsLeft}m`
                              : `Active · ${minsLeft}m left`
                            : session?.isActive === false
                              ? 'Cleared'
                              : 'Not activated'
                          }
                        </div>

                        {/* Session ID (truncated for reference) */}
                        {valid && session?.sid && (
                          <div style={{
                            fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
                            color: A.faintText,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            sid: {session.sid}
                          </div>
                        )}

                        {/* Copy URL (only valid sessions have a usable URL) */}
                        {valid && (
                          <button
                            onClick={() => { navigator.clipboard.writeText(getTableURL(tableNum)); toast.success(`Table ${tableNum} URL copied!`); }}
                            style={{
                              width: '100%', padding: '5px 0', borderRadius: 6,
                              border: A.border, background: A.shell, color: A.ink,
                              fontSize: 10, fontWeight: 700, cursor: 'pointer',
                              fontFamily: A.font,
                              letterSpacing: '0.04em', textTransform: 'uppercase',
                            }}>
                            Copy URL
                          </button>
                        )}

                        {/* Activate / Clear button */}
                        {valid ? (
                          <button
                            disabled={clearing === tableNum}
                            onClick={() => handleClear(tableNum)}
                            style={{
                              width: '100%', padding: '6px 0', borderRadius: 6,
                              border: `1px solid rgba(217,83,79,0.30)`,
                              background: 'rgba(217,83,79,0.06)', color: A.dangerDim,
                              fontSize: 10, fontWeight: 700, cursor: 'pointer',
                              fontFamily: A.font,
                              letterSpacing: '0.04em', textTransform: 'uppercase',
                            }}>
                            {clearing === tableNum ? '…' : '✕ Clear'}
                          </button>
                        ) : (
                          <button
                            disabled={activating === tableNum}
                            onClick={() => handleActivate(tableNum)}
                            style={{
                              width: '100%', padding: '6px 0', borderRadius: 6,
                              border: 'none',
                              background: A.ink, color: A.cream,
                              fontSize: 10, fontWeight: 700, cursor: 'pointer',
                              fontFamily: A.font,
                              letterSpacing: '0.04em', textTransform: 'uppercase',
                            }}>
                            {activating === tableNum ? '…' : '⚡ Activate'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

AdminQRCode.getLayout = (page) => page;