// components/ui/Label.jsx
//
// Small uppercase / letter-spaced section label. The recurring "FORM
// FIELDS / NEEDS ATTENTION / LIVE TODAY" style label that appears
// everywhere as a section header.
//
// Lighter usage: just text. Pair with a thin gold dot for the "live"
// look used on the matte-black signature card.
//
// Usage:
//   <Label>Restaurant info</Label>
//   <Label withDot>Live today</Label>
//   <Label as="div" tone="gold">Promotions</Label>

import { theme as A } from '../../lib/theme';

export default function Label({
  children,
  withDot,
  tone = 'muted',  // 'muted' | 'gold' | 'ink' | 'faint'
  as: Tag = 'span',
  style,
}) {
  const color = tone === 'gold'  ? A.warning
              : tone === 'ink'   ? A.ink
              : tone === 'faint' ? A.faintText
              :                    A.mutedText;
  return (
    <Tag style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: 11, fontWeight: 700,
      color,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      fontFamily: A.font,
      ...style,
    }}>
      {withDot && (
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: A.warning,
          boxShadow: '0 0 6px rgba(196,168,109,0.40)',
        }} />
      )}
      {children}
    </Tag>
  );
}
