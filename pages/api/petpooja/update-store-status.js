// pages/api/petpooja/update-store-status.js
// Phase B (Petpooja hybrid) — INBOUND endpoint Petpooja calls when
// the restaurant manually toggles store-open / store-close in their
// dashboard. We mirror to restaurant.isAcceptingOrders so the
// customer page reflects the change.
//
// Body shape:
//   { restID, store_status: 0|1, turn_on_time: 'YYYY-MM-DD HH:mm:ss', reason: string }
// Response: { http_code, status, message }

import { authenticatePetpoojaInbound } from '../../../lib/petpoojaInboundAuth';
import { setStoreStatus } from '../../../lib/petpoojaSync';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ http_code: 405, status: 'error', message: 'Method not allowed' });
  const body = req.body || {};
  const auth = await authenticatePetpoojaInbound(body);
  if (!auth.ok) return res.status(auth.status).json({ http_code: auth.status, status: 'error', message: auth.error });

  const { store_status, turn_on_time, reason } = body;
  if (store_status === undefined || store_status === null) {
    return res.status(400).json({ http_code: 400, status: 'error', message: 'store_status is required' });
  }

  try {
    const r = await setStoreStatus(auth.restaurant.id, {
      storeStatus: store_status,
      turnOnTime:  turn_on_time || null,
      reason:      reason || null,
    });
    return res.status(200).json({
      http_code: 200, status: 'success',
      message: r.isOpen ? 'Store opened' : 'Store closed',
    });
  } catch (err) {
    console.error('[/api/petpooja/update-store-status] failed:', err);
    return res.status(500).json({ http_code: 500, status: 'error', message: err?.message });
  }
}
