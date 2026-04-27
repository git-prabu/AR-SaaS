// components/ui/Drawer.jsx
//
// Right-anchored slide-in drawer with backdrop dismiss + Escape-to-close.
// Used for create/edit forms (offers/coupons/combos editors, item editor,
// etc.) where the form is too large for an inline accordion but not big
// enough for a full page.
//
// Usage:
//   <Drawer
//     open={open}
//     onClose={close}
//     title="Edit offer"
//     subtitle="Editing"        // small label above title (e.g. "New" / "Editing")
//     footer={<><Button>Save</Button><Button variant="ghost">Cancel</Button></>}
//   >
//     {/* drawer body — scrolls if too tall */}
//     <FormFields />
//   </Drawer>
//
// `width` — max drawer width in px (default 480).
// `closeOnBackdrop` — set to false for forms with unsaved changes if you
//   want the user to confirm explicitly.

import { useEffect } from 'react';
import { theme as A } from '../../lib/theme';

export default function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 480,
  closeOnBackdrop = true,
}) {
  // Esc closes the drawer.
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Animations live next to the drawer so consumers don't need a global
          stylesheet for them. Two short keyframes — fadeIn for the backdrop,
          slideInRight for the panel. */}
      <style>{`
        @keyframes ar-drawer-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ar-drawer-slide { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>

      <div
        onClick={closeOnBackdrop ? onClose : undefined}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
          zIndex: 90, animation: 'ar-drawer-fade 0.2s ease both',
        }}
      />
      <div
        role="dialog"
        aria-label={title}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: '100%', maxWidth: width,
          background: A.shell, zIndex: 91,
          display: 'flex', flexDirection: 'column',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
          animation: 'ar-drawer-slide 0.28s ease both',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 22px', borderBottom: A.border,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: A.shellDarker, flexShrink: 0,
        }}>
          <div>
            {subtitle && (
              <div style={{
                fontSize: 11, fontWeight: 600, color: A.warningDim,
                letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2,
              }}>{subtitle}</div>
            )}
            <div style={{
              fontFamily: A.font, fontWeight: 600, fontSize: 18,
              color: A.ink, letterSpacing: '-0.2px',
            }}>{title}</div>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close"
            style={{
              width: 36, height: 36, borderRadius: 8,
              border: A.border, background: A.shell,
              cursor: 'pointer', fontSize: 16, color: A.mutedText, fontFamily: A.font,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
        </div>

        {/* Body — scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px' }}>
          {children}
        </div>

        {/* Footer — actions */}
        {footer && (
          <div style={{
            padding: '14px 22px', borderTop: A.border,
            display: 'flex', justifyContent: 'flex-end', gap: 10,
            background: A.shellDarker, flexShrink: 0,
          }}>
            {footer}
          </div>
        )}
      </div>
    </>
  );
}
