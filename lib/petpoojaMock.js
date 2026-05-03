// lib/petpoojaMock.js
// Phase B (Petpooja hybrid) — Mock responses for the Petpooja Online
// Ordering API. Used during development before we have real partner-
// tier API credentials. Mocks return deterministic, realistic-looking
// data so the rest of the integration can be built and tested
// end-to-end without hitting Petpooja's servers.
//
// Activation: lib/petpooja.js calls these when:
//   1. process.env.PETPOOJA_USE_MOCKS === 'true'  (dev/staging override), OR
//   2. petpoojaConfig.apiKey starts with 'mock_'  (per-restaurant override)
//
// When real API credentials arrive, this file stays — it's still
// useful for unit tests and for the "Test connection" button on the
// onboarding wizard before the user has typed real keys.
//
// IMPORTANT: This file ships in production server bundles. It must
// never expose secrets, never reach out over the network, and must
// be deterministic given the same input.

// Stable mock restaurant info — returned when validateCredentials runs
// against any mock_* api key. Lets the onboarding wizard show "We
// found your restaurant: Demo Cafe — 4 items, 4 categories" before
// the user pushes any real data.
//
// itemCount / categoryCount are the numbers the wizard shows in the
// "✓ Found ..." success card. Hard-coded to match MOCK_MENU below.
const MOCK_RESTAURANT_INFO = {
  name: 'Demo Cafe (Mock)',
  city: 'Bengaluru',
  outlet: 'Indiranagar',
  itemCount: 4,
  categoryCount: 4,
  taxRates: {
    cgst: 2.5,
    sgst: 2.5,
    serviceCharge: 0,
  },
};

// Mock menu — covers the shape petpoojaSync.applyMenu expects, which
// follows Petpooja's V2.1.0 Apiary spec exactly. Field names below
// are NOT my invention — they're literal copies from the spec
// (item_categoryid with underscore, addongroups + addongroupitems as
// separate top-level arrays, per-item `addon` + `variation` arrays
// referencing the top-level entries). Swapping to real Petpooja data
// is a no-op for the consumer.
const MOCK_MENU = {
  restaurantId: 'mock-rest-001',
  // Top-level taxes — items reference these by id via the
  // CSV `item_tax` field. CGST + SGST 2.5% each.
  taxes: [
    { taxid: 'mock-tax-cgst', taxname: 'CGST', tax: '2.5', taxtype: 'P' },
    { taxid: 'mock-tax-sgst', taxname: 'SGST', tax: '2.5', taxtype: 'P' },
  ],
  categories: [
    { categoryid: 'cat-1', categoryname: 'Starters', categoryrank: '1' },
    { categoryid: 'cat-2', categoryname: 'Mains',    categoryrank: '2' },
    { categoryid: 'cat-3', categoryname: 'Desserts', categoryrank: '3' },
    { categoryid: 'cat-4', categoryname: 'Beverages',categoryrank: '4' },
  ],
  items: [
    {
      itemid: 'mock-item-001',
      itemname: 'Paneer Tikka',
      item_categoryid: 'cat-1',     // V2.1.0 spec: with underscore
      itemdescription: 'Charcoal-grilled paneer marinated in yogurt and spices.',
      price: '280',
      item_tax: 'mock-tax-cgst,mock-tax-sgst',  // CSV of tax ids
      item_image_url: '',
      itemallowvariation: '0',
      itemallowaddon:     '0',
      in_stock: '1',
      active: '1',
      addon: [],
      variation: [],
    },
    {
      itemid: 'mock-item-002',
      itemname: 'Butter Chicken',
      item_categoryid: 'cat-2',
      itemdescription: 'Tandoori chicken in a rich tomato-butter gravy.',
      price: '420',
      item_tax: 'mock-tax-cgst,mock-tax-sgst',
      item_image_url: '',
      itemallowvariation: '1',
      itemallowaddon:     '1',
      in_stock: '1',
      active: '1',
      // V2.1.0 per-item addon[] points at top-level addongroups by id.
      addon: [{ addon_group_id: 'mock-addongroup-1', addon_item_selection_min: '0', addon_item_selection_max: '2' }],
      variation: [
        { variationid: 'var-1', name: 'Half', price: '0' },
        { variationid: 'var-2', name: 'Full', price: '180' },
      ],
    },
    {
      itemid: 'mock-item-003',
      itemname: 'Gulab Jamun',
      item_categoryid: 'cat-3',
      itemdescription: 'Two pieces of milk-solid dumplings in cardamom syrup.',
      price: '120',
      item_tax: 'mock-tax-cgst,mock-tax-sgst',
      item_image_url: '',
      itemallowvariation: '0',
      itemallowaddon:     '0',
      in_stock: '1',
      active: '1',
      addon: [],
      variation: [],
    },
    {
      itemid: 'mock-item-004',
      itemname: 'Masala Chai',
      item_categoryid: 'cat-4',
      itemdescription: 'House-spiced black tea with milk.',
      price: '60',
      item_tax: 'mock-tax-cgst,mock-tax-sgst',
      item_image_url: '',
      itemallowvariation: '0',
      itemallowaddon:     '0',
      in_stock: '1',
      active: '1',
      addon: [],
      variation: [],
    },
  ],
  // V2.1.0 has addongroups + addongroupitems as separate top-level
  // arrays. Per-item `addon` references group ids (see Butter Chicken).
  addongroups: [
    { addongroupid: 'mock-addongroup-1', addongroup_name: 'Extras' },
  ],
  addongroupitems: [
    { addongroupitemid: 'add-1', addongroupid: 'mock-addongroup-1', addonitem_name: 'Extra Butter', addonitem_price: '30' },
    { addongroupitemid: 'add-2', addongroupid: 'mock-addongroup-1', addonitem_name: 'Naan',         addonitem_price: '40' },
  ],
};

// Mock order acknowledgement — what Petpooja's Save Order endpoint
// returns after we push a customer order. The petpoojaOrderId is a
// monotonically-increasing fake; we use Date.now() so each call
// produces a unique value.
function mockSaveOrderResponse(payload) {
  const ms = Date.now();
  return {
    success: '1',
    message: 'Order placed successfully (MOCK)',
    restID:  payload?.restID || 'mock-rest-001',
    orderID: payload?.OrderID || `mock-our-${ms}`,
    // What Petpooja typically returns as their internal order id —
    // we store this on our order doc as petpoojaOrderId for cross-ref
    // when sending payment-status updates.
    clientOrderID: `pp-${ms}`,
  };
}

// Mock payment status update ack.
function mockUpdatePaymentResponse(petpoojaOrderId) {
  return {
    success: '1',
    message: `Payment status updated for order ${petpoojaOrderId} (MOCK)`,
  };
}

// Mock credential validation — used by the onboarding wizard's "Test
// connection" button. Returns ok for any mock_* api key.
function mockValidateCredentialsResponse(config) {
  if (!config?.apiKey || !config?.restID) {
    return { ok: false, error: 'Missing apiKey or restID' };
  }
  return {
    ok: true,
    restaurant: { ...MOCK_RESTAURANT_INFO, restID: config.restID },
  };
}

export const petpoojaMock = {
  fetchMenu: () => Promise.resolve({ ...MOCK_MENU }),
  saveOrder: (payload) => Promise.resolve(mockSaveOrderResponse(payload)),
  updatePaymentStatus: (petpoojaOrderId) =>
    Promise.resolve(mockUpdatePaymentResponse(petpoojaOrderId)),
  validateCredentials: (config) =>
    Promise.resolve(mockValidateCredentialsResponse(config)),
};

// Helper: should we use mocks for this restaurant config?
// Yes if global env flag is set OR if the apiKey is a mock_ prefix.
// The latter lets us mix mock and real restaurants in the same
// deployment during the pilot rollout (some restaurants on real
// API, some still on mocks for testing).
export function shouldUseMocks(petpoojaConfig) {
  if (process.env.PETPOOJA_USE_MOCKS === 'true') return true;
  if (typeof petpoojaConfig?.apiKey === 'string' && petpoojaConfig.apiKey.startsWith('mock_')) return true;
  return false;
}
