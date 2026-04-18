// components/BentoGlow.jsx
// Pure-CSS cursor spotlight + border ring + cursor-localized outer halo on hover.
// No GSAP, no deps. Drop-in card wrapper:
//   <BentoGlow style={{ ...cardStyles }}>...card content...</BentoGlow>
//
// Structure:
//   <wrapper>           — invisible passthrough, hosts mouse listeners + CSS vars
//     <halo />          — sibling that extends OUTSIDE the card, masked to outside-only
//     <card>            — actual card with passed-in styles, white bg covers inside
//       <children/>     — caller's content
//       ::before        — soft spotlight tint inside the card (follows cursor)
//       ::after         — bright border ring sitting on the card edge (follows cursor)
//     </card>
//   </wrapper>
//
// The wrapper is sized exactly like the card (display: contents-equivalent) so
// existing grid/flex layouts that target BentoGlow still work.
//
// Mousemove writes cursor position to CSS vars (--bg-mx, --bg-my) on the wrapper.
// opacity controlled by --bg-on (0 or 1). Zero React re-renders on mousemove.
//
// Caller-provided onMouseEnter / onMouseLeave / onMouseMove are COMPOSED with the
// internal handlers — earlier versions accidentally let {...rest} spread overwrite
// the internal handlers (e.g. Peak Hours / Busiest Days passed an onMouseLeave for
// bar highlighting and the glow never cleared). Both fire now.

import { useRef, useCallback } from 'react';

// Tunable constants
const GLOW_RGB = '196, 168, 109';   // Antique Gold for spotlight + ring
const HALO_RGB = '218, 165, 32';    // Goldenrod — warmer/saturated for halo visibility against light grey

// Inside-card spotlight tint
const SPOT_SIZE = 180;               // spotlight radius (px)
const SPOT_OPACITY = 0.18;           // peak spotlight strength (0–1)

// Border ring sitting on the card edge
const RING_THICKNESS = 3;            // border ring thickness (px)
const RING_SIZE = 420;               // border-glow falloff radius (px)
const RING_OPACITY = 1.0;            // peak border brightness (0–1)

// Cursor-localized outer halo (extends beyond card, only visible outside card area)
const HALO_REACH = 1;               // how far outside the card the halo can extend (px)
const HALO_RADIUS = 200;             // radial-gradient falloff radius (px)
const HALO_PEAK_OPACITY = 0.75;      // peak halo brightness at cursor (0–1)
const HALO_BLUR = 10;                // additional blur applied to the halo gradient (px)

export default function BentoGlow({
  children,
  style,
  wrapperStyle,
  className = '',
  onMouseEnter: callerOnEnter,
  onMouseLeave: callerOnLeave,
  onMouseMove: callerOnMove,
  ...rest
}) {
  const ref = useRef(null);

  const onMove = useCallback((e) => {
    const el = ref.current;
    if (el) {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--bg-mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--bg-my', `${e.clientY - r.top}px`);
    }
    if (callerOnMove) callerOnMove(e);
  }, [callerOnMove]);

  const onEnter = useCallback((e) => {
    const el = ref.current;
    if (el) el.style.setProperty('--bg-on', '1');
    if (callerOnEnter) callerOnEnter(e);
  }, [callerOnEnter]);

  const onLeave = useCallback((e) => {
    const el = ref.current;
    if (el) el.style.setProperty('--bg-on', '0');
    if (callerOnLeave) callerOnLeave(e);
  }, [callerOnLeave]);

  return (
    <div
      ref={ref}
      className={`bento-glow-wrap ${className}`}
      style={{
        position: 'relative',
        '--bg-mx': '50%',
        '--bg-my': '50%',
        '--bg-on': '0',
        ...wrapperStyle,
      }}
      {...rest}
      onMouseMove={onMove}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {/*
        Halo sibling — extends HALO_REACH beyond card on all sides.
        The card (next sibling) has a white bg that covers the inside-card area,
        so only the OUTSIDE portion of this halo is visible. Cursor-localized via
        a radial gradient that translates with --bg-mx/--bg-my (offset by HALO_REACH
        because this div is at inset: -HALO_REACH).
      */}
      <div
        className="bento-halo"
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: `-${HALO_REACH}px`,
          pointerEvents: 'none',
          background: `radial-gradient(${HALO_RADIUS}px circle at calc(var(--bg-mx) + ${HALO_REACH}px) calc(var(--bg-my) + ${HALO_REACH}px), rgba(${HALO_RGB}, ${HALO_PEAK_OPACITY}) 0%, rgba(${HALO_RGB}, ${HALO_PEAK_OPACITY * 0.4}) 25%, rgba(${HALO_RGB}, 0) 60%)`,
          filter: `blur(${HALO_BLUR}px)`,
        }}
      />

      {/* Actual card — receives the caller's style prop. White bg covers the inside. */}
      <div className="bento-card" style={style}>
        {children}
      </div>

      <style jsx>{`
        /* Halo opacity driven by --bg-on (inherited from wrapper) */
        .bento-glow-wrap > .bento-halo {
          opacity: var(--bg-on, 0);
          transition: opacity 0.3s ease;
          z-index: 0;
        }
        .bento-glow-wrap > .bento-card {
          position: relative;
          z-index: 1;
          width: 100%;
          height: 100%;
          box-sizing: border-box;
        }
        /* Inside spotlight tint — on the card itself */
        .bento-glow-wrap > .bento-card::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
          opacity: var(--bg-on, 0);
          transition: opacity 0.3s ease;
          background: radial-gradient(
            ${SPOT_SIZE}px circle at var(--bg-mx) var(--bg-my),
            rgba(${GLOW_RGB}, ${SPOT_OPACITY}) 0%,
            rgba(${GLOW_RGB}, 0) 70%
          );
          z-index: 0;
        }
        /* Border ring on the card edge — brightest where cursor is */
        .bento-glow-wrap > .bento-card::after {
          content: '';
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          pointer-events: none;
          opacity: var(--bg-on, 0);
          transition: opacity 0.3s ease;
          padding: ${RING_THICKNESS}px;
          background: radial-gradient(
            ${RING_SIZE}px circle at var(--bg-mx) var(--bg-my),
            rgba(${GLOW_RGB}, ${RING_OPACITY}) 0%,
            rgba(${GLOW_RGB}, ${RING_OPACITY * 0.6}) 18%,
            rgba(${GLOW_RGB}, 0) 55%
          );
          -webkit-mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
                  mask-composite: exclude;
          z-index: 2;
        }
      `}</style>
    </div>
  );
}
