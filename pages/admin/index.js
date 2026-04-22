// pages/admin/index.js
// /admin → /admin/analytics redirect. Server-side so there's no flash of
// unrendered content. A real command-center dashboard home is planned for
// Sprint 1 — until then this is the cleanest answer.
export async function getServerSideProps() {
  return {
    redirect: { destination: '/admin/analytics', permanent: false },
  };
}

export default function AdminHome() {
  return null;
}
