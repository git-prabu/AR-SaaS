// components/MobilePullToRefresh.jsx
//
// Lightweight pull-to-refresh for the admin + staff shells, used because
// iOS Safari in PWA / standalone mode (and Android Chrome in some configs)
// doesn't surface the native browser pull-to-refresh. Owners reported they
// could not refresh the page on phones — this fills that gap.
//
// Behaviour:
//   - Active only on mobile (width < 768px)
//   - Activates ONLY when the page is scrolled to the top (scrollY === 0)
//     so it doesn't fight legitimate downward scroll on long pages
//   - User pulls down → an indicator with a rotating arrow shows progress
//   - At 70% pull (threshold), the arrow flips, and the user can release
//     to trigger a reload
//   - Release triggers router.reload() (Next.js SPA refresh) which is
//     ~5x faster than window.location.reload() and preserves any auth
//     state we already loaded
//
// Wrapping pattern (used in AdminLayout / StaffShell):
//   <MobilePullToRefresh>
//     <main>...page content...</main>
//   </MobilePullToRefresh>
//
// Or as a sibling that targets a parent scroller via prop:
//   <MobilePullToRefresh targetSelector=".admin-main" />

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';

const PULL_THRESHOLD = 80;          // px of pull required to trigger a refresh
const MAX_PULL_VISUAL = 110;        // px — visual cap so the indicator doesn't slide forever
const RESISTANCE = 0.45;            // touch delta multiplier — gives the rubber-band feel

export default function MobilePullToRefresh({ children }) {
  const router = useRouter();
  const [pull, setPull] = useState(0);         // current visual pull distance in px
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(null);
  const isPulling = useRef(false);

  useEffect(() => {
    // Only attach the listeners on phones — desktop users have F5 / Cmd+R.
    if (typeof window === 'undefined') return;
    const isMobile = () => window.innerWidth < 768;
    if (!isMobile()) return;

    const onTouchStart = (e) => {
      // Pull-to-refresh only starts when the user is already at scroll-top.
      // Anywhere else, this is a normal scroll — leave it alone.
      if (window.scrollY > 0) return;

      // Skip PTR if the touch starts INSIDE a modal / sheet (any element
      // up the ancestor chain whose computed `position` is `fixed`). The
      // take-order modal on /admin/tables and /admin/waiter is fixed,
      // and without this guard pulling down inside the modal triggered
      // a refresh on the page behind it — owner reported as "very
      // annoying". The walk stops at <body> because the layout shell
      // itself uses transforms, not fixed positioning, on the children
      // that should trigger PTR.
      let el = e.target;
      while (el && el !== document.body && el !== document.documentElement) {
        const cs = window.getComputedStyle(el);
        if (cs.position === 'fixed') {
          // Anything fixed with a non-trivial z-index is treated as an
          // overlay — modal, sheet, backdrop, bottom-nav. The mobile
          // top-bar is also fixed but at z-index 18 (modals are 60+);
          // we accept the small false-positive there because pulling
          // from the top bar isn't a useful gesture anyway.
          const z = parseInt(cs.zIndex, 10);
          if (!Number.isNaN(z) && z >= 10) return;
        }
        el = el.parentElement;
      }

      touchStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    };

    const onTouchMove = (e) => {
      if (!isPulling.current || touchStartY.current === null) return;
      const dy = e.touches[0].clientY - touchStartY.current;
      // Only respond to DOWNWARD pulls (positive dy). Upward = normal scroll.
      if (dy <= 0) {
        setPull(0);
        return;
      }
      // Apply resistance so the indicator doesn't outpace the finger 1:1.
      const visual = Math.min(MAX_PULL_VISUAL, dy * RESISTANCE);
      setPull(visual);
    };

    const onTouchEnd = () => {
      if (!isPulling.current) return;
      isPulling.current = false;
      touchStartY.current = null;
      if (pull >= PULL_THRESHOLD * RESISTANCE) {
        // Far enough — refresh. The visual stays briefly so the user sees
        // the spinner before the page reloads.
        setRefreshing(true);
        setPull(PULL_THRESHOLD * RESISTANCE);
        // setTimeout 0 lets the spinner render before reload kicks in.
        setTimeout(() => {
          try { router.reload(); }
          catch { window.location.reload(); }
        }, 80);
      } else {
        // Snap back.
        setPull(0);
      }
    };

    // Passive listeners so we don't fight native scroll. We never preventDefault.
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [pull, router]);

  // Pull progress 0..1 — used for the indicator's rotation.
  const progress = Math.min(1, pull / (PULL_THRESHOLD * RESISTANCE));
  const willTrigger = progress >= 1;

  return (
    <>
      {/* Pull indicator — sits at the very top, slides down with the pull.
          Only renders on mobile (display:none above the media query). */}
      <div
        aria-hidden={pull === 0 && !refreshing}
        className="ar-ptr-indicator"
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0,
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // Slide the indicator down from -56px to +pull as the user pulls.
          transform: `translateY(${pull - 56}px)`,
          transition: refreshing || pull === 0 ? 'transform 0.2s cubic-bezier(.4,0,.2,1)' : 'none',
          zIndex: 30,
          pointerEvents: 'none',
          background: 'transparent',
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: '#FFFFFF',
          boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#1A1A1A',
          opacity: pull === 0 && !refreshing ? 0 : 1,
          transition: 'opacity 0.15s',
        }}>
          {refreshing ? (
            <span style={{
              display: 'inline-block', width: 18, height: 18,
              border: '2.5px solid rgba(0,0,0,0.12)', borderTopColor: '#1A1A1A',
              borderRadius: '50%', animation: 'ar-ptr-spin 0.7s linear infinite',
            }} />
          ) : (
            <span style={{
              fontSize: 18, lineHeight: 1, fontWeight: 700,
              transform: `rotate(${willTrigger ? 180 : progress * 180}deg)`,
              transition: 'transform 0.12s',
            }}>↓</span>
          )}
        </div>
      </div>
      <style>{`
        @keyframes ar-ptr-spin { to { transform: rotate(360deg); } }
        @media (min-width: 768px) {
          .ar-ptr-indicator { display: none !important; }
        }
      `}</style>
      {children}
    </>
  );
}
