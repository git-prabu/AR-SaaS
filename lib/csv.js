// lib/csv.js
//
// Single source of truth for CSV export across the admin pages. Replaces the
// four hand-rolled CSV builders (reports, payments, analytics, items) that had
// drifted apart — only one of them added the UTF-8 BOM, two missed newline
// escaping, and quoting rules differed. Every "Export CSV" button now behaves
// identically.
//
// Guarantees on every export:
//   - RFC-4180 escaping: a field containing a comma, double-quote, CR or LF is
//     wrapped in double-quotes, with inner quotes doubled.
//   - CRLF row separators (what RFC-4180 specifies; Excel/Windows friendly).
//   - A leading UTF-8 BOM (﻿) so Excel decodes the rupee sign and regional
//     scripts (Tamil, Hindi, …) correctly instead of mojibake.

// Escape a single value per RFC-4180.
export function csvCell(value) {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// rows: Array<Array<cell>> — each inner array is one row of cells.
export function rowsToCsv(rows) {
  return (rows || []).map(r => (r || []).map(csvCell).join(',')).join('\r\n');
}

// objects: Array<object>. columns (optional): Array<{ key, label }> to control
// column order + header text. Without it, the keys of the first object are used
// (both as the header and the column order).
export function objectsToCsv(objects, columns) {
  const list = objects || [];
  if (!list.length) return '';
  const cols = (columns && columns.length)
    ? columns
    : Object.keys(list[0]).map(k => ({ key: k, label: k }));
  const header = cols.map(c => c.label);
  const body = list.map(o => cols.map(c => o[c.key]));
  return rowsToCsv([header, ...body]);
}

// Trigger a browser download of CSV text with a UTF-8 BOM. No-op on the server.
export function downloadCsv(csv, filename) {
  if (typeof window === 'undefined') return;
  const BOM = String.fromCharCode(0xFEFF); // UTF-8 BOM → Excel reads ₹/Tamil/Hindi right
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Convenience: build + download from rows in one call.
export function exportRowsCsv(rows, filename) {
  downloadCsv(rowsToCsv(rows), filename);
}

// Convenience: build + download from objects in one call.
export function exportObjectsCsv(objects, filename, columns) {
  downloadCsv(objectsToCsv(objects, columns), filename);
}
