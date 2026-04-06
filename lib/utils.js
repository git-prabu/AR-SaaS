// lib/utils.js — Shared utility functions

export function timeAgo(seconds) {
  if (!seconds) return 'just now';
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 0) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Design Tokens — CINEMATIC ───────────────────────────────────────────────
// Palette: #263431 · #CFC4AB · #EAE7E3 · #635F5A
export const T = {
  font: 'Outfit, sans-serif',
  fontDisplay: "'Playfair Display', Georgia, serif",
  // Text scale
  ink: '#263431',             // Deep Forest — headings, primary text
  charcoal: '#3A4A46',        // slightly lighter forest
  stone: '#635F5A',           // Stone Grey — secondary text
  mist: '#C4A86D',            // Antique Gold — placeholders
  // Surfaces
  sand: '#D6CCBA',            // Soft gold border — lighter for dividers
  cream: '#EAE7E3',           // Soft Cream — page bg
  white: '#FFFFFF',           // cards — pure white
  // Primary accent — Deep Forest
  accent: '#263431',          // from palette
  accentHover: '#344845',     // lighter forest
  accentLight: '#E8EDEC',     // very light forest wash
  accentSubtle: 'rgba(38,52,49,0.05)',
  // Sidebar — Deep Forest (dark)
  shell: '#263431',           // Deep Forest — rich dark sidebar
  shellDarker: '#1C2825',     // deeper forest
  shellText: '#EAE7E3',       // Soft Cream
  shellMuted: 'rgba(234,231,227,0.50)',
  shellActive: 'rgba(196,168,109,0.20)',  // gold wash
  shellActiveBg: 'rgba(196,168,109,0.15)',
  // Status
  success: '#4A7A5E',         // forest green
  successLight: '#E8EDEC',
  warning: '#C4A86D',         // Antique Gold
  warningLight: '#F2F0EC',
  danger: '#8A4A42',          // muted red
  dangerLight: '#F3EDEC',
  info: '#635F5A',            // Stone Grey
  infoLight: '#F0EFED',
  // Radius
  radiusCard: 14,
  radiusBtn: 10,
  radiusPill: 24,
  // Shadows — forest-toned
  shadowCard: '0 1px 3px rgba(38,52,49,0.06), 0 4px 16px rgba(38,52,49,0.04)',
  shadowBtn: '0 2px 4px rgba(38,52,49,0.10), 0 4px 12px rgba(38,52,49,0.06)',
  shadowElevated: '0 4px 12px rgba(38,52,49,0.08), 0 12px 36px rgba(38,52,49,0.06)',
};

export const ADMIN_STYLES = {
  card: {
    background: T.white,
    border: `1px solid ${T.sand}`,
    borderRadius: T.radiusCard,
    boxShadow: T.shadowCard,
  },
  cardElevated: {
    background: T.white,
    border: `1px solid ${T.sand}`,
    borderRadius: T.radiusCard,
    boxShadow: T.shadowElevated,
  },
  h1: { fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 28, color: T.ink, margin: 0, letterSpacing: '-0.3px' },
  sub: { fontFamily: T.font, fontSize: 13, color: T.stone, marginTop: 5, fontWeight: 400, letterSpacing: '-0.1px' },
};
