// components/PwaInstallPrompt.jsx
//
// A subtle, non-pushy nudge that asks admin users to install HaloHelm
// as a PWA on their device. Shows ONLY when:
//   - The browser fires `beforeinstallprompt` (i.e. the PWA is
//     installable — manifest + service worker + correct MIME types are
//     all in place). Chrome/Edge/Brave/Samsung Internet do; iOS Safari
//     does NOT, so the prompt never shows on iOS.
//   - The app isn't already installed (we check `display-mode: standalone`)
//   - The user hasn't dismissed the prompt in this session
//   - The user hasn't permanently dismissed it ("Not now" → 7-day
//     cool-down, "Don't show again" → forever)
//
// Renders as a small bottom-right card that slides in. Stays out of the
// way of admin content but stays visible enough to actually be noticed.
//
// IMPORTANT: this only renders inside AdminLayout (where we import it).
// It does NOT show on the customer menu page — diners shouldn't be
// prompted to install the restaurant's admin app.

import { useState, useEffect } from 'react';

// localStorage keys
const DISMISS_FOREVER_KEY = 'ar_pwa_install_dismiss_forever';
const DISMISS_UNTIL_KEY   = 'ar_pwa_install_dismiss_until'; // ms epoch

// "Not now" snoozes the prompt for this many days.
const NOT_NOW_SNOOZE_DAYS = 7;

const A = {
  font:       "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  ink:        '#1A1A1A',
  cream:      '#EDEDED',
  warning:    '#C4A86D',
  warningDim: '#A08656',
  mutedText:  'rgba(0,0,0,0.55)',
  faintText:  'rgba(0,0,0,0.42)',
  shell:      '#FFFFFF',
  border:     '1px solid rgba(0,0,0,0.10)',
};

function isAlreadyInstalled() {
  if (typeof window === 'undefined') return false;
  // Two ways to detect: display-mode: standalone (most browsers) and
  // iOS Safari's `navigator.standalone` (legacy / non-standard).
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
    if (window.navigator?.standalone === true) return true;
  } catch {}
  return false;
}

function shouldShowNow() {
  if (typeof window === 'undefined') return false;
  try {
    if (localStorage.getItem(DISMISS_FOREVER_KEY) === '1') return false;
    const until = parseInt(localStorage.getItem(DISMISS_UNTIL_KEY) || '0', 10);
    if (until && until > Date.now()) return false;
  } catch {}
  return true;
}

export default function PwaInstallPrompt() {
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // If already installed, never show.
    if (isAlreadyInstalled()) return;

    // If the user dismissed permanently or recently, don't even listen.
    if (!shouldShowNow()) return;

    const handler = (e) => {
      // Chrome wants us to call e.preventDefault() to take control of
      // when the prompt shows. Then we call e.prompt() ourselves later.
      e.preventDefault();
      setInstallPromptEvent(e);
      // Small delay so the card slides in AFTER the page has settled
      // (avoids competing with the admin's first interaction).
      setTimeout(() => setVisible(true), 2500);
    };

    // When the user installs from our prompt OR from the browser's
    // built-in menu, clear our state so the card doesn't reappear.
    const onInstalled = () => {
      setVisible(false);
      setInstallPromptEvent(null);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!visible || !installPromptEvent) return null;

  const handleInstall = async () => {
    if (installing) return;
    setInstalling(true);
    try {
      installPromptEvent.prompt();
      const choice = await installPromptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        // The `appinstalled` event will fire and close the card via the
        // listener above. No further action needed here.
      } else {
        // User chose "Cancel" in the browser's native prompt. Snooze.
        snooze();
      }
    } catch (err) {
      console.warn('[pwa] install prompt error:', err?.message);
      snooze();
    } finally {
      setInstallPromptEvent(null);
      setInstalling(false);
      setVisible(false);
    }
  };

  const snooze = () => {
    try {
      const until = Date.now() + NOT_NOW_SNOOZE_DAYS * 24 * 60 * 60 * 1000;
      localStorage.setItem(DISMISS_UNTIL_KEY, String(until));
    } catch {}
    setVisible(false);
  };

  const dismissForever = () => {
    try { localStorage.setItem(DISMISS_FOREVER_KEY, '1'); } catch {}
    setVisible(false);
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 18, right: 18,
        zIndex: 200,
        width: 320, maxWidth: 'calc(100vw - 36px)',
        background: A.shell,
        border: A.border,
        borderRadius: 14,
        boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
        padding: '16px 18px',
        fontFamily: A.font,
        animation: 'pwaSlideIn 0.35s cubic-bezier(0.22, 0.61, 0.36, 1) both',
      }}
      className="no-print">
      <style>{`@keyframes pwaSlideIn {
        from { transform: translateY(20px); opacity: 0; }
        to   { transform: translateY(0);    opacity: 1; }
      }`}</style>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{
          width: 36, height: 36, borderRadius: 9,
          background: 'linear-gradient(135deg, #1A1A1A, #2A2A2A)',
          color: A.warning,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 800, letterSpacing: '-0.5px',
        }} aria-hidden="true">H</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: A.ink, letterSpacing: '-0.1px' }}>
            Install HaloHelm
          </div>
          <div style={{ fontSize: 11, color: A.faintText }}>
            Faster, always on home screen
          </div>
        </div>
        <button
          onClick={dismissForever}
          title="Don't show this again"
          aria-label="Don't show again"
          style={{
            flexShrink: 0,
            width: 22, height: 22, borderRadius: 5,
            background: 'transparent', border: 'none',
            color: A.faintText, fontSize: 16, lineHeight: 1,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
          ×
        </button>
      </div>

      {/* Body */}
      <p style={{ fontSize: 12, color: A.mutedText, lineHeight: 1.55, margin: '8px 0 14px' }}>
        Install HaloHelm as an app on this device. Opens instantly without a
        browser tab, works offline for kitchen + waiter screens, and feels
        like a native app.
      </p>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleInstall}
          disabled={installing}
          style={{
            flex: 1,
            padding: '9px 14px', borderRadius: 8, border: 'none',
            background: A.ink, color: A.cream,
            fontFamily: A.font, fontSize: 12, fontWeight: 700,
            cursor: installing ? 'not-allowed' : 'pointer',
            opacity: installing ? 0.6 : 1,
          }}>
          {installing ? 'Installing…' : 'Install'}
        </button>
        <button
          onClick={snooze}
          style={{
            padding: '9px 14px', borderRadius: 8,
            background: 'transparent', color: A.mutedText,
            border: A.border,
            fontFamily: A.font, fontSize: 12, fontWeight: 600,
            cursor: 'pointer',
          }}>
          Not now
        </button>
      </div>
    </div>
  );
}
