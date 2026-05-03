// lib/petpooja.js
// Phase B (Petpooja hybrid) — API client for Petpooja Online Ordering API V2.1.0.
//
// Server-only — uses node fetch + the partner credentials in env. Never
// call this from a React component or the browser.
//
// CONSUMERS (all server-side):
//   - pages/api/petpooja/menu-sync.js     → fetchMenu()
//   - pages/api/petpooja/order-push.js    → saveOrder()
//   - pages/api/petpooja/payment-sync.js  → updatePaymentStatus()  [best-effort, see note]
//   - pages/api/petpooja/connect.js       → validateCredentials()
//   - lib/petpoojaSync.js                 → orchestration layer above this
//
// AUTH MODEL (verified against Petpooja's V2.1.0 Apiary blueprint):
//   - Three credentials issued by Petpooja per partner integrator:
//       * app_key      (32 chars)
//       * app_secret   (40 chars)
//       * access_token (40 chars)
//     These are PARTNER-LEVEL — same triplet used for every restaurant
//     we onboard. Stored in env (PETPOOJA_APP_KEY, etc.).
//   - Plus restID (per-restaurant) — stored on each restaurant doc's
//     petpoojaConfig.restID. Identifies WHICH restaurant the request
//     applies to.
//   - Two transports coexist:
//       * Save Order, Update Status, Rider: keys in JSON BODY (snake_case)
//       * Fetch Menu: keys in HTTP HEADERS (kebab-case: app-key etc.)
//
// PRODUCTION URLs (per Apiary docs):
//   - Save Order:           POST /V1/save_order
//   - Fetch Menu:           POST /V1/mapped_restaurant_menus
//   - Update Order Status:  POST /V1/update_order_status   (cancel-only today)
//   - Rider Status:         POST /V1/rider_status_update
//
// Production base host is partner-credential-gated; current dev hosts
// are AWS-API-Gateway URLs (different host per endpoint). Override
// per-endpoint via env vars below.
//
// CRITICAL FINDING — payment status updates:
//   Petpooja DOES NOT expose a public "mark paid after the fact"
//   endpoint. Payment is captured at save_order time via payment_type
//   ("COD" / "CARD" / "ONLINE" / "CREDIT" / "OTHER"). For dine-in
//   orders that are paid AFTER they're sent to the kitchen (the
//   common Indian flow), the cashier must mark them paid in Petpooja's
//   own billing UI — we have no API to sync that.
//
//   For TAKEAWAY pay-first orders we side-step this by NOT pushing to
//   Petpooja until payment is confirmed; payment_type is set correctly
//   on the initial save_order call.
//
//   updatePaymentStatus() below uses the partner-defined extension on
//   /V1/update_order_status (adding payment_type/payment_status fields).
//   This is best-effort and may be silently ignored by Petpooja —
//   syncPayment() in petpoojaSync logs but does not fail the operation
//   when this happens.
//
// MOCK MODE:
//   When process.env.PETPOOJA_USE_MOCKS === 'true' OR a restaurant's
//   apiKey starts with 'mock_', we route to lib/petpoojaMock.js
//   instead of hitting the real network. See shouldUseMocks().

import { petpoojaMock, shouldUseMocks } from './petpoojaMock';

// Per-endpoint base URLs — Petpooja's V2.1.0 dev hosts are different
// AWS API Gateway hostnames per endpoint, so we keep them separate.
// All overrideable via env so production credentials can point us at
// the partner-issued production URLs.
const URLS = {
  saveOrder:     process.env.PETPOOJA_URL_SAVE_ORDER     || 'https://47pfzh5sf2.execute-api.ap-southeast-1.amazonaws.com/V1/save_order',
  fetchMenu:     process.env.PETPOOJA_URL_FETCH_MENU     || 'https://qle1yy2ydc.execute-api.ap-southeast-1.amazonaws.com/V1/mapped_restaurant_menus',
  updateStatus:  process.env.PETPOOJA_URL_UPDATE_STATUS  || 'https://qle1yy2ydc.execute-api.ap-southeast-1.amazonaws.com/V1/update_order_status',
  riderStatus:   process.env.PETPOOJA_URL_RIDER_STATUS   || 'https://qle1yy2ydc.execute-api.ap-southeast-1.amazonaws.com/V1/rider_status_update',
};

// ── Partner-level credentials ────────────────────────────────────────
// Pulled from env at request time (not module load) so they can be
// rotated without a redeploy. Tests pass alternate values via env.
function partnerCreds() {
  return {
    app_key:      process.env.PETPOOJA_APP_KEY      || '',
    app_secret:   process.env.PETPOOJA_APP_SECRET   || '',
    access_token: process.env.PETPOOJA_ACCESS_TOKEN || '',
  };
}

// Build the keys-in-body block (snake_case, used by save_order +
// update_status + rider_status).
function bodyAuth(petpoojaConfig) {
  const p = partnerCreds();
  return {
    app_key:      petpoojaConfig?.appKey      || p.app_key,
    app_secret:   petpoojaConfig?.appSecret   || p.app_secret,
    access_token: petpoojaConfig?.accessToken || p.access_token,
  };
}

// Build the keys-in-headers block (kebab-case, used by fetch_menu).
function headerAuth(petpoojaConfig) {
  const p = partnerCreds();
  return {
    'Content-Type': 'application/json',
    'app-key':      petpoojaConfig?.appKey      || p.app_key,
    'app-secret':   petpoojaConfig?.appSecret   || p.app_secret,
    'access-token': petpoojaConfig?.accessToken || p.access_token,
  };
}

// ── HTTP helper ──────────────────────────────────────────────────────
async function postJson(url, body, { headers, timeoutMs = 15000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: headers || { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON response */ }
    if (!res.ok) {
      return { ok: false, status: res.status, data, error: data?.message || `HTTP ${res.status}` };
    }
    // Petpooja returns success="0" with HTTP 200 on validation failures.
    if (data && (data.success === '0' || data.success === 0)) {
      return {
        ok: false, status: res.status, data,
        error: data?.message || data?.errorCode || 'Petpooja returned success=0',
      };
    }
    return { ok: true, status: res.status, data, error: null };
  } catch (err) {
    return {
      ok: false, status: 0, data: null,
      error: err?.name === 'AbortError' ? 'Petpooja API timeout' : (err?.message || 'Network error'),
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── 1. Fetch menu ────────────────────────────────────────────────────
// Pulls the restaurant's full menu (categories + items + variations
// + addons + tax rules). Auth via headers (kebab-case), body is just
// { restID }.
//
// Response shape (top-level arrays per V2.1.0):
//   { success, message, restaurants, ordertypes, categories,
//     parentcategories, group_categories, items, attributes, taxes,
//     discounts, addongroups, addongroupitems, variations }
export async function fetchMenu(petpoojaConfig) {
  if (shouldUseMocks(petpoojaConfig)) return petpoojaMock.fetchMenu();
  if (!petpoojaConfig?.restID) throw new Error('fetchMenu: missing restID');

  const r = await postJson(
    URLS.fetchMenu,
    { restID: petpoojaConfig.restID },
    { headers: headerAuth(petpoojaConfig) }
  );
  if (!r.ok) throw new Error(`fetchMenu failed: ${r.error}`);
  return r.data;
}

// ── 2. Save order ────────────────────────────────────────────────────
// Pushes a customer order to the restaurant's POS. Auth in body.
//
// `orderPayload` shape (our normalised input — buildSaveOrderBody
// translates to Petpooja's verbose nested-details schema):
//   {
//     orderId:          string  (our order id; sent as orderID for idempotency)
//     orderType:        'dinein' | 'takeaway' | 'delivery'
//     tableNumber:      string | null
//     numPersons:       number
//     customerName:     string
//     customerPhone:    string
//     customerEmail:    string | null
//     customerAddress:  string | null
//     items: [{
//       petpoojaItemId:      string,
//       petpoojaVariationId: string | null,
//       petpoojaVariationName: string | null,
//       petpoojaAddons: [{ id, name, group_name, group_id, price, quantity }],
//       name:    string,
//       price:   number,
//       qty:     number,
//       finalPrice: number,
//       itemTaxes: [{ id, name, percent, amount }],
//       note:    string,
//     }]
//     subtotal:         number
//     orderTaxes: [{ id, title, type: 'P'|'F', percent, amount }]
//     serviceCharge:    number
//     discount:         number
//     discountType:     'F' | 'P'
//     discountTitle:    string | null
//     total:            number
//     paymentMode:      'COD' | 'CARD' | 'CREDIT' | 'ONLINE' | 'OTHER'
//     callbackUrl:      string  (where Petpooja sends status updates)
//     specialInstructions: string
//   }
export async function saveOrder(petpoojaConfig, orderPayload) {
  if (shouldUseMocks(petpoojaConfig)) return petpoojaMock.saveOrder(orderPayload);
  if (!petpoojaConfig?.restID) throw new Error('saveOrder: missing restID');

  const body = buildSaveOrderBody(petpoojaConfig, orderPayload);
  const r = await postJson(URLS.saveOrder, body);
  if (!r.ok) {
    const err = new Error(`saveOrder failed: ${r.error}`);
    err.errorCode = r.data?.errorCode;
    err.validationErrors = r.data?.validation_errors;
    throw err;
  }
  return {
    petpoojaOrderId: r.data?.orderID || null,        // Petpooja's internal id
    clientOrderID:   r.data?.clientOrderID || null,  // echoes our orderID
    raw: r.data,
  };
}

function buildSaveOrderBody(petpoojaConfig, p) {
  const auth = bodyAuth(petpoojaConfig);
  const orderTypeMap = {
    'dinein':   'D',
    'dine-in':  'D',
    'takeaway': 'P',  // Parcel/Pickup per V2.1.0 spec
    'parcel':   'P',
    'pickup':   'P',
    'delivery': 'H',  // Home Delivery
  };
  // Per-item tax block — array of {id, name, tax_percentage, amount}.
  const buildItemTax = (it) => (it.itemTaxes || []).map(t => ({
    id:             String(t.id),
    name:           String(t.name),
    tax_percentage: String(t.percent || 0),
    amount:         String(t.amount || 0),
  }));
  const orderItemDetails = (p.items || []).map(it => ({
    id:           String(it.petpoojaItemId),
    name:         String(it.name || ''),
    tax_inclusive: !!it.taxInclusive,
    gst_liability: it.gstLiability || 'vendor',
    item_tax:      buildItemTax(it),
    item_discount: String(it.itemDiscount || 0),
    price:         String(it.price ?? 0),
    final_price:   String(it.finalPrice ?? (Number(it.price) || 0) * (Number(it.qty) || 1)),
    quantity:      String(it.qty ?? 1),
    description:   it.note || '',
    variation_name: it.petpoojaVariationName || '',
    variation_id:   it.petpoojaVariationId ? String(it.petpoojaVariationId) : '',
    AddonItem: {
      details: (it.petpoojaAddons || []).map(a => ({
        id:         String(a.id),
        name:       String(a.name || ''),
        group_name: String(a.group_name || ''),
        price:      String(a.price || 0),
        group_id:   typeof a.group_id === 'number' ? a.group_id : Number(a.group_id) || 0,
        quantity:   String(a.quantity || 1),
      })),
    },
  }));
  const orderTaxDetails = (p.orderTaxes || []).map(t => ({
    id:                    String(t.id),
    title:                 String(t.title),
    type:                  t.type || 'P',
    price:                 String(t.percent || t.price || 0),
    tax:                   String(t.amount || 0),
    restaurant_liable_amt: String(t.restaurantLiableAmt || 0),
  }));
  const discountDetails = p.discount > 0 ? [{
    id:    '0',
    title: p.discountTitle || 'Discount',
    type:  p.discountType || 'F',
    price: String(p.discount),
  }] : [];

  return {
    app_key:      auth.app_key,
    app_secret:   auth.app_secret,
    access_token: auth.access_token,
    orderinfo: {
      OrderInfo: {
        Restaurant: {
          details: {
            res_name:            p.restaurantName || '',
            address:             p.restaurantAddress || '',
            contact_information: p.restaurantPhone || '',
            restID:              petpoojaConfig.restID,
          },
        },
        Customer: {
          details: {
            email:     p.customerEmail || '',
            name:      p.customerName  || '',
            address:   p.customerAddress || '',
            phone:     p.customerPhone || '',
            latitude:  p.customerLat  || '',
            longitude: p.customerLng  || '',
          },
        },
        Order: {
          details: {
            orderID:          String(p.orderId),
            preorder_date:    p.preorderDate || '',
            preorder_time:    p.preorderTime || '',
            service_charge:   String(p.serviceCharge || 0),
            sc_tax_amount:    String(p.serviceChargeTax || 0),
            delivery_charges: String(p.deliveryCharges || 0),
            dc_tax_percentage: String(p.deliveryChargesTaxPct || 0),
            dc_tax_amount:    String(p.deliveryChargesTax || 0),
            packing_charges:  String(p.packingCharges || 0),
            pc_tax_amount:    String(p.packingChargesTax || 0),
            pc_tax_percentage: String(p.packingChargesTaxPct || 0),
            order_type:       orderTypeMap[p.orderType] || 'D',
            ondc_bap:         p.bap || 'AdvertRadical',
            advanced_order:   'N',
            urgent_order:     false,
            urgent_time:      20,
            payment_type:     p.paymentMode || 'COD',
            table_no:         String(p.tableNumber || ''),
            no_of_persons:    String(p.numPersons || 1),
            discount_total:   String(p.discount || 0),
            tax_total:        String(p.taxTotal || (Number(p.cgst || 0) + Number(p.sgst || 0))),
            discount_type:    p.discountType || 'F',
            total:            String(p.total || 0),
            description:      p.specialInstructions || '',
            created_on:       p.createdOn || new Date().toISOString().replace('T', ' ').slice(0, 19),
            enable_delivery:  p.orderType === 'delivery' ? 1 : 0,
            min_prep_time:    p.minPrepTime || 20,
            callback_url:     p.callbackUrl || '',
            collect_cash:     String(p.collectCash || (p.paymentMode === 'COD' ? p.total : 0)),
            otp:              p.otp || '',
          },
        },
        OrderItem:  { details: orderItemDetails },
        Tax:        { details: orderTaxDetails },
        Discount:   { details: discountDetails },
      },
      udid:        p.udid || '',
      device_type: 'Web',
    },
  };
}

// ── 3. Cancel order ──────────────────────────────────────────────────
// Update Order Status currently only supports cancel (status="-1").
// Other kitchen statuses come FROM Petpooja via the callback URL we
// pass on save_order.
export async function cancelOrder(petpoojaConfig, opts) {
  if (shouldUseMocks(petpoojaConfig)) {
    return { success: '1', message: 'Cancelled (MOCK)', status: '-1' };
  }
  const auth = bodyAuth(petpoojaConfig);
  const body = {
    app_key:      auth.app_key,
    app_secret:   auth.app_secret,
    access_token: auth.access_token,
    restID:       petpoojaConfig.restID,
    orderID:      opts.petpoojaOrderId || '',  // Petpooja-side id (optional, deprecated)
    clientorderID: opts.clientOrderId,         // Our id — preferred
    cancelReason:  opts.reason || 'Cancelled by customer',
    status:        '-1',
  };
  const r = await postJson(URLS.updateStatus, body);
  if (!r.ok) throw new Error(`cancelOrder failed: ${r.error}`);
  return r.data;
}

// ── 4. Update payment status (BEST-EFFORT — see header notes) ────────
// Petpooja V2.1.0 has no dedicated update-payment endpoint. We extend
// the update_order_status envelope with payment fields. May be silently
// ignored by Petpooja's server. Callers (lib/petpoojaSync.syncPayment)
// log success/failure but do not block the user-visible flow.
export async function updatePaymentStatus(petpoojaConfig, args) {
  if (shouldUseMocks(petpoojaConfig)) {
    return petpoojaMock.updatePaymentStatus(args.petpoojaOrderId);
  }
  const auth = bodyAuth(petpoojaConfig);
  const body = {
    app_key:      auth.app_key,
    app_secret:   auth.app_secret,
    access_token: auth.access_token,
    restID:       petpoojaConfig.restID,
    clientorderID: args.clientOrderId,
    orderID:       args.petpoojaOrderId || '',
    // Partner extension — see header note. Petpooja MAY ignore these.
    payment_type:   args.method || 'CASH',
    payment_status: 'paid',
    transaction_id: args.transactionId || '',
    payment_time:   args.timeISO || new Date().toISOString(),
  };
  const r = await postJson(URLS.updateStatus, body);
  if (!r.ok) throw new Error(`updatePaymentStatus failed: ${r.error}`);
  return r.data;
}

// ── 5. Validate credentials ──────────────────────────────────────────
// V2.1.0 doesn't expose a dedicated validate endpoint. We treat a
// successful Fetch Menu as proof-of-credentials. This is also useful
// because the wizard wants to show "We found your restaurant: X items
// across Y categories" — which we get from the menu response anyway.
export async function validateCredentials(petpoojaConfig) {
  if (shouldUseMocks(petpoojaConfig)) return petpoojaMock.validateCredentials(petpoojaConfig);
  try {
    const menu = await fetchMenu(petpoojaConfig);
    const restaurantName = menu?.restaurants?.[0]?.restaurantname
                        || menu?.restaurants?.[0]?.name
                        || null;
    const itemCount = (menu?.items || []).length;
    const categoryCount = (menu?.categories || []).length;
    return {
      ok: true,
      restaurant: {
        restID: petpoojaConfig.restID,
        name: restaurantName,
        itemCount,
        categoryCount,
      },
    };
  } catch (err) {
    return { ok: false, error: err.message || 'Credential validation failed' };
  }
}

// Re-export the mock helpers so callers can detect mock mode without
// pulling in two files.
export { shouldUseMocks } from './petpoojaMock';
