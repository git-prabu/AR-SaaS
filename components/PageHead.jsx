// components/PageHead.jsx
// Tiny wrapper around next/head that enforces a single, consistent page-title
// format: "PageName — Advert Radical". Replaces a bunch of ad-hoc <Head><title>
// declarations that had drifted between em-dash (—) and pipe (|) separators.
//
// Usage:
//   import PageHead from '../../components/PageHead';
//   <PageHead title="Orders" />
//
// Pass extras as children if the page needs more <Head> tags (meta/scripts/etc):
//   <PageHead title="Subscription">
//     <script src="https://checkout.razorpay.com/v1/checkout.js" />
//   </PageHead>
import Head from 'next/head';

const BRAND = 'Advert Radical';
const SEPARATOR = '—';  // em-dash, not pipe. Single source for titles.

export default function PageHead({ title, children }) {
  const fullTitle = title ? `${title} ${SEPARATOR} ${BRAND}` : BRAND;
  return (
    <Head>
      <title>{fullTitle}</title>
      {children}
    </Head>
  );
}
