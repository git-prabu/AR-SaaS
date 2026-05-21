// lib/printKot.js
//
// Client-side thermal KOT (Kitchen Order Ticket) printing — Phase 1a.
//
// Approach: build a self-contained 80mm receipt HTML document from the
// order data ALREADY loaded on the page, open it in a small window, and
// fire that window's print(). This works with ANY printer the device
// has — including a thermal printer set as the default — via the OS
// print dialog, with ZERO hardware integration, no auth, no Firestore
// re-fetch. (A direct one-tap WebUSB/Bluetooth ESC/POS path can be added
// later for dialog-free printing; this is the universal baseline.)
//
// A KOT deliberately shows NO prices — the kitchen needs WHAT to cook,
// not money. Items are large + bold for across-the-counter readability;
// modifiers / notes are called out under each line.

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function buildKotHtml(order, opts = {}) {
  const restaurantName = opts.restaurantName || '';
  const items = Array.isArray(order?.items) ? order.items : [];
  const isTakeaway = order?.orderType === 'takeaway' || order?.orderType === 'takeout';
  const when = new Date();
  const timeStr = when.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const dateStr = when.toLocaleDateString('en-IN');
  const orderRef = order?.orderNumber ? `#${order.orderNumber}` : (order?.id ? order.id.slice(-5).toUpperCase() : '');

  const rows = items.map(it => {
    const qty = it.qty || 1;
    const mods = [];
    if (it.variant) mods.push(it.variant);
    if (Array.isArray(it.addOns) && it.addOns.length) mods.push(it.addOns.map(a => a?.name || a).join(', '));
    if (it.modNote) mods.push(it.modNote);
    if (it.note) mods.push(it.note);
    const modLine = mods.length ? `<div class="mod">+ ${escapeHtml(mods.join(' · '))}</div>` : '';
    return `<div class="row"><span class="qty">${qty}&times;</span><span class="nm">${escapeHtml(it.name || '')}</span></div>${modLine}`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>KOT ${escapeHtml(orderRef)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 80mm; padding: 6mm 5mm; font-family: 'Courier New', ui-monospace, monospace; color: #000; -webkit-print-color-adjust: exact; }
  .ctr { text-align: center; }
  .rest { font-size: 12px; }
  .kot { font-size: 19px; font-weight: 700; letter-spacing: 1px; margin: 5px 0; }
  .meta { font-size: 12px; margin: 2px 0; display: flex; justify-content: space-between; }
  .meta b { font-size: 14px; }
  .hr { border-top: 1px dashed #000; margin: 7px 0; }
  .row { display: flex; gap: 8px; font-size: 16px; font-weight: 700; padding: 4px 0; }
  .qty { min-width: 30px; }
  .nm { flex: 1; }
  .mod { font-size: 12px; padding: 0 0 4px 38px; }
  .note { font-size: 13px; margin-top: 6px; font-weight: 700; }
  .ft { font-size: 11px; text-align: center; margin-top: 9px; }
</style></head>
<body>
  ${restaurantName ? `<div class="ctr rest">${escapeHtml(restaurantName)}</div>` : ''}
  <div class="ctr kot">KITCHEN ORDER</div>
  <div class="meta"><b>${isTakeaway ? 'TAKEAWAY' : 'TABLE ' + escapeHtml(order?.tableNumber || '-')}</b><b>${escapeHtml(orderRef)}</b></div>
  <div class="meta"><span>${dateStr}</span><span>${timeStr}</span></div>
  ${order?.customerName ? `<div class="meta"><span>${escapeHtml(order.customerName)}</span></div>` : ''}
  <div class="hr"></div>
  ${rows || '<div class="row"><span class="nm">(no items)</span></div>'}
  ${order?.specialInstructions ? `<div class="note">! ${escapeHtml(order.specialInstructions)}</div>` : ''}
  <div class="hr"></div>
  <div class="ft">Printed ${timeStr}</div>
</body></html>`;
}

// Opens a print window for the KOT. Returns false if the popup was
// blocked (caller can surface a toast telling the user to allow popups).
export function printKot(order, opts = {}) {
  if (typeof window === 'undefined') return false;
  const html = buildKotHtml(order, opts);
  const w = window.open('', '_blank', 'width=380,height=640');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  // Let the new window paint before invoking print, else some browsers
  // print a blank page.
  setTimeout(() => { try { w.print(); } catch { /* user closed it */ } }, 300);
  return true;
}
