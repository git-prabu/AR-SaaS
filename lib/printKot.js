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

// On-screen-only close button injected into every print HTML.
//
// Why this exists: window.open() popups on iOS Safari and inside an
// installed PWA frequently open WITHOUT browser chrome — no address
// bar, no tab close button. After the print dialog is dismissed (or
// if it never fires), the user is staring at the bill / KOT HTML
// with no way out except killing the app from the app switcher.
// The owner reported this exact symptom from real-device testing.
//
// This snippet adds a fixed-position "× Close" pill at the top-right
// of the screen that calls window.close(). @media print hides it so
// it never appears on the actual printed receipt. The print()
// fallback button next to it lets the user manually re-trigger the
// print dialog if the auto-fire was suppressed (some Android Chrome
// flavours need a fresh user gesture). */
const PRINT_WINDOW_CHROME = `
<style>
  @media screen {
    .print-chrome {
      position: fixed; top: 12px; right: 12px; z-index: 99999;
      display: flex; gap: 8px;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .print-chrome button {
      padding: 10px 16px; border-radius: 10px; border: none;
      font-size: 13px; font-weight: 600; cursor: pointer;
      box-shadow: 0 4px 14px rgba(0,0,0,0.18);
    }
    .print-chrome .pc-print { background: #C4A86D; color: #1A1A1A; }
    .print-chrome .pc-close { background: #1A1A1A; color: #EDEDED; }
  }
  @media print { .print-chrome { display: none !important; } }
</style>
<div class="print-chrome">
  <button class="pc-print" onclick="window.print()">Print</button>
  <button class="pc-close" onclick="window.close()">&times; Close</button>
</div>`;

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
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @page { size: 80mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 80mm; padding: 6mm 5mm 80px 5mm; font-family: 'Courier New', ui-monospace, monospace; color: #000; -webkit-print-color-adjust: exact; }
  @media print { body { padding-bottom: 0; } }
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
  ${PRINT_WINDOW_CHROME}
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
  return openPrintWindow(buildKotHtml(order, opts));
}

// ── Customer bill (Bill v2, 12 Jun 2026) ─────────────────────────
// Rebuilt to the standard Indian thermal-bill skeleton the owner
// reverse-engineered from 6 real receipts (Petpooja-style: The Koi,
// Oceans 7, ilai, Zaitoon, Shri Food Park, Le Cafe):
//
//   header (logo / name / legal line / address / phone / GSTIN)
//   Name: ____ line
//   meta block (Date+time · "Dine In: T2" · Cashier · Bill No. · Token No.s)
//   Item | Qty. | Price | Amount
//   Total Qty + Sub Total · Service Charge · CGST/SGST · Round off
//   GRAND TOTAL · Paid via X · optional UPI pay-QR
//   footer (FSSAI · custom message)
//
// Everything presentational is driven by `billSettings` on the
// restaurant doc (managed in /admin/business-info → Bill Settings,
// merged over DEFAULT_BILL_SETTINGS so old restaurants get the full
// standard look with zero config).
//
// Tax modes (legal requirement, not cosmetic — see audit research):
//   regular       GSTIN + CGST/SGST lines + HSN/SAC line ("Tax Invoice")
//   composition   NO tax lines, "Bill of Supply" subtitle + the
//                 mandatory "composition taxable person…" wording
//   unregistered  no GSTIN, no tax lines, no wording
export const DEFAULT_BILL_SETTINGS = {
  taxMode: 'regular',        // 'regular' | 'composition' | 'unregistered'
  showLogo: true,            // prints restaurant.logoUrl when present
  legalName: '',             // optional "(A Unit of …)" line under the name
  showPhone: true,
  showCustomerName: true,    // "Name:" line (blank for walk-ins, like the samples)
  showCashier: true,
  showTokens: true,          // "Token No.: 83, 92" — kitchen round numbers
  showHsnLine: true,         // "HSN/SAC: 996331" meta line (regular mode only)
  showPaidVia: true,         // "Paid via Card" once the bill is paid
  showUpiQr: false,          // UPI pay-QR printed on UNPAID bills
  showFssai: true,
  paperWidth: 80,            // 58 | 80 (mm thermal roll)
  fontScale: 1,              // 1 normal · 1.15 large
  footerText: '',            // falls back to restaurant.billFooter
};

export function buildBillHtml(orders, opts = {}) {
  const r = opts.restaurant || {};
  const s = { ...DEFAULT_BILL_SETTINGS, ...(r.billSettings || {}), ...(opts.settings || {}) };
  const tableLabel = opts.tableLabel || '';
  const orderTypeLabel = opts.orderTypeLabel
    || ((Array.isArray(orders) && orders[0] && (orders[0].orderType === 'takeaway' || orders[0].orderType === 'takeout'))
      ? 'Pick Up' : 'Dine In');
  const when = new Date();
  const list = Array.isArray(orders) ? orders : [];
  const items = list.flatMap(o => Array.isArray(o.items) ? o.items : []);
  const sum = (f) => list.reduce((acc, o) => acc + (Number(o[f]) || 0), 0);
  const subtotal = sum('subtotal') || items.reduce((acc, it) => acc + (Number(it.price) || 0) * (it.qty || 1), 0);
  const cgst = sum('cgst');
  const sgst = sum('sgst');
  const serviceCharge = sum('serviceCharge');
  const discount = sum('discount');
  const roundOff = sum('roundOff');
  const total = sum('total') || (subtotal + serviceCharge + cgst + sgst - discount);
  const gstPct = Number(r.gstPercent) || 0;
  const couponCode = (list.find(o => o.couponCode) || {}).couponCode || '';
  const totalQty = items.reduce((acc, it) => acc + (Number(it.qty) || 1), 0);

  // Token No.s = the per-day kitchen order numbers, comma-joined when
  // the table ordered in rounds (Koi: "83, 92" · Zaitoon: "783, 805, 846").
  const tokens = list.map(o => o.orderNumber).filter(n => typeof n === 'number' && n > 0);
  const tokenStr = tokens.join(', ');

  // Bill No. = the formal running invoice number (ensureBillNumber).
  const billNo = opts.billNumber != null ? String(opts.billNumber) : '';

  const cashier = opts.cashier || '';
  const customerName = opts.customerName
    || (list.find(o => o.customerName) || {}).customerName || '';

  // Payment method — "Paid via X" once paid (Le Cafe pattern).
  const PAY = { paid_cash: 'Cash', paid_card: 'Card', paid_online: 'UPI', paid: 'Paid' };
  const payStatuses = [...new Set(list.map(o => o.paymentStatus).filter(st => PAY[st]))];
  const paidVia = payStatuses.length === 0 ? ''
    : payStatuses.length > 1 ? payStatuses.map(st => PAY[st]).join(' + ')
    : PAY[payStatuses[0]];
  const isUnpaid = payStatuses.length === 0;

  const regular = s.taxMode === 'regular';
  const composition = s.taxMode === 'composition';

  const itemRows = items.map(it => {
    const qty = Number(it.qty) || 1;
    const price = Number(it.price) || 0;
    return `<div class="row"><span class="n">${escapeHtml(it.name || '')}</span><span class="q">${qty}</span><span class="pr">${price.toFixed(2)}</span><span class="am">${(price * qty).toFixed(2)}</span></div>`;
  }).join('');

  const moneyRow = (label, val, o = {}) => {
    const n = Number(val) || 0;
    if (!o.always && n === 0) return '';
    const shown = o.neg ? `-${Math.abs(n).toFixed(2)}`
      : (o.signed ? (n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2)) : n.toFixed(2));
    return `<div class="trow"><span>${escapeHtml(label)}</span><span>${shown}</span></div>`;
  };

  const W = s.paperWidth === 58 ? 58 : 80;
  const F = Number(s.fontScale) === 1.15 ? 1.15 : 1;
  const px = (n) => Math.round(n * F * 10) / 10 + 'px';

  return `<!doctype html><html><head><meta charset="utf-8"><title>Bill${billNo ? ' #' + escapeHtml(billNo) : ''}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @page { size: ${W}mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: ${W}mm; padding: 5mm 4mm 80px 4mm; font-family: 'Courier New', ui-monospace, monospace; color: #000; font-size: ${px(12)}; -webkit-print-color-adjust: exact; }
  @media print { body { padding-bottom: 0; } }
  .ctr { text-align: center; }
  .logo { max-width: ${W === 58 ? 70 : 110}px; max-height: 60px; filter: grayscale(1) contrast(1.2); margin-bottom: 3px; }
  .rn { font-size: ${px(17)}; font-weight: 700; letter-spacing: 0.4px; }
  .sm { font-size: ${px(10)}; line-height: 1.5; }
  .sub { font-size: ${px(11)}; font-weight: 700; letter-spacing: 1px; margin-top: 2px; }
  .hr2 { border-top: 1px solid #000; border-bottom: 1px solid #000; height: 3px; margin: 6px 0; }
  .hr { border-top: 1px solid #000; margin: 6px 0; }
  .nameln { font-size: ${px(11)}; padding: 4px 0 8px; border-bottom: 1px solid #000; margin-bottom: 6px; }
  .meta { display: flex; justify-content: space-between; gap: 8px; font-size: ${px(11)}; margin: 1px 0; }
  .meta b { font-size: ${px(12)}; }
  .tokens { font-size: ${px(12)}; font-weight: 700; margin: 2px 0; }
  .row { display: flex; gap: 4px; font-size: ${px(11.5)}; padding: 2.5px 0; }
  .row .n { flex: 1; word-break: break-word; }
  .row .q { min-width: ${W === 58 ? 16 : 22}px; text-align: right; }
  .row .pr { min-width: ${W === 58 ? 38 : 48}px; text-align: right; }
  .row .am { min-width: ${W === 58 ? 42 : 54}px; text-align: right; }
  .hd { font-weight: 700; border-bottom: 1px solid #000; padding-bottom: 3px; margin-bottom: 2px; }
  .trow { display: flex; justify-content: space-between; font-size: ${px(11)}; padding: 1.5px 0; }
  .qtyrow { display: flex; justify-content: space-between; font-size: ${px(11.5)}; font-weight: 700; padding: 2px 0; }
  .tot { display: flex; justify-content: space-between; font-size: ${px(16)}; font-weight: 700; margin-top: 4px; }
  .paid { font-size: ${px(10.5)}; margin-top: 4px; }
  .comp { font-size: ${px(9.5)}; text-align: center; margin-top: 6px; line-height: 1.4; }
  .qr { text-align: center; margin-top: 8px; }
  .qr img { width: ${W === 58 ? 110 : 140}px; height: ${W === 58 ? 110 : 140}px; }
  .qr .cap { font-size: ${px(10)}; margin-top: 2px; }
  .ft { text-align: center; font-size: ${px(10)}; margin-top: 8px; line-height: 1.6; }
</style></head>
<body>
  ${PRINT_WINDOW_CHROME}
  <div class="ctr">
    ${s.showLogo && r.logoUrl ? `<img class="logo" src="${escapeHtml(r.logoUrl)}" alt="">` : ''}
    <div class="rn">${escapeHtml(r.name || 'Restaurant')}</div>
    ${s.legalName ? `<div class="sm">(${escapeHtml(s.legalName)})</div>` : ''}
    ${r.address ? `<div class="sm">${escapeHtml(r.address)}</div>` : ''}
    ${s.showPhone && r.phone ? `<div class="sm">Phone: ${escapeHtml(r.phone)}</div>` : ''}
    ${regular && r.gstNumber ? `<div class="sm">GSTIN: ${escapeHtml(r.gstNumber)}</div>` : ''}
    ${composition ? `<div class="sub">BILL OF SUPPLY</div>` : ''}
  </div>
  <div class="hr2"></div>
  ${s.showCustomerName ? `<div class="nameln">Name: ${escapeHtml(customerName)}</div>` : ''}
  <div class="meta"><span>Date: ${when.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span><b>${escapeHtml(orderTypeLabel)}${tableLabel ? ': ' + escapeHtml(String(tableLabel)) : ''}</b></div>
  <div class="meta"><span>${when.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}</span><span></span></div>
  <div class="meta"><span>${s.showCashier && cashier ? 'Cashier: ' + escapeHtml(cashier) : ''}</span><span>${billNo ? 'Bill No.: ' + escapeHtml(billNo) : ''}</span></div>
  ${s.showTokens && tokenStr ? `<div class="tokens">Token No.: ${escapeHtml(tokenStr)}</div>` : ''}
  ${regular && s.showHsnLine ? `<div class="meta"><span>HSN/SAC: ${escapeHtml(String(r.hsnCode || '996331'))}</span><span></span></div>` : ''}
  <div class="hr2"></div>
  <div class="row hd"><span class="n">Item</span><span class="q">Qty.</span><span class="pr">Price</span><span class="am">Amount</span></div>
  ${itemRows || '<div class="row"><span class="n">(no items)</span></div>'}
  <div class="hr"></div>
  <div class="qtyrow"><span>Total Qty: ${totalQty}</span><span>Sub Total&nbsp;&nbsp;${subtotal.toFixed(2)}</span></div>
  ${moneyRow('Service Charge', serviceCharge)}
  ${regular ? moneyRow(`C.G.S.T ${(gstPct / 2).toFixed(1)}%`, cgst) : ''}
  ${regular ? moneyRow(`S.G.S.T ${(gstPct / 2).toFixed(1)}%`, sgst) : ''}
  ${moneyRow(couponCode ? `Discount (${couponCode})` : 'Discount', discount, { neg: true })}
  ${moneyRow('Round off', roundOff, { signed: true })}
  <div class="hr"></div>
  <div class="tot"><span>Grand Total</span><span>&#8377;${Math.round(total).toLocaleString('en-IN')}</span></div>
  ${s.showPaidVia && paidVia ? `<div class="paid">Paid via ${escapeHtml(paidVia)}</div>` : ''}
  ${composition ? `<div class="comp">Composition taxable person,<br>not eligible to collect tax on supplies</div>` : ''}
  ${s.showUpiQr && isUnpaid && opts.upiQrDataUrl ? `<div class="qr"><img src="${opts.upiQrDataUrl}" alt="UPI QR"><div class="cap">Scan any UPI app &middot; &#8377;${Math.round(total).toLocaleString('en-IN')} pre-filled</div></div>` : ''}
  <div class="hr2"></div>
  <div class="ft">
    ${s.showFssai && r.fssaiNo ? `FSSAI Lic No. ${escapeHtml(r.fssaiNo)}<br>` : ''}
    ${escapeHtml(s.footerText || r.billFooter || 'Thank You! Visit Again!')}
  </div>
</body></html>`;
}

// Print the customer bill. ASYNC since v2 — when the settings ask for a
// UPI pay-QR on unpaid bills, the QR data-URL must be generated before
// the HTML is written. The popup is opened SYNCHRONOUSLY (inside the
// click's gesture context — popup blockers kill window.open after an
// await) with a placeholder, then the final HTML replaces it.
export async function printBill(orders, opts = {}) {
  if (typeof window === 'undefined') return false;

  const w = window.open('', '_blank', 'width=380,height=640');
  if (!w) return false;
  w.document.open();
  w.document.write('<!doctype html><html><body style="font-family:sans-serif;padding:24px;color:#444">Preparing bill…</body></html>');
  w.document.close();

  // opts.billNumber may be a NUMBER or a PROMISE (callers kick
  // ensureBillNumber without awaiting so this window.open above stays
  // inside the tap's gesture context — popup blockers kill window.open
  // that happens after an await). Resolve it now that the window is ours.
  let billNumber = null;
  try { billNumber = await Promise.resolve(opts.billNumber); } catch { billNumber = null; }

  let upiQrDataUrl = null;
  try {
    const r = opts.restaurant || {};
    const s = { ...DEFAULT_BILL_SETTINGS, ...(r.billSettings || {}), ...(opts.settings || {}) };
    const list = Array.isArray(orders) ? orders : [];
    const paid = list.some(o => ['paid_cash', 'paid_card', 'paid_online', 'paid'].includes(o.paymentStatus));
    const upiId = (r.upiId || '').trim();
    if (s.showUpiQr && !paid && upiId) {
      const total = list.reduce((acc, o) => acc + (Number(o.total) || 0), 0);
      const uri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(r.name || 'Restaurant')}&am=${Math.round(total)}&cu=INR&tn=${encodeURIComponent('Bill ' + (billNumber || ''))}`;
      const QRCode = (await import('qrcode')).default;
      upiQrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 300 });
    }
  } catch { /* QR is decorative — print without it rather than fail */ }

  const html = buildBillHtml(orders, { ...opts, billNumber, upiQrDataUrl });
  try {
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch { /* user closed it */ } }, 300);
    return true;
  } catch {
    try { w.close(); } catch {}
    return false;
  }
}

// Shared print-window opener (KOT path — bills use the async variant above).
function openPrintWindow(html) {
  const w = window.open('', '_blank', 'width=380,height=640');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch { /* user closed it */ } }, 300);
  return true;
}
