// pages/api/petpooja/item-stock.js
// Phase B (Petpooja hybrid) — INBOUND endpoint Petpooja calls when
// the restaurant flips an item's in-stock state in their POS.
//
// We mirror to our menuItems doc's `isOutOfStock` field so the
// customer page hides / shows the item in real time.
//
// Body shape (per Petpooja spec):
//   {
//     restID: string,
//     type: 'item' | 'addon',
//     inStock: boolean,
//     itemID: string[] | string,
//     autoTurnOnTime?: 'custom',
//     customTurnOnTime?: 'YYYY-MM-DD HH:mm'
//   }
//
// Response: { http_code, status, message }
// The "auto turn on" scheduling is OUT OF SCOPE for v1 — restaurants
// that need this can flip items back manually in Petpooja and the
// next /pushmenu / /item-stock call will sync to us.

import { authenticatePetpoojaInbound } from '../../../lib/petpoojaInboundAuth';
import { toggleItemStock } from '../../../lib/petpoojaSync';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ http_code: 405, status: 'error', message: 'Method not allowed' });
  const body = req.body || {};
  const auth = await authenticatePetpoojaInbound(body);
  if (!auth.ok) return res.status(auth.status).json({ http_code: auth.status, status: 'error', message: auth.error });

  const { type, inStock } = body;
  // itemID can be a string OR array depending on the call.
  const raw = body.itemID;
  const itemIDs = Array.isArray(raw) ? raw : (raw ? [raw] : []);

  try {
    const result = await toggleItemStock(auth.restaurant.id, {
      type:    type === 'addon' ? 'addon' : 'item',
      inStock: !!inStock,
      itemIDs,
    });
    if (!result.ok) {
      return res.status(404).json({ http_code: 404, status: 'error', message: result.error });
    }
    return res.status(200).json({
      http_code: 200, status: 'success',
      message: `Updated ${result.count} item(s)`,
    });
  } catch (err) {
    console.error('[/api/petpooja/item-stock] failed:', err);
    return res.status(500).json({ http_code: 500, status: 'error', message: err?.message });
  }
}
