// pages/404.js
// Custom 404 page — replaces Next.js's default plain-text error page.
// Statically pre-rendered (no Firestore, no auth) so it always loads
// instantly even when the rest of the app is down.
//
// Branded to match the Aspire palette + the Halo/Helm wordmark used
// across the rest of HaloHelm.

import Head from 'next/head';
import Link from 'next/link';

const A = {
  font:      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  cream:     '#EDEDED',
  ink:       '#1A1A1A',
  warning:   '#C4A86D',
  warningDim:'#A08656',
  mutedText: 'rgba(0,0,0,0.55)',
  faintText: 'rgba(0,0,0,0.38)',
};

export default function NotFound() {
  return (
    <>
      <Head>
        <title>Page not found — HaloHelm</title>
        <meta name="robots" content="noindex,nofollow" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>
      <div style={{
        minHeight: '100vh', background: A.cream, fontFamily: A.font, color: A.ink,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '40px 24px', textAlign: 'center',
      }}>
        {/* Wordmark — kept identical to the rest of the site so 404 still
            feels "inside" the HaloHelm brand, not a generic error page. */}
        <Link href="/" style={{ textDecoration: 'none', marginBottom: 40 }}>
          <div style={{ fontWeight: 700, fontSize: 24, color: A.ink, letterSpacing: '-0.5px' }}>
            Halo<span style={{ color: A.warning, fontStyle: 'italic', fontWeight: 500 }}>Helm</span>
          </div>
        </Link>

        {/* Big 404 number — restrained, gold-coloured */}
        <div style={{
          fontSize: 96, fontWeight: 700, color: A.warning,
          letterSpacing: '-3px', lineHeight: 1, marginBottom: 18,
        }}>
          404
        </div>

        <h1 style={{
          fontSize: 28, fontWeight: 700, color: A.ink,
          letterSpacing: '-0.5px', margin: '0 0 12px',
        }}>
          We couldn't find that page.
        </h1>

        <p style={{
          fontSize: 15, color: A.mutedText, lineHeight: 1.65,
          maxWidth: 440, margin: '0 0 32px',
        }}>
          The link may be broken, or the page may have moved.
          If you scanned a table QR code that isn't working,
          please ask your waiter to activate the table.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link
            href="/"
            style={{
              padding: '12px 24px', borderRadius: 10,
              background: A.ink, color: A.cream,
              fontSize: 14, fontWeight: 600,
              textDecoration: 'none', display: 'inline-block',
            }}>
            Go to Home
          </Link>
          <Link
            href="/admin/login"
            style={{
              padding: '12px 24px', borderRadius: 10,
              background: 'transparent', color: A.ink,
              border: `1px solid rgba(0,0,0,0.15)`,
              fontSize: 14, fontWeight: 600,
              textDecoration: 'none', display: 'inline-block',
            }}>
            Sign in
          </Link>
        </div>

        <div style={{
          marginTop: 48, fontSize: 12, color: A.faintText,
        }}>
          If you think this is a bug, email{' '}
          <a href="mailto:hello@halohelm.com" style={{ color: A.warningDim, textDecoration: 'none' }}>
            hello@halohelm.com
          </a>
        </div>
      </div>
    </>
  );
}

NotFound.getLayout = (page) => page;
