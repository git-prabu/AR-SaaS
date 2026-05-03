// components/ConfirmModal.jsx
// Card-style confirmation dialog. Drop-in replacement for the
// browser's native confirm() — gives us styling control + matches
// the rest of the app's visual language (matte-black headers,
// gold accents, rounded corners, soft shadow).
//
// Usage:
//   const [confirm, setConfirm] = useState(null);   // null | { ...config }
//   ...
//   <ConfirmModal
//     open={!!confirm}
//     {...confirm}
//     onCancel={() => setConfirm(null)}
//   />
//   ...
//   onClick={() => setConfirm({
//     title: 'Cancel order?',
//     body: 'This cannot be undone. The kitchen has not started this order yet.',
//     confirmLabel: 'Yes, cancel order',
//     cancelLabel: 'Keep order',
//     destructive: true,
//     onConfirm: async () => { await doCancel(); },
//   })}
//
// Lifecycle:
//   onConfirm runs first; the modal stays open with a loading spinner
//   while it's awaited so the user gets feedback. After it resolves
//   (or rejects), we call onCancel to close. If onConfirm throws, we
//   close anyway — the caller is expected to surface its own error
//   toast for the user.

import { useEffect, useState, useRef } from 'react';

export default function ConfirmModal({
  open,
  title = 'Are you sure?',
  body = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
  darkMode = false,
}) {
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef(null);

  // Reset busy state whenever the modal is reopened.
  useEffect(() => { if (open) setBusy(false); }, [open]);

  // Esc to dismiss + focus trap on the cancel button so keyboard
  // users have a sane starting point.
  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const handleKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel?.();
    };
    window.addEventListener('keydown', handleKey);
    // Focus the cancel button by default — destructive actions
    // shouldn't be one-Enter away.
    const t = setTimeout(() => {
      const btn = dialogRef.current?.querySelector('[data-confirm-cancel]');
      btn?.focus();
    }, 0);
    return () => { window.removeEventListener('keydown', handleKey); clearTimeout(t); };
  }, [open, busy, onCancel]);

  if (!open) return null;

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm?.();
    } catch (err) {
      // Caller is expected to surface its own toast — we just close.
      console.warn('ConfirmModal onConfirm threw:', err);
    } finally {
      // The caller's onConfirm may have already triggered onCancel by
      // unmounting the modal; this is just the safety net.
      onCancel?.();
    }
  };

  const overlay = darkMode ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.50)';
  const surface = darkMode ? '#1A1814' : '#FFFFFF';
  const headBg  = darkMode ? '#2A241D' : '#FAFAF8';
  const ink     = darkMode ? '#FFF5E8' : '#1E1B18';
  const muted   = darkMode ? 'rgba(255,245,232,0.55)' : 'rgba(42,31,16,0.55)';
  const border  = darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const dangerBg = '#D9534F';
  const safeBg = darkMode ? '#F79B3D' : '#1E1B18';
  const safeText = darkMode ? '#1E1B18' : '#FFF5E8';

  return (
    <div
      onClick={() => !busy && onCancel?.()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: overlay,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        animation: 'cm-fade 0.18s ease both',
      }}
    >
      <style>{`
        @keyframes cm-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cm-pop  { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }
        @keyframes cm-spin { to { transform: rotate(360deg); } }
      `}</style>
      <div
        ref={dialogRef}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 380,
          background: surface,
          borderRadius: 16,
          boxShadow: '0 24px 64px rgba(0,0,0,0.30), 0 8px 16px rgba(0,0,0,0.12)',
          overflow: 'hidden',
          animation: 'cm-pop 0.20s ease both',
        }}>

        {/* Header — matte-cream/gold accent. Left bar is destructive-red
            when the action is destructive, otherwise gold. */}
        <div style={{
          padding: '18px 22px 14px',
          background: headBg,
          borderBottom: `1px solid ${border}`,
          borderLeft: `4px solid ${destructive ? dangerBg : '#C4A86D'}`,
        }}>
          <div style={{
            fontSize: 16, fontWeight: 700, color: ink, letterSpacing: '-0.2px',
          }}>
            {title}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 22px 6px' }}>
          {typeof body === 'string'
            ? <div style={{ fontSize: 14, color: muted, lineHeight: 1.55 }}>{body}</div>
            : body /* allow custom JSX */
          }
        </div>

        {/* Buttons */}
        <div style={{
          padding: '14px 18px 18px',
          display: 'flex', gap: 10, justifyContent: 'flex-end',
        }}>
          <button
            data-confirm-cancel
            onClick={() => !busy && onCancel?.()}
            disabled={busy}
            style={{
              padding: '10px 18px', borderRadius: 10,
              background: 'transparent',
              border: `1.5px solid ${border}`,
              color: ink,
              fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1,
              minWidth: 88,
            }}>
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            style={{
              padding: '10px 18px', borderRadius: 10,
              background: destructive ? dangerBg : safeBg,
              color: destructive ? '#fff' : safeText,
              border: 'none',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer',
              minWidth: 120,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: destructive ? '0 4px 12px rgba(217,83,79,0.30)' : '0 4px 12px rgba(0,0,0,0.16)',
            }}>
            {busy && (
              <span style={{
                display: 'inline-block', width: 13, height: 13,
                border: '2px solid rgba(255,255,255,0.45)',
                borderTopColor: '#fff', borderRadius: '50%',
                animation: 'cm-spin 0.7s linear infinite',
              }} />
            )}
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
