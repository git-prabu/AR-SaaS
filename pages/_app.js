// pages/_app.js
import '../styles/globals.css';
import React, { useEffect } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { Toaster } from 'react-hot-toast';
import OfflineIndicator from '../components/OfflineIndicator';

// Auth providers are dynamically imported so the firebase/auth SDK
// (~120-150KB) lands in its OWN chunk instead of the shared _app bundle
// that every page — including the anonymous customer menu page — loads.
// The customer page renders WITHOUT this component (see render branch
// below), so its bundle never pulls firebase/auth at all.
//   ssr: true  → still server-rendered for admin/staff pages, so there's
//                no auth-context flash on those routes.
const AuthProviders = dynamic(() => import('../components/AuthProviders'), { ssr: true });

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
  //
  // The same flag also decides whether to mount the Firebase auth
  // providers. Customer-facing routes (/restaurant/* and /r/*) are
  // fully anonymous — they never read an auth context — so we skip
  // AuthProviders entirely for them, keeping firebase/auth out of
  // their bundle. router.pathname is identical on server + client,
  // so this branch is deterministic and hydration-safe.
  const isCustomerPage = router.pathname.startsWith('/restaurant/') || router.pathname.startsWith('/r/');

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

  // Toaster config is shared by both branches — Aspire palette, matches
  // the admin chrome (matte-black bg, cream text, subtle gold hairline).
  const toaster = (
    <Toaster
      position="top-right"
      toastOptions={{
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
  );

  // ── Customer-facing routes — NO auth providers ──
  // /restaurant/* and /r/* are anonymous. Mounting them without
  // AuthProviders keeps firebase/auth out of the customer bundle
  // entirely (it becomes its own dynamically-loaded chunk used only
  // by admin/staff/superadmin routes).
  if (isCustomerPage) {
    return (
      <ErrorBoundary>
        <OfflineIndicator />
        {getLayout(<Component {...pageProps} />)}
        {toaster}
      </ErrorBoundary>
    );
  }

  // ── Admin / staff / superadmin / landing / signup — full auth stack ──
  return (
    <ErrorBoundary>
      <Head>
        <link rel="manifest" href="/manifest.json" />
      </Head>
      <AuthProviders>
        <OfflineIndicator />
        {getLayout(<Component {...pageProps} />)}
        {toaster}
      </AuthProviders>
    </ErrorBoundary>
  );
}
