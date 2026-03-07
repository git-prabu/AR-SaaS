import Head from 'next/head';
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getRestaurantById } from '../../lib/db';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';

const SIZES  = [{ label:'Small', value:256, desc:'Table card' }, { label:'Medium', value:512, desc:'Menu insert' }, { label:'Large', value:1024, desc:'Print / poster' }];
const STYLES = [{ label:'Light', bg:'#FFFFFF', fg:'#1E1B18', border:'#E8E4DE' }, { label:'Coral', bg:'#FFF5E8', fg:'#E05A3A', border:'#F4D0A0' }, { label:'Dark',  bg:'#1E1B18', fg:'#F5A876', border:'#3A3530' }];

const S = {
  card:  { background:'#FFFFFF', border:'1px solid rgba(42,31,16,0.07)', borderRadius:20, boxShadow:'0 2px 14px rgba(42,31,16,0.06)' },
  h1:    { fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:22, color:'#1E1B18', margin:0 },
  sub:   { fontSize:13, color:'rgba(42,31,16,0.45)', marginTop:4 },
  label: { display:'block', fontSize:11, fontWeight:600, color:'rgba(42,31,16,0.5)', letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:8 },
};

export default function AdminQRCode() {
  const { userData } = useAuth();
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qrDataURL, setQrDataURL] = useState(null);
  const [selectedSize,  setSelectedSize]  = useState(SIZES[1]);
  const [selectedStyle, setSelectedStyle] = useState(STYLES[0]);
  const [generating, setGenerating] = useState(false);
  const rid = userData?.restaurantId;

  useEffect(() => {
    if (!rid) return;
    getRestaurantById(rid).then(r => { setRestaurant(r); setLoading(false); });
  }, [rid]);

  useEffect(() => { if (restaurant?.subdomain) generateQR(); }, [restaurant, selectedSize, selectedStyle]);

  const getMenuURL = () => `https://${restaurant?.subdomain||''}.advertradical.com`;

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

  const downloadQR = () => {
    if (!qrDataURL) return;
    const link = document.createElement('a');
    link.download = `${restaurant.subdomain}-ar-menu-qr-${selectedSize.value}px.png`;
    link.href = qrDataURL;
    link.click();
    toast.success('QR code downloaded!');
  };

  const copyURL = () => { navigator.clipboard.writeText(getMenuURL()); toast.success('Menu URL copied!'); };

  const printQR = () => {
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>${restaurant.name} — AR Menu QR</title><style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:${selectedStyle.bg};font-family:Arial,sans-serif;padding:40px}.card{background:${selectedStyle.bg};border:2px solid ${selectedStyle.border};border-radius:24px;padding:40px;text-align:center;max-width:480px}img{width:320px;height:320px;border-radius:12px}h1{font-size:28px;font-weight:800;color:${selectedStyle.fg};margin-top:24px}p{font-size:14px;color:${selectedStyle.fg}99;margin-top:8px}.badge{display:inline-block;margin-top:16px;padding:6px 16px;background:${selectedStyle.fg}20;border:1px solid ${selectedStyle.fg}40;border-radius:999px;font-size:12px;font-weight:600;color:${selectedStyle.fg}}</style></head><body><div class="card"><img src="${qrDataURL}" alt="QR Code"/><h1>${restaurant.name}</h1><p>Scan to view our menu in Augmented Reality</p><div class="badge">⬡ AR Menu</div></div></body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  return (
    <AdminLayout>
      <Head><title>QR Code — Advert Radical</title></Head>
      <div style={{ background:'#F2F0EC', minHeight:'100vh', padding:32, fontFamily:'Inter,sans-serif' }}>
        <div style={{ maxWidth:900, margin:'0 auto' }}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ marginBottom:28 }}>
            <h1 style={S.h1}>QR Code Generator</h1>
            <p style={S.sub}>Download and print your AR menu QR code for tables, menus, and posters.</p>
          </div>

          {loading ? (
            <div style={{ display:'flex', justifyContent:'center', paddingTop:60 }}>
              <div style={{ width:32, height:32, border:'3px solid #E05A3A', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>

              {/* LEFT — QR Preview */}
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                <div style={{ ...S.card, padding:32, display:'flex', flexDirection:'column', alignItems:'center', gap:16, background:selectedStyle.bg, border:`2px solid ${selectedStyle.border}` }}>
                  <div style={{ width:200, height:200, borderRadius:16, overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', background:selectedStyle.bg }}>
                    {generating
                      ? <div style={{ width:32, height:32, border:`3px solid ${selectedStyle.fg}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
                      : qrDataURL && <img src={qrDataURL} alt="QR Code" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
                    }
                  </div>
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:16, color:selectedStyle.fg, marginBottom:4 }}>{restaurant?.name}</div>
                    <div style={{ fontSize:12, color:selectedStyle.fg+'99' }}>Scan to view in Augmented Reality</div>
                    <div style={{ display:'inline-block', marginTop:8, padding:'4px 12px', background:selectedStyle.fg+'18', border:`1px solid ${selectedStyle.fg}30`, borderRadius:30, fontSize:11, fontWeight:600, color:selectedStyle.fg }}>⬡ AR Menu</div>
                  </div>
                </div>

                {/* URL bar */}
                <div style={{ ...S.card, padding:'12px 16px', display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ flex:1, fontSize:13, color:'rgba(42,31,16,0.6)', fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{getMenuURL()}</div>
                  <button onClick={copyURL} style={{ padding:'6px 14px', borderRadius:8, border:'none', background:'#F2F0EC', color:'rgba(42,31,16,0.6)', fontSize:12, fontWeight:600, cursor:'pointer' }}>Copy</button>
                </div>

                {/* Action buttons */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <button onClick={downloadQR} disabled={!qrDataURL||generating} style={{ padding:'12px', borderRadius:12, border:'none', background:'#1E1B18', color:'#FFF5E8', fontSize:14, fontWeight:600, fontFamily:'Poppins,sans-serif', cursor:'pointer', opacity:(!qrDataURL||generating)?0.5:1 }}>
                    ↓ Download
                  </button>
                  <button onClick={printQR} disabled={!qrDataURL} style={{ padding:'12px', borderRadius:12, border:'1.5px solid rgba(42,31,16,0.12)', background:'#fff', color:'#1E1B18', fontSize:14, fontWeight:600, fontFamily:'Poppins,sans-serif', cursor:'pointer' }}>
                    🖨 Print
                  </button>
                </div>
              </div>

              {/* RIGHT — Options */}
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                {/* Size */}
                <div style={{ ...S.card, padding:24 }}>
                  <label style={S.label}>Size</label>
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {SIZES.map(sz => (
                      <div key={sz.value} onClick={()=>setSelectedSize(sz)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderRadius:12, border:`1.5px solid ${selectedSize.value===sz.value?'rgba(224,90,58,0.4)':'rgba(42,31,16,0.08)'}`, background:selectedSize.value===sz.value?'rgba(224,90,58,0.05)':'#F7F5F2', cursor:'pointer', transition:'all 0.15s' }}>
                        <div>
                          <div style={{ fontSize:13, fontWeight:600, color:'#1E1B18' }}>{sz.label}</div>
                          <div style={{ fontSize:11, color:'rgba(42,31,16,0.45)', marginTop:2 }}>{sz.desc}</div>
                        </div>
                        <span style={{ fontSize:12, color:'rgba(42,31,16,0.4)', fontFamily:'monospace' }}>{sz.value}px</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Style */}
                <div style={{ ...S.card, padding:24 }}>
                  <label style={S.label}>Color Style</label>
                  <div style={{ display:'flex', gap:10 }}>
                    {STYLES.map(st => (
                      <div key={st.label} onClick={()=>setSelectedStyle(st)} style={{ flex:1, padding:'14px 10px', borderRadius:12, border:`2px solid ${selectedStyle.label===st.label?'rgba(224,90,58,0.5)':'rgba(42,31,16,0.08)'}`, background:st.bg, cursor:'pointer', textAlign:'center', transition:'all 0.15s' }}>
                        <div style={{ width:28, height:28, borderRadius:8, background:st.fg, margin:'0 auto 8px' }} />
                        <div style={{ fontSize:11, fontWeight:600, color:st.fg }}>{st.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stats */}
                <div style={{ ...S.card, padding:24 }}>
                  <label style={S.label}>Quick Stats</label>
                  <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                    {[
                      { label:'Your menu URL', value:getMenuURL(), mono:true },
                      { label:'Subdomain', value:restaurant?.subdomain },
                      { label:'Plan', value:restaurant?.plan||'Basic', cap:true },
                    ].map(s=>(
                      <div key={s.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:12, color:'rgba(42,31,16,0.5)' }}>{s.label}</span>
                        <span style={{ fontSize:12, fontWeight:600, color:'#1E1B18', fontFamily:s.mono?'monospace':'inherit', textTransform:s.cap?'capitalize':'none', maxWidth:160, textAlign:'right', overflow:'hidden', textOverflow:'ellipsis' }}>{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
AdminQRCode.getLayout = (page) => page;
