// pages/admin/coupons.js
//
// Redirect stub. The standalone Coupons page was consolidated into
// /admin/promotions. See pages/admin/promotions.js for the unified editor.
export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/admin/promotions?tab=coupons',
      permanent: false,
    },
  };
}

export default function AdminCouponsRedirect() {
  return null;
}
