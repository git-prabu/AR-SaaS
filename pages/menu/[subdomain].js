// pages/menu/[subdomain].js
//
// Phase 9 (Google integration) — a PUBLIC, static, read-only menu.
// Purpose: a clean menu link a restaurant owner can paste into their Google
// Business Profile ("Menu" field). Shows categories, items, photos, and the
// AR viewer — and DELIBERATELY has NO cart, ordering, call-waiter, or table
// session (that all lives on the customer page /restaurant/[subdomain]).
//
// Rendered with getStaticProps + ISR (revalidate) so the HTML is crawlable by
// Google, and embeds schema.org Restaurant/Menu JSON-LD so Google can parse
// the dishes. Reuses the same public reads as the customer page.
import Head from 'next/head';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { getRestaurantBySubdomainAny, getMenuItems, getAllRestaurants } from '../../lib/db';

// AR viewer is client-only (model-viewer iframe). Same component the customer
// page uses, loaded on demand when a diner taps "View in 3D / AR".
const ARViewerEmbed = dynamic(() => import('../../components/ARViewer').then(m => m.ARViewerEmbed), { ssr: false });

const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER,
  cream: '#EDEDED', ink: '#1A1A1A', shell: '#FFFFFF',
  warning: '#C4A86D', warningDim: '#A08656',
  mutedText: 'rgba(0,0,0,0.55)', faintText: 'rgba(0,0,0,0.4)',
  border: '1px solid rgba(0,0,0,0.07)',
  cardShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 14px rgba(0,0,0,0.05)',
  veg: '#3F9E5A', nonVeg: '#B23B3B',
};

const rupee = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');

// Order categories by the owner's saved categoryOrder, then any leftovers A→Z.
function orderedCategories(items, categoryOrder) {
  const present = [...new Set(items.map(i => (i.category || '').trim()).filter(Boolean))];
  const ordered = Array.isArray(categoryOrder) ? categoryOrder.filter(c => present.includes(c)) : [];
  const rest = present.filter(c => !ordered.includes(c)).sort((a, b) => a.localeCompare(b));
  const all = [...ordered, ...rest];
  // Items with no category fall into a trailing "More" bucket.
  if (items.some(i => !(i.category || '').trim())) all.push('');
  return all;
}

export default function StaticMenu({ restaurant, menuItems }) {
  const [arItem, setArItem] = useState(null);

  if (!restaurant) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: INTER, background: A.cream, color: A.mutedText }}>
        Menu not found.
      </div>
    );
  }

  const items = (menuItems || []).filter(i => i.isActive !== false);
  const cats = orderedCategories(items, restaurant.categoryOrder);
  const byCat = {};
  for (const it of items) {
    const k = (it.category || '').trim();
    (byCat[k] = byCat[k] || []).push(it);
  }
  const catImages = (restaurant.categoryImages && typeof restaurant.categoryImages === 'object') ? restaurant.categoryImages : {};

  // ── schema.org so Google can read the menu ──
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: restaurant.name,
    ...(restaurant.address ? { address: restaurant.address } : {}),
    ...(restaurant.phone ? { telephone: restaurant.phone } : {}),
    ...(restaurant.cuisine ? { servesCuisine: restaurant.cuisine } : {}),
    hasMenu: {
      '@type': 'Menu',
      hasMenuSection: cats.filter(c => (byCat[c] || []).length).map(c => ({
        '@type': 'MenuSection',
        name: c || 'More',
        hasMenuItem: (byCat[c] || []).map(it => ({
          '@type': 'MenuItem',
          name: it.name,
          ...(it.description ? { description: String(it.description).slice(0, 300) } : {}),
          offers: { '@type': 'Offer', price: Math.round(Number(it.price) || 0), priceCurrency: 'INR' },
        })),
      })),
    },
  };

  const title = `${restaurant.name} — Menu`;
  const desc = `Browse the menu at ${restaurant.name}${restaurant.cuisine ? ` · ${restaurant.cuisine}` : ''}. View dishes in 3D / AR.`;

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={desc} />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={desc} />
        <meta property="og:type" content="restaurant.menu" />
        {/* eslint-disable-next-line react/no-danger */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </Head>

      <div style={{ minHeight: '100vh', background: A.cream, fontFamily: A.font, color: A.ink }}>
        <style>{`
          @keyframes mfade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
          .m-item:hover { box-shadow: 0 2px 4px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.07); }
        `}</style>

        {/* Header */}
        <header style={{ background: A.shell, borderBottom: A.border, padding: '22px 18px 18px' }}>
          <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 14 }}>
            {restaurant.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={restaurant.logoUrl} alt={restaurant.name} style={{ width: 52, height: 52, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
            ) : null}
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.4px', margin: 0, lineHeight: 1.1 }}>{restaurant.name}</h1>
              <div style={{ fontSize: 12.5, color: A.mutedText, marginTop: 3 }}>
                {restaurant.cuisine ? restaurant.cuisine : 'Menu'}{restaurant.city ? ` · ${restaurant.city}` : ''}
              </div>
            </div>
          </div>
        </header>

        {/* Menu */}
        <main style={{ maxWidth: 860, margin: '0 auto', padding: '20px 16px 60px' }}>
          {items.length === 0 && (
            <div style={{ textAlign: 'center', color: A.mutedText, padding: '60px 0', fontSize: 14 }}>
              This menu isn’t available yet.
            </div>
          )}

          {cats.filter(c => (byCat[c] || []).length).map(c => (
            <section key={c || '_more'} style={{ marginBottom: 30 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                {catImages[c] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={catImages[c]} alt="" style={{ width: 30, height: 30, borderRadius: 8, objectFit: 'cover' }} />
                ) : null}
                <h2 style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.02em', textTransform: 'uppercase', color: A.warningDim, margin: 0 }}>
                  {c || 'More'}
                </h2>
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                {(byCat[c] || []).map(item => {
                  const unavailable = item.isOutOfStock === true;
                  return (
                    <div key={item.id} className="m-item" style={{
                      background: A.shell, border: A.border, borderRadius: 14, boxShadow: A.cardShadow,
                      padding: 12, display: 'flex', gap: 13, alignItems: 'flex-start',
                      opacity: unavailable ? 0.6 : 1, transition: 'box-shadow .15s',
                    }}>
                      {item.imageURL ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.imageURL} alt={item.name} loading="lazy"
                          style={{ width: 86, height: 86, borderRadius: 11, objectFit: 'cover', flexShrink: 0, background: A.cream }} />
                      ) : (
                        <div style={{ width: 86, height: 86, borderRadius: 11, background: A.cream, flexShrink: 0 }} />
                      )}

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{
                            width: 13, height: 13, borderRadius: 3, flexShrink: 0,
                            border: `1.5px solid ${item.isVeg ? A.veg : A.nonVeg}`,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: item.isVeg ? A.veg : A.nonVeg }} />
                          </span>
                          <span style={{ fontSize: 15, fontWeight: 700, color: A.ink }}>{item.name}</span>
                        </div>

                        <div style={{ fontSize: 14, fontWeight: 700, color: A.ink, marginTop: 4 }}>{rupee(item.price)}</div>

                        {item.description ? (
                          <p style={{ fontSize: 12.5, color: A.mutedText, margin: '5px 0 0', lineHeight: 1.45 }}>
                            {String(item.description).slice(0, 160)}
                          </p>
                        ) : null}

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                          {unavailable && (
                            <span style={{ fontSize: 11, fontWeight: 700, color: A.nonVeg, background: 'rgba(178,59,59,0.08)', padding: '3px 8px', borderRadius: 6 }}>
                              Currently unavailable
                            </span>
                          )}
                          {item.modelURL ? (
                            <button onClick={() => setArItem(item)}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                                border: `1px solid ${A.warning}`, background: 'rgba(196,168,109,0.10)',
                                color: A.warningDim, fontSize: 12, fontWeight: 700, fontFamily: A.font,
                              }}>
                              🥽 View in 3D / AR
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <div style={{ textAlign: 'center', marginTop: 24, fontSize: 11.5, color: A.faintText }}>
            Menu powered by <span style={{ fontWeight: 600 }}>Halo<span style={{ color: A.warning, fontStyle: 'italic' }}>Helm</span></span>
          </div>
        </main>

        {/* AR modal */}
        {arItem && (
          <div onClick={() => setArItem(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, animation: 'mfade .2s ease' }}>
            <div onClick={(e) => e.stopPropagation()}
              style={{ background: A.shell, borderRadius: 18, width: '100%', maxWidth: 480, padding: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: A.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{arItem.name}</div>
                <button onClick={() => setArItem(null)} aria-label="Close"
                  style={{ border: 'none', background: 'transparent', fontSize: 22, lineHeight: 1, cursor: 'pointer', color: A.mutedText, padding: '0 4px' }}>×</button>
              </div>
              <ARViewerEmbed modelURL={arItem.modelURL} itemName={arItem.name} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// Pre-build a page for every active restaurant; new ones build on first hit.
export async function getStaticPaths() {
  try {
    const restaurants = await getAllRestaurants();
    return {
      paths: restaurants
        .filter(r => r.isActive && r.subdomain)
        .map(r => ({ params: { subdomain: r.subdomain } })),
      fallback: 'blocking',
    };
  } catch (err) {
    console.error('[menu/getStaticPaths] failed:', err.message);
    return { paths: [], fallback: 'blocking' };
  }
}

export async function getStaticProps({ params }) {
  try {
    const restaurant = await getRestaurantBySubdomainAny(params.subdomain);
    if (!restaurant) return { notFound: true, revalidate: 30 };
    const menuItems = await getMenuItems(restaurant.id);
    return {
      props: {
        restaurant: JSON.parse(JSON.stringify(restaurant)),
        menuItems: JSON.parse(JSON.stringify(menuItems || [])),
      },
      revalidate: 120, // menu refreshes in the background every 2 min
    };
  } catch (err) {
    console.error('[menu/getStaticProps] failed:', err.message);
    return { notFound: true, revalidate: 15 };
  }
}
