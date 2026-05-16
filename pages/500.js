// pages/500.js
// Custom 500 page — replaces Next.js's default unstyled error page for
// server-side failures. Pre-rendered (no JS / Firestore dependency) so
// it loads even when the app's runtime is broken.

import Head from 'next/head';
import Link from 'next/link';

const A = {
  font:      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  cream:     '#EDEDED',
  ink:       '#1A1A1A',
  warning:   '#C4A86D',
  warningDim:'#A08656',
  danger:    '#D9534F',
  mutedText: 'rgba(0,0,0,0.55)',
  faintText: 'rgba(0,0,0,0.38)',
};

export default function ServerError() {
  return (
    <>
      <Head>
        <title>Something went wrong — HaloHelm</title>
        <meta name="robots" content="noindex,nofollow" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>
      <div style={{
        minHeight: '100vh', background: A.cream, fontFamily: A.font, color: A.ink,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '40px 24px', textAlign: 'center',
      }}>
        <Link href="/" style={{ textDecoration: 'none', marginBottom: 40 }}>
          <div style={{ fontWeight: 700, fontSize: 24, color: A.ink, letterSpacing: '-0.5px' }}>
            Halo<span style={{ color: A.warning, fontStyle: 'italic', fontWeight: 500 }}>Helm</span>
          </div>
        </Link>

        {/* Use the danger colour (red-orange) for 500 — it's the only place
            we use red, to signal "something broke on our side, not yours". */}
        <div style={{
          fontSize: 96, fontWeight: 700, color: A.danger,
          letterSpacing: '-3px', lineHeight: 1, marginBottom: 18,
        }}>
          500
        </div>

        <h1 style={{
          fontSize: 28, fontWeight: 700, color: A.ink,
          letterSpacing: '-0.5px', margin: '0 0 12px',
        }}>
          Something went wrong on our end.
        </h1>

        <p style={{
          fontSize: 15, color: A.mutedText, lineHeight: 1.65,
          maxWidth: 440, margin: '0 0 32px',
        }}>
          Our team has been notified. Please try refreshing the page in a moment.
          If the problem keeps happening, get in touch.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={() => typeof window !== 'undefined' && window.location.reload()}
            style={{
              padding: '12px 24px', borderRadius: 10,
              background: A.ink, color: A.cream,
              fontSize: 14, fontWeight: 600,
              border: 'none', cursor: 'pointer',
            }}>
            Refresh page
          </button>
          <Link
            href="/"
            style={{
              padding: '12px 24px', borderRadius: 10,
              background: 'transparent', color: A.ink,
              border: `1px solid rgba(0,0,0,0.15)`,
              fontSize: 14, fontWeight: 600,
              textDecoration: 'none', display: 'inline-block',
            }}>
            Go to Home
          </Link>
        </div>

        <div style={{
          marginTop: 48, fontSize: 12, color: A.faintText,
        }}>
          Email{' '}
          <a href="mailto:hello@halohelm.com" style={{ color: A.warningDim, textDecoration: 'none' }}>
            hello@halohelm.com
          </a>
          {' '}with what you were doing when this happened, and we'll investigate.
        </div>
      </div>
    </>
  );
}

ServerError.getLayout = (page) => page;
