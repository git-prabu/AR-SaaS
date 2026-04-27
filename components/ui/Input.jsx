// components/ui/Input.jsx
//
// Standard text input + an Input.Field wrapper that includes the label,
// optional hint, and required indicator.
//
// Usage:
//   <Input.Field label="Restaurant name" required hint="Shown on bills">
//     <Input value={name} onChange={e => setName(e.target.value)} />
//   </Input.Field>
//
// Or stand-alone:
//   <Input type="email" placeholder="..." value={x} onChange={...} />
//
// Designed to mirror the inline-style inputs already used on settings.js
// and similar pages so swapping in this component doesn't change the
// look — it just removes the copy-paste.

import { theme as A } from '../../lib/theme';

const baseStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '10px 12px',
  background: A.shell,
  border: '1px solid rgba(0,0,0,0.10)',
  borderRadius: 9,
  fontSize: 14,
  color: A.ink,
  fontFamily: A.font,
  outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

export default function Input({ style, mono, ...rest }) {
  return (
    <input
      style={{
        ...baseStyle,
        fontFamily: mono ? A.mono : A.font,
        letterSpacing: mono ? '0.04em' : undefined,
        ...style,
      }}
      {...rest}
    />
  );
}

// Field wrapper — label + optional hint + child input. The label gets the
// uppercase / letter-spaced treatment used on settings + drawer forms.
function Field({ label, required, hint, children, marginBottom = 18 }) {
  return (
    <div style={{ marginBottom }}>
      <label style={{
        display: 'block', fontSize: 10, fontWeight: 700,
        color: A.mutedText, letterSpacing: '0.08em', textTransform: 'uppercase',
        marginBottom: 6, fontFamily: A.font,
      }}>
        {label}
        {required && <span style={{ color: A.danger, fontWeight: 700, marginLeft: 4 }}>*</span>}
        {hint && (
          <span style={{
            fontWeight: 400, textTransform: 'none', letterSpacing: 0,
            color: A.faintText, marginLeft: 6,
          }}>{hint}</span>
        )}
      </label>
      {children}
    </div>
  );
}

Input.Field = Field;
