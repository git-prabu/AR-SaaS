// Phase H — Per-restaurant payment gateway abstraction
// =====================================================
//
// Each restaurant brings their own gateway account (BYO model — they
// pay the gateway directly, we never see the money). The active
// provider + credentials live on `restaurants/{rid}.gatewayConfig`,
// which the restaurant admin sets via /admin/gateway.
//
// Currently implemented: Paytm Business (the most common option for
// Indian restaurants in 2025-26). The architecture allows dropping in
// Razorpay / PhonePe / Cashfree later without touching the customer
// flow — see lib/gatewayProviders/.
//
// Two operations exposed to the rest of the app:
//
//   createPaymentIntent(restaurantId, order)
//     Server-side. Builds the gateway request, returns the redirect
//     URL / UPI deep link the customer needs to open. Also stamps
//     `gatewayProviderTxnId` on the order doc so the webhook can
//     match the callback back to the order.
//
//   verifyWebhookAndExtractEvent(restaurantId, headers, body)
//     Server-side. Verifies the webhook signature using the merchant
//     key, parses the body, returns
//       { orderId, paymentStatus, providerRef }
//     when the event is a confirmed-paid (or rejected) event, or
//     `null` when the event is something we don't act on.
//
// The "paymentStatus" returned matches our existing schema:
//   paid_online → success
//   payment_issue → failed / canceled
//
// Both helpers run on Node (API routes) using the Admin SDK so they
// bypass Firestore rules. Never call them from client code.

import { adminDb } from './firebaseAdmin';
import * as paytm from './gatewayProviders/paytm';

const PROVIDERS = { paytm };

// Read this restaurant's gateway config. The credentials (merchant key
// etc.) live in a PRIVATE subcollection that's locked behind Firestore
// rules to admin/super only — the customer-facing public restaurant
// doc only carries a boolean stub (`gatewayActive`/`gatewayProvider`)
// the customer UI uses to show/hide the gateway button.
//
// This separation is critical: the public doc is server-rendered into
// the customer page HTML (via getStaticProps) AND read by the live
// snapshot listener on the customer client. Storing the merchantKey
// there would leak it to anyone who scrapes a page or opens DevTools.
export async function getGatewayConfig(restaurantId) {
  const privSnap = await adminDb.doc(`restaurants/${restaurantId}/private/gateway`).get();
  if (!privSnap.exists) return null;
  const data = privSnap.data();
  if (!data) return null;
  return data;
}

// Save (or clear) a restaurant's gateway config.
// Called from the /admin/gateway settings page via /api/payment/config.
//
// Writes to TWO places:
//   1. `restaurants/{rid}/private/gateway` — full config (with merchantKey)
//   2. `restaurants/{rid}.gatewayActive` + `.gatewayProvider` — public stubs
//      the customer UI reads via the live snapshot listener
export async function setGatewayConfig(restaurantId, config) {
  if (!config) {
    // Clear everything.
    await adminDb.doc(`restaurants/${restaurantId}/private/gateway`).delete().catch(() => {});
    await adminDb.doc(`restaurants/${restaurantId}`).set(
      { gatewayActive: false, gatewayProvider: null },
      { merge: true }
    );
    return;
  }
  await adminDb.doc(`restaurants/${restaurantId}/private/gateway`).set(config, { merge: false });
  await adminDb.doc(`restaurants/${restaurantId}`).set(
    {
      gatewayActive: !!config.isActive,
      gatewayProvider: config.provider || null,
    },
    { merge: true }
  );
}

// True when the restaurant has a usable gateway configured.
export function isGatewayActive(config) {
  if (!config) return false;
  if (config.isActive === false) return false;
  if (!config.provider) return false;
  if (!PROVIDERS[config.provider]) return false;
  return true;
}

// Create a payment intent for an order. The customer-facing handler
// gets back enough info to render the payment screen (URL or UPI
// intent). Stamps `gatewayProviderTxnId` + `gatewayProvider` on the
// order so the webhook can match the callback later.
//
// `order` is the in-memory order doc (already loaded by the caller).
export async function createPaymentIntent(restaurantId, order) {
  const config = await getGatewayConfig(restaurantId);
  if (!isGatewayActive(config)) {
    const err = new Error('GATEWAY_NOT_CONFIGURED');
    err.code = 'GATEWAY_NOT_CONFIGURED';
    throw err;
  }
  const provider = PROVIDERS[config.provider];

  const intent = await provider.createIntent({
    config,
    order,
    // The webhook URL the gateway should call. Each restaurant gets
    // its own subpath so the webhook handler can scope rule checks
    // + signature verification per-tenant without cross-talk.
    webhookUrl: `${getPublicOrigin()}/api/payment/webhook?rid=${encodeURIComponent(restaurantId)}`,
    // Where the customer should land after the gateway page closes.
    returnUrl: `${getPublicOrigin()}/restaurant/${encodeURIComponent(order.subdomain || '')}?paymentReturn=${encodeURIComponent(order.id || '')}`,
  });

  // Stamp the provider txn id so the webhook can match back. Best-
  // effort — if it fails the customer still gets the intent, the
  // webhook just won't auto-confirm and admin will fall back to
  // manual mark-paid.
  if (intent && intent.providerTransactionId) {
    try {
      await adminDb.doc(`restaurants/${restaurantId}/orders/${order.id}`).update({
        gatewayProvider: config.provider,
        gatewayProviderTxnId: intent.providerTransactionId,
        gatewayCreatedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('[gateway] failed to stamp providerTxnId on order:', e?.message);
    }
  }

  return intent;
}

// Verify + parse a webhook payload. Returns null when the event is
// not actionable (or the signature didn't verify). Callers must NOT
// trust an unverified result — that would let an attacker forge
// "paid" events.
export async function verifyWebhookAndExtractEvent(restaurantId, headers, rawBody) {
  const config = await getGatewayConfig(restaurantId);
  if (!isGatewayActive(config)) return null;
  const provider = PROVIDERS[config.provider];
  try {
    return await provider.verifyWebhook({ config, headers, rawBody });
  } catch (err) {
    console.error('[gateway] webhook verify failed:', err?.message);
    return null;
  }
}

// Resolve our public-facing origin for callbacks. In production we
// rely on NEXT_PUBLIC_SITE_URL; locally we fall back to the request
// host (set in API routes via the proxy header).
function getPublicOrigin() {
  return process.env.NEXT_PUBLIC_SITE_URL
    || process.env.SITE_URL
    || 'https://advertradical.vercel.app';
}
