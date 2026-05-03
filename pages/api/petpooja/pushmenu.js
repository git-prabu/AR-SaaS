// pages/api/petpooja/pushmenu.js
// Phase B (Petpooja hybrid) — INBOUND endpoint. Petpooja pushes the
// full menu object to us whenever the restaurant edits anything in
// their dashboard (item names, prices, categories, stock, taxes,
// addons). We apply it via the same applyMenu helper that powers the
// pull-driven /api/petpooja/menu-sync endpoint.
//
// This is the PREFERRED sync path — push gives us real-time menu
// updates without polling. The 6-hour pull cron stays as a fallback.
//
// Body shape: full menu object (same shape as the Fetch Menu response).
//   Top-level: { restID, restaurants[], categories[], items[], taxes[],
//                addongroups[], addongroupitems[], variations[], ... }
//
// Response: { http_code, status, message }

import { authenticatePetpoojaInbound } from '../../../lib/petpoojaInboundAuth';
import { applyMenu } from '../../../lib/petpoojaSync';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ http_code: 405, status: 'error', message: 'Method not allowed' });
  const body = req.body || {};
  const auth = await authenticatePetpoojaInbound(body);
  if (!auth.ok) return res.status(auth.status).json({ http_code: auth.status, status: 'error', message: auth.error });

  // The body itself is the menu object — applyMenu expects it directly.
  try {
    const r = await applyMenu(auth.restaurant.id, body, 'menu-push');
    if (!r.ok) {
      return res.status(500).json({ http_code: 500, status: 'error', message: r.error || 'apply failed' });
    }
    return res.status(200).json({
      http_code: 200, status: 'success',
      message: `Menu applied — ${r.itemCount} items.`,
    });
  } catch (err) {
    console.error('[/api/petpooja/pushmenu] failed:', err);
    return res.status(500).json({ http_code: 500, status: 'error', message: err?.message });
  }
}
