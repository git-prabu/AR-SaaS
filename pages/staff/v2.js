// pages/staff/v2.js
//
// Thin redirect to the standalone static prototype at
// /staff-v2/index.html (lives in public/staff-v2/). The previous
// React-rendered version is gone — we ship the prototype's HTML
// untouched so the design is byte-for-byte the Claude Design export
// the owner mocked up. All Firestore wiring lives inside that
// folder (see public/staff-v2/data.js).
//
// Server-side: a 308 redirect via getServerSideProps means the
// browser navigates directly without rendering anything from React.
// No _app.js wrapping, no globals.css, no hydration. Just the
// static HTML.

export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/staff-v2/index.html',
      permanent: false,
    },
  };
}

export default function StaffV2Redirect() {
  return null;
}
