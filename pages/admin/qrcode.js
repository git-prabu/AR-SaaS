import Head from 'next/head';
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getRestaurantById, activateTableSession, clearTableSession, getAllTableSessions, isSessionValid } from '../../lib/db';
import { db } from '../../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';

const SIZES = [{ label: 'Small', value: 256, desc: 'Table card' }, { label: 'Medium', value: 512, desc: 'Menu insert' }, { label: 'Large', value: 1024, desc: 'Print / poster' }];
const STYLES = [{ label: 'Light', bg: '#FFFFFF', fg: '#1E1B18', border: '#E8E4DE' }, { label: 'Coral', bg: '#FFF5E8', fg: '#E05A3A', border: '#F4D0A0' }, { label: 'Dark', bg: '#1E1B18', fg: '#F5A876', border: '#3A3530' }];

const S = {
  card: { background: '#FFFFFF', border: '1px solid rgba(42,31,16,0.07)', borderRadius: 20, boxShadow: '0 2px 14px rgba(42,31,16,0.06)' },
  h1: { fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 22, color: '#1E1B18', margin: 0 },
  sub: { fontSize: 13, color: 'rgba(42,31,16,0.45)', marginTop: 4 },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(42,31,16,0.5)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 },
};

export default function AdminQRCode() {
  const { userData } = useAuth();
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qrDataURL, setQrDataURL] = useState(null);
  const [selectedSize, setSelectedSize] = useState(SIZES[1]);
  const [selectedStyle, setSelectedStyle] = useState(STYLES[0]);
  const [generating, setGenerating] = useState(false);

  // Table QR state
  const [tableCount, setTableCount] = useState(12);
  const [tableQRs, setTableQRs] = useState([]);   // [{ table, dataURL }]
  const [generatingTables, setGeneratingTables] = useState(false);
  const [tablesDone, setTablesDone] = useState(false);

  // Table sessions state
  const [sessions, setSessions] = useState({}); // { tableNum: sessionDoc }
  const [activating, setActivating] = useState(null);
  const [clearing, setClearing] = useState(null);
  const [sessionHours, setSessionHours] = useState(3);

  const rid = userData?.restaurantId;

  useEffect(() => {
    if (!rid) return;
    getRestaurantById(rid).then(r => { setRestaurant(r); setLoading(false); });
  }, [rid]);

  useEffect(() => { if (restaurant?.subdomain) generateQR(); }, [restaurant, selectedSize, selectedStyle]);

  // Real-time sessions listener
  useEffect(() => {
    if (!rid) return;
    const unsub = onSnapshot(collection(db, 'restaurants', rid, 'tableSessions'), (snap) => {
      const map = {};
      snap.docs.forEach(d => { map[d.data().tableNumber] = d.data(); });
      setSessions(map);
    });
    return unsub;
  }, [rid]);

  // Reset table QRs when style changes so they stay in sync
  useEffect(() => { setTableQRs([]); setTablesDone(false); }, [selectedStyle]);

  const BASE_URL = 'https://ar-saa-s-kbzn.vercel.app';

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
        setTableQRs([...results]); // update progressively
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

  const copyURL = () => { navigator.clipboard.writeText(getMenuURL()); toast.success('Menu URL copied!'); };

  const printQR = () => {
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>${restaurant.name} — AR Menu QR</title><style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:${selectedStyle.bg};font-family:Arial,sans-serif;padding:40px}.card{background:${selectedStyle.bg};border:2px solid ${selectedStyle.border};border-radius:24px;padding:40px;text-align:center;max-width:480px}img{width:320px;height:320px;border-radius:12px}h1{font-size:28px;font-weight:800;color:${selectedStyle.fg};margin-top:24px}p{font-size:14px;color:${selectedStyle.fg}99;margin-top:8px}.badge{display:inline-block;margin-top:16px;padding:6px 16px;background:${selectedStyle.fg}20;border:1px solid ${selectedStyle.fg}40;border-radius:999px;font-size:12px;font-weight:600;color:${selectedStyle.fg}}</style></head><body><div class="card"><img src="${qrDataURL}" alt="QR Code"/><h1>${restaurant.name}</h1><p>Scan to view our menu in Augmented Reality</p><div class="badge">⬡ AR Menu</div></div></body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 500);
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
        body{background:${selectedStyle.bg};font-family:Arial,sans-serif;padding:24px}
        .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;max-width:900px;margin:0 auto}
        .card{background:${selectedStyle.bg};border:2px solid ${selectedStyle.border};border-radius:16px;padding:20px;text-align:center;break-inside:avoid}
        img{width:160px;height:160px;border-radius:8px}
        .table-num{font-size:20px;font-weight:800;color:${selectedStyle.fg};margin-top:10px}
        .rest-name{font-size:11px;color:${selectedStyle.fg}99;margin-top:3px}
        .hint{font-size:10px;color:${selectedStyle.fg}66;margin-top:6px}
        @media print{@page{margin:10mm}}
      </style>
    </head><body><div class="grid">${cards}</div></body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 600);
  };

  return (
    <AdminLayout>
      <Head><title>QR Code — Advert Radical</title></Head>
      <div style={{ background: '#F2F0EC', minHeight: '100vh', padding: 32, fontFamily: 'Inter,sans-serif' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>
          <div style={{ marginBottom: 28 }}>
            <h1 style={S.h1}>QR Code Generator</h1>
            <p style={S.sub}>Download and print your AR menu QR code for tables, menus, and posters.</p>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
              <div style={{ width: 32, height: 32, border: '3px solid #E05A3A', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : (
            <>
              {/* ── Main QR Generator ─────────────────────────────────── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>

                {/* LEFT — QR Preview */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ ...S.card, padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, background: selectedStyle.bg, border: `2px solid ${selectedStyle.border}` }}>
                    <div style={{ width: 200, height: 200, borderRadius: 16, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: selectedStyle.bg }}>
                      {generating
                        ? <div style={{ width: 32, height: 32, border: `3px solid ${selectedStyle.fg}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                        : qrDataURL && <img src={qrDataURL} alt="QR Code" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      }
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 16, color: selectedStyle.fg, marginBottom: 4 }}>{restaurant?.name}</div>
                      <div style={{ fontSize: 12, color: selectedStyle.fg + '99' }}>Scan to view in Augmented Reality</div>
                      <div style={{ display: 'inline-block', marginTop: 8, padding: '4px 12px', background: selectedStyle.fg + '18', border: `1px solid ${selectedStyle.fg}30`, borderRadius: 30, fontSize: 11, fontWeight: 600, color: selectedStyle.fg }}>⬡ AR Menu</div>
                    </div>
                  </div>

                  {/* URL bar */}
                  <div style={{ ...S.card, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, fontSize: 13, color: 'rgba(42,31,16,0.6)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getMenuURL()}</div>
                    <button onClick={copyURL} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#F2F0EC', color: 'rgba(42,31,16,0.6)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Copy</button>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <button onClick={downloadQR} disabled={!qrDataURL || generating} style={{ padding: '12px', borderRadius: 12, border: 'none', background: '#1E1B18', color: '#FFF5E8', fontSize: 14, fontWeight: 600, fontFamily: 'Poppins,sans-serif', cursor: 'pointer', opacity: (!qrDataURL || generating) ? 0.5 : 1 }}>
                      ↓ Download
                    </button>
                    <button onClick={printQR} disabled={!qrDataURL} style={{ padding: '12px', borderRadius: 12, border: '1.5px solid rgba(42,31,16,0.12)', background: '#fff', color: '#1E1B18', fontSize: 14, fontWeight: 600, fontFamily: 'Poppins,sans-serif', cursor: 'pointer' }}>
                      🖨 Print
                    </button>
                  </div>
                </div>

                {/* RIGHT — Options */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Size */}
                  <div style={{ ...S.card, padding: 24 }}>
                    <label style={S.label}>Size</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {SIZES.map(sz => (
                        <div key={sz.value} onClick={() => setSelectedSize(sz)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 12, border: `1.5px solid ${selectedSize.value === sz.value ? 'rgba(224,90,58,0.4)' : 'rgba(42,31,16,0.08)'}`, background: selectedSize.value === sz.value ? 'rgba(224,90,58,0.05)' : '#F7F5F2', cursor: 'pointer', transition: 'all 0.15s' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1E1B18' }}>{sz.label}</div>
                            <div style={{ fontSize: 11, color: 'rgba(42,31,16,0.45)', marginTop: 2 }}>{sz.desc}</div>
                          </div>
                          <span style={{ fontSize: 12, color: 'rgba(42,31,16,0.4)', fontFamily: 'monospace' }}>{sz.value}px</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Style */}
                  <div style={{ ...S.card, padding: 24 }}>
                    <label style={S.label}>Color Style</label>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {STYLES.map(st => (
                        <div key={st.label} onClick={() => setSelectedStyle(st)} style={{ flex: 1, padding: '14px 10px', borderRadius: 12, border: `2px solid ${selectedStyle.label === st.label ? 'rgba(224,90,58,0.5)' : 'rgba(42,31,16,0.08)'}`, background: st.bg, cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s' }}>
                          <div style={{ width: 28, height: 28, borderRadius: 8, background: st.fg, margin: '0 auto 8px' }} />
                          <div style={{ fontSize: 11, fontWeight: 600, color: st.fg }}>{st.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Stats */}
                  <div style={{ ...S.card, padding: 24 }}>
                    <label style={S.label}>Quick Stats</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {[
                        { label: 'Your menu URL', value: getMenuURL(), mono: true },
                        { label: 'Subdomain', value: restaurant?.subdomain },
                        { label: 'Plan', value: restaurant?.plan || 'Basic', cap: true },
                      ].map(s => (
                        <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, color: 'rgba(42,31,16,0.5)' }}>{s.label}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#1E1B18', fontFamily: s.mono ? 'monospace' : 'inherit', textTransform: s.cap ? 'capitalize' : 'none', maxWidth: 160, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Per-Table QR Codes ────────────────────────────────── */}
              <div style={{ ...S.card, padding: 28 }}>
                {/* Section header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 22 }}>
                  <div>
                    <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 16, color: '#1E1B18', marginBottom: 4 }}>
                      🪑 Per-Table QR Codes
                    </div>
                    <div style={{ fontSize: 13, color: 'rgba(42,31,16,0.45)', maxWidth: 420 }}>
                      Each QR code links directly to your menu with the table number pre-filled — no manual selection needed.
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {tablesDone && tableQRs.length > 0 && (
                      <button onClick={printAllTableQRs}
                        style={{ padding: '10px 18px', borderRadius: 12, border: '1.5px solid rgba(42,31,16,0.12)', background: '#fff', color: '#1E1B18', fontSize: 13, fontWeight: 600, fontFamily: 'Poppins,sans-serif', cursor: 'pointer' }}>
                        🖨 Print All
                      </button>
                    )}
                    <button onClick={generateTableQRs} disabled={generatingTables}
                      style={{ padding: '10px 20px', borderRadius: 12, border: 'none', background: '#1E1B18', color: '#FFF5E8', fontSize: 13, fontWeight: 600, fontFamily: 'Poppins,sans-serif', cursor: generatingTables ? 'not-allowed' : 'pointer', opacity: generatingTables ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {generatingTables
                        ? <><div style={{ width: 14, height: 14, border: '2px solid #FFF5E8', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Generating…</>
                        : '⚡ Generate QR Codes'
                      }
                    </button>
                  </div>
                </div>

                {/* Table count input */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22, padding: '14px 18px', borderRadius: 14, background: 'rgba(247,155,61,0.06)', border: '1px solid rgba(247,155,61,0.18)' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1E1B18' }}>Number of tables:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => setTableCount(c => Math.max(1, c - 1))}
                      style={{ width: 30, height: 30, borderRadius: 8, border: '1.5px solid rgba(42,31,16,0.14)', background: '#fff', fontSize: 16, fontWeight: 700, color: '#1E1B18', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                    <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 18, color: '#1E1B18', minWidth: 32, textAlign: 'center' }}>{tableCount}</span>
                    <button onClick={() => setTableCount(c => Math.min(50, c + 1))}
                      style={{ width: 30, height: 30, borderRadius: 8, border: '1.5px solid rgba(42,31,16,0.14)', background: '#fff', fontSize: 16, fontWeight: 700, color: '#1E1B18', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                  </div>
                  <span style={{ fontSize: 12, color: 'rgba(42,31,16,0.4)' }}>Tables 1 – {tableCount} · uses current color style</span>
                </div>

                {/* Table QR grid */}
                {tableQRs.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 14 }}>
                    {tableQRs.map(item => (
                      <div key={item.table} style={{ borderRadius: 16, border: `2px solid ${selectedStyle.border}`, background: selectedStyle.bg, padding: '14px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, animation: 'fadeIn 0.2s ease' }}>
                        <img src={item.dataURL} alt={`Table ${item.table}`} style={{ width: 100, height: 100, borderRadius: 8 }} />
                        <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 13, color: selectedStyle.fg }}>
                          Table {item.table}
                        </div>
                        <button onClick={() => downloadTableQR(item)}
                          style={{ width: '100%', padding: '6px 0', borderRadius: 8, border: 'none', background: selectedStyle.fg + '18', color: selectedStyle.fg, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                          ↓ Download
                        </button>
                      </div>
                    ))}

                    {/* Progress placeholder for generating */}
                    {generatingTables && Array.from({ length: tableCount - tableQRs.length }, (_, i) => (
                      <div key={`placeholder-${i}`} style={{ borderRadius: 16, border: '2px solid rgba(42,31,16,0.07)', background: '#F7F5F2', padding: '14px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 160 }}>
                        <div style={{ width: 24, height: 24, border: '2px solid rgba(42,31,16,0.15)', borderTopColor: '#F79B3D', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'rgba(42,31,16,0.35)' }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>🪑</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>Set your table count and hit Generate</div>
                    <div style={{ fontSize: 12, marginTop: 6 }}>Each QR will encode your menu URL + table number automatically</div>
                  </div>
                )}
              </div>
              {/* ── Table Session Manager ─────────────────────────────── */}
              <div style={{ ...S.card, padding: 28, marginTop: 20 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 22 }}>
                  <div>
                    <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 16, color: '#1E1B18', marginBottom: 4 }}>
                      🔐 Table Session Manager
                    </div>
                    <div style={{ fontSize: 13, color: 'rgba(42,31,16,0.45)', maxWidth: 460 }}>
                      Activate a table when new guests sit down. Only active sessions can view the menu and place orders — prevents fake orders from outside the restaurant.
                    </div>
                  </div>
                  {/* Session duration selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(42,31,16,0.5)' }}>Session:</span>
                    {[1, 2, 3, 4, 6].map(h => (
                      <button key={h} onClick={() => setSessionHours(h)}
                        style={{ padding: '6px 12px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif', background: sessionHours === h ? '#1E1B18' : '#fff', color: sessionHours === h ? '#FFF5E8' : 'rgba(42,31,16,0.5)', boxShadow: sessionHours === h ? '0 2px 8px rgba(30,27,24,0.2)' : '0 1px 4px rgba(42,31,16,0.06)', transition: 'all 0.15s' }}>
                        {h}h
                      </button>
                    ))}
                  </div>
                </div>

                {/* Legend */}
                <div style={{ display: 'flex', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
                  {[['#5A9A78', 'Active — guests can order'], ['#F79B3D', 'Expiring soon (< 30 min)'], ['rgba(42,31,16,0.2)', 'Inactive / Not started']].map(([color, label]) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(42,31,16,0.5)' }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
                      {label}
                    </div>
                  ))}
                </div>

                {/* Session grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                  {Array.from({ length: tableCount }, (_, i) => {
                    const tableNum = String(i + 1);
                    const session = sessions[tableNum];
                    const valid = isSessionValid(session);
                    const expiresAt = session?.expiresAt ? new Date(session.expiresAt) : null;
                    const minsLeft = expiresAt ? Math.round((expiresAt - Date.now()) / 60000) : 0;
                    const expiringSoon = valid && minsLeft < 30;
                    const dotColor = valid ? (expiringSoon ? '#F79B3D' : '#5A9A78') : 'rgba(42,31,16,0.2)';

                    return (
                      <div key={tableNum} style={{ borderRadius: 14, border: `1.5px solid ${valid ? (expiringSoon ? 'rgba(247,155,61,0.35)' : 'rgba(90,154,120,0.3)') : 'rgba(42,31,16,0.08)'}`, background: valid ? (expiringSoon ? 'rgba(247,155,61,0.05)' : 'rgba(90,154,120,0.05)') : '#F7F5F2', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>

                        {/* Table number + status dot */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 15, color: '#1E1B18' }}>Table {tableNum}</span>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, display: 'inline-block', boxShadow: valid ? `0 0 6px ${dotColor}` : 'none' }} />
                        </div>

                        {/* Status text */}
                        <div style={{ fontSize: 11, color: valid ? (expiringSoon ? '#C05A00' : '#1A6040') : 'rgba(42,31,16,0.4)', fontWeight: 600 }}>
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
                          <div style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(42,31,16,0.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            sid: {session.sid}
                          </div>
                        )}

                        {/* Copy working URL */}
                        {valid && (
                          <button
                            onClick={() => { navigator.clipboard.writeText(getTableURL(tableNum)); toast.success(`Table ${tableNum} URL copied!`); }}
                            style={{ width: '100%', padding: '5px 0', borderRadius: 8, border: '1.5px solid rgba(42,31,16,0.12)', background: '#fff', color: 'rgba(42,31,16,0.6)', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                            📋 Copy URL
                          </button>
                        )}

                        {/* Action button */}
                        {valid ? (
                          <button
                            disabled={clearing === tableNum}
                            onClick={() => handleClear(tableNum)}
                            style={{ width: '100%', padding: '7px 0', borderRadius: 8, border: '1.5px solid rgba(224,90,58,0.3)', background: 'rgba(224,90,58,0.07)', color: '#C04A28', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                            {clearing === tableNum ? '…' : '✕ Clear Table'}
                          </button>
                        ) : (
                          <button
                            disabled={activating === tableNum}
                            onClick={() => handleActivate(tableNum)}
                            style={{ width: '100%', padding: '7px 0', borderRadius: 8, border: 'none', background: '#1E1B18', color: '#FFF5E8', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                            {activating === tableNum ? '…' : '⚡ Activate'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Activate / Clear all */}
                <div style={{ display: 'flex', gap: 10, marginTop: 18, paddingTop: 18, borderTop: '1px solid rgba(42,31,16,0.07)' }}>
                  <button
                    onClick={async () => {
                      for (let i = 1; i <= tableCount; i++) await activateTableSession(rid, String(i), sessionHours);
                      toast.success(`All ${tableCount} tables activated for ${sessionHours}h`);
                    }}
                    style={{ padding: '10px 20px', borderRadius: 12, border: 'none', background: '#1E1B18', color: '#FFF5E8', fontSize: 13, fontWeight: 600, fontFamily: 'Poppins,sans-serif', cursor: 'pointer' }}>
                    ⚡ Activate All Tables
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm(`Clear all ${tableCount} table sessions?`)) return;
                      for (let i = 1; i <= tableCount; i++) await clearTableSession(rid, String(i));
                      toast.success('All tables cleared');
                    }}
                    style={{ padding: '10px 20px', borderRadius: 12, border: '1.5px solid rgba(42,31,16,0.12)', background: '#fff', color: 'rgba(42,31,16,0.6)', fontSize: 13, fontWeight: 600, fontFamily: 'Poppins,sans-serif', cursor: 'pointer' }}>
                    Clear All
                  </button>
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