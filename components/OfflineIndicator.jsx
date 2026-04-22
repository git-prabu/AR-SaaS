// components/OfflineIndicator.jsx
// Global offline banner. Listens to the browser's online/offline events and
// shows a matte-black pill across the top when the user loses connectivity.
// Works everywhere because it's mounted in pages/_app.js — one instance,
// all pages.
import { useEffect, useState } from 'react';

const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export default function OfflineIndicator() {
  const [online, setOnline] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Run on mount to avoid SSR hydration mismatch (navigator is undefined on SSR).
    setMounted(true);
    if (typeof navigator === 'undefined') return;
    setOnline(navigator.onLine);
    const handleOnline  = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!mounted || online) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
      background: '#1A1A1A', color: '#EAE7E3',
      padding: '8px 16px', textAlign: 'center',
      fontFamily: INTER,
      fontSize: 13, fontWeight: 600, letterSpacing: '0.01em',
      borderBottom: '2px solid #C4A86D',
      boxShadow: '0 2px 12px rgba(0,0,0,0.28)',
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#D9534F' }} />
        You're offline — changes will sync when connection returns
      </span>
    </div>
  );
}
