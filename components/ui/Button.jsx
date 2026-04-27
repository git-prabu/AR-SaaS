// components/ui/Button.jsx
//
// Shared button used across admin pages. Wraps an HTML button with the
// Aspire tokens + a few semantic variants. Existing pages keep their
// inline button styles — adopt this on new code.
//
// Variants (visual intent, not status):
//   primary  — black ink fill, cream text. The CTA on a card.
//   ghost    — white shell with a thin border. Secondary action.
//   danger   — soft red wash with red text. Destructive action.
//   warning  — gold tint. Used sparingly for "needs attention" actions.
//
// Sizes: 'sm' | 'md' (default) | 'lg'.
//
// `loading` shows a spinner and disables the button. `icon` slots a node
// before the label (don't pass JSX in the children for the icon).

import { theme as A } from '../../lib/theme';

const SIZE = {
  sm: { padding: '6px 14px', fontSize: 12 },
  md: { padding: '10px 18px', fontSize: 13 },
  lg: { padding: '12px 22px', fontSize: 14 },
};

const VARIANT = {
  primary: { background: A.ink,    color: A.cream, border: 'none', shadow: '0 2px 8px rgba(0,0,0,0.10)' },
  ghost:   { background: A.shell,  color: A.ink,   border: A.borderStrong, shadow: 'none' },
  danger:  { background: 'rgba(217,83,79,0.08)', color: A.danger, border: '1px solid rgba(217,83,79,0.18)', shadow: 'none' },
  warning: { background: 'rgba(196,168,109,0.12)', color: A.warningDim, border: '1px solid rgba(196,168,109,0.30)', shadow: 'none' },
};

export default function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  icon,
  fullWidth,
  style,
  ...rest
}) {
  const v = VARIANT[variant] || VARIANT.primary;
  const s = SIZE[size]       || SIZE.md;
  const isInactive = disabled || loading;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isInactive}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: s.padding,
        borderRadius: 9,
        border: v.border,
        background: v.background,
        color: v.color,
        fontFamily: A.font,
        fontSize: s.fontSize,
        fontWeight: 600,
        letterSpacing: '0.01em',
        cursor: isInactive ? 'not-allowed' : 'pointer',
        opacity: isInactive ? 0.5 : 1,
        boxShadow: v.shadow,
        width: fullWidth ? '100%' : undefined,
        transition: 'transform 0.12s, box-shadow 0.12s, opacity 0.15s',
        ...style,
      }}
      {...rest}
    >
      {loading ? (
        <span style={{
          width: 13, height: 13,
          border: `2px solid ${v.color}`, borderTopColor: 'transparent',
          borderRadius: '50%', animation: 'spin 0.7s linear infinite',
          display: 'inline-block',
        }} />
      ) : icon}
      {children}
    </button>
  );
}
