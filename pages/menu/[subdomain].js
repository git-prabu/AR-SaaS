// pages/menu/[subdomain].js
//
// Phase 9 (Google integration) — PUBLIC, read-only menu for Google.
//
// It renders the EXACT same UI as the customer page (/restaurant/[subdomain])
// by reusing the shared <RestaurantMenu> component in `staticMenu` mode. That
// flag hides every ordering surface — the bottom dock (View Order / Call
// Waiter / Help Me Choose), the quick-add (+) on cards, the "Add to Order"
// button in the item sheet, the Combo Deals upsell, and the welcome/coach
// tour — while keeping the header, category strip, "See it on your table"
// AR strip, item detail sheet, ratings, dark mode, language switch, and the
// AR viewer. Reusing the same component (instead of a look-alike) guarantees
// the Google menu can never visually drift from the live customer menu.
//
// Same getStaticPaths + getStaticProps (ISR) and the same prop shape the
// customer page feeds the component (restaurant, menuItems, offers, combos).
import { RestaurantMenu } from '../restaurant/[subdomain]';
import { getRestaurantBySubdomainAny, getMenuItems, getActiveOffers, getCombos, getAllRestaurants } from '../../lib/db';

export default function StaticMenu(props) {
  return <RestaurantMenu {...props} staticMenu />;
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
    // Same four reads the customer page makes, so the component renders
    // identically (combos are fetched but hidden by staticMenu).
    const [menuItems, offers, combos] = await Promise.all([
      getMenuItems(restaurant.id),
      getActiveOffers(restaurant.id),
      getCombos(restaurant.id),
    ]);
    return {
      props: {
        restaurant: JSON.parse(JSON.stringify(restaurant)),
        menuItems: JSON.parse(JSON.stringify(menuItems || [])),
        offers: JSON.parse(JSON.stringify(offers || [])),
        combos: JSON.parse(JSON.stringify(combos || [])),
        error: null,
      },
      revalidate: 60, // menu refreshes in the background every 60s
    };
  } catch (err) {
    console.error('[menu/getStaticProps] failed:', err.message);
    return {
      props: { restaurant: null, menuItems: [], offers: [], combos: [], error: err.message },
      revalidate: 15,
    };
  }
}
