// pages/admin/offers.js
//
// Redirect stub. The standalone Offers page was consolidated into
// /admin/promotions (which has inline Create + Edit drawers for offers,
// coupons, and combos). This stub forwards old links/bookmarks to the
// Offers tab of the new page.
//
// Server-side redirect via getServerSideProps so the user never sees a
// flash of the redirect page before client-side routing kicks in.
export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/admin/promotions?tab=offers',
      permanent: false,
    },
  };
}

export default function AdminOffersRedirect() {
  return null;
}
