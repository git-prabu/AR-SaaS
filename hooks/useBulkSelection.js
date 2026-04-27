// hooks/useBulkSelection.js
//
// Generic bulk-selection state for any list of items with stable IDs.
// Used initially by /admin/items but designed to drop into other admin
// pages later (feedback, payments, etc.).
//
// Usage:
//   const sel = useBulkSelection(displayedItems, item => item.id);
//   <Checkbox checked={sel.isSelected(item.id)} onChange={() => sel.toggle(item.id)} />
//   <Checkbox checked={sel.allSelected} onChange={sel.toggleAll} />   // header
//   {sel.count > 0 && <BulkActionBar count={sel.count} ... />}
//
// `items` is the CURRENT visible list (filtered + searched). The
// "select all" toggle operates on the visible list, NOT the entire
// dataset — that matches user intuition ("select all I can see").
// Selected IDs that drop out of the visible list (e.g., user changes
// filter) stay in state but are invisible until they reappear; call
// `clear()` if the parent wants to reset on filter change.

import { useState, useCallback, useMemo } from 'react';

export default function useBulkSelection(items = [], getId = (x) => x.id) {
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const visibleIds = useMemo(() => items.map(getId), [items, getId]);

  const isSelected = useCallback(
    (id) => selectedIds.has(id),
    [selectedIds]
  );

  const toggle = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else              next.add(id);
      return next;
    });
  }, []);

  const allSelected = useMemo(() => {
    if (visibleIds.length === 0) return false;
    return visibleIds.every(id => selectedIds.has(id));
  }, [visibleIds, selectedIds]);

  // The "indeterminate" state — some but not all visible items selected.
  // Lets the parent render a tri-state checkbox.
  const someSelected = useMemo(() => {
    if (allSelected) return false;
    return visibleIds.some(id => selectedIds.has(id));
  }, [visibleIds, selectedIds, allSelected]);

  const toggleAll = useCallback(() => {
    setSelectedIds(prev => {
      // If everything visible is already selected, deselect just the visible
      // ones (preserves selections from other filters).
      if (visibleIds.every(id => prev.has(id)) && visibleIds.length > 0) {
        const next = new Set(prev);
        visibleIds.forEach(id => next.delete(id));
        return next;
      }
      // Otherwise add all visible to the selection.
      const next = new Set(prev);
      visibleIds.forEach(id => next.add(id));
      return next;
    });
  }, [visibleIds]);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  // The actual list of selected IDs. Materialised only when read so the
  // hook itself doesn't allocate every render.
  const ids = useMemo(() => Array.from(selectedIds), [selectedIds]);

  return {
    isSelected,
    toggle,
    toggleAll,
    clear,
    allSelected,
    someSelected,
    count: selectedIds.size,
    ids,
  };
}
