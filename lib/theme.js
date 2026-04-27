// lib/theme.js
//
// Single source of truth for the Aspire palette + typography tokens used
// across admin pages. Replaces the per-page `const A = {...}` object that
// gets copy-pasted (and slowly diverges) on every new page.
//
// Each admin page can either:
//   1. import the whole `theme` object: `import { theme as A } from '@/lib/theme'`
//   2. import named tokens: `import { ink, warning } from '@/lib/theme'`
//
// Existing pages keep their inline `A` objects — migration is gradual,
// not a big-bang rewrite. New components in components/ui/* use this
// module directly.

const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'JetBrains Mono', monospace";

// Surface tokens — the cream → shell → forest hierarchy from light to dark.
export const cream        = '#EDEDED';   // page background
export const shell        = '#FFFFFF';   // card / drawer background
export const shellDarker  = '#FAFAF8';   // input / hover background
export const ink          = '#1A1A1A';   // primary text + dark signature card

// Accent + semantic colors.
export const warning      = '#C4A86D';   // antique gold — primary brand accent
export const warningDim   = '#A08656';   // darker gold — text on light bg
export const success      = '#3F9E5A';
export const danger       = '#D9534F';

// Text tokens (alpha overlays so they work on any light surface).
export const mutedText    = 'rgba(0,0,0,0.55)';
export const faintText    = 'rgba(0,0,0,0.38)';
export const subtleBg     = 'rgba(0,0,0,0.04)';
export const border       = '1px solid rgba(0,0,0,0.06)';
export const borderStrong = '1px solid rgba(0,0,0,0.10)';

// Card shadow — the standard "raised but quiet" lift used on most cards.
export const shadowCard   = '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)';

// Forest / matte-black tokens for signature dark cards (LIVE TODAY, Z-report,
// etc.). Black gradient with slight tonal shift between top and bottom.
export const forest           = '#1A1A1A';
export const forestDarker     = '#2A2A2A';
export const forestText       = '#EAE7E3';                    // soft cream text on black
export const forestTextMuted  = 'rgba(234,231,227,0.55)';
export const forestTextFaint  = 'rgba(234,231,227,0.35)';
export const forestSubtleBg   = 'rgba(255,255,255,0.04)';
export const forestBorder     = '1px solid rgba(255,255,255,0.06)';

// Typography.
export const font        = INTER;
export const fontDisplay = INTER;
export const mono        = MONO;

// Aggregate object — drop-in replacement for the per-page `A = {...}`
// constants that pages currently inline. Existing pages can swap their
// inline `A` for `import { theme as A } from '@/lib/theme'` with no
// other changes (key names match exactly).
export const theme = {
  font, fontDisplay, mono,
  cream, ink, shell, shellDarker,
  warning, warningDim, success, danger,
  mutedText, faintText, subtleBg,
  border, borderStrong,
  shadowCard, cardShadow: shadowCard, // alias — some pages use cardShadow
  forest, forestDarker, forestText,
  forestTextMuted, forestTextFaint,
  forestSubtleBg, forestBorder,
};

export default theme;
