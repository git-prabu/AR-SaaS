import Head from 'next/head';
import { useState, useEffect, useCallback } from 'react';
import { getRestaurantBySubdomain, getMenuItems, getActiveOffers, trackVisit, incrementItemView, incrementARView } from '../../../lib/db';
import { ARViewerEmbed } from '../../../components/ARViewer';

function getSessionId() {
  if (typeof window === 'undefined') return 'ssr';
  let sid = sessionStorage.getItem('ar_sid');
  if (!sid) { sid = Math.random().toString(36).substr(2, 16); sessionStorage.setItem('ar_sid', sid); }
  return sid;
}

const FOOD_PLACEHOLDERS = [
  'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&q=75',
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=75',
  'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=600&q=75',
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=75',
  'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=600&q=75',
  'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=600&q=75',
  'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&q=75',
  'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=600&q=75',
];
function getPlaceholder(id) {
  let h = 0;
  for (let i = 0; i < (id||'').length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return FOOD_PLACEHOLDERS[h % FOOD_PLACEHOLDERS.length];
}
const SPICE = { Mild:'🌶', Medium:'🌶🌶', Spicy:'🌶🌶🌶', 'Very Spicy':'🌶🌶🌶🌶' };

export default function RestaurantMenu({ restaurant, menuItems, offers, error }) {
  const [activeCat,    setActiveCat]    = useState('All');
  const [selectedItem, setSelectedItem] = useState(null);
  const [showAR,       setShowAR]       = useState(false);
  const [imgErr,       setImgErr]       = useState({});

  useEffect(() => {
    if (restaurant?.id) trackVisit(restaurant.id, getSessionId()).catch(() => {});
  }, [restaurant?.id]);

  useEffect(() => {
    document.body.style.overflow = selectedItem ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [selectedItem]);

  const cats     = ['All', ...new Set((menuItems||[]).map(i=>i.category).filter(Boolean))];
  const filtered = activeCat === 'All' ? (menuItems||[]) : (menuItems||[]).filter(i=>i.category===activeCat);
  const arCount  = (menuItems||[]).filter(i=>i.modelURL).length;

  const openItem = useCallback(async (item) => {
    setSelectedItem(item); setShowAR(false);
    if (restaurant?.id) await incrementItemView(restaurant.id, item.id).catch(()=>{});
  }, [restaurant?.id]);

  const closeItem     = useCallback(() => { setSelectedItem(null); setShowAR(false); }, []);
  const handleARLaunch = useCallback(async () => {
    if (restaurant?.id && selectedItem?.id)
      await incrementARView(restaurant.id, selectedItem.id).catch(()=>{});
  }, [restaurant?.id, selectedItem?.id]);

  const imgSrc = (item) => (!imgErr[item.id] && item.imageURL) ? item.imageURL : getPlaceholder(item.id);

  if (error || !restaurant) return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(145deg,#F5A876,#F0906A,#C8A8D8)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Inter,sans-serif' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:56, marginBottom:14 }}>🍽️</div>
        <h1 style={{ fontSize:22, fontWeight:700, color:'#1E1B18', marginBottom:6 }}>Restaurant not found</h1>
        <p style={{ color:'rgba(42,31,16,0.55)' }}>This page doesn't exist or the restaurant is inactive.</p>
      </div>
    </div>
  );

  return (
    <>
      <Head>
        <title>{restaurant.name} — AR Menu</title>
        <meta name="description" content={`Explore ${restaurant.name}'s menu in augmented reality`} />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; -webkit-tap-highlight-color:transparent; }
        html { scroll-behavior:smooth; }

        body {
          font-family: 'DM Sans', sans-serif;
          background: linear-gradient(160deg, #F2906A 0%, #E8745A 30%, #D96060 60%, #C080B8 100%);
          background-attachment: fixed;
          min-height: 100vh;
          overflow-x: hidden;
        }

        @keyframes float1  { 0%,100%{transform:translateY(0)rotate(0)}   50%{transform:translateY(-18px)rotate(4deg)} }
        @keyframes float2  { 0%,100%{transform:translateY(0)rotate(0)}   50%{transform:translateY(-10px)rotate(-5deg)} }
        @keyframes blink   { 0%,100%{opacity:1} 50%{opacity:0.25} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

        /* ── blobs ── */
        .blob { position:fixed; pointer-events:none; z-index:0; border-radius:50%; }

        /* ── HEADER ── */
        .hdr {
          position: sticky; top: 0; z-index: 50;
          background: rgba(250,238,218,0.85);
          backdrop-filter: blur(28px); -webkit-backdrop-filter: blur(28px);
          border-bottom: 1.5px solid rgba(230,185,110,0.4);
          box-shadow: 0 4px 28px rgba(100,40,10,0.13);
        }
        .hdr-inner { max-width: 720px; margin: 0 auto; padding: 0 18px; }

        .hdr-top {
          display: flex; align-items: center; gap: 14px;
          padding: 13px 0;
          border-bottom: 1px solid rgba(200,140,60,0.1);
        }
        .logo {
          width: 50px; height: 50px; border-radius: 18px; flex-shrink: 0;
          background: linear-gradient(135deg,#E05A3A,#F07050);
          display: flex; align-items: center; justify-content: center; font-size: 24px;
          box-shadow: 0 6px 20px rgba(224,90,58,0.4), inset 0 1px 0 rgba(255,255,255,0.25);
        }
        .rname { font-family:'Sora',sans-serif; font-weight:800; font-size:19px; color:#1A1008; line-height:1.1; }
        .rsub  { font-size:11px; color:rgba(42,31,16,0.42); margin-top:3px; font-weight:500; letter-spacing:0.02em; }

        .ar-pill {
          margin-left:auto; flex-shrink:0;
          display:flex; align-items:center; gap:7px;
          padding:9px 16px; border-radius:24px;
          background:rgba(224,90,58,0.14);
          border:1.5px solid rgba(224,90,58,0.32);
          font-size:12px; font-weight:700; color:#C04A28;
          letter-spacing:0.03em;
        }
        .ar-dot { width:7px; height:7px; border-radius:50%; background:#E05A3A; animation:blink 1.8s infinite; }

        /* ── CATEGORY TABS ── */
        .cats {
          display:flex; gap:8px;
          padding: 14px 0 16px;
          overflow-x: auto; scrollbar-width: none;
        }
        .cats::-webkit-scrollbar { display:none; }
        .cat {
          flex-shrink: 0;
          padding: 10px 22px; border-radius: 28px;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px; font-weight: 600;
          cursor: pointer; white-space: nowrap;
          border: 2px solid rgba(200,130,60,0.22);
          background: rgba(255,250,240,0.6);
          color: rgba(42,31,16,0.6);
          backdrop-filter: blur(10px);
          transition: all 0.2s cubic-bezier(0.34,1.56,0.64,1);
          box-shadow: 0 2px 8px rgba(100,40,10,0.06);
        }
        .cat:hover:not(.on) {
          background: rgba(255,250,240,0.85);
          border-color: rgba(200,130,60,0.38);
          transform: translateY(-1px);
        }
        .cat.on {
          background: linear-gradient(135deg,#E05A3A,#F07050);
          border-color: transparent; color:#fff; font-weight:800;
          box-shadow: 0 6px 22px rgba(224,90,58,0.42);
          transform: translateY(-2px);
        }

        /* ── MAIN ── */
        .main { max-width:720px; margin:0 auto; padding:20px 18px 100px; position:relative; z-index:1; }

        /* Offer banner */
        .offer-wrap {
          display:flex; align-items:center; gap:12px;
          padding:14px 18px; margin-bottom:18px;
          border-radius:18px;
          background: rgba(224,90,58,0.13);
          border: 1.5px solid rgba(224,90,58,0.28);
          backdrop-filter:blur(10px);
          animation: fadeUp 0.5s ease both;
        }
        .offer-emoji { font-size:26px; flex-shrink:0; }
        .offer-title { font-family:'Sora',sans-serif; font-weight:700; font-size:14px; color:#C04A28; }
        .offer-desc  { font-size:12px; color:rgba(42,31,16,0.55); margin-top:2px; }

        /* AR strip */
        .ar-strip {
          display:flex; align-items:center; gap:12px;
          padding:13px 18px; margin-bottom:22px;
          border-radius:16px;
          background:rgba(224,90,58,0.1);
          border:1.5px solid rgba(224,90,58,0.2);
          backdrop-filter:blur(8px);
          animation: fadeUp 0.5s 0.1s ease both;
        }
        .ar-strip-icon { font-size:22px; flex-shrink:0; }
        .ar-strip-t { font-size:13px; font-weight:700; color:#C04A28; }
        .ar-strip-s { font-size:11px; color:rgba(42,31,16,0.45); margin-top:2px; }

        /* ── GRID ── */
        .grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }

        /* ── CARD ── */
        .card {
          background: rgba(255,246,228,0.82);
          backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px);
          border:1.5px solid rgba(255,218,148,0.55);
          border-radius:22px; overflow:hidden;
          cursor:pointer; position:relative; text-align:left;
          transition:all 0.28s cubic-bezier(0.34,1.56,0.64,1);
          animation: fadeUp 0.4s ease both;
          box-shadow:0 6px 24px rgba(90,40,10,0.09), inset 0 1px 0 rgba(255,255,255,0.75);
        }
        .card:hover  { transform:translateY(-9px) scale(1.018); box-shadow:0 22px 52px rgba(90,40,10,0.18); }
        .card:active { transform:scale(0.97); }
        .card.ar-card   { border-color:rgba(224,90,58,0.38); }
        .card.feat-card { border-color:rgba(138,112,176,0.45); }

        /* Card image — full-width, 4:3 */
        .c-img { position:relative; overflow:hidden; width:100%; aspect-ratio:4/3; }
        .c-img img {
          width:100%; height:100%; object-fit:cover; display:block;
          transition:transform 0.35s ease;
        }
        .card:hover .c-img img { transform:scale(1.07); }
        .c-img-ph {
          width:100%; height:100%;
          display:flex; align-items:center; justify-content:center;
          font-size:52px;
          background:linear-gradient(160deg,rgba(255,232,195,0.9),rgba(255,208,155,0.7));
        }

        /* AR badge */
        .c-ar-badge {
          position:absolute; top:9px; right:9px;
          background:linear-gradient(135deg,#E05A3A,#F07050);
          color:#fff; font-size:10px; font-weight:800;
          padding:4px 10px; border-radius:10px;
          letter-spacing:0.05em;
          box-shadow:0 3px 12px rgba(224,90,58,0.5);
        }

        /* Veg indicator */
        .veg-ind {
          position:absolute; top:9px; left:9px;
          width:20px; height:20px; border-radius:5px; border:2.5px solid;
          background:rgba(255,246,228,0.92);
          display:flex; align-items:center; justify-content:center;
        }
        .veg-ind.v  { border-color:#2A8048; }
        .veg-ind.nv { border-color:#C03020; }
        .veg-ind.v::after  { content:''; width:9px; height:9px; border-radius:50%; background:#2A8048; }
        .veg-ind.nv::after { content:''; width:9px; height:9px; border-radius:50%; background:#C03020; }

        /* Offer ribbon at bottom of image */
        .c-ribbon {
          position:absolute; bottom:0; left:0; right:0;
          padding:6px 12px;
          font-size:11px; font-weight:800; color:#fff; text-align:center;
          letter-spacing:0.04em;
          text-shadow:0 1px 3px rgba(0,0,0,0.3);
        }

        /* Card body */
        .c-body { padding:13px 14px 15px; }
        .c-name {
          font-family:'Sora',sans-serif; font-weight:700; font-size:14px;
          color:#1A1008; line-height:1.25; margin-bottom:7px;
        }

        /* Badges */
        .c-badges { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px; }
        .cbadge { font-size:9px; font-weight:800; padding:3px 9px; border-radius:20px; letter-spacing:0.03em; }
        .cbadge-pop  { color:#E05A3A; background:rgba(224,90,58,0.1); border:1px solid rgba(224,90,58,0.28); }
        .cbadge-feat { color:#7A5AB0; background:rgba(138,112,176,0.1); border:1px solid rgba(138,112,176,0.3); }

        /* Price + meta row */
        .c-meta { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; margin-bottom:4px; }
        .c-price { font-family:'Sora',sans-serif; font-size:16px; font-weight:800; color:#C04A28; }
        .c-cal   { font-size:11px; color:rgba(42,31,16,0.38); font-weight:500; }
        .c-spice { font-size:11px; }
        .c-prep  { font-size:11px; color:rgba(42,31,16,0.45); font-weight:500; }

        /* AR CTA strip inside card */
        .c-ar-cta {
          display:flex; align-items:center; justify-content:center; gap:6px;
          margin-top:10px; padding:9px 12px; border-radius:13px;
          background:rgba(224,90,58,0.1);
          border:1.5px solid rgba(224,90,58,0.22);
          font-size:11px; font-weight:800; color:#C04A28;
          letter-spacing:0.05em; text-transform:uppercase;
        }

        /* Empty state */
        .empty { text-align:center; padding:70px 20px; color:rgba(42,31,16,0.4); }

        /* ── OVERLAY + SHEET ── */
        .overlay {
          position:fixed; inset:0; z-index:60;
          display:flex; align-items:flex-end; justify-content:center;
          background:rgba(20,8,3,0.6);
          backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);
          animation:fadeIn 0.22s ease;
        }
        .sheet {
          position:relative; width:100%; max-width:560px;
          background:rgba(255,246,228,0.97);
          backdrop-filter:blur(30px); -webkit-backdrop-filter:blur(30px);
          border:1.5px solid rgba(255,218,148,0.7);
          border-radius:32px 32px 0 0;
          max-height:94vh; overflow-y:auto;
          animation:slideUp 0.36s cubic-bezier(0.32,0.72,0,1);
          box-shadow:0 -20px 70px rgba(80,30,5,0.3), inset 0 1px 0 rgba(255,255,255,0.9);
        }
        .handle-row { display:flex; justify-content:center; padding:14px 0 0; }
        .handle     { width:42px; height:4px; border-radius:2px; background:rgba(160,100,40,0.2); }
        .close-btn  {
          position:absolute; top:13px; right:16px;
          width:36px; height:36px; border-radius:50%;
          background:rgba(255,228,190,0.8); border:1.5px solid rgba(200,140,70,0.3);
          color:rgba(100,55,20,0.6); cursor:pointer; font-size:15px;
          display:flex; align-items:center; justify-content:center;
          transition:all 0.15s;
        }
        .close-btn:hover { background:rgba(224,90,58,0.15); color:#C04A28; }

        /* Modal hero */
        .m-hero {
          margin:8px 16px 0;
          border-radius:22px; overflow:hidden;
          aspect-ratio:16/9; position:relative;
        }
        .m-hero img { width:100%; height:100%; object-fit:cover; display:block; }
        .m-hero-ph  { width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:72px; background:linear-gradient(160deg,rgba(255,230,190,0.8),rgba(255,205,150,0.5)); }

        /* Modal content */
        .sbody { padding:20px 22px 40px; }
        .m-title { font-family:'Sora',sans-serif; font-weight:800; font-size:26px; color:#1A1008; text-align:center; margin-bottom:12px; line-height:1.2; }

        .m-tags  { display:flex; justify-content:center; gap:8px; flex-wrap:wrap; margin-bottom:14px; }
        .tag-cat { padding:6px 15px; border-radius:22px; font-size:12px; font-weight:700; background:rgba(224,90,58,0.1); border:1.5px solid rgba(224,90,58,0.26); color:#C04A28; }
        .tag-v   { padding:6px 15px; border-radius:22px; font-size:12px; font-weight:700; background:rgba(42,128,72,0.1); border:1.5px solid rgba(42,128,72,0.26); color:#1A6A38; }
        .tag-nv  { padding:6px 15px; border-radius:22px; font-size:12px; font-weight:700; background:rgba(192,48,32,0.08); border:1.5px solid rgba(192,48,32,0.22); color:#8B2010; }
        .tag-pop { padding:6px 15px; border-radius:22px; font-size:12px; font-weight:700; background:rgba(224,90,58,0.1); border:1.5px solid rgba(224,90,58,0.25); color:#C04A28; }

        /* Pills row (prep + spice) */
        .m-pills { display:flex; justify-content:center; gap:8px; flex-wrap:wrap; margin-bottom:16px; }
        .m-pill  { display:flex; align-items:center; gap:6px; padding:7px 16px; border-radius:22px; font-size:12px; font-weight:600; background:rgba(255,232,195,0.8); border:1.5px solid rgba(200,148,72,0.32); color:rgba(42,31,16,0.7); }

        .m-price     { text-align:center; font-family:'Sora',sans-serif; font-size:38px; font-weight:800; color:#C04A28; }
        .m-price-sub { text-align:center; font-size:11px; color:rgba(42,31,16,0.38); margin-top:2px; margin-bottom:16px; font-weight:500; }
        .m-desc      { font-size:14px; color:rgba(42,31,16,0.6); line-height:1.75; text-align:center; margin-bottom:22px; }

        .divider { height:1px; background:rgba(200,145,70,0.18); margin:18px 0; }
        .sec-lbl { font-size:10px; font-weight:800; color:rgba(100,55,20,0.45); letter-spacing:0.12em; text-transform:uppercase; margin-bottom:13px; }

        /* Nutrition */
        .nutr { display:grid; grid-template-columns:repeat(4,1fr); gap:9px; margin-bottom:22px; }
        .nc   { background:rgba(255,235,205,0.85); border:1.5px solid rgba(255,212,145,0.6); border-radius:16px; padding:14px 8px; text-align:center; box-shadow:0 3px 10px rgba(120,70,20,0.07); }
        .nc-v { font-family:'Sora',sans-serif; font-size:20px; font-weight:800; color:#C04A28; }
        .nc-u { font-size:10px; color:rgba(100,55,20,0.42); margin-top:1px; }
        .nc-l { font-size:10px; color:rgba(42,31,16,0.55); margin-top:3px; font-weight:600; }

        /* Ingredients */
        .ings { display:flex; flex-wrap:wrap; gap:7px; margin-bottom:24px; }
        .ing  { padding:7px 15px; border-radius:22px; font-size:12px; color:rgba(42,31,16,0.65); background:rgba(255,235,205,0.85); border:1.5px solid rgba(200,148,72,0.28); font-weight:500; }

        /* AR button */
        .ar-btn {
          width:100%; padding:19px; border-radius:22px; border:none;
          background:linear-gradient(135deg,#E05A3A,#F07050);
          color:#fff; font-family:'Sora',sans-serif; font-weight:800; font-size:17px;
          cursor:pointer; display:flex; align-items:center; justify-content:center; gap:13px;
          box-shadow:0 12px 36px rgba(224,90,58,0.48);
          transition:transform 0.18s,box-shadow 0.18s;
          letter-spacing:0.01em;
        }
        .ar-btn:hover  { transform:translateY(-3px); box-shadow:0 18px 44px rgba(224,90,58,0.56); }
        .ar-btn:active { transform:scale(0.98); }
        .ar-hint { text-align:center; font-size:11px; color:rgba(100,55,20,0.4); margin-top:10px; font-weight:500; }
      `}</style>

      {/* Background blobs */}
      <div className="blob" style={{top:'-10%',right:'-8%',width:380,height:380,background:'rgba(255,255,255,0.1)',animation:'float1 9s ease-in-out infinite'}}/>
      <div className="blob" style={{top:'4%',right:'9%',width:200,height:200,background:'rgba(255,255,255,0.08)',animation:'float1 7s ease-in-out 0.8s infinite'}}/>
      <div className="blob" style={{top:'28%',left:'2%',width:220,height:220,background:'linear-gradient(135deg,rgba(196,181,212,0.3),rgba(175,155,215,0.2))',animation:'float2 10s ease-in-out 1s infinite'}}/>
      <div className="blob" style={{bottom:'22%',right:'1%',width:170,height:170,background:'linear-gradient(135deg,rgba(143,196,168,0.28),rgba(110,180,148,0.18))',animation:'float2 8s ease-in-out 0.3s infinite'}}/>
      <div className="blob" style={{bottom:'-18%',left:'-10%',width:460,height:460,background:'rgba(255,255,255,0.07)'}}/>

      {/* ── HEADER ── */}
      <header className="hdr">
        <div className="hdr-inner">
          <div className="hdr-top">
            <div className="logo">🍽️</div>
            <div>
              <div className="rname">{restaurant.name}</div>
              <div className="rsub">Tap a dish · See it in AR on your table</div>
            </div>
            {arCount > 0 && (
              <div className="ar-pill"><span className="ar-dot"/>AR Live</div>
            )}
          </div>
          <div className="cats">
            {cats.map(c => (
              <button key={c} className={`cat${activeCat===c?' on':''}`} onClick={()=>setActiveCat(c)}>{c}</button>
            ))}
          </div>
        </div>
      </header>

      <main className="main">

        {/* Offer banner */}
        {offers?.[0] && (
          <div className="offer-wrap">
            <span className="offer-emoji">🎉</span>
            <div>
              <div className="offer-title">{offers[0].title}</div>
              {offers[0].description && <div className="offer-desc">{offers[0].description}</div>}
            </div>
          </div>
        )}

        {/* AR strip */}
        {arCount > 0 && (
          <div className="ar-strip">
            <span className="ar-strip-icon">🥽</span>
            <div>
              <div className="ar-strip-t">{arCount} dish{arCount!==1?'es':''} you can view in AR</div>
              <div className="ar-strip-s">Tap a card → press "View in AR" — no app needed</div>
            </div>
          </div>
        )}

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="empty">
            <div style={{fontSize:52,marginBottom:14}}>🥢</div>
            <p style={{fontSize:15,fontWeight:600}}>No items in this category</p>
          </div>
        ) : (
          <div className="grid">
            {filtered.map((item, idx) => (
              <button
                key={item.id}
                className={`card${item.modelURL?' ar-card':''}${item.isFeatured?' feat-card':''}`}
                style={{animationDelay:`${idx*0.055}s`}}
                onClick={() => openItem(item)}>

                {/* Image */}
                <div className="c-img">
                  <img
                    src={imgSrc(item)} alt={item.name} loading="lazy"
                    onError={() => setImgErr(e=>({...e,[item.id]:true}))}
                  />
                  {item.modelURL && <span className="c-ar-badge">🥽 AR</span>}
                  {typeof item.isVeg === 'boolean' && <span className={`veg-ind ${item.isVeg?'v':'nv'}`}/>}
                  {item.offerBadge && item.offerLabel && (
                    <div className="c-ribbon" style={{background:item.offerColor||'#E05A3A'}}>🏷 {item.offerLabel}</div>
                  )}
                </div>

                {/* Body */}
                <div className="c-body">
                  <div className="c-name">{item.name}</div>

                  {(item.isPopular || item.isFeatured) && (
                    <div className="c-badges">
                      {item.isFeatured && <span className="cbadge cbadge-feat">⭐ Featured</span>}
                      {item.isPopular  && <span className="cbadge cbadge-pop">✦ Popular</span>}
                    </div>
                  )}

                  <div className="c-meta">
                    {item.price    && <span className="c-price">₹{item.price}</span>}
                    {item.calories && <span className="c-cal">{item.calories} kcal</span>}
                    {item.spiceLevel && item.spiceLevel!=='None' && <span className="c-spice">{SPICE[item.spiceLevel]}</span>}
                  </div>
                  {item.prepTime && <div className="c-prep">⏱ {item.prepTime}</div>}

                  {item.modelURL && (
                    <div className="c-ar-cta">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                      View in AR
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* ── MODAL ── */}
      {selectedItem && (
        <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)closeItem();}}>
          <div className="sheet">
            <div className="handle-row"><div className="handle"/></div>
            <button className="close-btn" onClick={closeItem}>✕</button>

            {!showAR && (
              <div className="m-hero">
                <img
                  src={imgSrc(selectedItem)} alt={selectedItem.name}
                  onError={()=>setImgErr(e=>({...e,[selectedItem.id]:true}))}
                />
                {selectedItem.offerBadge && selectedItem.offerLabel && (
                  <div style={{position:'absolute',bottom:0,left:0,right:0,padding:'8px 16px',background:selectedItem.offerColor||'#E05A3A',color:'#fff',fontSize:13,fontWeight:800,textAlign:'center',letterSpacing:'0.03em'}}>
                    🏷 {selectedItem.offerLabel}
                  </div>
                )}
              </div>
            )}

            <div className="sbody">
              <h2 className="m-title">{selectedItem.name}</h2>

              <div className="m-tags">
                {selectedItem.category && <span className="tag-cat">{selectedItem.category}</span>}
                {typeof selectedItem.isVeg === 'boolean' && (
                  <span className={selectedItem.isVeg?'tag-v':'tag-nv'}>{selectedItem.isVeg?'● Veg':'● Non-Veg'}</span>
                )}
                {selectedItem.isPopular && <span className="tag-pop">✦ Popular</span>}
              </div>

              {(selectedItem.prepTime || (selectedItem.spiceLevel && selectedItem.spiceLevel!=='None')) && (
                <div className="m-pills">
                  {selectedItem.prepTime && <span className="m-pill">⏱ Ready in {selectedItem.prepTime}</span>}
                  {selectedItem.spiceLevel && selectedItem.spiceLevel!=='None' && (
                    <span className="m-pill">{SPICE[selectedItem.spiceLevel]} {selectedItem.spiceLevel}</span>
                  )}
                </div>
              )}

              {selectedItem.price && (
                <>
                  <div className="m-price">₹{selectedItem.price}</div>
                  <div className="m-price-sub">per serving</div>
                </>
              )}
              {selectedItem.description && <p className="m-desc">{selectedItem.description}</p>}

              {(selectedItem.calories||selectedItem.protein||selectedItem.carbs||selectedItem.fats) && (
                <>
                  <div className="divider"/>
                  <div className="sec-lbl">Nutrition per serving</div>
                  <div className="nutr">
                    {[{l:'Calories',v:selectedItem.calories,u:'kcal'},{l:'Protein',v:selectedItem.protein,u:'g'},{l:'Carbs',v:selectedItem.carbs,u:'g'},{l:'Fats',v:selectedItem.fats,u:'g'}]
                      .filter(n=>n.v).map(n=>(
                      <div key={n.l} className="nc">
                        <div className="nc-v">{n.v}</div>
                        <div className="nc-u">{n.u}</div>
                        <div className="nc-l">{n.l}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {selectedItem.ingredients?.length > 0 && (
                <>
                  <div className="sec-lbl">Ingredients</div>
                  <div className="ings">
                    {selectedItem.ingredients.map(ing=><span key={ing} className="ing">{ing}</span>)}
                  </div>
                </>
              )}

              {!showAR && selectedItem.modelURL && (
                <>
                  <div className="divider"/>
                  <button className="ar-btn" onClick={()=>{setShowAR(true);handleARLaunch();}}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                    View in AR — Point at Your Table
                  </button>
                  <div className="ar-hint">No app needed · Android Chrome &amp; iOS Safari</div>
                </>
              )}

              {showAR && <ARViewerEmbed modelURL={selectedItem.modelURL} itemName={selectedItem.name} onARLaunch={handleARLaunch}/>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export async function getServerSideProps({ params }) {
  try {
    const restaurant = await getRestaurantBySubdomain(params.subdomain);
    if (!restaurant) return { props:{restaurant:null,menuItems:[],offers:[],error:'Not found'} };
    const [menuItems, offers] = await Promise.all([getMenuItems(restaurant.id), getActiveOffers(restaurant.id)]);
    return {
      props: {
        restaurant: JSON.parse(JSON.stringify(restaurant)),
        menuItems:  JSON.parse(JSON.stringify(menuItems)),
        offers:     JSON.parse(JSON.stringify(offers)),
        error: null,
      }
    };
  } catch (err) {
    return { props:{restaurant:null,menuItems:[],offers:[],error:err.message} };
  }
}
