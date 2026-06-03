// hooks/useOkTheme.js
//
// Phase F (2026-06-03) — Light/dark theme for the Order & Kitchen
// station pages.
//
// Why a separate hook (not a global theme provider): the rest of
// the admin app uses its own light palette via the Aspire color
// tokens hard-coded in each page. We don't want this hook flipping
// /admin/analytics, /admin/staff etc. — those pages weren't
// designed to support a theme switch, and flipping their hard-coded
// colors would look broken.
//
// Instead: this hook ONLY touches the .ok-root subtree (the
// /admin/orders, /admin/kitchen-new, /admin/order-kitchen pages,
// plus anything else that imports styles/order-kitchen.css). It
// reads + writes a `data-theme` attribute on document.body that
// the [data-theme="light"] rules in order-kitchen.css scope to
// the .ok-root descendant only.
//
// Persistence: localStorage key `ok_theme`. Defaults to 'dark'
// (the original look). If a user has set 'light' before they get
// the same theme back on next load — even if Vercel served them
// a fresh bundle, the body attribute gets re-applied on mount.
//
// SSR-safe: `typeof window` guard so getStaticProps + the first
// server render don't throw.

import { useEffect, useState, useCallback } from 'react';

const LS_KEY = 'ok_theme';

function readStored() {
  if (typeof window === 'undefined') return 'dark';
  try {
    const v = localStorage.getItem(LS_KEY);
    return v === 'light' ? 'light' : 'dark';
  } catch { return 'dark'; }
}

function apply(theme) {
  if (typeof document === 'undefined') return;
  if (theme === 'light') document.body.setAttribute('data-theme', 'light');
  else document.body.removeAttribute('data-theme');
}

export default function useOkTheme() {
  const [theme, setThemeState] = useState('dark');

  // On mount: pull the stored value + apply it. (We start in
  // 'dark' to avoid an SSR/CSR mismatch flash; the effect fires
  // immediately after hydration so the user sees light if that's
  // what they chose, with at most one render of the dark frame.)
  useEffect(() => {
    const stored = readStored();
    setThemeState(stored);
    apply(stored);
  }, []);

  const setTheme = useCallback((next) => {
    const t = next === 'light' ? 'light' : 'dark';
    setThemeState(t);
    apply(t);
    try { localStorage.setItem(LS_KEY, t); } catch {}
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }, [theme, setTheme]);

  // Cleanup on unmount: remove the body attribute so navigating
  // AWAY from a station page (e.g. to /admin/analytics) doesn't
  // leave the body in light mode and risk leaking the theme into
  // unrelated pages. The Aspire pages don't read data-theme but
  // it's good hygiene.
  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined') document.body.removeAttribute('data-theme');
    };
  }, []);

  return { theme, setTheme, toggle, isLight: theme === 'light' };
}
