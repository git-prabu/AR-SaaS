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

  const categories = ['All', ...new Set((menuItems||[]).map(i=>i.category).filter(Boolean))];
  const filtered = activeCategory === 'All' ? menuItems : menuItems.filter(i=>i.category===activeCategory);
  const arCount = (menuItems||[]).filter(i=>i.modelURL).length;

  const openItem = useCallback(async (item) => {
    setSelectedItem(item); setShowAR(false);
    if (restaurant?.id) await incrementItemView(restaurant.id, item.id).catch(()=>{});
  }, [restaurant?.id]);

  const closeItem = useCallback(() => { setSelectedItem(null); setShowAR(false); }, []);

  const handleARLaunch = useCallback(async () => {
    if (restaurant?.id && selectedItem?.id)
      await incrementARView(restaurant.id, selectedItem.id).catch(()=>{});
  }, [restaurant?.id, selectedItem?.id]);

  if (error || !restaurant) return (
    <div style={{minHeight:'100vh',background:'#F5F4F0',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Inter,sans-serif'}}>
      <div style={{textAlign:'center'}}><div style={{fontSize:56,marginBottom:14}}>🍽️</div>
        <h1 style={{fontSize:22,fontWeight:700,color:'#1C1917',marginBottom:6}}>Restaurant not found</h1>
        <p style={{color:'#6B6460'}}>This page doesn't exist or the restaurant is inactive.</p>
      </div>
    </div>
  );

  return (
    <>
      <Head>
        <title>{restaurant.name} — AR Menu</title>
        <meta name="description" content={`View ${restaurant.name}'s menu in augmented reality`} />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
        body{background:#F5F4F0;overflow-x:hidden}

        .page{min-height:100vh;background:#F5F4F0;font-family:'Inter',sans-serif;color:#1C1917;}

        /* Offer banner */
        .offer{background:linear-gradient(90deg,#FF6B35,#FFB347);padding:10px 20px;text-align:center;font-size:13px;font-weight:600;color:#fff;}

        /* Header */
        .hdr{position:sticky;top:0;z-index:40;background:rgba(245,244,240,0.92);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-bottom:1px solid #E2DED8;padding:16px 18px 0;}
        .hdr-inner{max-width:680px;margin:0 auto;}
        .hdr-top{display:flex;align-items:center;gap:12px;padding-bottom:14px;}
        .logo-box{width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#FF6B35,#FFB347);display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 4px 14px rgba(255,107,53,0.3);flex-shrink:0;}
        .resto-name{font-family:'"Plus Jakarta Sans"',sans-serif;font-weight:800;font-size:18px;color:#1C1917;}
        .resto-sub{font-size:12px;color:#A09890;margin-top:2px;}
        .ar-badge{margin-left:auto;display:flex;align-items:center;gap:6px;padding:6px 13px;border-radius:20px;background:rgba(255,107,53,0.08);border:1px solid rgba(255,107,53,0.2);font-size:11px;font-weight:700;color:#FF6B35;white-space:nowrap;flex-shrink:0;}
        .ar-dot{width:6px;height:6px;border-radius:50%;background:#FF6B35;animation:blink 2s infinite;}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}

        /* Cats */
        .cats{display:flex;gap:8px;overflow-x:auto;padding-bottom:14px;scrollbar-width:none;}
        .cats::-webkit-scrollbar{display:none}
        .cat{flex-shrink:0;padding:7px 16px;border-radius:20px;font-size:13px;font-weight:500;border:1.5px solid #E2DED8;background:#fff;color:#6B6460;cursor:pointer;font-family:'Inter',sans-serif;transition:all 0.15s;box-shadow:0 1px 4px rgba(0,0,0,0.04);}
        .cat.on{background:#FF6B35;border-color:#FF6B35;color:#fff;font-weight:700;box-shadow:0 4px 14px rgba(255,107,53,0.3);}

        /* Main */
        .main{max-width:680px;margin:0 auto;padding:20px 16px 60px;}

        /* AR strip */
        .ar-strip{display:flex;align-items:center;gap:8px;padding:11px 14px;margin-bottom:20px;background:#fff;border:1px solid rgba(255,107,53,0.15);border-radius:12px;font-size:12px;color:#FF6B35;font-weight:500;box-shadow:0 2px 8px rgba(255,107,53,0.06);}

        /* Grid */
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}

        /* Card — like Image 1: white card, circular food image */
        .card{background:#fff;border:1.5px solid #E2DED8;border-radius:20px;overflow:hidden;cursor:pointer;text-align:left;transition:all 0.2s;box-shadow:0 2px 8px rgba(0,0,0,0.05);position:relative;}
        .card:active{transform:scale(0.97);}
        .card:hover{border-color:rgba(255,107,53,0.25);box-shadow:0 6px 24px rgba(0,0,0,0.10);transform:translateY(-2px);}
        .card.ar-card{border-color:rgba(255,107,53,0.2);}

        /* Circular image like Image 1 */
        .img-wrap{display:flex;justify-content:center;padding:16px 16px 0;}
        .img-circle{width:100px;height:100px;border-radius:50%;overflow:hidden;background:#F5F4F0;box-shadow:0 6px 20px rgba(0,0,0,0.1);flex-shrink:0;border:3px solid #fff;}
        .img-circle img{width:100%;height:100%;object-fit:cover;display:block;}
        .img-circle .noimg{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:34px;background:linear-gradient(135deg,#FFF0E8,#FFF8EE);}

        /* AR badge */
        .badge-ar{position:absolute;top:10px;right:10px;background:linear-gradient(135deg,#FF6B35,#FFB347);color:#fff;font-size:9px;font-weight:800;padding:3px 8px;border-radius:8px;letter-spacing:0.05em;text-transform:uppercase;box-shadow:0 2px 8px rgba(255,107,53,0.35);}

        /* Veg */
        .veg-dot{position:absolute;top:10px;left:10px;width:16px;height:16px;border-radius:4px;border:2px solid;display:flex;align-items:center;justify-content:center;background:#fff;}
        .veg-dot.v{border-color:#16A34A;}
        .veg-dot.v::after{content:'';width:7px;height:7px;border-radius:50%;background:#16A34A;}
        .veg-dot.nv{border-color:#DC2626;}
        .veg-dot.nv::after{content:'';width:7px;height:7px;border-radius:50%;background:#DC2626;}

        .card-body{padding:12px 14px 14px;text-align:center;}
        .card-name{font-family:'"Plus Jakarta Sans"',sans-serif;font-weight:700;font-size:13px;line-height:1.25;color:#1C1917;margin-bottom:5px;}
        .card-row{display:flex;align-items:center;justify-content:center;gap:8px;}
        .card-cal{font-size:11px;color:#A09890;}
        .card-price{font-family:'"Plus Jakarta Sans"',sans-serif;font-size:13px;font-weight:700;color:#FF6B35;}
        .card-ar-lbl{font-size:10px;color:#FF6B35;font-weight:600;display:flex;align-items:center;justify-content:center;gap:3px;margin-top:6px;letter-spacing:0.03em;text-transform:uppercase;}

        /* Empty */
        .empty{text-align:center;padding:60px 20px;color:#A09890;}

        /* MODAL */
        .overlay{position:fixed;inset:0;z-index:50;display:flex;align-items:flex-end;justify-content:center;background:rgba(28,25,23,0.5);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:fin 0.2s ease;}
        @keyframes fin{from{opacity:0}to{opacity:1}}
        .sheet{position:relative;width:100%;max-width:520px;background:#F5F4F0;border-radius:28px 28px 0 0;overflow-y:auto;max-height:93vh;animation:sup 0.32s cubic-bezier(0.32,0.72,0,1);}
        @keyframes sup{from{transform:translateY(100%)}to{transform:translateY(0)}}
        .handle-row{display:flex;justify-content:center;padding:14px 0 4px;}
        .handle{width:36px;height:4px;border-radius:2px;background:#D0CBC4;}
        .close-btn{position:absolute;top:14px;right:16px;width:32px;height:32px;border-radius:50%;background:#fff;border:1.5px solid #E2DED8;color:#6B6460;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.07);}
        .sbody{padding:2px 20px 36px;}

        /* Modal hero — large circle like Image 1 */
        .m-hero{display:flex;justify-content:center;padding:8px 0 20px;}
        .m-img{width:160px;height:160px;border-radius:50%;overflow:hidden;background:#fff;border:4px solid #fff;box-shadow:0 12px 40px rgba(0,0,0,0.12);}
        .m-img img{width:100%;height:100%;object-fit:cover;}
        .m-img .noimg{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:64px;background:linear-gradient(135deg,#FFF0E8,#FFF8EE);}

        .m-title{font-family:'"Plus Jakarta Sans"',sans-serif;font-weight:800;font-size:26px;line-height:1.15;text-align:center;color:#1C1917;margin-bottom:10px;}
        .m-tags{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-bottom:16px;}
        .tag-cat{padding:5px 13px;border-radius:20px;font-size:12px;font-weight:600;background:rgba(255,107,53,0.08);border:1px solid rgba(255,107,53,0.18);color:#FF6B35;}
        .tag-veg{padding:5px 13px;border-radius:20px;font-size:12px;font-weight:600;}
        .tag-veg.v{background:#DCFCE7;border:1px solid #BBF7D0;color:#16A34A;}
        .tag-veg.nv{background:#FEE2E2;border:1px solid #FECACA;color:#DC2626;}

        .m-price{text-align:center;font-family:'"Plus Jakarta Sans"',sans-serif;font-size:32px;font-weight:800;color:#FF6B35;margin-bottom:4px;}
        .m-price-sub{text-align:center;font-size:11px;color:#A09890;margin-bottom:18px;}
        .m-desc{font-size:14px;color:#6B6460;line-height:1.65;margin-bottom:20px;text-align:center;}
        .div{height:1px;background:#E2DED8;margin:18px 0;}
        .sec-lbl{font-size:10px;font-weight:700;color:#A09890;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:10px;}

        /* Nutrition — white cards */
        .nutr{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px;}
        .nc{background:#fff;border:1.5px solid #E2DED8;border-radius:14px;padding:12px 8px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.04);}
        .nc-val{font-family:'"Plus Jakarta Sans"',sans-serif;font-size:18px;font-weight:800;color:#FF6B35;}
        .nc-unit{font-size:10px;color:#A09890;margin-top:1px;}
        .nc-lbl{font-size:10px;color:#6B6460;margin-top:2px;}

        /* Ingredients */
        .ings{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:22px;}
        .ing{padding:6px 12px;border-radius:20px;font-size:12px;color:#6B6460;background:#fff;border:1.5px solid #E2DED8;}

        /* AR button */
        .ar-btn{width:100%;padding:16px;border-radius:16px;border:none;background:linear-gradient(135deg,#FF6B35,#FFB347);color:#fff;font-family:'"Plus Jakarta Sans"',sans-serif;font-weight:700;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:0 6px 24px rgba(255,107,53,0.35);transition:transform 0.15s;}
        .ar-btn:active{transform:scale(0.98);}
        .ar-hint{text-align:center;font-size:11px;color:#A09890;margin-top:8px;}
      `}</style>

      <div className="page">
        {offers?.[0] && <div className="offer">🎉 {offers[0].title} — {offers[0].description}</div>}

        <header className="hdr">
          <div className="hdr-inner">
            <div className="hdr-top">
              <div className="logo-box">🍽️</div>
              <div>
                <div className="resto-name">{restaurant.name}</div>
                <div className="resto-sub">Tap any item to view in AR</div>
              </div>
              <div className="ar-badge"><span className="ar-dot"/>AR Enabled</div>
            </div>
            <div className="cats">
              {categories.map(cat=>(
                <button key={cat} className={`cat${activeCategory===cat?' on':''}`} onClick={()=>setActiveCategory(cat)}>{cat}</button>
              ))}
            </div>
          </div>
        </header>

        <main className="main">
          {arCount>0 && (
            <div className="ar-strip">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              {arCount} dish{arCount!==1?'es':''} available in AR — tap to view in your space
            </div>
          )}
          {filtered.length===0 ? (
            <div className="empty"><div style={{fontSize:44,marginBottom:10}}>🥢</div><p>No items in this category</p></div>
          ) : (
            <div className="grid">
              {filtered.map(item=>(
                <button key={item.id} className={`card${item.modelURL?' ar-card':''}`} onClick={()=>openItem(item)}>
                  {item.modelURL && <span className="badge-ar">AR</span>}
                  {typeof item.isVeg==='boolean' && <span className={`veg-dot ${item.isVeg?'v':'nv'}`}/>}
                  <div className="img-wrap">
                    <div className="img-circle">
                      {item.imageURL ? <img src={item.imageURL} alt={item.name} loading="lazy"/> : <div className="noimg">🍽️</div>}
                    </div>
                  </div>
                  <div className="card-body">
                    <div className="card-name">{item.name}</div>
                    <div className="card-row">
                      {item.calories && <span className="card-cal">{item.calories} kcal</span>}
                      {item.price && <span className="card-price">₹{item.price}</span>}
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

        {selectedItem && (
          <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)closeItem();}}>
            <div className="sheet">
              <div className="handle-row"><div className="handle"/></div>
              <button className="close-btn" onClick={closeItem}>✕</button>
              <div className="sbody">
                {!showAR && (
                  <div className="m-hero">
                    <div className="m-img">
                      {selectedItem.imageURL ? <img src={selectedItem.imageURL} alt={selectedItem.name}/> : <div className="noimg">🍽️</div>}
                    </div>
                  </div>
                )}
                <h2 className="m-title">{selectedItem.name}</h2>
                <div className="m-tags">
                  {selectedItem.category && <span className="tag-cat">{selectedItem.category}</span>}
                  {typeof selectedItem.isVeg==='boolean' && <span className={`tag-veg ${selectedItem.isVeg?'v':'nv'}`}>{selectedItem.isVeg?'● Veg':'● Non-Veg'}</span>}
                </div>
                {selectedItem.price && <><div className="m-price">₹{selectedItem.price}</div><div className="m-price-sub">per serving</div></>}
                {selectedItem.description && <p className="m-desc">{selectedItem.description}</p>}

                {(selectedItem.calories||selectedItem.protein||selectedItem.carbs||selectedItem.fats) && (
                  <><div className="sec-lbl">Nutrition per serving</div>
                  <div className="nutr">
                    {[{l:'Calories',v:selectedItem.calories,u:'kcal'},{l:'Protein',v:selectedItem.protein,u:'g'},{l:'Carbs',v:selectedItem.carbs,u:'g'},{l:'Fats',v:selectedItem.fats,u:'g'}]
                      .filter(n=>n.v).map(n=>(
                      <div key={n.l} className="nc"><div className="nc-val">{n.v}</div><div className="nc-unit">{n.u}</div><div className="nc-lbl">{n.l}</div></div>
                    ))}
                  </div></>
                )}

                {selectedItem.ingredients?.length>0 && (
                  <><div className="sec-lbl">Ingredients</div>
                  <div className="ings">{selectedItem.ingredients.map(ing=><span key={ing} className="ing">{ing}</span>)}</div></>
                )}

                {!showAR && selectedItem.modelURL && (
                  <><div className="div"/>
                  <button className="ar-btn" onClick={()=>setShowAR(true)}>
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                    View in AR — Point at your table
                  </button>
                  <div className="ar-hint">No app needed · Android Chrome &amp; iOS Safari/Chrome</div></>
                )}

                {showAR && <ARViewerEmbed modelURL={selectedItem.modelURL} itemName={selectedItem.name} onARLaunch={handleARLaunch}/>}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export async function getServerSideProps({ params }) {
  try {
    const restaurant = await getRestaurantBySubdomain(params.subdomain);
    if (!restaurant) return { props:{restaurant:null,menuItems:[],offers:[],error:'Not found'} };
    const [menuItems, offers] = await Promise.all([getMenuItems(restaurant.id), getActiveOffers(restaurant.id)]);
    return { props:{restaurant:JSON.parse(JSON.stringify(restaurant)),menuItems:JSON.parse(JSON.stringify(menuItems)),offers:JSON.parse(JSON.stringify(offers)),error:null} };
  } catch(err) {
    return { props:{restaurant:null,menuItems:[],offers:[],error:err.message} };
  }
}
