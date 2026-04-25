// pages/admin/combos.js
//
// Redirect stub. The standalone Combos page was consolidated into
// /admin/promotions. See pages/admin/promotions.js for the unified editor.
export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/admin/promotions?tab=combos',
      permanent: false,
    },
  };
}

export default function AdminCombosRedirect() {
  return null;
}
