// pages/restaurant/[subdomain]/index.js
import Head from 'next/head';
import { useState, useEffect, useCallback, useRef } from 'react';
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
  const sheetRef = useRef(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!restaurant?.id) return;
    trackVisit(restaurant.id, getSessionId()).catch(() => {});
  }, [restaurant?.id]);

  // Lock body scroll when modal open
  useEffect(() => {
    if (selectedItem) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [selectedItem]);

  const categories = ['All', ...new Set((menuItems || []).map(i => i.category).filter(Boolean))];
  const filtered = activeCategory === 'All' ? menuItems : menuItems.filter(i => i.category === activeCategory);

  const openItem = useCallback(async (item) => {
    setSelectedItem(item);
    setShowAR(false);
    if (restaurant?.id) await incrementItemView(restaurant.id, item.id).catch(() => {});
  }, [restaurant?.id]);

  const closeItem = useCallback(() => {
    setSelectedItem(null);
    setShowAR(false);
  }, []);

  const handleARLaunch = useCallback(async () => {
    if (restaurant?.id && selectedItem?.id) {
      await incrementARView(restaurant.id, selectedItem.id).catch(() => {});
    }
  }, [restaurant?.id, selectedItem?.id]);

  if (error || !restaurant) {
    return (
      <div style={{ minHeight: '100vh', background: '#0A0A0B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: 'center', padding: '0 24px' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🍽️</div>
          <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Restaurant not found</h1>
          <p style={{ color: '#888' }}>This page doesn't exist or the restaurant is currently inactive.</p>
        </div>
      </div>
    );
  }

  const activeOffer = offers?.[0];
  const arItems = (menuItems || []).filter(i => i.modelURL).length;

  return (
    <>
      <Head>
        <title>{restaurant.name} — AR Menu</title>
        <meta name="description" content={`View ${restaurant.name}'s menu in augmented reality`} />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
        body { background: #0A0A0B; }

        .menu-page { min-height: 100vh; background: #0A0A0B; font-family: 'DM Sans', sans-serif; color: #F0F0F0; }

        /* Offer banner */
        .offer-banner {
          background: linear-gradient(90deg, #FF6B35, #FFB347);
          padding: 10px 16px;
          text-align: center;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.01em;
        }

        /* Header */
        .header {
          position: sticky;
          top: 0;
          z-index: 40;
          background: rgba(10, 10, 11, 0.92);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255,255,255,0.06);
          padding: 16px 20px 0;
        }
        .header-top {
          max-width: 680px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          gap: 12px;
          padding-bottom: 14px;
        }
        .restaurant-avatar {
          width: 48px; height: 48px;
          border-radius: 14px;
          background: linear-gradient(135deg, #FF6B35 0%, #FFB347 100%);
          display: flex; align-items: center; justify-content: center;
          font-size: 22px;
          flex-shrink: 0;
          box-shadow: 0 4px 16px rgba(255,107,53,0.3);
        }
        .restaurant-name { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 18px; line-height: 1.2; }
        .restaurant-sub { font-size: 12px; color: #888; margin-top: 2px; }
        .ar-badge {
          margin-left: auto;
          display: flex; align-items: center; gap: 6px;
          padding: 6px 12px;
          border-radius: 20px;
          background: rgba(255,107,53,0.1);
          border: 1px solid rgba(255,107,53,0.25);
          font-size: 11px;
          font-weight: 600;
          color: #FF6B35;
          white-space: nowrap;
        }
        .ar-dot { width: 6px; height: 6px; border-radius: 50%; background: #FF6B35; animation: pulse 2s infinite; }
        @keyframes pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.5; transform:scale(1.3); } }

        /* Category tabs */
        .cat-scroll {
          max-width: 680px; margin: 0 auto;
          display: flex; gap: 8px;
          overflow-x: auto; padding-bottom: 14px;
          scrollbar-width: none;
        }
        .cat-scroll::-webkit-scrollbar { display: none; }
        .cat-btn {
          flex-shrink: 0;
          padding: 7px 16px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 500;
          border: 1px solid rgba(255,255,255,0.1);
          background: transparent;
          color: #888;
          cursor: pointer;
          transition: all 0.2s;
          font-family: 'DM Sans', sans-serif;
        }
        .cat-btn.active {
          background: #FF6B35;
          border-color: #FF6B35;
          color: white;
          font-weight: 600;
        }

        /* Main content */
        .main { max-width: 680px; margin: 0 auto; padding: 20px 16px 40px; }

        /* AR items count strip */
        .ar-strip {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 14px; margin-bottom: 20px;
          background: rgba(255,107,53,0.06);
          border: 1px solid rgba(255,107,53,0.15);
          border-radius: 12px;
          font-size: 12px; color: #FF6B35; font-weight: 500;
        }

        /* Grid */
        .menu-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

        /* Card */
        .menu-card {
          background: #141416;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 18px;
          overflow: hidden;
          cursor: pointer;
          transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
          text-align: left;
          display: block;
          width: 100%;
        }
        .menu-card:active { transform: scale(0.97); }
        .menu-card.has-ar { border-color: rgba(255,107,53,0.2); }

        .card-image {
          width: 100%; height: 140px;
          background: #1C1C1F;
          overflow: hidden;
          position: relative;
        }
        .card-image img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.4s; }
        .card-image .placeholder {
          width: 100%; height: 100%;
          display: flex; align-items: center; justify-content: center;
          font-size: 40px;
          background: linear-gradient(135deg, #1C1C1F 0%, #141416 100%);
        }

        /* AR badge on card */
        .card-ar-badge {
          position: absolute; top: 8px; right: 8px;
          background: rgba(255,107,53,0.9);
          backdrop-filter: blur(8px);
          color: white; font-size: 9px; font-weight: 700;
          padding: 3px 8px; border-radius: 10px;
          letter-spacing: 0.05em; text-transform: uppercase;
        }

        /* Veg/Non-veg indicator */
        .veg-dot {
          position: absolute; top: 8px; left: 8px;
          width: 16px; height: 16px;
          border-radius: 3px;
          border: 1.5px solid;
          display: flex; align-items: center; justify-content: center;
        }
        .veg-dot.veg { border-color: #22c55e; }
        .veg-dot.veg::after { content: ''; width: 7px; height: 7px; border-radius: 50%; background: #22c55e; }
        .veg-dot.nonveg { border-color: #ef4444; }
        .veg-dot.nonveg::after { content: ''; width: 7px; height: 7px; border-radius: 50%; background: #ef4444; }

        .card-body { padding: 12px; }
        .card-name { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 13px; line-height: 1.3; margin-bottom: 4px; color: #F0F0F0; }
        .card-meta { display: flex; align-items: center; justify-content: space-between; }
        .card-cal { font-size: 11px; color: #666; }
        .card-price { font-size: 13px; font-weight: 700; color: #FF6B35; font-family: 'Syne', sans-serif; }
        .card-ar-text { font-size: 10px; color: #FF6B35; font-weight: 600; display: flex; align-items: center; gap: 4px; margin-top: 6px; letter-spacing: 0.03em; text-transform: uppercase; }

        /* MODAL */
        .modal-overlay {
          position: fixed; inset: 0; z-index: 50;
          display: flex; align-items: flex-end; justify-content: center;
          background: rgba(0,0,0,0.75);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }

        .modal-sheet {
          position: relative;
          width: 100%; max-width: 520px;
          background: #111113;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 28px 28px 0 0;
          overflow-y: auto;
          max-height: 93vh;
          animation: slideUp 0.3s cubic-bezier(0.32, 0.72, 0, 1);
        }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }

        .modal-handle { display: flex; justify-content: center; padding: 14px 0 4px; }
        .modal-handle-bar { width: 36px; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.12); }

        .modal-close {
          position: absolute; top: 14px; right: 16px;
          width: 32px; height: 32px; border-radius: 50%;
          background: rgba(255,255,255,0.08);
          border: none; color: #888; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; transition: background 0.2s;
        }
        .modal-close:hover { background: rgba(255,255,255,0.14); }

        .modal-body { padding: 4px 20px 32px; }

        .modal-cover {
          width: 100%; height: 220px;
          border-radius: 18px; overflow: hidden;
          background: #1C1C1F; margin-bottom: 20px;
        }
        .modal-cover img { width: 100%; height: 100%; object-fit: cover; }
        .modal-cover .placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 72px; }

        .modal-title { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 26px; line-height: 1.15; margin-bottom: 8px; }
        .modal-tags { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; align-items: center; }
        .modal-category { padding: 4px 12px; border-radius: 20px; background: rgba(255,107,53,0.1); border: 1px solid rgba(255,107,53,0.2); color: #FF6B35; font-size: 12px; font-weight: 600; }
        .modal-veg-label { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 20px; }
        .modal-veg-label.veg { background: rgba(34,197,94,0.1); color: #22c55e; border: 1px solid rgba(34,197,94,0.2); }
        .modal-veg-label.nonveg { background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.2); }

        .modal-desc { font-size: 14px; color: #999; line-height: 1.6; margin-bottom: 20px; }

        /* Price row */
        .modal-price-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
        .modal-price { font-family: 'Syne', sans-serif; font-size: 28px; font-weight: 800; color: #FF6B35; }
        .modal-price-sub { font-size: 12px; color: #555; }

        /* Nutrition grid */
        .nutr-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 20px; }
        .nutr-card { background: #1A1A1D; border-radius: 14px; padding: 12px 8px; text-align: center; border: 1px solid rgba(255,255,255,0.05); }
        .nutr-val { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 18px; color: #FF6B35; }
        .nutr-unit { font-size: 10px; color: #555; margin-top: 2px; }
        .nutr-label { font-size: 10px; color: #777; }

        /* Ingredients */
        .section-label { font-size: 10px; font-weight: 700; color: #555; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 10px; }
        .ing-wrap { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 24px; }
        .ing-chip { padding: 6px 12px; border-radius: 20px; background: #1A1A1D; border: 1px solid rgba(255,255,255,0.07); font-size: 12px; color: #aaa; }

        /* AR Button */
        .ar-btn {
          width: 100%; padding: 16px;
          border-radius: 16px; border: none;
          background: linear-gradient(135deg, #FF6B35 0%, #FFB347 100%);
          color: white; font-family: 'Syne', sans-serif;
          font-weight: 700; font-size: 16px;
          cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px;
          box-shadow: 0 8px 32px rgba(255,107,53,0.35);
          transition: transform 0.15s, box-shadow 0.15s;
          letter-spacing: 0.02em;
        }
        .ar-btn:active { transform: scale(0.98); box-shadow: 0 4px 16px rgba(255,107,53,0.3); }

        .ar-hint { text-align: center; font-size: 11px; color: #555; margin-top: 8px; }

        /* Divider */
        .divider { height: 1px; background: rgba(255,255,255,0.06); margin: 20px 0; }

        /* Empty state */
        .empty { text-align: center; padding: 60px 20px; color: #555; }
        .empty-icon { font-size: 48px; margin-bottom: 12px; }
      `}</style>

      <div className="menu-page">

        {/* OFFER BANNER */}
        {activeOffer && (
          <div className="offer-banner">
            🎉 {activeOffer.title} — {activeOffer.description}
          </div>
        )}

        {/* HEADER */}
        <header className="header">
          <div className="header-top">
            <div className="restaurant-avatar">🍽️</div>
            <div>
              <div className="restaurant-name">{restaurant.name}</div>
              <div className="restaurant-sub">Scan any item to view it in AR</div>
            </div>
            <div className="ar-badge">
              <span className="ar-dot" />
              AR Enabled
            </div>
          </div>

          {/* Category tabs */}
          <div className="cat-scroll">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`cat-btn${activeCategory === cat ? ' active' : ''}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </header>

        {/* MAIN */}
        <main className="main">

          {/* AR strip */}
          {arItems > 0 && (
            <div className="ar-strip">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
              </svg>
              {arItems} item{arItems !== 1 ? 's' : ''} available in AR — tap to view in your space
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">🥢</div>
              <p>No items in this category yet</p>
            </div>
          ) : (
            <div className="menu-grid">
              {filtered.map((item, i) => (
                <button key={item.id} className={`menu-card${item.modelURL ? ' has-ar' : ''}`} onClick={() => openItem(item)}>
                  <div className="card-image">
                    {item.imageURL
                      ? <img src={item.imageURL} alt={item.name} loading="lazy" />
                      : <div className="placeholder">🍽️</div>
                    }
                    {item.modelURL && <span className="card-ar-badge">AR</span>}
                    {typeof item.isVeg === 'boolean' && (
                      <div className={`veg-dot ${item.isVeg ? 'veg' : 'nonveg'}`} />
                    )}
                  </div>
                  <div className="card-body">
                    <div className="card-name">{item.name}</div>
                    <div className="card-meta">
                      {item.calories && <span className="card-cal">{item.calories} kcal</span>}
                      {item.price && <span className="card-price">₹{item.price}</span>}
                    </div>
                    {item.modelURL && (
                      <div className="card-ar-text">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                          <path d="M2 17l10 5 10-5"/>
                          <path d="M2 12l10 5 10-5"/>
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

        {/* ITEM MODAL */}
        {selectedItem && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeItem(); }}>
            <div className="modal-sheet" ref={sheetRef}>
              <div className="modal-handle"><div className="modal-handle-bar" /></div>
              <button className="modal-close" onClick={closeItem}>✕</button>

              <div className="modal-body">
                {/* Cover image */}
                {!showAR && (
                  <div className="modal-cover">
                    {selectedItem.imageURL
                      ? <img src={selectedItem.imageURL} alt={selectedItem.name} />
                      : <div className="placeholder">🍽️</div>
                    }
                  </div>
                )}

                {/* Title + tags */}
                <h2 className="modal-title">{selectedItem.name}</h2>
                <div className="modal-tags">
                  {selectedItem.category && <span className="modal-category">{selectedItem.category}</span>}
                  {typeof selectedItem.isVeg === 'boolean' && (
                    <span className={`modal-veg-label ${selectedItem.isVeg ? 'veg' : 'nonveg'}`}>
                      {selectedItem.isVeg ? '● Veg' : '● Non-Veg'}
                    </span>
                  )}
                </div>

                {/* Price */}
                {selectedItem.price && (
                  <div className="modal-price-row">
                    <div>
                      <div className="modal-price">₹{selectedItem.price}</div>
                      <div className="modal-price-sub">per serving</div>
                    </div>
                  </div>
                )}

                {/* Description */}
                {selectedItem.description && (
                  <p className="modal-desc">{selectedItem.description}</p>
                )}

                {/* Nutrition */}
                {(selectedItem.calories || selectedItem.protein || selectedItem.carbs || selectedItem.fats) && (
                  <>
                    <div className="section-label">Nutrition per serving</div>
                    <div className="nutr-grid">
                      {[
                        { label: 'Calories', val: selectedItem.calories, unit: 'kcal' },
                        { label: 'Protein',  val: selectedItem.protein,  unit: 'g'    },
                        { label: 'Carbs',    val: selectedItem.carbs,    unit: 'g'    },
                        { label: 'Fats',     val: selectedItem.fats,     unit: 'g'    },
                      ].filter(n => n.val).map(n => (
                        <div key={n.label} className="nutr-card">
                          <div className="nutr-val">{n.val}</div>
                          <div className="nutr-unit">{n.unit}</div>
                          <div className="nutr-label">{n.label}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Ingredients */}
                {selectedItem.ingredients?.length > 0 && (
                  <>
                    <div className="section-label">Ingredients</div>
                    <div className="ing-wrap">
                      {selectedItem.ingredients.map(ing => (
                        <span key={ing} className="ing-chip">{ing}</span>
                      ))}
                    </div>
                  </>
                )}

                {/* AR */}
                {!showAR && selectedItem.modelURL && (
                  <>
                    <div className="divider" />
                    <button className="ar-btn" onClick={() => setShowAR(true)}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                        <path d="M2 17l10 5 10-5"/>
                        <path d="M2 12l10 5 10-5"/>
                      </svg>
                      View in AR — Point at your table
                    </button>
                    <div className="ar-hint">No app needed · Works on Android & iOS</div>
                  </>
                )}

                {showAR && (
                  <ARViewerEmbed
                    modelURL={selectedItem.modelURL}
                    itemName={selectedItem.name}
                    onARLaunch={handleARLaunch}
                  />
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
