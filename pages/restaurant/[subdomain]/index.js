// pages/restaurant/[subdomain]/index.js
// Public customer-facing menu page
import Head from 'next/head';
import { useState, useEffect, useCallback } from 'react';
import { getRestaurantBySubdomain, getMenuItems, getActiveOffers, trackVisit, incrementItemView, incrementARView } from '../../../lib/db';
import { ARViewerEmbed } from '../../../components/ARViewer';

// Generate a session ID for analytics
function getSessionId() {
  if (typeof window === 'undefined') return 'ssr';
  let sid = sessionStorage.getItem('ar_sid');
  if (!sid) {
    sid = Math.random().toString(36).substr(2, 16);
    sessionStorage.setItem('ar_sid', sid);
  }
  return sid;
}

export default function RestaurantMenu({ restaurant, menuItems, offers, error }) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedItem, setSelectedItem] = useState(null);
  const [showAR, setShowAR]               = useState(false);

  // Track visit on mount
  useEffect(() => {
    if (!restaurant?.id) return;
    const sid = getSessionId();
    trackVisit(restaurant.id, sid).catch(() => {});
  }, [restaurant?.id]);

  const categories = ['All', ...new Set((menuItems || []).map(i => i.category).filter(Boolean))];
  const filtered   = activeCategory === 'All'
    ? menuItems
    : menuItems.filter(i => i.category === activeCategory);

  const openItem = useCallback(async (item) => {
    setSelectedItem(item);
    setShowAR(false);
    if (restaurant?.id) {
      await incrementItemView(restaurant.id, item.id).catch(() => {});
    }
  }, [restaurant?.id]);

  const handleARLaunch = useCallback(async () => {
    if (restaurant?.id && selectedItem?.id) {
      await incrementARView(restaurant.id, selectedItem.id).catch(() => {});
    }
  }, [restaurant?.id, selectedItem?.id]);

  if (error || !restaurant) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center font-body text-center px-6">
        <div>
          <div className="text-5xl mb-4">🍽️</div>
          <h1 className="font-display text-2xl font-bold text-text-primary mb-2">Restaurant not found</h1>
          <p className="text-text-secondary">This page doesn't exist or the restaurant is currently inactive.</p>
        </div>
      </div>
    );
  }

  const activeOffer = offers?.[0];

  return (
    <>
      <Head>
        <title>{restaurant.name} — AR Menu</title>
        <meta name="description" content={`View ${restaurant.name}'s menu in augmented reality`} />
      </Head>

      <div className="min-h-screen bg-bg-base font-body text-text-primary">

        {/* OFFER BANNER */}
        {activeOffer && (
          <div
            className="px-4 py-2.5 text-center text-sm font-medium"
            style={{ background: 'linear-gradient(90deg, #FF6B35, #FFB347)' }}
          >
            🎉 {activeOffer.title} — {activeOffer.description}
          </div>
        )}

        {/* HEADER */}
        <header className="px-6 py-6 border-b border-bg-border bg-bg-surface sticky top-0 z-30">
          <div className="max-w-2xl mx-auto flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-brand/20 flex items-center justify-center text-2xl flex-shrink-0">
              🍽️
            </div>
            <div>
              <h1 className="font-display font-bold text-xl leading-tight">{restaurant.name}</h1>
              <p className="text-text-secondary text-xs mt-0.5">Scan any item to view it in AR</p>
            </div>
            {/* AR Badge */}
            <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-brand/30 bg-brand/10 text-brand text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
              AR Enabled
            </div>
          </div>

          {/* Category tabs */}
          <div className="max-w-2xl mx-auto mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeCategory === cat
                    ? 'bg-brand text-white'
                    : 'bg-bg-raised border border-bg-border text-text-secondary hover:text-text-primary'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </header>

        {/* MENU GRID */}
        <main className="max-w-2xl mx-auto px-4 py-6">
          {filtered.length === 0 ? (
            <div className="text-center py-20 text-text-muted">
              <div className="text-4xl mb-3">🥢</div>
              <p>No items in this category yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filtered.map(item => (
                <button
                  key={item.id}
                  onClick={() => openItem(item)}
                  className="bg-bg-surface border border-bg-border rounded-2xl overflow-hidden text-left card-lift transition-all hover:border-brand/30"
                >
                  {/* Cover image */}
                  <div className="w-full h-36 bg-bg-raised overflow-hidden">
                    {item.imageURL ? (
                      <img
                        src={item.imageURL}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl">🍽️</div>
                    )}
                  </div>

                  <div className="p-3">
                    <div className="font-medium text-sm leading-tight mb-1">{item.name}</div>
                    {item.calories && (
                      <div className="text-xs text-text-muted">{item.calories} kcal</div>
                    )}
                    {item.modelURL && (
                      <div className="mt-2 text-xs text-brand font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand" />
                        View in AR
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </main>

        {/* ITEM DETAIL MODAL */}
        {selectedItem && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center"
            onClick={(e) => { if (e.target === e.currentTarget) { setSelectedItem(null); setShowAR(false); } }}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

            {/* Sheet */}
            <div className="relative w-full max-w-lg bg-bg-surface border border-bg-border rounded-t-3xl overflow-y-auto max-h-[92vh] z-10">
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-bg-border" />
              </div>

              {/* Close */}
              <button
                onClick={() => { setSelectedItem(null); setShowAR(false); }}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-bg-raised flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors"
              >
                ✕
              </button>

              <div className="px-6 pb-10">
                {/* Cover */}
                {!showAR && (
                  <div className="w-full h-52 rounded-2xl overflow-hidden bg-bg-raised mb-4 mt-2">
                    {selectedItem.imageURL ? (
                      <img
                        src={selectedItem.imageURL}
                        alt={selectedItem.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-6xl">🍽️</div>
                    )}
                  </div>
                )}

                {/* Title */}
                <h2 className="font-display font-bold text-2xl mb-1">{selectedItem.name}</h2>
                {selectedItem.category && (
                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-brand/10 text-brand text-xs font-medium mb-3">
                    {selectedItem.category}
                  </span>
                )}
                {selectedItem.description && (
                  <p className="text-text-secondary text-sm leading-relaxed mb-4">{selectedItem.description}</p>
                )}

                {/* Nutritional info */}
                {(selectedItem.calories || selectedItem.protein || selectedItem.carbs || selectedItem.fats) && (
                  <div className="grid grid-cols-4 gap-2 mb-5">
                    {[
                      { label: 'Calories', val: selectedItem.calories, unit: 'kcal' },
                      { label: 'Protein',  val: selectedItem.protein,  unit: 'g'    },
                      { label: 'Carbs',    val: selectedItem.carbs,    unit: 'g'    },
                      { label: 'Fats',     val: selectedItem.fats,     unit: 'g'    },
                    ].map(n => n.val && (
                      <div key={n.label} className="bg-bg-raised rounded-xl p-3 text-center">
                        <div className="font-display font-bold text-lg text-brand">{n.val}</div>
                        <div className="text-xs text-text-muted leading-tight">{n.unit}<br/>{n.label}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Ingredients */}
                {selectedItem.ingredients?.length > 0 && (
                  <div className="mb-5">
                    <h3 className="font-display font-semibold text-sm text-text-secondary uppercase tracking-wider mb-2">
                      Ingredients
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedItem.ingredients.map(ing => (
                        <span
                          key={ing}
                          className="px-2.5 py-1 rounded-lg bg-bg-raised border border-bg-border text-xs text-text-secondary"
                        >
                          {ing}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* AR Section */}
                {!showAR && selectedItem.modelURL && (
                  <button
                    onClick={() => setShowAR(true)}
                    className="w-full py-4 rounded-xl font-semibold text-white flex items-center justify-center gap-3 ar-pulse mt-2"
                    style={{ background: 'linear-gradient(135deg, #FF6B35 0%, #FFB347 100%)' }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                      <path d="M2 17l10 5 10-5"/>
                      <path d="M2 12l10 5 10-5"/>
                    </svg>
                    View in AR
                  </button>
                )}

                {showAR && (
                  <ARViewerEmbed
                    modelURL={selectedItem.modelURL}
                    imageURL={selectedItem.imageURL}
                    itemName={selectedItem.name}
                    onARLaunch={handleARLaunch}
                    restaurantId={restaurant.id}
                    itemId={selectedItem.id}
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

    if (!restaurant) {
      return { props: { restaurant: null, menuItems: [], offers: [], error: 'Not found' } };
    }

    const [menuItems, offers] = await Promise.all([
      getMenuItems(restaurant.id),
      getActiveOffers(restaurant.id),
    ]);

    return {
      props: {
        restaurant: JSON.parse(JSON.stringify(restaurant)),
        menuItems:  JSON.parse(JSON.stringify(menuItems)),
        offers:     JSON.parse(JSON.stringify(offers)),
        error: null,
      },
    };
  } catch (err) {
    return {
      props: { restaurant: null, menuItems: [], offers: [], error: err.message },
    };
  }
}
