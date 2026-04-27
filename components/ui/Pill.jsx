// components/ui/Pill.jsx
//
// Status / tag pill. Tiny rounded badge with uppercase letter-spaced text.
// Used everywhere there's a row + status (orders, offers, coupons, combos).
//
// Variants map to the standard semantic colors. `tone` overrides the
// background+text for a custom look (e.g. category tags).

import { theme as A } from '../../lib/theme';

const VARIANT = {
  active:    { bg: 'rgba(63,158,90,0.10)',   color: A.success },
  scheduled: { bg: 'rgba(196,168,109,0.12)', color: A.warningDim },
  warning:   { bg: 'rgba(196,168,109,0.12)', color: A.warningDim },
  danger:    { bg: 'rgba(217,83,79,0.10)',   color: A.danger },
  expired:   { bg: A.subtleBg,                color: A.faintText },
  inactive:  { bg: 'rgba(0,0,0,0.06)',        color: A.mutedText },
  muted:     { bg: A.subtleBg,                color: A.mutedText },
  ink:       { bg: A.ink,                     color: A.cream },
  gold:      { bg: 'rgba(196,168,109,0.18)', color: A.warning },
};

export default function Pill({
  children,
  variant = 'muted',
  tone,           // optional { bg, color } override
  size = 'sm',    // 'sm' (10/3-8) | 'md' (11/4-10)
  style,
}) {
  const v = tone || VARIANT[variant] || VARIANT.muted;
  const padding = size === 'md' ? '4px 10px' : '3px 8px';
  const fontSize = size === 'md' ? 11 : 10;

  return (
    <span style={{
      display: 'inline-block',
      padding,
      borderRadius: 4,
      background: v.bg,
      color: v.color,
      fontSize,
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
      fontFamily: A.font,
      ...style,
    }}>
      {children}
    </span>
  );
}
