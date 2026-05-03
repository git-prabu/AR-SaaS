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
// found your restaurant: Demo Cafe" before the user pushes any real
// data.
const MOCK_RESTAURANT_INFO = {
  name: 'Demo Cafe (Mock)',
  city: 'Bengaluru',
  outlet: 'Indiranagar',
  taxRates: {
    cgst: 2.5,
    sgst: 2.5,
    serviceCharge: 0,
  },
};

// Mock menu — small, realistic-looking, covers the shape we'll need
// to render the customer page (categories, items, variations, addons,
// images). Numbers map cleanly to Petpooja's documented field names
// (itemid, item_name, price, etc.) so swapping in real data is a
// no-op for the consumer.
const MOCK_MENU = {
  restaurantId: 'mock-rest-001',
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
      itemcategoryid: 'cat-1',
      itemdescription: 'Charcoal-grilled paneer marinated in yogurt and spices.',
      price: '280',
      item_tax: '5',           // GST percent for this item
      item_image_url: '',      // Petpooja often returns this empty — our admin uploads
      itemallowvariation: '0', // 0 = no variation, 1 = has variations
      itemallowaddon:     '0',
      in_stock: '1',
      active: '1',
    },
    {
      itemid: 'mock-item-002',
      itemname: 'Butter Chicken',
      itemcategoryid: 'cat-2',
      itemdescription: 'Tandoori chicken in a rich tomato-butter gravy.',
      price: '420',
      item_tax: '5',
      item_image_url: '',
      itemallowvariation: '1',
      itemallowaddon:     '1',
      in_stock: '1',
      active: '1',
    },
    {
      itemid: 'mock-item-003',
      itemname: 'Gulab Jamun',
      itemcategoryid: 'cat-3',
      itemdescription: 'Two pieces of milk-solid dumplings in cardamom syrup.',
      price: '120',
      item_tax: '5',
      item_image_url: '',
      itemallowvariation: '0',
      itemallowaddon:     '0',
      in_stock: '1',
      active: '1',
    },
    {
      itemid: 'mock-item-004',
      itemname: 'Masala Chai',
      itemcategoryid: 'cat-4',
      itemdescription: 'House-spiced black tea with milk.',
      price: '60',
      item_tax: '5',
      item_image_url: '',
      itemallowvariation: '0',
      itemallowaddon:     '0',
      in_stock: '1',
      active: '1',
    },
  ],
  variations: [
    // Item-002 has Half / Full variations
    { variationid: 'var-1', itemid: 'mock-item-002', name: 'Half', price: '0' },
    { variationid: 'var-2', itemid: 'mock-item-002', name: 'Full', price: '180' },
  ],
  addons: [
    // Item-002 has add-ons
    { addonid: 'add-1', itemid: 'mock-item-002', addongroup: 'Extras', name: 'Extra Butter',  price: '30' },
    { addonid: 'add-2', itemid: 'mock-item-002', addongroup: 'Extras', name: 'Naan',          price: '40' },
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
