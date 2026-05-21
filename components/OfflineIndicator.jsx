// components/OfflineIndicator.jsx
// Global connection banner. Listens to the browser's online/offline events
// and shows a top bar:
//   · offline      → matte-black bar: "You're offline — changes will sync…"
//   · just back    → green bar for ~3s: "Back online — changes synced" so
//                    staff get explicit closure that their queued writes
//                    flushed (Phase 1c).
// Mounted once in pages/_app.js → covers every page.
import { useEffect, useRef, useState } from 'react';

const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export default function OfflineIndicator() {
  const [online, setOnline] = useState(true);
  const [justReconnected, setJustReconnected] = useState(false);
  const [mounted, setMounted] = useState(false);
  // Track whether we were ever offline, so we only flash the green
  // "synced" confirmation after an actual drop (not on first load).
  const wasOffline = useRef(false);
  const flashTimer = useRef(null);

  useEffect(() => {
    setMounted(true);
    if (typeof navigator === 'undefined') return;
    setOnline(navigator.onLine);

    const handleOnline = () => {
      setOnline(true);
      if (wasOffline.current) {
        wasOffline.current = false;
        setJustReconnected(true);
        clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setJustReconnected(false), 3000);
      }
    };
    const handleOffline = () => {
      wasOffline.current = true;
      setJustReconnected(false);
      setOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearTimeout(flashTimer.current);
    };
  }, []);

  if (!mounted) return null;

  // Back-online confirmation (green, auto-dismisses).
  if (online && justReconnected) {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        background: '#1A1A1A', color: '#EAE7E3',
        padding: '8px 16px', textAlign: 'center', fontFamily: INTER,
        fontSize: 13, fontWeight: 600, letterSpacing: '0.01em',
        borderBottom: '2px solid #3F9E5A',
        boxShadow: '0 2px 12px rgba(0,0,0,0.28)',
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3F9E5A' }} />
          Back online — your changes have synced
        </span>
      </div>
    );
  }

  if (online) return null;

  // Offline bar.
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
      background: '#1A1A1A', color: '#EAE7E3',
      padding: '8px 16px', textAlign: 'center', fontFamily: INTER,
      fontSize: 13, fontWeight: 600, letterSpacing: '0.01em',
      borderBottom: '2px solid #C4A86D',
      boxShadow: '0 2px 12px rgba(0,0,0,0.28)',
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#D9534F' }} />
        You're offline — orders &amp; changes will sync when the connection returns
      </span>
    </div>
  );
}
