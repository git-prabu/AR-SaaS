// pages/_app.js
import '../styles/globals.css';
import React from 'react';
import { AdminAuthProvider, SuperAdminAuthProvider } from '../hooks/useAuth';
import { StaffAuthProvider } from '../hooks/useStaffAuth';
import { Toaster } from 'react-hot-toast';

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

  return (
    // All three providers are completely independent — different Firebase
    // app instances, different localStorage keys, no shared state.
    <ErrorBoundary>
    <AdminAuthProvider>
      <SuperAdminAuthProvider>
        <StaffAuthProvider>
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
        </StaffAuthProvider>
      </SuperAdminAuthProvider>
    </AdminAuthProvider>
    </ErrorBoundary>
  );
}