// components/ui/Card.jsx
//
// Standard white shell card used across admin pages. Two surface variants
// + an optional padded body so consumers usually don't need to add their
// own padding wrapper.
//
// Variants:
//   light  (default) — white shell, subtle border, soft shadow
//   forest           — matte-black gradient (the "signature" card from LIVE
//                       TODAY / Z-report). Text inside should use forestText.
//
// `padding` — false to skip the inner padding (for full-bleed children
//             like a list with its own row padding).
// `as`     — render as a different element (e.g. 'section').

import { theme as A } from '../../lib/theme';

export default function Card({
  children,
  variant = 'light',
  padding = '20px 24px',
  style,
  as: Tag = 'div',
  ...rest
}) {
  const isForest = variant === 'forest';
  return (
    <Tag
      style={{
        background: isForest
          ? `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`
          : A.shell,
        borderRadius: 14,
        border: isForest ? A.forestBorder : A.border,
        boxShadow: isForest
          ? '0 4px 16px rgba(38,52,49,0.15)'
          : A.shadowCard,
        padding: padding === false ? 0 : padding,
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
