// pages/staff/v2.js
//
// Server-side 308 redirect to the standalone prototype bundle the
// owner exported from Claude Design. Lives untouched at
// public/staff-v2/standalone.html — same self-extracting bundler
// the owner tested locally, so the visual + behaviour are exactly
// what they signed off on.
//
// Real-Firestore wiring is the next step (the patched index.html +
// data.js are still in public/staff-v2/ as scratch — we can switch
// over to them once the visual is confirmed identical).
//
// No React touches this response — `getServerSideProps` returns the
// redirect at the HTTP layer so the standalone HTML runs in a clean
// document without _app.js wrapping.

export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/staff-v2/standalone.html',
      permanent: false,
    },
  };
}

export default function StaffV2Redirect() {
  return null;
}
