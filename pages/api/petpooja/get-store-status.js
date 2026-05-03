// pages/api/petpooja/get-store-status.js
// Phase B (Petpooja hybrid) — INBOUND endpoint Petpooja calls to
// query our store status (open / closed). We answer based on the
// restaurant doc's `isAcceptingOrders` field. Default is open.
//
// Body shape: { restID }
// Response: { http_code, status, store_status: '0'|'1', message }
//   store_status '1' = open, '0' = closed (per Petpooja's convention).

import { authenticatePetpoojaInbound } from '../../../lib/petpoojaInboundAuth';
import { readStoreStatus } from '../../../lib/petpoojaSync';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ http_code: 405, status: 'error', message: 'Method not allowed' });
  const auth = await authenticatePetpoojaInbound(req.body || {});
  if (!auth.ok) return res.status(auth.status).json({ http_code: auth.status, status: 'error', message: auth.error });

  try {
    const r = await readStoreStatus(auth.restaurant.id);
    if (!r.ok) return res.status(404).json({ http_code: 404, status: 'error', message: r.error });
    return res.status(200).json({
      http_code:    200,
      status:       'success',
      store_status: r.isOpen ? '1' : '0',
      message:      r.isOpen ? 'Store is accepting orders' : 'Store is closed',
    });
  } catch (err) {
    console.error('[/api/petpooja/get-store-status] failed:', err);
    return res.status(500).json({ http_code: 500, status: 'error', message: err?.message });
  }
}
