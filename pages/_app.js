// pages/_app.js
import '../styles/globals.css';
import React from 'react';
import { AdminAuthProvider, SuperAdminAuthProvider } from '../hooks/useAuth';
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
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter,sans-serif', background: '#FAF7F2', color: '#1E1B18' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ fontSize: 14, color: 'rgba(42,31,16,0.55)', marginBottom: 20 }}>An unexpected error occurred.</p>
          <button onClick={() => window.location.reload()} style={{ padding: '10px 24px', borderRadius: 12, border: 'none', background: '#1E1B18', color: '#FFF5E8', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App({ Component, pageProps }) {
  const getLayout = Component.getLayout || ((page) => page);

  return (
    // Both providers are completely independent — different Firebase
    // app instances, different localStorage keys, no shared state.
    <ErrorBoundary>
    <AdminAuthProvider>
      <SuperAdminAuthProvider>
        {getLayout(<Component {...pageProps} />)}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#18181D',
              color: '#F2F2EE',
              border: '1px solid #27272E',
              fontFamily: "Inter, sans-serif",
            },
            success: { iconTheme: { primary: '#FF6B35', secondary: '#09090B' } },
            error: { iconTheme: { primary: '#EF4444', secondary: '#09090B' } },
          }}
        />
      </SuperAdminAuthProvider>
    </AdminAuthProvider>
    </ErrorBoundary>
  );
}