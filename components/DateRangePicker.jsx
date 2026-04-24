// components/DateRangePicker.jsx
//
// Self-contained custom date-range popover. Renders a "Custom" pill button
// (or "start → end" when a custom range is active) plus a popover with two
// date inputs and Apply / Clear actions.
//
// Used on admin pages that already have period pills (Today / Week / Month /
// All) and want an extra "Custom" option.
//
// Usage (e.g. in payments.js / waiter.js / orders.js):
//   const [customRange, setCustomRange] = useState({ active: false, start: '', end: '' });
//   <div style={{ position: 'relative', ... }}>
//     {/* existing Today/Week/Month/All pills — reset customRange on click */}
//     <DateRangePicker
//       value={customRange}
//       onChange={setCustomRange}
//       maxDate={todayKey()}
//       theme={A}              // your page's Aspire palette object
//       popoverRight={0}       // anchor popover to the right edge of parent
//     />
//   </div>
//   // In filter logic, check `customRange.active` and use the bounds derived
//   // from `customRange.start` / `customRange.end` instead of the period pill.
//
// The parent MUST be position: relative — the popover uses position: absolute.

import { useState } from 'react';

export default function DateRangePicker({
  value,                    // { active, start, end } — controlled by parent
  onChange,                 // (newValue) => void
  maxDate,                  // ISO date string like '2026-04-24' — caps end input
  theme,                    // { ink, cream, shell, mutedText, faintText, border, font, ... }
  pillStyle,                // optional inline style override for the trigger button
  pillActiveStyle,          // optional additional style when a custom range is active
  pillClassName,            // optional className for hover CSS
  popoverBg,                // optional — defaults to theme.shell
  popoverRight = 0,         // px from right edge of parent (use 'auto' + popoverLeft to anchor left)
  popoverLeft,              // optional — use instead of popoverRight for left-anchored popovers
  compactLabel = false,     // true → "MM-DD → MM-DD", false → full "YYYY-MM-DD → YYYY-MM-DD"
}) {
  const [open, setOpen] = useState(false);
  const v = value || { active: false, start: '', end: '' };
  const canApply = !!(v.start && v.end && v.start <= v.end);

  const triggerLabel = v.active
    ? (compactLabel ? `${v.start.slice(5)} → ${v.end.slice(5)}` : `${v.start} → ${v.end}`)
    : 'Custom';

  const bg = popoverBg || theme.shell;
  const defaultPillStyle = {
    padding: '6px 12px',
    fontFamily: theme.font,
    fontSize: 12,
    fontWeight: v.active ? 700 : 500,
    background: v.active ? theme.ink : 'transparent',
    color: v.active ? theme.cream : theme.mutedText,
    border: 'none',
    borderRadius: 7,
    cursor: 'pointer',
    transition: 'all 0.15s',
  };

  const popoverPos = popoverLeft != null
    ? { left: popoverLeft }
    : { right: popoverRight };

  return (
    <>
      <button
        type="button"
        className={pillClassName}
        onClick={() => setOpen(o => !o)}
        style={{
          ...defaultPillStyle,
          ...(pillStyle || {}),
          ...(v.active ? (pillActiveStyle || {}) : {}),
        }}
      >
        {triggerLabel}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 42, ...popoverPos, zIndex: 20,
          background: bg, border: theme.border, borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
          padding: 14, width: 280,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: theme.faintText, marginBottom: 8,
          }}>Custom range</div>

          <label style={{ display: 'block', fontSize: 11, color: theme.mutedText, marginBottom: 4 }}>Start date</label>
          <input
            type="date"
            value={v.start}
            max={v.end || undefined}
            onChange={e => onChange({ ...v, start: e.target.value })}
            style={{
              width: '100%', padding: '8px 10px', border: theme.border, borderRadius: 8,
              fontSize: 13, marginBottom: 10, boxSizing: 'border-box',
              fontFamily: theme.font, color: theme.ink, background: bg,
            }}
          />

          <label style={{ display: 'block', fontSize: 11, color: theme.mutedText, marginBottom: 4 }}>End date</label>
          <input
            type="date"
            value={v.end}
            min={v.start || undefined}
            max={maxDate || undefined}
            onChange={e => onChange({ ...v, end: e.target.value })}
            style={{
              width: '100%', padding: '8px 10px', border: theme.border, borderRadius: 8,
              fontSize: 13, marginBottom: 12, boxSizing: 'border-box',
              fontFamily: theme.font, color: theme.ink, background: bg,
            }}
          />

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => { if (canApply) { onChange({ ...v, active: true }); setOpen(false); } }}
              disabled={!canApply}
              style={{
                flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none',
                background: theme.ink, color: theme.cream,
                fontSize: 12, fontWeight: 600, fontFamily: theme.font,
                cursor: canApply ? 'pointer' : 'not-allowed',
                opacity: canApply ? 1 : 0.5,
              }}
            >Apply</button>
            {v.active && (
              <button
                type="button"
                onClick={() => { onChange({ active: false, start: '', end: '' }); setOpen(false); }}
                style={{
                  padding: '8px 12px', borderRadius: 8, border: theme.border,
                  background: bg, color: theme.mutedText,
                  fontSize: 12, fontWeight: 600, fontFamily: theme.font, cursor: 'pointer',
                }}
              >Clear</button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
