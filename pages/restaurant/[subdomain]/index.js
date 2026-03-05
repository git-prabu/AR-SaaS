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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (restaurant?.id) trackVisit(restaurant.id, getSessionId()).catch(()=>{});
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
    <div style={{minHeight:'100vh',background:'linear-gradient(135deg,#1a0f2e,#0f1a2e)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Inter,sans-serif'}}>
      <div style={{textAlign:'center',color:'#F0EEF8'}}>
        <div style={{fontSize:56,marginBottom:14}}>🍽️</div>
        <h1 style={{fontSize:22,fontWeight:700,marginBottom:6}}>Restaurant not found</h1>
        <p style={{color:'rgba(255,255,255,0.4)'}}>This page doesn't exist or the restaurant is inactive.</p>
      </div>
    </div>
  );

  return (
    <>
      <Head>
        <title>{restaurant.name} — AR Menu</title>
        <meta name="description" content={`View ${restaurant.name}'s menu in augmented reality`}/>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet"/>
      </Head>

      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}

        body{
          background: linear-gradient(135deg,#1a0f2e 0%,#0f1a2e 55%,#1a0820 100%);
          background-attachment: fixed;
          overflow-x:hidden;
        }

        /* Ambient orbs — fixed so they don't scroll */
        .orb{position:fixed;border-radius:50%;pointer-events:none;z-index:0;}
        .o1{width:400px;height:400px;top:-80px;right:-60px;background:radial-gradient(circle,rgba(147,100,255,0.18),transparent 70%);}
        .o2{width:320px;height:320px;bottom:20%;left:-60px;background:radial-gradient(circle,rgba(255,107,53,0.12),transparent 70%);}
        .o3{width:260px;height:260px;top:45%;right:5%;background:radial-gradient(circle,rgba(255,143,177,0.1),transparent 70%);}

        /* Floating clay shapes */
        .clay{position:fixed;border-radius:50%;pointer-events:none;z-index:0;animation:float 5s ease-in-out infinite;}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes cardIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}

        /* Floating glass header */
        .hdr{
          position:sticky;top:10px;z-index:40;
          margin:10px 12px 0;
          background:rgba(255,255,255,0.08);
          backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
          border:1px solid rgba(255,255,255,0.13);
          border-radius:24px;
          padding:14px 16px 0;
          box-shadow:0 8px 32px rgba(0,0,0,0.25);
        }
        .hdr-inner{max-width:660px;margin:0 auto;}
        .hdr-top{display:flex;align-items:center;gap:12px;padding-bottom:14px;}

        .logo{width:46px;height:46px;border-radius:14px;background:linear-gradient(135deg,#FF6B35,#FFB347);display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 6px 20px rgba(255,107,53,0.35);flex-shrink:0;}
        .rname{font-family:Poppins,sans-serif;font-weight:800;font-size:17px;color:#F0EEF8;}
        .rsub{font-size:11px;color:rgba(255,255,255,0.35);margin-top:2px;}
        .ar-live{margin-left:auto;display:flex;align-items:center;gap:6px;padding:6px 13px;border-radius:20px;background:rgba(255,107,53,0.12);border:1px solid rgba(255,107,53,0.25);font-size:11px;font-weight:700;color:#FF8C5A;white-space:nowrap;flex-shrink:0;}
        .ar-dot{width:6px;height:6px;border-radius:50%;background:#FF6B35;animation:pulse 2s infinite;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}

        /* Category pills */
        .cats{display:flex;gap:8px;overflow-x:auto;padding-bottom:14px;scrollbar-width:none;}
        .cats::-webkit-scrollbar{display:none}
        .cat{flex-shrink:0;padding:7px 16px;border-radius:20px;font-size:13px;font-weight:500;
          border:1px solid rgba(255,255,255,0.1);
          background:rgba(255,255,255,0.05);
          color:rgba(255,255,255,0.5);cursor:pointer;
          font-family:Inter,sans-serif;transition:all 0.15s;
          backdrop-filter:blur(8px);}
        .cat.on{background:linear-gradient(135deg,rgba(255,107,53,0.35),rgba(255,179,71,0.25));border-color:rgba(255,107,53,0.35);color:#F0EEF8;font-weight:700;box-shadow:0 4px 16px rgba(255,107,53,0.2);}

        /* Main */
        .main{max-width:680px;margin:0 auto;padding:20px 14px 70px;position:relative;z-index:1;}

        /* AR strip */
        .ar-strip{display:flex;align-items:center;gap:8px;padding:11px 14px;margin-bottom:20px;
          background:rgba(255,107,53,0.1);border:1px solid rgba(255,107,53,0.2);
          border-radius:14px;font-size:12px;color:#FF8C5A;font-weight:500;
          backdrop-filter:blur(10px);}

        /* Grid */
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}

        /* Card — glass floating cards, circular food image */
        .card{
          background:rgba(255,255,255,0.07);
          backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
          border:1px solid rgba(255,255,255,0.12);
          border-radius:22px;overflow:hidden;
          cursor:pointer;text-align:left;
          position:relative;
          transition:all 0.25s;
          animation:cardIn 0.4s ease forwards;
          box-shadow:0 4px 20px rgba(0,0,0,0.2);
        }
        .card:hover{background:rgba(255,255,255,0.11);transform:translateY(-5px) scale(1.01);box-shadow:0 20px 48px rgba(0,0,0,0.35);}
        .card:active{transform:scale(0.97);}
        .card.ar-card{border-color:rgba(255,107,53,0.25);box-shadow:0 4px 20px rgba(0,0,0,0.2),0 0 0 1px rgba(255,107,53,0.1) inset;}

        /* Circular image */
        .img-wrap{display:flex;justify-content:center;padding:16px 16px 0;}
        .img-circ{width:100px;height:100px;border-radius:50%;overflow:hidden;
          background:rgba(255,255,255,0.06);
          border:3px solid rgba(255,255,255,0.1);
          box-shadow:0 8px 28px rgba(0,0,0,0.35);flex-shrink:0;}
        .img-circ img{width:100%;height:100%;object-fit:cover;display:block;}
        .img-circ .noimg{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:34px;}
        .card.ar-card .img-circ{border-color:rgba(255,107,53,0.35);box-shadow:0 8px 28px rgba(0,0,0,0.35),0 0 20px rgba(255,107,53,0.15);}

        .ar-badge{position:absolute;top:10px;right:10px;background:linear-gradient(135deg,#FF6B35,#FFB347);color:#fff;font-size:9px;font-weight:800;padding:3px 9px;border-radius:9px;letter-spacing:0.05em;text-transform:uppercase;box-shadow:0 2px 8px rgba(255,107,53,0.4);}
        .veg-dot{position:absolute;top:10px;left:10px;width:16px;height:16px;border-radius:4px;border:2px solid;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.3);backdrop-filter:blur(4px);}
        .veg-dot.v{border-color:#4ade80;}.veg-dot.v::after{content:'';width:7px;height:7px;border-radius:50%;background:#4ade80;}
        .veg-dot.nv{border-color:#f87171;}.veg-dot.nv::after{content:'';width:7px;height:7px;border-radius:50%;background:#f87171;}

        .card-body{padding:11px 13px 14px;text-align:center;}
        .card-name{font-family:Poppins,sans-serif;font-weight:700;font-size:13px;line-height:1.25;color:rgba(255,255,255,0.9);margin-bottom:5px;}
        .card-row{display:flex;align-items:center;justify-content:center;gap:8px;}
        .card-cal{font-size:11px;color:rgba(255,255,255,0.3);}
        .card-price{font-family:Poppins,sans-serif;font-size:13px;font-weight:700;color:#FF8C5A;}
        .card-ar-lbl{font-size:10px;color:#FF8C5A;font-weight:600;display:flex;align-items:center;justify-content:center;gap:3px;margin-top:6px;letter-spacing:0.03em;text-transform:uppercase;}

        .empty{text-align:center;padding:60px 20px;color:rgba(255,255,255,0.25);}

        /* MODAL */
        .overlay{position:fixed;inset:0;z-index:50;display:flex;align-items:flex-end;justify-content:center;
          background:rgba(0,0,0,0.65);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
          animation:fadeIn 0.22s ease;}
        .sheet{
          position:relative;width:100%;max-width:520px;
          background:rgba(20,12,36,0.95);
          backdrop-filter:blur(32px);-webkit-backdrop-filter:blur(32px);
          border:1px solid rgba(255,255,255,0.1);
          border-top:1px solid rgba(255,255,255,0.15);
          border-radius:32px 32px 0 0;
          overflow-y:auto;max-height:93vh;
          animation:slideUp 0.34s cubic-bezier(0.32,0.72,0,1);
          box-shadow:0 -20px 60px rgba(0,0,0,0.5);
        }
        .handle-row{display:flex;justify-content:center;padding:14px 0 4px;}
        .handle{width:36px;height:4px;border-radius:2px;background:rgba(255,255,255,0.15);}
        .close-btn{position:absolute;top:14px;right:16px;width:32px;height:32px;border-radius:50%;
          background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);
          color:rgba(255,255,255,0.5);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;transition:all 0.15s;}
        .close-btn:hover{background:rgba(255,255,255,0.14);color:rgba(255,255,255,0.9);}
        .sbody{padding:2px 20px 36px;}

        /* Modal hero */
        .m-hero{display:flex;justify-content:center;padding:8px 0 20px;}
        .m-img{width:156px;height:156px;border-radius:50%;overflow:hidden;
          background:rgba(255,255,255,0.06);
          border:4px solid rgba(255,255,255,0.1);
          box-shadow:0 12px 40px rgba(0,0,0,0.4),0 0 0 8px rgba(255,255,255,0.03);}
        .m-img img{width:100%;height:100%;object-fit:cover;}
        .m-img .noimg{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:64px;}

        .m-title{font-family:Poppins,sans-serif;font-weight:800;font-size:24px;line-height:1.15;text-align:center;color:#F0EEF8;margin-bottom:10px;}
        .m-tags{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-bottom:16px;}
        .tag-cat{padding:5px 13px;border-radius:20px;font-size:12px;font-weight:600;background:rgba(255,107,53,0.12);border:1px solid rgba(255,107,53,0.25);color:#FF8C5A;}
        .tag-veg{padding:5px 13px;border-radius:20px;font-size:12px;font-weight:600;}
        .tag-veg.v{background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.25);color:#4ade80;}
        .tag-veg.nv{background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.25);color:#f87171;}

        .m-price{text-align:center;font-family:Poppins,sans-serif;font-size:34px;font-weight:800;color:#FF8C5A;margin-bottom:4px;text-shadow:0 0 24px rgba(255,107,53,0.3);}
        .m-price-sub{text-align:center;font-size:11px;color:rgba(255,255,255,0.3);margin-bottom:18px;}
        .m-desc{font-size:14px;color:rgba(255,255,255,0.5);line-height:1.7;margin-bottom:20px;text-align:center;}

        .divider{height:1px;background:rgba(255,255,255,0.07);margin:18px 0;}
        .sec-lbl{font-size:10px;font-weight:700;color:rgba(255,255,255,0.3);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:11px;}

        /* Nutrition glass cards */
        .nutr{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px;}
        .nc{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:13px 7px;text-align:center;backdrop-filter:blur(8px);}
        .nc-val{font-family:Poppins,sans-serif;font-size:18px;font-weight:800;color:#FF8C5A;}
        .nc-unit{font-size:10px;color:rgba(255,255,255,0.3);margin-top:1px;}
        .nc-lbl{font-size:10px;color:rgba(255,255,255,0.4);margin-top:2px;}

        .ings{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:22px;}
        .ing{padding:6px 12px;border-radius:20px;font-size:12px;color:rgba(255,255,255,0.5);
          background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);}

        /* AR button */
        .ar-btn{width:100%;padding:16px;border-radius:16px;border:none;
          background:linear-gradient(135deg,#FF6B35,#FFB347);
          color:#fff;font-family:Poppins,sans-serif;font-weight:700;font-size:16px;
          cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;
          box-shadow:0 8px 30px rgba(255,107,53,0.4);
          transition:transform 0.15s,box-shadow 0.15s;}
        .ar-btn:active{transform:scale(0.98);box-shadow:0 4px 16px rgba(255,107,53,0.3);}
        .ar-hint{text-align:center;font-size:11px;color:rgba(255,255,255,0.25);margin-top:8px;}
      `}</style>

      {/* Ambient background */}
      <div className="orb o1"/><div className="orb o2"/><div className="orb o3"/>
      <div className="clay" style={{top:'12%',right:'4%',width:55,height:55,background:'linear-gradient(135deg,rgba(255,107,53,0.35),rgba(255,179,71,0.25))',animationDelay:'0s'}}/>
      <div className="clay" style={{top:'40%',left:'3%',width:38,height:38,background:'linear-gradient(135deg,rgba(147,100,255,0.35),rgba(255,143,177,0.25))',animationDelay:'1.5s'}}/>
      <div className="clay" style={{bottom:'30%',right:'5%',width:44,height:44,borderRadius:14,background:'linear-gradient(135deg,rgba(255,143,177,0.3),rgba(147,100,255,0.2))',animationDelay:'0.8s'}}/>

      {/* Offer banner */}
      {offers?.[0] && (
        <div style={{background:'linear-gradient(90deg,#FF6B35,#FFB347)',padding:'10px 20px',textAlign:'center',fontSize:13,fontWeight:600,color:'#fff',position:'relative',zIndex:10}}>
          🎉 {offers[0].title} — {offers[0].description}
        </div>
      )}

      {/* Floating glass header */}
      <header className="hdr">
        <div className="hdr-inner">
          <div className="hdr-top">
            <div className="logo">🍽️</div>
            <div>
              <div className="rname">{restaurant.name}</div>
              <div className="rsub">Tap any item to view in AR</div>
            </div>
            <div className="ar-live"><span className="ar-dot"/>AR Live</div>
          </div>
          <div className="cats">
            {categories.map(cat=>(
              <button key={cat} className={`cat${activeCategory===cat?' on':''}`} onClick={()=>setActiveCategory(cat)}>{cat}</button>
            ))}
          </div>
        </div>
      </header>

      <main className="main">
        {arCount > 0 && (
          <div className="ar-strip">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            {arCount} dish{arCount!==1?'es':''} available in AR — tap to view in your space
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="empty"><div style={{fontSize:44,marginBottom:10}}>🥢</div><p>No items in this category</p></div>
        ) : (
          <div className="grid">
            {filtered.map((item, idx) => (
              <button key={item.id} className={`card${item.modelURL?' ar-card':''}`}
                style={{animationDelay:`${idx*0.06}s`}}
                onClick={()=>openItem(item)}>
                {item.modelURL && <span className="ar-badge">AR</span>}
                {typeof item.isVeg==='boolean' && <span className={`veg-dot ${item.isVeg?'v':'nv'}`}/>}
                <div className="img-wrap">
                  <div className="img-circ">
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

      {/* MODAL */}
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

              {(selectedItem.calories||selectedItem.protein||selectedItem.carbs||selectedItem.fats) && (<>
                <div className="sec-lbl">Nutrition per serving</div>
                <div className="nutr">
                  {[{l:'Calories',v:selectedItem.calories,u:'kcal'},{l:'Protein',v:selectedItem.protein,u:'g'},{l:'Carbs',v:selectedItem.carbs,u:'g'},{l:'Fats',v:selectedItem.fats,u:'g'}]
                    .filter(n=>n.v).map(n=>(
                    <div key={n.l} className="nc"><div className="nc-val">{n.v}</div><div className="nc-unit">{n.u}</div><div className="nc-lbl">{n.l}</div></div>
                  ))}
                </div>
              </>)}

              {selectedItem.ingredients?.length > 0 && (<>
                <div className="sec-lbl">Ingredients</div>
                <div className="ings">{selectedItem.ingredients.map(ing=><span key={ing} className="ing">{ing}</span>)}</div>
              </>)}

              {!showAR && selectedItem.modelURL && (<>
                <div className="divider"/>
                <button className="ar-btn" onClick={()=>setShowAR(true)}>
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
    if (!restaurant) return { props:{restaurant:null,menuItems:[],offers:[],error:'Not found'} };
    const [menuItems, offers] = await Promise.all([getMenuItems(restaurant.id), getActiveOffers(restaurant.id)]);
    return { props:{restaurant:JSON.parse(JSON.stringify(restaurant)),menuItems:JSON.parse(JSON.stringify(menuItems)),offers:JSON.parse(JSON.stringify(offers)),error:null} };
  } catch(err) {
    return { props:{restaurant:null,menuItems:[],offers:[],error:err.message} };
  }
}
