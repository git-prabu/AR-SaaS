// pages/_app.js
import '../styles/globals.css';
// staff-v2 dark theme tokens — fully scoped under .sv2 root class so
// they cannot leak onto any other page. Imported here because Next.js
// only allows global CSS imports from _app.
import '../styles/staff-v2.css';
import React, { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Toaster } from 'react-hot-toast';
import OfflineIndicator from '../components/OfflineIndicator';
// AuthProviders is a STATIC import — it must be, because next/dynamic
// (even with ssr:true) introduces a hydration boundary: until that chunk
// loads, the wrapped subtree is inert server-HTML. On the admin/staff
// login forms that meant a click on "Sign in" before the chunk landed
// did a native GET submit — page refresh, form cleared, no login. A
// static import keeps every page interactive the instant React hydrates.
//
// Trade-off: firebase/auth (~80KB) rides in the shared _app chunk, so
// the customer menu page carries it too. The lib/firebase.js <->
// lib/firebaseAuth.js <-> lib/db.js split still stands (it's correct
// structure) — it just doesn't shrink the customer bundle on its own
// while _app.js wraps every route in the auth providers. Properly
// excluding auth from the customer bundle needs a per-page-layout
// refactor (getLayout on each admin page); that's a separate, larger
// change. Correctness of login > an 80KB bundle micro-win.
import AuthProviders from '../components/AuthProviders';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      // Error fallback uses the Aspire palette so it matches the rest of the app.
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: '#EDEDED', color: '#1A1A1A' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.55)', marginBottom: 20 }}>An unexpected error occurred.</p>
          <button onClick={() => window.location.reload()} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: '#1A1A1A', color: '#EDEDED', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App({ Component, pageProps }) {
  const getLayout = Component.getLayout || ((page) => page);
  const router = useRouter();
  // Phase L — only inject the static admin manifest on routes that
  // AREN'T the customer-facing /restaurant/{subdomain} (which provides
  // its own per-restaurant dynamic manifest in its page <Head>).
  // Browsers use the FIRST <link rel="manifest"> they see, so we
  // can't have both — placing the static one in _document would
  // always win and clobber the customer page's per-restaurant
  // manifest with the admin-focused one.
  const isCustomerPage = router.pathname.startsWith('/restaurant/') || router.pathname.startsWith('/r/');
  // Staff portal (/staff/*) needs its OWN manifest with start_url
  // /staff/home, NOT /admin (the owner login). Without this, a staff
  // member who installs the app from /staff/login lands at /admin
  // when they reopen it — and they can't sign in there because they
  // don't have an admin account. The staff-manifest.json also has
  // staff-specific shortcuts (Kitchen / Waiter / Orders that point
  // to /staff/* paths, which the existing next.config.js
  // rewrite serves from /admin/* pages with the staff token). */
  const isStaffPage = router.pathname.startsWith('/staff/');

  // Register the service worker once the app has mounted. Only runs in the
  // browser and only once per page load. Next.js hot-reload in dev sometimes
  // re-runs this effect; navigator.serviceWorker.register is idempotent so
  // that's fine. Gracefully no-ops if the browser lacks SW support.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // Register after the window load event so SW registration doesn't compete
    // with initial page render.
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        // Non-fatal — app works without SW, just no offline shell cold-start.
        console.warn('Service worker registration failed:', err);
      });
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return (
    // All three providers are completely independent — different Firebase
    // app instances, different localStorage keys, no shared state. They
    // wrap EVERY page (statically) so hydration is never delayed.
    <ErrorBoundary>
      {!isCustomerPage && (
        <Head>
          <link
            rel="manifest"
            href={isStaffPage ? '/staff-manifest.json' : '/manifest.json'}
          />
          {/* iOS Safari doesn't honour manifest start_url — it always
              opens the URL the user was on when they tapped Add to
              Home Screen. apple-mobile-web-app-capable + viewport are
              already set in _document.js so the home-screen icon
              behaves like a native app on iOS too. */}
          <meta name="application-name" content={isStaffPage ? 'HaloHelm Staff' : 'HaloHelm'} />
        </Head>
      )}
      <AuthProviders>
        <OfflineIndicator />
        {getLayout(<Component {...pageProps} />)}
        <Toaster
          position="top-right"
          toastOptions={{
            // Aspire palette — matches the admin chrome (matte-black bg, cream
            // text, subtle gold hairline border). Icon theme keeps semantic
            // green/red but uses the exact green/red used throughout admin pages.
            style: {
              background: '#1A1A1A',
              color: '#EDEDED',
              border: '1px solid rgba(196,168,109,0.18)',
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              fontSize: 13,
              borderRadius: 10,
              boxShadow: '0 4px 24px rgba(0,0,0,0.28)',
            },
            success: { iconTheme: { primary: '#3F9E5A', secondary: '#EDEDED' } },
            error:   { iconTheme: { primary: '#D9534F', secondary: '#EDEDED' } },
          }}
        />
      </AuthProviders>
    </ErrorBoundary>
  );
}
