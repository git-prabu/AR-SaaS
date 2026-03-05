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

export default function RestaurantMenu({ restaurant, menuItems, offers, error }) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedItem, setSelectedItem] = useState(null);
  const [showAR, setShowAR] = useState(false);

  useEffect(() => {
    if (restaurant?.id) trackVisit(restaurant.id, getSessionId()).catch(() => {});
  }, [restaurant?.id]);

  useEffect(() => {
    document.body.style.overflow = selectedItem ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [selectedItem]);

  const categories = ['All', ...new Set((menuItems || []).map(i => i.category).filter(Boolean))];
  const filtered = activeCategory === 'All' ? menuItems : menuItems.filter(i => i.category === activeCategory);
  const arCount = (menuItems || []).filter(i => i.modelURL).length;

  const openItem = useCallback(async (item) => {
    setSelectedItem(item); setShowAR(false);
    if (restaurant?.id) await incrementItemView(restaurant.id, item.id).catch(() => {});
  }, [restaurant?.id]);

  const closeItem = useCallback(() => { setSelectedItem(null); setShowAR(false); }, []);

  const handleARLaunch = useCallback(async () => {
    if (restaurant?.id && selectedItem?.id)
      await incrementARView(restaurant.id, selectedItem.id).catch(() => {});
  }, [restaurant?.id, selectedItem?.id]);

  if (error || !restaurant) return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(145deg,#F5A876,#F0906A,#C8A8D8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter,sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 14 }}>🍽️</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E1B18', marginBottom: 6 }}>Restaurant not found</h1>
        <p style={{ color: 'rgba(42,31,16,0.55)' }}>This page doesn't exist or the restaurant is inactive.</p>
      </div>
    </div>
  );

  return (
    <>
      <Head>
        <title>{restaurant.name} — AR Menu</title>
        <meta name="description" content={`View ${restaurant.name}'s menu in augmented reality`} />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }

        body {
          background: linear-gradient(145deg, #F5A876 0%, #F0906A 45%, #C8A8D8 100%);
          background-attachment: fixed;
          overflow-x: hidden;
          min-height: 100vh;
        }

        /* Floating clay decorations — fixed */
        .clay { position: fixed; pointer-events: none; z-index: 0; }
        @keyframes float  { 0%,100%{ transform:translateY(0) }       50%{ transform:translateY(-11px) } }
        @keyframes floatR { 0%,100%{ transform:translateY(0) rotate(0deg) } 50%{ transform:translateY(-8px) rotate(7deg) } }
        @keyframes fadeIn  { from{ opacity:0 } to{ opacity:1 } }
        @keyframes slideUp { from{ transform:translateY(100%) } to{ transform:translateY(0) } }
        @keyframes cardIn  { from{ opacity:0; transform:translateY(18px) } to{ opacity:1; transform:translateY(0) } }
        @keyframes blink   { 0%,100%{ opacity:1 } 50%{ opacity:0.35 } }

        /* Floating pill header */
        .hdr {
          position: sticky; top: 10px; z-index: 40;
          margin: 10px 12px 0;
          background: rgba(255,245,225,0.78);
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          border: 1.5px solid rgba(255,215,155,0.6);
          border-radius: 26px;
          padding: 14px 16px 0;
          box-shadow: 0 8px 32px rgba(120,70,30,0.14), inset 0 1px 0 rgba(255,255,255,0.7);
        }
        .hdr-inner { max-width: 660px; margin: 0 auto; }
        .hdr-top   { display:flex; align-items:center; gap:12px; padding-bottom:14px; }

        /* Logo box — coral gradient like the reference CTA button */
        .logo-box {
          width: 46px; height: 46px; border-radius: 16px;
          background: linear-gradient(135deg, #E05A3A, #F07050);
          display: flex; align-items: center; justify-content: center;
          font-size: 20px; flex-shrink: 0;
          box-shadow: 0 6px 20px rgba(224,90,58,0.35);
        }
        .rname { font-family: Poppins,sans-serif; font-weight: 800; font-size: 17px; color: #1E1B18; }
        .rsub  { font-size: 11px; color: rgba(42,31,16,0.45); margin-top: 2px; }

        .ar-live {
          margin-left: auto; display:flex; align-items:center; gap:6px;
          padding: 6px 13px; border-radius: 20px;
          background: rgba(224,90,58,0.12); border: 1.5px solid rgba(224,90,58,0.28);
          font-size: 11px; font-weight: 700; color: #C04A28; white-space: nowrap; flex-shrink: 0;
        }
        .ar-dot { width:6px; height:6px; border-radius:50%; background:#E05A3A; animation: blink 2s infinite; }

        /* Category pills */
        .cats { display:flex; gap:8px; overflow-x:auto; padding-bottom:14px; scrollbar-width:none; }
        .cats::-webkit-scrollbar { display:none; }
        .cat {
          flex-shrink:0; padding:7px 16px; border-radius:20px;
          font-size:13px; font-weight:500;
          border: 1.5px solid rgba(200,140,80,0.3);
          background: rgba(255,255,255,0.45);
          color: rgba(42,31,16,0.6); cursor:pointer;
          font-family: Inter,sans-serif; transition: all 0.16s;
          box-shadow: 0 2px 8px rgba(120,70,30,0.07);
          backdrop-filter: blur(8px);
        }
        .cat.on {
          background: linear-gradient(135deg,#E05A3A,#F07050);
          border-color: transparent; color: #fff; font-weight: 700;
          box-shadow: 0 4px 16px rgba(224,90,58,0.35);
        }

        /* Main */
        .main { max-width: 680px; margin: 0 auto; padding: 18px 14px 70px; position: relative; z-index: 1; }

        /* AR strip */
        .ar-strip {
          display:flex; align-items:center; gap:8px;
          padding: 11px 14px; margin-bottom: 18px;
          background: rgba(224,90,58,0.1);
          border: 1.5px solid rgba(224,90,58,0.22); border-radius: 14px;
          font-size: 12px; color: #C04A28; font-weight: 600;
          backdrop-filter: blur(8px);
          box-shadow: 0 2px 8px rgba(120,70,30,0.06);
        }

        /* Grid */
        .grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }

        /* --- CARD --- clay style, circular food image like reference */
        .card {
          background: rgba(255,245,225,0.72);
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
          border: 1.5px solid rgba(255,215,155,0.55);
          border-radius: 22px; overflow: hidden;
          cursor: pointer; text-align: left; position: relative;
          transition: all 0.24s cubic-bezier(0.34,1.56,0.64,1);
          animation: cardIn 0.4s ease forwards;
          box-shadow: 0 6px 22px rgba(120,70,30,0.1), inset 0 1px 0 rgba(255,255,255,0.65);
        }
        .card:hover {
          transform: translateY(-6px) scale(1.02);
          box-shadow: 0 18px 44px rgba(120,70,30,0.18);
        }
        .card:active { transform: scale(0.97); }
        .card.ar-card { border-color: rgba(224,90,58,0.35); box-shadow: 0 6px 22px rgba(120,70,30,0.1), 0 0 0 1px rgba(224,90,58,0.1) inset; }

        /* Circular image — centrepiece of each card */
        .img-wrap  { display:flex; justify-content:center; padding:16px 16px 0; }
        .img-circ  {
          width: 100px; height: 100px; border-radius: 50%; overflow: hidden;
          background: rgba(255,230,190,0.6);
          border: 3px solid rgba(255,215,155,0.7);
          box-shadow: 0 8px 26px rgba(120,70,30,0.15);
          flex-shrink: 0;
        }
        .img-circ img  { width:100%; height:100%; object-fit:cover; display:block; }
        .img-circ .noimg { width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:34px; }
        .card.ar-card .img-circ { border-color: rgba(224,90,58,0.4); box-shadow: 0 8px 26px rgba(120,70,30,0.15), 0 0 16px rgba(224,90,58,0.12); }

        .ar-badge {
          position:absolute; top:10px; right:10px;
          background: linear-gradient(135deg,#E05A3A,#F07050);
          color:#fff; font-size:9px; font-weight:800; padding:3px 9px;
          border-radius:9px; letter-spacing:0.05em; text-transform:uppercase;
          box-shadow: 0 2px 8px rgba(224,90,58,0.4);
        }
        .veg-dot { position:absolute; top:10px; left:10px; width:16px; height:16px; border-radius:4px; border:2px solid; display:flex; align-items:center; justify-content:center; background:rgba(255,245,220,0.8); }
        .veg-dot.v  { border-color:#3A6A48; } .veg-dot.v::after  { content:''; width:7px; height:7px; border-radius:50%; background:#3A6A48; }
        .veg-dot.nv { border-color:#C03020; } .veg-dot.nv::after { content:''; width:7px; height:7px; border-radius:50%; background:#C03020; }

        .card-body  { padding:11px 13px 14px; text-align:center; }
        .card-name  { font-family:Poppins,sans-serif; font-weight:700; font-size:13px; line-height:1.25; color:#1E1B18; margin-bottom:5px; }
        .card-row   { display:flex; align-items:center; justify-content:center; gap:8px; }
        .card-cal   { font-size:11px; color:rgba(42,31,16,0.4); }
        .card-price { font-family:Poppins,sans-serif; font-size:13px; font-weight:700; color:#C04A28; }
        .card-ar-lbl { font-size:10px; color:#C04A28; font-weight:700; display:flex; align-items:center; justify-content:center; gap:3px; margin-top:6px; letter-spacing:0.04em; text-transform:uppercase; }

        .empty { text-align:center; padding:60px 20px; color:rgba(42,31,16,0.4); }

        /* ---- MODAL ---- */
        .overlay {
          position:fixed; inset:0; z-index:50;
          display:flex; align-items:flex-end; justify-content:center;
          background: rgba(42,20,10,0.45);
          backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
          animation: fadeIn 0.2s ease;
        }
        .sheet {
          position:relative; width:100%; max-width:520px;
          background: rgba(255,245,225,0.95);
          backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
          border: 1.5px solid rgba(255,215,155,0.7);
          border-top: 1.5px solid rgba(255,230,180,0.9);
          border-radius: 32px 32px 0 0;
          overflow-y: auto; max-height: 93vh;
          animation: slideUp 0.34s cubic-bezier(0.32,0.72,0,1);
          box-shadow: 0 -12px 60px rgba(120,70,30,0.2), inset 0 1px 0 rgba(255,255,255,0.8);
        }
        .handle-row { display:flex; justify-content:center; padding:14px 0 4px; }
        .handle { width:36px; height:4px; border-radius:2px; background:rgba(180,120,60,0.25); }
        .close-btn {
          position:absolute; top:14px; right:16px; width:32px; height:32px; border-radius:50%;
          background:rgba(255,230,190,0.7); border:1.5px solid rgba(200,140,80,0.3);
          color:rgba(100,60,30,0.6); cursor:pointer; display:flex; align-items:center;
          justify-content:center; font-size:14px; transition:all 0.15s;
        }
        .close-btn:hover { background:rgba(224,90,58,0.12); color:#C04A28; }
        .sbody { padding:2px 20px 36px; }

        /* Modal hero — large circular image */
        .m-hero { display:flex; justify-content:center; padding:8px 0 20px; }
        .m-img {
          width:160px; height:160px; border-radius:50%; overflow:hidden;
          background:rgba(255,230,190,0.6);
          border: 4px solid rgba(255,215,155,0.7);
          box-shadow: 0 14px 40px rgba(120,70,30,0.2), 0 0 0 8px rgba(255,240,200,0.3);
        }
        .m-img img  { width:100%; height:100%; object-fit:cover; }
        .m-img .noimg { width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:64px; }

        .m-title { font-family:Poppins,sans-serif; font-weight:800; font-size:24px; line-height:1.15; text-align:center; color:#1E1B18; margin-bottom:10px; }
        .m-tags  { display:flex; justify-content:center; gap:8px; flex-wrap:wrap; margin-bottom:16px; }
        .tag-cat { padding:5px 13px; border-radius:20px; font-size:12px; font-weight:600; background:rgba(224,90,58,0.1); border:1.5px solid rgba(224,90,58,0.25); color:#C04A28; }
        .tag-veg { padding:5px 13px; border-radius:20px; font-size:12px; font-weight:600; }
        .tag-veg.v  { background:rgba(58,106,72,0.1);  border:1.5px solid rgba(58,106,72,0.25);  color:#2A5A38; }
        .tag-veg.nv { background:rgba(192,48,32,0.08); border:1.5px solid rgba(192,48,32,0.2);   color:#8B2010; }

        .m-price { text-align:center; font-family:Poppins,sans-serif; font-size:34px; font-weight:800; color:#C04A28; margin-bottom:4px; }
        .m-price-sub { text-align:center; font-size:11px; color:rgba(42,31,16,0.4); margin-bottom:18px; }
        .m-desc { font-size:14px; color:rgba(42,31,16,0.55); line-height:1.7; margin-bottom:20px; text-align:center; }

        .divider  { height:1px; background:rgba(200,140,80,0.2); margin:18px 0; }
        .sec-lbl  { font-size:10px; font-weight:700; color:rgba(100,60,30,0.5); letter-spacing:0.1em; text-transform:uppercase; margin-bottom:11px; }

        /* Nutrition cards — warm clay style */
        .nutr { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:20px; }
        .nc {
          background: rgba(255,240,210,0.7);
          border: 1.5px solid rgba(255,215,155,0.5); border-radius:14px; padding:12px 7px;
          text-align:center; box-shadow: 0 3px 10px rgba(120,70,30,0.08);
        }
        .nc-val  { font-family:Poppins,sans-serif; font-size:18px; font-weight:800; color:#C04A28; }
        .nc-unit { font-size:10px; color:rgba(100,60,30,0.45); margin-top:1px; }
        .nc-lbl  { font-size:10px; color:rgba(42,31,16,0.55); margin-top:2px; }

        .ings { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:22px; }
        .ing  {
          padding:6px 12px; border-radius:20px; font-size:12px;
          color:rgba(42,31,16,0.6); background:rgba(255,240,210,0.7);
          border:1.5px solid rgba(200,150,80,0.3);
        }

        /* AR button — coral pill like the reference */
        .ar-btn {
          width:100%; padding:16px; border-radius:50px; border:none;
          background: linear-gradient(135deg,#E05A3A,#F07050);
          color:#fff; font-family:Poppins,sans-serif; font-weight:700; font-size:16px;
          cursor:pointer; display:flex; align-items:center; justify-content:center; gap:10px;
          box-shadow: 0 8px 28px rgba(224,90,58,0.4);
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .ar-btn:active { transform:scale(0.98); }
        .ar-hint { text-align:center; font-size:11px; color:rgba(100,60,30,0.4); margin-top:8px; }
      `}</style>

      {/* Clay floating decorations */}
      <div className="clay float" style={{ top:'8%', right:'4%', width:72, height:72, borderRadius:'50%', background:'rgba(255,255,255,0.55)', boxShadow:'0 10px 28px rgba(180,120,60,0.12)' }}/>
      <div className="clay float" style={{ top:'7%', right:'10%', width:44, height:44, borderRadius:'50%', background:'rgba(255,255,255,0.4)', animationDelay:'0.6s' }}/>
      <div className="clay" style={{ top:'38%', left:'2%', width:52, height:52, borderRadius:'50%', background:'linear-gradient(135deg,#C4B5D4,#D8CCEA)', boxShadow:'0 8px 20px rgba(120,80,160,0.15)', animation:'float 7s ease-in-out 1s infinite' }}/>
      <div className="clay" style={{ bottom:'25%', right:'3%', width:44, height:44, borderRadius:14, background:'linear-gradient(135deg,#8FC4A8,#AAD8BE)', boxShadow:'0 6px 16px rgba(60,120,80,0.18)', animation:'floatR 6s ease-in-out 0.5s infinite' }}/>
      <div className="clay" style={{ bottom:'-18%', left:'-6%', width:400, height:400, borderRadius:'50%', background:'rgba(255,255,255,0.1)', pointerEvents:'none' }}/>

      {/* Offer banner */}
      {offers?.[0] && (
        <div style={{ background:'linear-gradient(90deg,#E05A3A,#F07050)', padding:'10px 20px', textAlign:'center', fontSize:13, fontWeight:700, color:'#fff', position:'relative', zIndex:10 }}>
          🎉 {offers[0].title} — {offers[0].description}
        </div>
      )}

      {/* Floating glass header */}
      <header className="hdr">
        <div className="hdr-inner">
          <div className="hdr-top">
            <div className="logo-box">🍽️</div>
            <div>
              <div className="rname">{restaurant.name}</div>
              <div className="rsub">Tap any dish to view in AR</div>
            </div>
            <div className="ar-live"><span className="ar-dot"/>AR Live</div>
          </div>
          <div className="cats">
            {categories.map(cat => (
              <button key={cat} className={`cat${activeCategory === cat ? ' on' : ''}`} onClick={() => setActiveCategory(cat)}>{cat}</button>
            ))}
          </div>
        </div>
      </header>

      <main className="main">
        {arCount > 0 && (
          <div className="ar-strip">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            {arCount} dish{arCount !== 1 ? 'es' : ''} in AR — tap a card to see it on your table
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="empty"><div style={{ fontSize:44, marginBottom:10 }}>🥢</div><p>No items in this category</p></div>
        ) : (
          <div className="grid">
            {filtered.map((item, idx) => (
              <button key={item.id} className={`card${item.modelURL ? ' ar-card' : ''}`}
                style={{ animationDelay:`${idx * 0.06}s` }}
                onClick={() => openItem(item)}>
                {item.modelURL && <span className="ar-badge">AR</span>}
                {typeof item.isVeg === 'boolean' && <span className={`veg-dot ${item.isVeg ? 'v' : 'nv'}`}/>}
                <div className="img-wrap">
                  <div className="img-circ">
                    {item.imageURL
                      ? <img src={item.imageURL} alt={item.name} loading="lazy"/>
                      : <div className="noimg">🍽️</div>}
                  </div>
                </div>
                <div className="card-body">
                  <div className="card-name">{item.name}</div>
                  <div className="card-row">
                    {item.calories && <span className="card-cal">{item.calories} kcal</span>}
                    {item.price    && <span className="card-price">₹{item.price}</span>}
                  </div>
                  {item.modelURL && (
                    <div className="card-ar-lbl">
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                      View in AR
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* MODAL */}
      {selectedItem && (
        <div className="overlay" onClick={e => { if (e.target === e.currentTarget) closeItem(); }}>
          <div className="sheet">
            <div className="handle-row"><div className="handle"/></div>
            <button className="close-btn" onClick={closeItem}>✕</button>
            <div className="sbody">
              {!showAR && (
                <div className="m-hero">
                  <div className="m-img">
                    {selectedItem.imageURL
                      ? <img src={selectedItem.imageURL} alt={selectedItem.name}/>
                      : <div className="noimg">🍽️</div>}
                  </div>
                </div>
              )}

              <h2 className="m-title">{selectedItem.name}</h2>
              <div className="m-tags">
                {selectedItem.category && <span className="tag-cat">{selectedItem.category}</span>}
                {typeof selectedItem.isVeg === 'boolean' && (
                  <span className={`tag-veg ${selectedItem.isVeg ? 'v' : 'nv'}`}>{selectedItem.isVeg ? '● Veg' : '● Non-Veg'}</span>
                )}
              </div>
              {selectedItem.price && <><div className="m-price">₹{selectedItem.price}</div><div className="m-price-sub">per serving</div></>}
              {selectedItem.description && <p className="m-desc">{selectedItem.description}</p>}

              {(selectedItem.calories || selectedItem.protein || selectedItem.carbs || selectedItem.fats) && (<>
                <div className="sec-lbl">Nutrition per serving</div>
                <div className="nutr">
                  {[{ l:'Calories', v:selectedItem.calories, u:'kcal' }, { l:'Protein', v:selectedItem.protein, u:'g' }, { l:'Carbs', v:selectedItem.carbs, u:'g' }, { l:'Fats', v:selectedItem.fats, u:'g' }]
                    .filter(n => n.v).map(n => (
                    <div key={n.l} className="nc">
                      <div className="nc-val">{n.v}</div>
                      <div className="nc-unit">{n.u}</div>
                      <div className="nc-lbl">{n.l}</div>
                    </div>
                  ))}
                </div>
              </>)}

              {selectedItem.ingredients?.length > 0 && (<>
                <div className="sec-lbl">Ingredients</div>
                <div className="ings">{selectedItem.ingredients.map(ing => <span key={ing} className="ing">{ing}</span>)}</div>
              </>)}

              {!showAR && selectedItem.modelURL && (<>
                <div className="divider"/>
                <button className="ar-btn" onClick={() => { setShowAR(true); handleARLaunch(); }}>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                  View in AR — Point at Your Table
                </button>
                <div className="ar-hint">No app needed · Android Chrome &amp; iOS Safari</div>
              </>)}

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
    if (!restaurant) return { props: { restaurant: null, menuItems: [], offers: [], error: 'Not found' } };
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
    return { props: { restaurant: null, menuItems: [], offers: [], error: err.message } };
  }
}
