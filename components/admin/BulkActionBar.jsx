// components/admin/BulkActionBar.jsx
//
// Floating sticky bar that appears at the bottom of the screen when 1+
// rows are selected on a list page. Shows the count + a row of action
// buttons. Used initially on /admin/items; reusable for any list.
//
// AdminLayout has a 240px sidebar — we offset the centered bar by half
// that so it visually centers on the content area, not the full viewport.
//
// Pass `actions` as an array of { label, onClick, variant?, danger?, busy? }.
// `onClear` shows an "✕ Clear" button that deselects all.

import { theme as A } from '../../lib/theme';

export default function BulkActionBar({
  count,
  itemLabel = 'item',          // singular noun, used as "{count} {itemLabel}{s}"
  actions = [],
  onClear,
}) {
  if (!count || count <= 0) return null;
  const plural = count === 1 ? '' : 's';

  return (
    <>
      <style>{`
        @keyframes bulk-bar-slide-up { from { transform: translate(-50%, 100%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
      `}</style>
      <div
        className="no-print"
        style={{
          position: 'fixed', bottom: 24,
          // Center on the visible content area, not the viewport (sidebar = 240px).
          left: 'calc(50% + 120px)', transform: 'translateX(-50%)',
          zIndex: 100,
          background: A.ink, color: A.cream,
          borderRadius: 14, padding: '12px 18px',
          boxShadow: '0 12px 36px rgba(0,0,0,0.30)',
          display: 'inline-flex', alignItems: 'center', gap: 14,
          fontFamily: A.font, fontSize: 13, fontWeight: 500,
          animation: 'bulk-bar-slide-up 0.22s ease both',
          maxWidth: 'calc(100vw - 280px)', flexWrap: 'wrap',
        }}
      >
        {/* Count + clear */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 28, height: 24, padding: '0 9px', borderRadius: 12,
            background: A.warning, color: A.ink,
            fontSize: 12, fontWeight: 700, fontFamily: A.mono,
          }}>{count}</span>
          <span style={{ color: A.forestText }}>{itemLabel}{plural} selected</span>
        </div>

        <span style={{ width: 1, height: 22, background: 'rgba(234,231,227,0.16)', flexShrink: 0 }} />

        {/* Actions */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {actions.map((a, i) => (
            <button
              key={i}
              onClick={a.onClick}
              disabled={a.busy}
              style={{
                padding: '7px 14px', borderRadius: 8, border: 'none',
                background: a.danger ? 'rgba(217,83,79,0.18)' : 'rgba(234,231,227,0.12)',
                color: a.danger ? '#FF8B86' : A.cream,
                fontFamily: A.font, fontSize: 12, fontWeight: 600,
                cursor: a.busy ? 'not-allowed' : 'pointer',
                opacity: a.busy ? 0.5 : 1,
                transition: 'background 0.12s, opacity 0.15s',
                whiteSpace: 'nowrap',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              {a.busy && (
                <span style={{
                  width: 11, height: 11,
                  border: `2px solid ${a.danger ? '#FF8B86' : A.cream}`, borderTopColor: 'transparent',
                  borderRadius: '50%', animation: 'spin 0.7s linear infinite',
                  display: 'inline-block',
                }} />
              )}
              {a.label}
            </button>
          ))}
        </div>

        {/* Clear */}
        {onClear && (
          <button
            onClick={onClear}
            aria-label="Clear selection"
            title="Clear selection"
            style={{
              padding: '5px 10px', borderRadius: 6, border: 'none',
              background: 'transparent',
              color: 'rgba(234,231,227,0.55)',
              fontFamily: A.font, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >×</button>
        )}
      </div>
    </>
  );
}
