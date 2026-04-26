// components/EmptyState.jsx
//
// Shared empty-state card used across admin list pages. Visual matches the
// existing inline EmptyCards (white shell, 3-dot indicator, title + subtitle)
// so swapping in this component preserves the look.
//
// New compared to the old inline cards: an optional CTA button. Pass
// `ctaLabel` + `onCta` to render a primary action button under the
// subtitle — useful for first-time empty states like "+ Add your first
// menu item". Omit both for purely informational empty states (e.g.
// "No orders yet" — there's no action the admin can take from here).
//
// Usage:
//   <EmptyState
//     title="No menu items yet"
//     subtitle="Add your first dish to start showing it on your menu."
//     ctaLabel="+ Add menu item"
//     onCta={() => openCreate()}
//   />

const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const C = {
  shell: '#FFFFFF',
  ink: '#1A1A1A',
  cream: '#EDEDED',
  warning: '#C4A86D',
  mutedText: 'rgba(0,0,0,0.55)',
  border: '1px solid rgba(0,0,0,0.06)',
  cardShadow: '0 2px 10px rgba(38,52,49,0.03)',
};

export default function EmptyState({
  title,
  subtitle,
  ctaLabel,                  // optional — when set, renders a primary action button
  onCta,                     // optional — handler for the CTA
  secondaryCtaLabel,         // optional — second button (e.g. "Bulk import" alongside "+ New")
  onSecondaryCta,
  size = 'comfortable',      // 'comfortable' (64px padding) | 'compact' (40px padding)
}) {
  const padding = size === 'compact' ? '40px 28px' : '64px 32px';
  return (
    <div style={{
      background: C.shell, borderRadius: 14, border: C.border,
      padding, textAlign: 'center', boxShadow: C.cardShadow,
      fontFamily: INTER,
    }}>
      {/* 3-dot indicator — gold pulses to signal the page is "listening". */}
      <div style={{ display: 'inline-flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: C.warning, opacity: 0.8, animation: 'pulse 1.8s infinite' }} />
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(0,0,0,0.10)' }} />
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(0,0,0,0.06)' }} />
      </div>

      {title && (
        <div style={{
          fontWeight: 600, fontSize: 16, color: C.ink,
          marginBottom: 8, letterSpacing: '-0.2px',
        }}>{title}</div>
      )}

      {subtitle && (
        <div style={{
          fontSize: 13, color: C.mutedText, lineHeight: 1.6,
          maxWidth: 440, margin: '0 auto',
        }}>{subtitle}</div>
      )}

      {(ctaLabel || secondaryCtaLabel) && (
        <div style={{ display: 'inline-flex', gap: 10, marginTop: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
          {ctaLabel && (
            <button onClick={onCta} type="button" style={{
              padding: '10px 20px', borderRadius: 10, border: 'none',
              background: C.ink, color: C.cream,
              fontFamily: INTER, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}>{ctaLabel}</button>
          )}
          {secondaryCtaLabel && (
            <button onClick={onSecondaryCta} type="button" style={{
              padding: '10px 20px', borderRadius: 10,
              border: '1px solid rgba(0,0,0,0.10)',
              background: C.shell, color: C.ink,
              fontFamily: INTER, fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
            }}>{secondaryCtaLabel}</button>
          )}
        </div>
      )}
    </div>
  );
}
