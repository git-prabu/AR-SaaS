// pages/pay/razorpay.js
//
// Thin checkout-host page that loads Razorpay's JS SDK and triggers the
// hosted-modal checkout. Customer lands here from /api/payment/intent
// (see lib/gatewayProviders/razorpay.js → paymentUrl). The page reads
// the Razorpay order id, key, and amount from the URL query so we don't
// need a server round trip — the intent endpoint already created the
// order on Razorpay's side and stamped our orders with the txn id.
//
// This page exists because Razorpay's checkout is modal-based (you call
// `Razorpay.open()` from JS), not URL-based. Wrapping it in a host page
// lets the rest of our system stay URL-redirect-friendly.

import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

const RAZORPAY_SDK = 'https://checkout.razorpay.com/v1/checkout.js';

function loadScript(src) {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if (document.querySelector(`script[src="${src}"]`)) return resolve(true);
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload  = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

export default function RazorpayCheckoutPage() {
  const router = useRouter();
  const [status, setStatus] = useState('loading'); // loading | opening | done | error
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    if (!router.isReady) return;
    const { rzpOrderId, keyId, amount, name, description, returnUrl } = router.query;

    if (!rzpOrderId || !keyId || !amount) {
      setStatus('error');
      setErrMsg('Missing payment parameters. Please try again from the bill page.');
      return;
    }

    let cancelled = false;
    (async () => {
      const ok = await loadScript(RAZORPAY_SDK);
      if (cancelled) return;
      if (!ok) {
        setStatus('error');
        setErrMsg('Could not load Razorpay. Check your internet and try again.');
        return;
      }
      setStatus('opening');

      const options = {
        key:        String(keyId),
        order_id:   String(rzpOrderId),
        amount:     Number(amount),
        currency:   'INR',
        name:       String(name || 'Restaurant'),
        description:String(description || 'Order payment'),
        // Default to UPI when the customer landed here from a UPI tap.
        prefill:    { method: 'upi' },
        // Auto-capture so payment.captured fires on success.
        config: {
          display: {
            // Surface UPI block first; cards/netbanking are still
            // available below it.
            blocks: {
              upi: {
                name: 'Pay via UPI',
                instruments: [{ method: 'upi' }],
              },
            },
            sequence: ['block.upi'],
            preferences: { show_default_blocks: true },
          },
        },
        handler: function () {
          // Payment success — webhook handles the actual order update,
          // we just bounce back to the menu page.
          setStatus('done');
          if (returnUrl) {
            window.location.href = String(returnUrl);
          }
        },
        modal: {
          ondismiss: function () {
            // User closed the modal without paying — go back.
            if (returnUrl) window.location.href = String(returnUrl);
            else if (typeof history !== 'undefined') history.back();
          },
        },
        theme: { color: '#B8472D' },
      };

      try {
        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function () {
          setStatus('error');
          setErrMsg('Payment failed. Please try again or pick another method.');
        });
        rzp.open();
      } catch (e) {
        console.error('[razorpay-host] open failed:', e);
        setStatus('error');
        setErrMsg('Could not open Razorpay. Please try again.');
      }
    })();

    return () => { cancelled = true; };
  }, [router.isReady, router.query]);

  return (
    <>
      <Head>
        <title>Razorpay Checkout — HaloHelm</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <div style={{
        minHeight: '100vh', background: '#F8F8F8',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 20, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: '#1E1B18',
      }}>
        {status === 'loading' && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Preparing payment…</div>
            <div style={{ fontSize: 14, color: 'rgba(30,27,24,0.55)' }}>This will only take a moment.</div>
          </>
        )}
        {status === 'opening' && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Opening Razorpay…</div>
            <div style={{ fontSize: 14, color: 'rgba(30,27,24,0.55)' }}>If the popup doesn't show, allow popups for this page.</div>
          </>
        )}
        {status === 'done' && (
          <>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>✓ Payment confirmed</div>
            <div style={{ fontSize: 14, color: 'rgba(30,27,24,0.55)' }}>Returning to your order…</div>
          </>
        )}
        {status === 'error' && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#B8472D' }}>Couldn't complete payment</div>
            <div style={{ fontSize: 14, color: 'rgba(30,27,24,0.55)', textAlign: 'center', maxWidth: 320, marginBottom: 18 }}>{errMsg}</div>
            <button
              onClick={() => history.back()}
              style={{
                padding: '12px 22px', borderRadius: 10, border: 'none',
                background: '#1E1B18', color: '#FFF',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}>
              Go back
            </button>
          </>
        )}
      </div>
    </>
  );
}

// This is a customer-facing utility page — bypass the AdminLayout default.
RazorpayCheckoutPage.getLayout = (page) => page;
