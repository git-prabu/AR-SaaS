// pages/restaurant/[subdomain]/index.js
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
    if (!restaurant?.id) return;
    trackVisit(restaurant.id, getSessionId()).catch(() => {});
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
    <div style={{minHeight:'100vh',background:'#0D0D0F',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'sans-serif'}}>
      <div style={{textAlign:'center',color:'#fff'}}><div style={{fontSize:64,marginBottom:16}}>🍽️</div><h1>Restaurant not found</h1></div>
    </div>
  );

  return (
    <>
      <Head>
        <title>{restaurant.name} — AR Menu</title>
        <meta name="description" content={`View ${restaurant.name}'s menu in augmented reality`} />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Clash+Display:wght@400;500;600;700&family=Satoshi:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
        body{background:#0D0D0F;overflow-x:hidden}

        .page{
          min-height:100vh;
          background:#0D0D0F;
          font-family:'Satoshi','DM Sans',sans-serif;
          color:#F5F5F0;
          position:relative;
          overflow-x:hidden;
        }

        /* Ambient background orbs */
        .bg-orb{
          position:fixed;
          border-radius:50%;
          filter:blur(80px);
          pointer-events:none;
          z-index:0;
        }
        .orb1{width:400px;height:400px;background:rgba(255,107,53,0.12);top:-100px;right:-100px;}
        .orb2{width:300px;height:300px;background:rgba(255,180,80,0.07);bottom:20%;left:-80px;}
        .orb3{width:200px;height:200px;background:rgba(255,107,53,0.06);top:40%;right:10%;}

        /* Offer banner */
        .offer-banner{
          position:relative;z-index:10;
          background:linear-gradient(90deg,#FF6B35,#FFB347);
          padding:10px 20px;text-align:center;
          font-size:13px;font-weight:600;letter-spacing:0.02em;
        }

        /* Header */
        .header{
          position:sticky;top:0;z-index:40;
          padding:20px 20px 0;
          background:rgba(13,13,15,0.8);
          backdrop-filter:blur(24px);
          -webkit-backdrop-filter:blur(24px);
          border-bottom:1px solid rgba(255,255,255,0.05);
        }
        .header-inner{max-width:680px;margin:0 auto;}
        .header-top{display:flex;align-items:center;gap:14px;padding-bottom:16px;}

        .resto-logo{
          width:52px;height:52px;border-radius:16px;
          background:linear-gradient(135deg,#FF6B35,#FFB347);
          display:flex;align-items:center;justify-content:center;
          font-size:24px;flex-shrink:0;
          box-shadow:0 8px 24px rgba(255,107,53,0.35);
        }
        .resto-name{
          font-family:'Clash Display','Syne',sans-serif;
          font-weight:700;font-size:20px;line-height:1.1;
          background:linear-gradient(135deg,#F5F5F0,#BBBBAA);
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;
        }
        .resto-sub{font-size:12px;color:#666;margin-top:3px;}
        .ar-pill{
          margin-left:auto;flex-shrink:0;
          display:flex;align-items:center;gap:6px;
          padding:7px 14px;border-radius:30px;
          background:rgba(255,107,53,0.12);
          border:1px solid rgba(255,107,53,0.3);
          font-size:11px;font-weight:700;color:#FF6B35;
          letter-spacing:0.04em;text-transform:uppercase;
        }
        .ar-pulse{width:6px;height:6px;border-radius:50%;background:#FF6B35;animation:glow 2s infinite;}
        @keyframes glow{0%,100%{box-shadow:0 0 0 0 rgba(255,107,53,0.6)}50%{box-shadow:0 0 0 4px rgba(255,107,53,0)}}

        /* Categories */
        .cats{
          display:flex;gap:8px;overflow-x:auto;padding-bottom:16px;
          scrollbar-width:none;
        }
        .cats::-webkit-scrollbar{display:none}
        .cat{
          flex-shrink:0;padding:8px 18px;border-radius:30px;
          font-size:13px;font-weight:500;
          border:1px solid rgba(255,255,255,0.08);
          background:rgba(255,255,255,0.03);
          color:#888;cursor:pointer;
          font-family:'Satoshi',sans-serif;
          transition:all 0.2s;
        }
        .cat.on{
          background:linear-gradient(135deg,#FF6B35,#FFB347);
          border-color:transparent;color:#fff;font-weight:700;
          box-shadow:0 4px 16px rgba(255,107,53,0.3);
        }

        /* Main */
        .main{max-width:680px;margin:0 auto;padding:24px 16px 60px;position:relative;z-index:1;}

        /* AR strip */
        .ar-strip{
          display:flex;align-items:center;gap:10px;
          padding:12px 16px;margin-bottom:24px;
          background:rgba(255,107,53,0.06);
          border:1px solid rgba(255,107,53,0.15);
          border-radius:14px;
          font-size:12px;color:#FF8050;font-weight:500;
        }

        /* Grid */
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;}

        /* Card */
        .card{
          background:rgba(255,255,255,0.04);
          border:1px solid rgba(255,255,255,0.07);
          border-radius:22px;overflow:hidden;
          cursor:pointer;text-align:left;
          transition:transform 0.2s,box-shadow 0.2s,border-color 0.2s;
          backdrop-filter:blur(10px);
          -webkit-backdrop-filter:blur(10px);
          position:relative;
        }
        .card.ar-card{
          border-color:rgba(255,107,53,0.2);
          background:rgba(255,107,53,0.04);
        }
        .card:active{transform:scale(0.97);}

        /* Card image — circular dish style */
        .card-img-wrap{
          width:100%;padding:16px 16px 0;
          display:flex;justify-content:center;
        }
        .card-img{
          width:110px;height:110px;border-radius:50%;
          overflow:hidden;background:#1C1C1F;
          border:3px solid rgba(255,255,255,0.06);
          box-shadow:0 8px 32px rgba(0,0,0,0.4);
          flex-shrink:0;
        }
        .card-img img{width:100%;height:100%;object-fit:cover;display:block;}
        .card-img .noimg{
          width:100%;height:100%;
          display:flex;align-items:center;justify-content:center;
          font-size:36px;
          background:radial-gradient(circle,#2A2A2E,#1C1C1F);
        }

        /* AR glow ring on image */
        .card.ar-card .card-img{
          border-color:rgba(255,107,53,0.4);
          box-shadow:0 8px 32px rgba(0,0,0,0.4),0 0 0 2px rgba(255,107,53,0.15);
        }

        /* AR badge */
        .ar-badge{
          position:absolute;top:10px;right:10px;
          background:linear-gradient(135deg,#FF6B35,#FFB347);
          color:#fff;font-size:9px;font-weight:800;
          padding:3px 8px;border-radius:10px;
          letter-spacing:0.06em;text-transform:uppercase;
          box-shadow:0 2px 8px rgba(255,107,53,0.4);
        }

        /* Veg indicator */
        .veg-ind{
          position:absolute;top:10px;left:10px;
          width:18px;height:18px;border-radius:4px;
          border:2px solid;
          display:flex;align-items:center;justify-content:center;
        }
        .veg-ind.v{border-color:#22c55e;}
        .veg-ind.v::after{content:'';width:8px;height:8px;border-radius:50%;background:#22c55e;}
        .veg-ind.nv{border-color:#ef4444;}
        .veg-ind.nv::after{content:'';width:8px;height:8px;border-radius:50%;background:#ef4444;}

        .card-body{padding:12px 14px 14px;text-align:center;}
        .card-name{
          font-family:'Clash Display','Syne',sans-serif;
          font-weight:600;font-size:13px;line-height:1.25;
          color:#F0F0EC;margin-bottom:6px;
        }
        .card-row{display:flex;align-items:center;justify-content:center;gap:8px;}
        .card-cal{font-size:11px;color:#555;}
        .card-price{
          font-family:'Clash Display',sans-serif;
          font-size:14px;font-weight:700;color:#FF8050;
        }
        .card-ar-label{
          font-size:10px;color:#FF8050;font-weight:600;
          display:flex;align-items:center;justify-content:center;gap:3px;
          margin-top:6px;letter-spacing:0.04em;text-transform:uppercase;
        }

        /* Empty */
        .empty{text-align:center;padding:60px 20px;color:#444;}
        .empty-icon{font-size:48px;margin-bottom:12px;}

        /* MODAL */
        .overlay{
          position:fixed;inset:0;z-index:50;
          display:flex;align-items:flex-end;justify-content:center;
          background:rgba(0,0,0,0.8);
          backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
          animation:fadeIn 0.25s ease;
        }
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}

        .sheet{
          position:relative;
          width:100%;max-width:520px;
          background:rgba(18,18,20,0.98);
          border:1px solid rgba(255,255,255,0.08);
          border-radius:32px 32px 0 0;
          overflow-y:auto;max-height:93vh;
          animation:up 0.35s cubic-bezier(0.32,0.72,0,1);
        }
        @keyframes up{from{transform:translateY(100%)}to{transform:translateY(0)}}

        .handle-wrap{display:flex;justify-content:center;padding:14px 0 6px;}
        .handle{width:40px;height:4px;border-radius:2px;background:rgba(255,255,255,0.1);}

        .close-btn{
          position:absolute;top:16px;right:18px;
          width:34px;height:34px;border-radius:50%;
          background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.08);
          color:#888;cursor:pointer;font-size:15px;
          display:flex;align-items:center;justify-content:center;
          transition:background 0.2s;
        }
        .close-btn:hover{background:rgba(255,255,255,0.12);}

        .sheet-body{padding:0 20px 36px;}

        /* Hero image in modal — large circle */
        .modal-hero{
          display:flex;justify-content:center;
          padding:8px 0 20px;
        }
        .modal-img{
          width:180px;height:180px;border-radius:50%;
          overflow:hidden;background:#1C1C1F;
          border:4px solid rgba(255,255,255,0.06);
          box-shadow:0 16px 48px rgba(0,0,0,0.5),0 0 0 8px rgba(255,107,53,0.06);
        }
        .modal-img img{width:100%;height:100%;object-fit:cover;}
        .modal-img .noimg{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:72px;background:radial-gradient(circle,#2A2A2E,#1C1C1F);}

        .modal-title{
          font-family:'Clash Display','Syne',sans-serif;
          font-weight:700;font-size:28px;line-height:1.15;
          text-align:center;margin-bottom:10px;
          background:linear-gradient(135deg,#F5F5F0 30%,#CCCCBB);
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;
        }
        .modal-tags{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-bottom:16px;}
        .tag-cat{
          padding:5px 14px;border-radius:20px;font-size:12px;font-weight:600;
          background:rgba(255,107,53,0.1);border:1px solid rgba(255,107,53,0.2);color:#FF8050;
        }
        .tag-veg{
          padding:5px 14px;border-radius:20px;font-size:12px;font-weight:600;
        }
        .tag-veg.v{background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);color:#22c55e;}
        .tag-veg.nv{background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);color:#ef4444;}

        .modal-price{
          text-align:center;
          font-family:'Clash Display',sans-serif;
          font-size:36px;font-weight:700;
          color:#FF8050;margin-bottom:6px;
          text-shadow:0 0 30px rgba(255,107,53,0.3);
        }
        .modal-price-sub{text-align:center;font-size:11px;color:#555;margin-bottom:20px;}

        .modal-desc{
          font-size:14px;color:#888;line-height:1.65;
          margin-bottom:22px;text-align:center;
        }

        /* Glass divider */
        .divider{height:1px;background:rgba(255,255,255,0.06);margin:20px 0;}

        /* Nutrition */
        .sec-label{
          font-size:10px;font-weight:700;color:#444;
          letter-spacing:0.12em;text-transform:uppercase;
          margin-bottom:12px;
        }
        .nutr{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:22px;}
        .nutr-card{
          background:rgba(255,255,255,0.04);
          border:1px solid rgba(255,255,255,0.06);
          border-radius:16px;padding:14px 8px;text-align:center;
        }
        .nutr-val{
          font-family:'Clash Display',sans-serif;
          font-size:20px;font-weight:700;color:#FF8050;
        }
        .nutr-unit{font-size:10px;color:#555;margin-top:1px;}
        .nutr-lbl{font-size:10px;color:#666;margin-top:2px;}

        /* Ingredients */
        .ings{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:24px;}
        .ing{
          padding:6px 14px;border-radius:20px;font-size:12px;color:#999;
          background:rgba(255,255,255,0.04);
          border:1px solid rgba(255,255,255,0.06);
        }

        /* AR Button */
        .ar-btn{
          width:100%;padding:17px;border-radius:18px;border:none;
          background:linear-gradient(135deg,#FF6B35,#FFB347);
          color:#fff;
          font-family:'Clash Display','Syne',sans-serif;
          font-weight:700;font-size:17px;letter-spacing:0.02em;
          cursor:pointer;
          display:flex;align-items:center;justify-content:center;gap:10px;
          box-shadow:0 8px 36px rgba(255,107,53,0.4),0 0 0 1px rgba(255,200,100,0.1) inset;
          transition:transform 0.15s,box-shadow 0.15s;
        }
        .ar-btn:active{transform:scale(0.98);box-shadow:0 4px 16px rgba(255,107,53,0.3);}
        .ar-hint{text-align:center;font-size:11px;color:#444;margin-top:8px;}
      `}</style>

      <div className="page">
        <div className="bg-orb orb1" />
        <div className="bg-orb orb2" />
        <div className="bg-orb orb3" />

        {offers?.[0] && (
          <div className="offer-banner">🎉 {offers[0].title} — {offers[0].description}</div>
        )}

        <header className="header">
          <div className="header-inner">
            <div className="header-top">
              <div className="resto-logo">🍽️</div>
              <div>
                <div className="resto-name">{restaurant.name}</div>
                <div className="resto-sub">Point your phone at your table</div>
              </div>
              <div className="ar-pill">
                <span className="ar-pulse" />
                AR Live
              </div>
            </div>
            <div className="cats">
              {categories.map(cat => (
                <button key={cat} className={`cat${activeCategory===cat?' on':''}`} onClick={()=>setActiveCategory(cat)}>
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </header>

        <main className="main">
          {arCount > 0 && (
            <div className="ar-strip">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
              </svg>
              {arCount} dish{arCount!==1?'es':''} available in AR — tap to view in your space
            </div>
          )}

          {filtered.length===0 ? (
            <div className="empty"><div className="empty-icon">🥢</div><p>No items in this category</p></div>
          ) : (
            <div className="grid">
              {filtered.map(item => (
                <button key={item.id} className={`card${item.modelURL?' ar-card':''}`} onClick={()=>openItem(item)}>
                  {item.modelURL && <span className="ar-badge">AR</span>}
                  {typeof item.isVeg==='boolean' && (
                    <span className={`veg-ind ${item.isVeg?'v':'nv'}`} />
                  )}
                  <div className="card-img-wrap">
                    <div className="card-img">
                      {item.imageURL
                        ? <img src={item.imageURL} alt={item.name} loading="lazy"/>
                        : <div className="noimg">🍽️</div>
                      }
                    </div>
                  </div>
                  <div className="card-body">
                    <div className="card-name">{item.name}</div>
                    <div className="card-row">
                      {item.calories && <span className="card-cal">{item.calories} kcal</span>}
                      {item.price && <span className="card-price">₹{item.price}</span>}
                    </div>
                    {item.modelURL && (
                      <div className="card-ar-label">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                        </svg>
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
              <div className="handle-wrap"><div className="handle"/></div>
              <button className="close-btn" onClick={closeItem}>✕</button>
              <div className="sheet-body">
                {!showAR && (
                  <div className="modal-hero">
                    <div className="modal-img">
                      {selectedItem.imageURL
                        ? <img src={selectedItem.imageURL} alt={selectedItem.name}/>
                        : <div className="noimg">🍽️</div>
                      }
                    </div>
                  </div>
                )}
                <h2 className="modal-title">{selectedItem.name}</h2>
                <div className="modal-tags">
                  {selectedItem.category && <span className="tag-cat">{selectedItem.category}</span>}
                  {typeof selectedItem.isVeg==='boolean' && (
                    <span className={`tag-veg ${selectedItem.isVeg?'v':'nv'}`}>
                      {selectedItem.isVeg?'● Veg':'● Non-Veg'}
                    </span>
                  )}
                </div>
                {selectedItem.price && (
                  <>
                    <div className="modal-price">₹{selectedItem.price}</div>
                    <div className="modal-price-sub">per serving</div>
                  </>
                )}
                {selectedItem.description && <p className="modal-desc">{selectedItem.description}</p>}

                {(selectedItem.calories||selectedItem.protein||selectedItem.carbs||selectedItem.fats) && (
                  <>
                    <div className="sec-label">Nutrition per serving</div>
                    <div className="nutr">
                      {[{l:'Calories',v:selectedItem.calories,u:'kcal'},{l:'Protein',v:selectedItem.protein,u:'g'},{l:'Carbs',v:selectedItem.carbs,u:'g'},{l:'Fats',v:selectedItem.fats,u:'g'}]
                        .filter(n=>n.v).map(n=>(
                        <div key={n.l} className="nutr-card">
                          <div className="nutr-val">{n.v}</div>
                          <div className="nutr-unit">{n.u}</div>
                          <div className="nutr-lbl">{n.l}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {selectedItem.ingredients?.length>0 && (
                  <>
                    <div className="sec-label">Ingredients</div>
                    <div className="ings">
                      {selectedItem.ingredients.map(ing=>(
                        <span key={ing} className="ing">{ing}</span>
                      ))}
                    </div>
                  </>
                )}

                {!showAR && selectedItem.modelURL && (
                  <>
                    <div className="divider"/>
                    <button className="ar-btn" onClick={()=>setShowAR(true)}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                      </svg>
                      View in AR
                    </button>
                    <div className="ar-hint">No app needed · Android Chrome &amp; iOS Safari/Chrome</div>
                  </>
                )}

                {showAR && (
                  <ARViewerEmbed modelURL={selectedItem.modelURL} itemName={selectedItem.name} onARLaunch={handleARLaunch}/>
                )}
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
    const { subdomain } = params;
    const restaurant = await getRestaurantBySubdomain(subdomain);
    if (!restaurant) return { props: { restaurant: null, menuItems: [], offers: [], error: 'Not found' } };
    const [menuItems, offers] = await Promise.all([getMenuItems(restaurant.id), getActiveOffers(restaurant.id)]);
    return { props: { restaurant: JSON.parse(JSON.stringify(restaurant)), menuItems: JSON.parse(JSON.stringify(menuItems)), offers: JSON.parse(JSON.stringify(offers)), error: null } };
  } catch (err) {
    return { props: { restaurant: null, menuItems: [], offers: [], error: err.message } };
  }
}
