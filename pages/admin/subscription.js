// pages/admin/subscription.js
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getRestaurantById } from '../../lib/db';
import toast from 'react-hot-toast';

const PLANS = [
  { id: 'basic',   name: 'Basic',   price: 999,  items: 10,  storage: 500,  period: '6 months' },
  { id: 'pro',     name: 'Pro',     price: 2499, items: 40,  storage: 2048, period: '6 months', popular: true },
  { id: 'premium', name: 'Premium', price: 4999, items: 100, storage: 5120, period: '6 months' },
];

export default function AdminSubscription() {
  const { userData }              = useAuth();
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [paying, setPaying]       = useState(null);

  const rid = userData?.restaurantId;

  useEffect(() => {
    if (!rid) return;
    getRestaurantById(rid).then(r => { setRestaurant(r); setLoading(false); });
  }, [rid]);

  const handleUpgrade = async (plan) => {
    if (!window.Razorpay) {
      toast.error('Payment system not loaded. Please refresh.');
      return;
    }
    setPaying(plan.id);
    try {
      // Create order via API route
      const res  = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, restaurantId: rid }),
      });
      const data = await res.json();
      if (!data.orderId) throw new Error('Could not create order');

      const options = {
        key:        process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount:     plan.price * 100,
        currency:   'INR',
        name:       'Advert Radical',
        description: `${plan.name} Plan — 6 months`,
        order_id:   data.orderId,
        handler: async (response) => {
          // Verify + update subscription via webhook / API
          await fetch('/api/payments/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...response, planId: plan.id, restaurantId: rid }),
          });
          toast.success(`Successfully upgraded to ${plan.name} plan!`);
          const updated = await getRestaurantById(rid);
          setRestaurant(updated);
        },
        prefill:   { email: userData?.email || '' },
        theme:     { color: '#FF6B35' },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      toast.error('Payment failed. Try again.');
      console.error(err);
    } finally {
      setPaying(null);
    }
  };

  const currentPlan = PLANS.find(p => p.id === restaurant?.plan) || PLANS[0];
  const subEnd      = restaurant?.subscriptionEnd;
  const isExpired   = subEnd && new Date(subEnd) < new Date();

  return (
    <AdminLayout>
      <Head>
        <title>Subscription — Advert Radical</title>
        <script src="https://checkout.razorpay.com/v1/checkout.js" />
      </Head>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="font-display font-bold text-2xl">Subscription</h1>
          <p className="text-text-secondary text-sm mt-1">Manage your plan and billing</p>
        </div>

        {loading ? (
          <div className="h-32 skeleton rounded-2xl mb-8" />
        ) : (
          <>
            {/* Current plan card */}
            <div className="bg-bg-surface border border-brand/20 rounded-2xl p-6 mb-8">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Current Plan</div>
                  <div className="font-display font-bold text-2xl">{currentPlan.name}</div>
                  {subEnd && (
                    <div className={`text-sm mt-1 ${isExpired ? 'text-red-400' : 'text-text-secondary'}`}>
                      {isExpired ? '⚠️ Expired on ' : 'Active until '}{subEnd}
                    </div>
                  )}
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  restaurant?.paymentStatus === 'active'
                    ? 'bg-green-400/10 text-green-400 border border-green-400/20'
                    : 'bg-red-400/10 text-red-400 border border-red-400/20'
                }`}>
                  {restaurant?.paymentStatus === 'active' ? 'Active' : 'Inactive'}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-5">
                <UsageBar
                  label="AR Items"
                  used={restaurant?.itemsUsed || 0}
                  max={restaurant?.maxItems || currentPlan.items}
                />
                <UsageBar
                  label="Storage"
                  used={restaurant?.storageUsedMB || 0}
                  max={restaurant?.maxStorageMB || currentPlan.storage}
                  unit="MB"
                />
              </div>
            </div>

            {/* Plan cards */}
            <h2 className="font-display font-semibold text-lg mb-4">Upgrade Plan</h2>
            <div className="grid md:grid-cols-3 gap-5">
              {PLANS.map(plan => {
                const isCurrent = plan.id === restaurant?.plan;
                return (
                  <div
                    key={plan.id}
                    className={`relative rounded-2xl border p-6 transition-all ${
                      plan.popular
                        ? 'border-brand bg-brand/5'
                        : 'border-bg-border bg-bg-surface'
                    } ${isCurrent ? 'ring-1 ring-brand/30' : ''}`}
                  >
                    {plan.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-brand text-white text-xs font-semibold rounded-full">
                        Popular
                      </div>
                    )}
                    <div className="font-display font-bold text-lg mb-1">{plan.name}</div>
                    <div className="flex items-end gap-1 mb-4">
                      <span className="text-2xl font-display font-bold">₹{plan.price.toLocaleString()}</span>
                      <span className="text-text-muted text-xs mb-1">/ {plan.period}</span>
                    </div>
                    <ul className="space-y-1.5 mb-5 text-xs text-text-secondary">
                      <li>✓ {plan.items} AR items</li>
                      <li>✓ {plan.storage >= 1024 ? `${plan.storage/1024}GB` : `${plan.storage}MB`} storage</li>
                      <li>✓ Analytics dashboard</li>
                      <li>✓ QR code & subdomain</li>
                    </ul>
                    <button
                      onClick={() => !isCurrent && handleUpgrade(plan)}
                      disabled={isCurrent || paying === plan.id}
                      className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all disabled:cursor-not-allowed ${
                        isCurrent
                          ? 'bg-bg-raised border border-bg-border text-text-muted'
                          : plan.popular
                          ? 'text-white hover:opacity-90'
                          : 'bg-bg-raised border border-bg-border text-text-primary hover:border-brand/40'
                      }`}
                      style={!isCurrent && plan.popular ? { background: 'linear-gradient(135deg, #FF6B35, #FFB347)' } : {}}
                    >
                      {isCurrent ? 'Current Plan' : paying === plan.id ? 'Opening…' : 'Upgrade'}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

AdminSubscription.getLayout = (page) => page;

function UsageBar({ label, used, max, unit = '' }) {
  const pct = Math.min(100, Math.round((used / max) * 100));
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-text-secondary">{label}</span>
        <span className="text-text-muted">{used}{unit} / {max}{unit}</span>
      </div>
      <div className="w-full h-1.5 bg-bg-raised rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: pct > 80 ? '#EF4444' : 'linear-gradient(90deg, #FF6B35, #FFB347)',
          }}
        />
      </div>
    </div>
  );
}
