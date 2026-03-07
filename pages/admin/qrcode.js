import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getRestaurantById } from '../../lib/db';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';

const SIZES  = [{ label:'Small', value:256, desc:'Table card' }, { label:'Medium', value:512, desc:'Menu insert' }, { label:'Large', value:1024, desc:'Print / poster' }];
const STYLES = [{ label:'Dark', bg:'#08090C', fg:'#B8962E', border:'rgba(184,150,46,0.2)' }, { label:'Light', bg:'#FFFFFF', fg:'#1E1B18', border:'#E8E4DE' }, { label:'Gold', bg:'#0D0E12', fg:'#D4B048', border:'rgba(212,176,72,0.25)' }];

const G = { card:'rgba(255,255,255,0.03)', border:'rgba(255,255,255,0.07)', gold:'#B8962E', text:'rgba(255,255,255,0.82)', textDim:'rgba(255,255,255,0.32)' };
const lbl = { display:'block', fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.32)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:8, fontFamily:`'DM Mono',monospace` };

export default function AdminQRCode() {
  const { userData } = useAuth();
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qrDataURL, setQrDataURL] = useState(null);
  const [selectedSize,  setSelectedSize]  = useState(SIZES[1]);
  const [selectedStyle, setSelectedStyle] = useState(STYLES[0]);
  const [generating, setGenerating] = useState(false);
  const rid = userData?.restaurantId;

  useEffect(() => { if (!rid) return; getRestaurantById(rid).then(r=>{setRestaurant(r);setLoading(false);}); }, [rid]);
  useEffect(() => { if (restaurant?.subdomain) generateQR(); }, [restaurant, selectedSize, selectedStyle]);

  const getMenuURL = () => `https://${restaurant?.subdomain||''}.advertradical.com`;

  const generateQR = async () => {
    if (!restaurant?.subdomain) return;
    setGenerating(true);
    try {
      const dataURL = await QRCode.toDataURL(getMenuURL(), { width:selectedSize.value, margin:3, color:{dark:selectedStyle.fg,light:selectedStyle.bg}, errorCorrectionLevel:'H' });
      setQrDataURL(dataURL);
    } catch { toast.error('Failed to generate QR code'); }
    finally { setGenerating(false); }
  };

  const downloadQR = () => {
    if (!qrDataURL) return;
    const link = document.createElement('a');
    link.download = `${restaurant.subdomain}-ar-menu-qr-${selectedSize.value}px.png`;
    link.href = qrDataURL; link.click();
    toast.success('QR code downloaded!');
  };

  const copyURL = () => { navigator.clipboard.writeText(getMenuURL()); toast.success('Menu URL copied!'); };

  const printQR = () => {
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>${restaurant.name} — AR Menu QR</title><style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:${selectedStyle.bg};font-family:Arial,sans-serif;padding:40px}.card{background:${selectedStyle.bg};border:2px solid ${selectedStyle.border};border-radius:24px;padding:40px;text-align:center;max-width:480px}img{width:320px;height:320px;border-radius:12px}h1{font-size:28px;font-weight:800;color:${selectedStyle.fg};margin-top:24px}p{font-size:14px;color:${selectedStyle.fg}99;margin-top:8px}.badge{display:inline-block;margin-top:16px;padding:6px 16px;background:${selectedStyle.fg}20;border:1px solid ${selectedStyle.fg}40;border-radius:999px;font-size:12px;font-weight:600;color:${selectedStyle.fg}}</style></head><body><div class="card"><img src="${qrDataURL}" alt="QR Code"/><h1>${restaurant.name}</h1><p>Scan to view our menu in Augmented Reality</p><div class="badge">⬡ AR Menu</div></div></body></html>`);
    win.document.close(); setTimeout(()=>win.print(),500);
  };

  return (
    <AdminLayout>
      <Head><title>QR Code — Advert Radical</title></Head>
      <div style={{minHeight:'100vh',padding:'32px 36px',fontFamily:`'Bricolage Grotesque',Inter,sans-serif`}}>
        <div style={{maxWidth:900,margin:'0 auto'}}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box}`}</style>
          <div style={{marginBottom:28}}>
            <h1 style={{fontWeight:800,fontSize:22,color:'rgba(255,255,255,0.88)',margin:0,letterSpacing:'-0.02em'}}>QR Code Generator</h1>
            <p style={{fontSize:13,color:G.textDim,marginTop:4}}>Download and print your AR menu QR code for tables, menus, and posters.</p>
          </div>

          {loading ? (
            <div style={{display:'flex',justifyContent:'center',paddingTop:60}}>
              <div style={{width:32,height:32,border:`2px solid ${G.gold}`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
            </div>
          ) : (
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>

              {/* LEFT — QR Preview */}
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div style={{background:selectedStyle.bg,border:`1px solid ${selectedStyle.border}`,borderRadius:12,padding:32,display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>
                  <div style={{width:200,height:200,borderRadius:12,overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',background:selectedStyle.bg}}>
                    {generating
                      ? <div style={{width:32,height:32,border:`2px solid ${selectedStyle.fg}`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
                      : qrDataURL && <img src={qrDataURL} alt="QR Code" style={{width:'100%',height:'100%',objectFit:'contain'}}/>
                    }
                  </div>
                  <div style={{textAlign:'center'}}>
                    <div style={{fontWeight:700,fontSize:16,color:selectedStyle.fg,marginBottom:4}}>{restaurant?.name}</div>
                    <div style={{fontSize:12,color:selectedStyle.fg+'99'}}>Scan to view in Augmented Reality</div>
                    <div style={{display:'inline-block',marginTop:8,padding:'4px 12px',background:selectedStyle.fg+'18',border:`1px solid ${selectedStyle.fg}30`,borderRadius:20,fontSize:11,fontWeight:600,color:selectedStyle.fg}}>⬡ AR Menu</div>
                  </div>
                </div>

                <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:10,padding:'12px 16px',display:'flex',alignItems:'center',gap:10}}>
                  <div style={{flex:1,fontSize:12,color:G.textDim,fontFamily:`'DM Mono',monospace`,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{getMenuURL()}</div>
                  <button onClick={copyURL} style={{padding:'5px 12px',borderRadius:6,border:`1px solid ${G.border}`,background:'transparent',color:G.textDim,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}} onMouseOver={e=>{e.currentTarget.style.color=G.gold;e.currentTarget.style.borderColor='rgba(184,150,46,0.3)'}} onMouseOut={e=>{e.currentTarget.style.color=G.textDim;e.currentTarget.style.borderColor=G.border}}>Copy</button>
                </div>

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <button onClick={downloadQR} disabled={!qrDataURL||generating} style={{padding:'11px',borderRadius:8,border:`1px solid rgba(184,150,46,0.35)`,background:'rgba(184,150,46,0.1)',color:G.gold,fontSize:13,fontWeight:700,fontFamily:'inherit',cursor:'pointer',opacity:(!qrDataURL||generating)?0.4:1,transition:'all 0.2s'}}>↓ Download</button>
                  <button onClick={printQR} disabled={!qrDataURL} style={{padding:'11px',borderRadius:8,border:`1px solid ${G.border}`,background:G.card,color:G.text,fontSize:13,fontWeight:600,fontFamily:'inherit',cursor:'pointer'}}>🖨 Print</button>
                </div>
              </div>

              {/* RIGHT — Options */}
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:12,padding:22}}>
                  <label style={lbl}>Size</label>
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    {SIZES.map(sz=>(
                      <div key={sz.value} onClick={()=>setSelectedSize(sz)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'11px 14px',borderRadius:8,border:`1px solid ${selectedSize.value===sz.value?'rgba(184,150,46,0.35)':G.border}`,background:selectedSize.value===sz.value?'rgba(184,150,46,0.07)':'transparent',cursor:'pointer',transition:'all 0.15s'}}>
                        <div>
                          <div style={{fontSize:13,fontWeight:600,color:selectedSize.value===sz.value?G.gold:G.text}}>{sz.label}</div>
                          <div style={{fontSize:11,color:G.textDim,marginTop:2}}>{sz.desc}</div>
                        </div>
                        <span style={{fontSize:11,color:G.textDim,fontFamily:`'DM Mono',monospace`}}>{sz.value}px</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:12,padding:22}}>
                  <label style={lbl}>Color Style</label>
                  <div style={{display:'flex',gap:8}}>
                    {STYLES.map(st=>(
                      <div key={st.label} onClick={()=>setSelectedStyle(st)} style={{flex:1,padding:'14px 8px',borderRadius:10,border:`1px solid ${selectedStyle.label===st.label?'rgba(184,150,46,0.5)':G.border}`,background:st.bg,cursor:'pointer',textAlign:'center',transition:'all 0.15s'}}>
                        <div style={{width:24,height:24,borderRadius:6,background:st.fg,margin:'0 auto 8px'}}/>
                        <div style={{fontSize:11,fontWeight:600,color:st.fg}}>{st.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:12,padding:22}}>
                  <label style={lbl}>Info</label>
                  <div style={{display:'flex',flexDirection:'column',gap:10}}>
                    {[
                      { label:'Menu URL', value:getMenuURL(), mono:true },
                      { label:'Subdomain', value:restaurant?.subdomain },
                      { label:'Plan', value:restaurant?.plan||'Basic', cap:true },
                    ].map(s=>(
                      <div key={s.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                        <span style={{fontSize:12,color:G.textDim,flexShrink:0}}>{s.label}</span>
                        <span style={{fontSize:12,fontWeight:600,color:G.text,fontFamily:s.mono?`'DM Mono',monospace`:'inherit',textTransform:s.cap?'capitalize':'none',maxWidth:160,textAlign:'right',overflow:'hidden',textOverflow:'ellipsis'}}>{s.value}</span>
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
