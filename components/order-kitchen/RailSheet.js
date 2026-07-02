// components/order-kitchen/RailSheet.js
//
// Tablet-portrait / phone stand-ins for the desktop right rail
// (Service queue / Waitlist / Running now). Below 1000px the rail is
// hidden (order-kitchen.css), so each panel becomes a RailChip that
// opens a RailSheet — a bottom sheet with the exact same content.
//
// Styling lives in order-kitchen.css (.okv-chip / .okv-sheet*). The
// chips row wrapper (.okv-railchips) is CSS-gated to <1000px, so pages
// can render it unconditionally; on mobile DOM (<700) it's always shown.

import React, { useEffect } from 'react';

export function RailChip({ label, count, onClick }) {
  return (
    <button className="okv-chip" onClick={onClick}>
      {label}
      {count > 0 && <span className="n">{count}</span>}
    </button>
  );
}

export function RailSheet({ open, title, meta, onClose, children }) {
  // Close on Escape — cheap listener, only while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="okv-sheetback" onClick={onClose} />
      <div className="okv-sheet" role="dialog" aria-label={title}>
        <div className="sh-head">
          <h3 className="sh-title">{title}</h3>
          {meta}
          <button className="sh-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </>
  );
}
