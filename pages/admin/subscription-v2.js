// pages/admin/subscription-v2.js
//
// ★ REDESIGN EXEMPLAR ★ — duplicate of /admin/subscription on the dark
// "ok-root" theme (via <OkShell>). Logic (live restaurant subscribe, plan/
// status derivation, Razorpay upgrade flow, billing-period selector) copied
// verbatim from subscription.js — only the render is new. Original untouched.
import Head from 'next/head';
import Script from 'next/script';
import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import OkShell from '../../components/admin/OkShell';
import { getRestaurantById } from '../../lib/db';
import { db } from '../../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { PLANS, normalizePlanId, BILLING_PERIOD_DAYS, BILLING_PERIODS, getEffectivePrice, getEffectivePriceInPaise, getPeriod, planCap, formatCap } from '../../lib/plans';
import toast from 'react-hot-toast';

function formatDate(input) {
  if (!input) return '';
  let d;
  if (typeof input === 'string') d = new Date(input);
  else if (input.seconds) d = new Date(input.seconds * 1000);
  else if (input.toDate) d = input.toDate();
  else d = new Date(input);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function UsageBar({ label, used, max, unit = '' }) {
  const isUnlimited = formatCap(max) === 'Unlimited';
  const pct = (max > 0 && !isUnlimited) ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const color = pct > 80 ? 'var(--danger)' : pct > 60 ? 'var(--gold)' : 'var(--success)';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)', fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-2)', fontWeight: 700 }}>{used}{unit} / {isUnlimited ? 'Unlimited' : `${max}${unit}`}</span>
      </div>
      <div style={{ height: 6, background: 'var(--card-3)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 3, background: color, width: `${pct}%`, transition: 'width 0.4s' }} />
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-3)', marginTop: 4 }}>{pct}% used</div>
    </div>
  );
}

export default function SubscriptionV2() {
  const { userData } = useAuth();
  const rid = userData?.restaurantId;
  const restaurantName = userData?.restaurantName || 'Your Restaurant';

  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(null);
  const [period, setPeriod] = useState('monthly');

  useEffect(() => {
    if (!rid) return;
    let firstSnap = true;
    const unsub = onSnapshot(doc(db, 'restaurants', rid), (snap) => {
      if (!snap.exists()) { setLoading(false); return; }
      const r = { id: snap.id, ...snap.data() };
      setRestaurant(r);
      if (firstSnap) { firstSnap = false; if (r?.subscriptionPeriod) setPeriod(r.subscriptionPeriod); }
      setLoading(false);
    }, (err) => { console.error('subscription load error:', err); setLoading(false); });
    return unsub;
  }, [rid]);

  const computed = useMemo(() => {
    if (!restaurant) return null;
    const isTrial = restaurant.paymentStatus === 'trial';
    const trialEnd = restaurant.trialEndsAt ? new Date(restaurant.trialEndsAt) : null;
    const trialDaysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd - Date.now()) / (1000 * 60 * 60 * 24))) : 0;
    const trialExpired = trialEnd ? trialEnd < new Date() : false;
    const subEnd = restaurant.subscriptionEnd ? new Date(restaurant.subscriptionEnd) : null;
    const subStart = restaurant.subscriptionStart ? new Date(restaurant.subscriptionStart) : null;
    const isExpired = subEnd && subEnd < new Date();
    const isActive = restaurant.paymentStatus === 'active';
    const daysRemaining = subEnd ? Math.max(0, Math.ceil((subEnd - Date.now()) / (1000 * 60 * 60 * 24))) : null;
    const totalDays = (subStart && subEnd) ? Math.max(1, Math.ceil((subEnd - subStart) / (1000 * 60 * 60 * 24))) : BILLING_PERIOD_DAYS;
    const usedDays = totalDays - (daysRemaining || 0);
    const timePct = Math.min(100, Math.max(0, Math.round((usedDays / totalDays) * 100)));
    const currentPlan = PLANS.find(p => p.id === normalizePlanId(restaurant.plan)) || PLANS[0];

    let statusLabel, statusColor, statusBg, statusBorder;
    if (isTrial && !trialExpired) { statusLabel = 'Trial'; statusColor = 'var(--gold)'; statusBg = 'rgba(196,168,109,0.12)'; statusBorder = 'rgba(196,168,109,0.30)'; }
    else if (isActive && !isExpired) { statusLabel = 'Active'; statusColor = 'var(--success)'; statusBg = 'rgba(63,170,99,0.12)'; statusBorder = 'rgba(63,170,99,0.30)'; }
    else if (isExpired || trialExpired) { statusLabel = 'Expired'; statusColor = 'var(--danger)'; statusBg = 'rgba(217,83,79,0.12)'; statusBorder = 'rgba(217,83,79,0.30)'; }
    else { statusLabel = 'Inactive'; statusColor = 'var(--tx-3)'; statusBg = 'var(--card-3)'; statusBorder = 'var(--line)'; }

    const effectiveDaysLeft = isTrial ? trialDaysLeft : daysRemaining;
    const timeColor = effectiveDaysLeft === null ? 'var(--success)' : effectiveDaysLeft <= 14 ? 'var(--danger)' : effectiveDaysLeft <= 30 ? 'var(--gold)' : 'var(--success)';

    return { currentPlan, isTrial, trialEnd, trialDaysLeft, trialExpired, subEnd, subStart, isExpired, isActive, daysRemaining, totalDays, usedDays, timePct, timeColor, statusLabel, statusColor, statusBg, statusBorder, effectiveDaysLeft };
  }, [restaurant]);

  const handleUpgrade = async (plan) => {
    if (!window.Razorpay) { toast.error('Payment system not loaded. Please refresh.'); return; }
    setPaying(plan.id);
    const normalizedCurrent = normalizePlanId(restaurant?.plan);
    const samePlan = plan.id === normalizedCurrent;
    const planIdx = PLANS.findIndex(p => p.id === plan.id);
    const currentIdx = PLANS.findIndex(p => p.id === normalizedCurrent);
    const isDowngrade = !samePlan && !(computed?.isTrial) && planIdx >= 0 && currentIdx >= 0 && planIdx < currentIdx;
    try {
      const idempotencyKey = `${plan.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const res = await fetch('/api/payments/create-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId: plan.id, restaurantId: rid, idempotencyKey, period }) });
      const data = await res.json();
      if (!data.orderId) { console.error('[upgrade] create-order failed', { status: res.status, data }); throw new Error(data?.detail || data?.error || 'Could not create order'); }
      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: getEffectivePriceInPaise(plan.id, period, restaurant),
        currency: 'INR', name: 'HaloHelm',
        description: `${plan.name} Plan — ${getPeriod(period).label}`,
        order_id: data.orderId,
        handler: async (response) => {
          const verifyRes = await fetch('/api/payments/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...response, planId: plan.id, restaurantId: rid }) });
          const verifyData = await verifyRes.json().catch(() => ({}));
          const action = samePlan ? 'Switched to' : isDowngrade ? 'Downgraded to' : 'Upgraded to';
          const carry = Number(verifyData?.carriedOverDays) || 0;
          const carryNote = carry > 0 ? ` — ${carry} day${carry === 1 ? '' : 's'} carried over from your previous cycle.` : '';
          toast.success(`${action} ${plan.name} plan!${carryNote}`);
          setRestaurant(await getRestaurantById(rid));
        },
        prefill: { email: userData?.email || '' },
        theme: { color: '#C4A86D' },
      };
      new window.Razorpay(options).open();
    } catch (err) { console.error('[upgrade] error', err); toast.error(err?.message ? `Payment failed: ${err.message}` : 'Payment failed. Try again.'); }
    finally { setPaying(null); }
  };

  return (
    <>
      <Head><title>Subscription — HaloHelm</title></Head>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes ok-pulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
      <OkShell active={null} eyebrow="Account · plan & billing" title="Subscription" brand={restaurantName}>
        {/* Signature stat card */}
        {computed && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '20px 24px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: (computed.statusLabel === 'Active' || computed.statusLabel === 'Trial') ? 'var(--gold)' : 'var(--danger)', animation: 'ok-pulse 2s ease infinite' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: 'var(--gold)' }}>Subscription</span>
              <div style={{ flex: 1, height: 1, background: 'var(--line-soft)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)' }}>{computed.isTrial ? 'Free trial' : computed.isActive ? 'Live' : 'Inactive'}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              {[
                { label: 'Current plan', value: computed.currentPlan.name, color: 'var(--tx)' },
                { label: 'Status', value: computed.statusLabel, color: computed.statusColor },
                { label: computed.isTrial ? 'Trial ends in' : 'Days left', value: computed.effectiveDaysLeft !== null ? computed.effectiveDaysLeft : '—', color: computed.timeColor, suffix: computed.effectiveDaysLeft !== null ? 'd' : '' },
                { label: 'Menu items', value: `${restaurant?.itemsUsed || 0}/${formatCap(planCap(restaurant, 'maxItems'))}`, color: 'var(--tx)' },
              ].map(s => (
                <div key={s.label} style={{ padding: '16px 18px', borderRadius: 12, background: 'var(--card-2)', border: '1px solid var(--line)' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--tx-3)', marginBottom: 8 }}>{s.label}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26, lineHeight: 1, letterSpacing: '-0.02em', color: s.color, display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span>{s.value}</span>{s.suffix && <span style={{ fontSize: 14, color: 'var(--tx-3)', fontWeight: 600 }}>{s.suffix}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--line)', padding: 48, textAlign: 'center' }}>
            <div style={{ width: 30, height: 30, border: '3px solid var(--gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-3)' }}>Loading subscription…</div>
          </div>
        ) : !restaurant ? (
          <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--line)', padding: 48, textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--tx-3)' }}>Could not load restaurant data.</div>
        ) : (
          <>
            {/* Current plan detail */}
            <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--line)', borderLeft: `3px solid ${computed.timeColor}`, padding: '22px 26px', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: 'var(--gold)' }}>Current plan</span>
                <div style={{ flex: 1, height: 1, background: 'var(--line-soft)' }} />
                <span style={{ padding: '2px 10px', borderRadius: 6, background: computed.statusBg, color: computed.statusColor, border: `1px solid ${computed.statusBorder}`, fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: computed.statusColor }} />{computed.statusLabel}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26, color: 'var(--tx)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                    {computed.currentPlan.name}{computed.isTrial && <span style={{ marginLeft: 10, fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--gold)', letterSpacing: '.06em', textTransform: 'uppercase' }}>· Free Trial</span>}
                  </div>
                  {computed.isTrial && computed.trialEnd && <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, marginTop: 4, color: computed.trialExpired ? 'var(--danger)' : 'var(--tx-3)', fontWeight: 500 }}>{computed.trialExpired ? 'Trial expired on ' : 'Trial ends on '}<strong style={{ color: 'var(--tx)' }}>{formatDate(computed.trialEnd)}</strong></div>}
                  {!computed.isTrial && computed.subEnd && <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, marginTop: 4, color: computed.isExpired ? 'var(--danger)' : 'var(--tx-3)', fontWeight: 500 }}>{computed.isExpired ? 'Expired on ' : 'Renews on '}<strong style={{ color: 'var(--tx)' }}>{formatDate(computed.subEnd)}</strong></div>}
                </div>
                {computed.effectiveDaysLeft !== null && (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 32, color: computed.timeColor, lineHeight: 1 }}>{computed.effectiveDaysLeft}</span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)', fontWeight: 600 }}>days left</span>
                  </div>
                )}
              </div>
              {!computed.isTrial && computed.subEnd && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-3)', fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase' }}>Plan duration</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-2)', fontWeight: 700 }}>{computed.isExpired ? 'Expired' : `${computed.daysRemaining} of ${computed.totalDays} days remaining`}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--card-3)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 3, background: computed.isExpired ? 'var(--danger)' : computed.timeColor, width: `${computed.timePct}%`, transition: 'width 0.4s' }} />
                  </div>
                </div>
              )}
              {!computed.isTrial && !computed.isExpired && computed.daysRemaining !== null && computed.daysRemaining <= 30 && (
                <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 18, background: computed.daysRemaining <= 14 ? 'rgba(217,83,79,0.08)' : 'rgba(196,168,109,0.10)', border: `1px solid ${computed.daysRemaining <= 14 ? 'rgba(217,83,79,0.30)' : 'rgba(196,168,109,0.30)'}`, fontFamily: 'var(--font-body)', fontSize: 12, color: computed.daysRemaining <= 14 ? 'var(--danger)' : 'var(--gold)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{computed.daysRemaining <= 14 ? '⚠' : 'ℹ'}</span><span>Your plan expires in <strong>{computed.daysRemaining} days</strong>. Upgrade below to continue uninterrupted access.</span>
                </div>
              )}
              {computed.isTrial && !computed.trialExpired && computed.trialDaysLeft <= 7 && (
                <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 18, background: 'rgba(196,168,109,0.10)', border: '1px solid rgba(196,168,109,0.30)', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--gold)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>ℹ</span><span>Your free trial ends in <strong>{computed.trialDaysLeft} day{computed.trialDaysLeft === 1 ? '' : 's'}</strong>. Pick a plan below to keep your menu live.</span>
                </div>
              )}
              {computed.isTrial && computed.trialExpired && (
                <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 18, background: 'rgba(217,83,79,0.08)', border: '1px solid rgba(217,83,79,0.30)', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--danger)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>⚠</span><span>Your free trial has expired. Pick a plan to reactivate your menu.</span>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 18 }}>
                <UsageBar label="Menu Items" used={restaurant.itemsUsed || 0} max={planCap(restaurant, 'maxItems')} />
                <UsageBar label="Storage" used={restaurant.storageUsedMB || 0} max={planCap(restaurant, 'maxStorageMB')} unit="MB" />
              </div>
            </div>

            {/* Upgrade plans */}
            <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--line)', padding: '22px 26px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: 'var(--gold)' }}>{computed.isTrial ? 'Choose a plan' : 'Available plans'}</span>
                <div style={{ flex: 1, height: 1, background: 'var(--line-soft)' }} />
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)', marginBottom: 14, lineHeight: 1.5 }}>Pay securely via Razorpay (UPI, cards, netbanking). Your menu stays live the whole time.</div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
                {BILLING_PERIODS.map(p => (
                  <button key={p.id} onClick={() => setPeriod(p.id)} style={{ padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, border: period === p.id ? '1.5px solid var(--gold)' : '1px solid var(--line)', background: period === p.id ? 'rgba(196,168,109,0.10)' : 'var(--card-2)', color: 'var(--tx)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {p.label}{p.savingsLabel && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(63,170,99,0.12)', color: 'var(--success)' }}>{p.savingsLabel}</span>}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                {PLANS.map(plan => {
                  const normalizedCurrent = normalizePlanId(restaurant.plan);
                  const samePlan = plan.id === normalizedCurrent;
                  const currentPeriod = restaurant.subscriptionPeriod || 'monthly';
                  const isCurrent = !computed.isTrial && samePlan && period === currentPeriod;
                  const planIdx = PLANS.findIndex(p => p.id === plan.id);
                  const currentIdx = PLANS.findIndex(p => p.id === normalizedCurrent);
                  const isDowngrade = !samePlan && !computed.isTrial && planIdx >= 0 && currentIdx >= 0 && planIdx < currentIdx;
                  const isPopular = !!plan.popular;
                  const priceInr = getEffectivePrice(plan.id, period, restaurant);
                  const monthly = getEffectivePrice(plan.id, 'monthly', restaurant);
                  const days = getPeriod(period).days;
                  const monthsCovered = days / 30;
                  const perMonth = Math.round(priceInr / monthsCovered);
                  const isFounding = !!restaurant?.foundingPricing?.[plan.id]?.[period];
                  return (
                    <div key={plan.id} style={{ position: 'relative', background: isCurrent ? 'rgba(63,170,99,0.05)' : 'var(--card-2)', borderRadius: 14, border: isPopular ? '2px solid var(--gold)' : isCurrent ? '1px solid rgba(63,170,99,0.30)' : '1px solid var(--line)', padding: '24px 22px 22px' }}>
                      {isPopular && <div style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', padding: '3px 14px', background: 'linear-gradient(135deg, var(--gold), var(--gold-dim))', color: '#1A1815', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, borderRadius: 5, letterSpacing: '.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>★ Most Popular</div>}
                      {isCurrent && <div style={{ position: 'absolute', top: 12, right: 12, padding: '2px 8px', borderRadius: 4, background: 'rgba(63,170,99,0.14)', color: 'var(--success)', border: '1px solid rgba(63,170,99,0.30)', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>Current</div>}
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--tx)', marginBottom: 8 }}>{plan.name}</div>
                      <div style={{ marginBottom: 18 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 30, color: 'var(--tx)', letterSpacing: '-0.02em' }}>₹{priceInr.toLocaleString('en-IN')}</span>
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)', fontWeight: 500 }}>/ {getPeriod(period).label}</span>
                        </div>
                        {period !== 'monthly' && <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', marginTop: 4 }}>≈ ₹{perMonth.toLocaleString('en-IN')}/mo · save ₹{((monthly * monthsCovered) - priceInr).toLocaleString('en-IN')}</div>}
                        {isFounding && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--success)', marginTop: 5, letterSpacing: '.05em', textTransform: 'uppercase' }}>★ Founding partner price</div>}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
                        {[`${formatCap(plan.maxItems)} AR menu items`, `${plan.maxStorageMB >= 1024 ? (plan.maxStorageMB / 1024) + ' GB' : plan.maxStorageMB + ' MB'} storage for 3D models`, 'Real-time analytics', 'QR code generator + custom subdomain', 'Kitchen display + waiter calls', 'Customer feedback dashboard'].map(f => (
                          <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)', lineHeight: 1.5 }}>
                            <span style={{ width: 14, height: 14, flexShrink: 0, borderRadius: 4, background: 'rgba(63,170,99,0.14)', color: 'var(--success)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, marginTop: 1 }}>✓</span><span>{f}</span>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => !isCurrent && handleUpgrade(plan)} disabled={isCurrent || paying === plan.id}
                        style={{ width: '100%', padding: 11, borderRadius: 9, border: 'none', background: isCurrent ? 'var(--card-3)' : isPopular ? 'linear-gradient(135deg, var(--gold), var(--gold-dim))' : 'var(--accent)', color: isCurrent ? 'var(--tx-3)' : (isPopular ? '#1A1815' : 'var(--accent-ink)'), fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, cursor: isCurrent ? 'default' : (paying === plan.id ? 'not-allowed' : 'pointer'), opacity: paying === plan.id ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        {isCurrent ? 'Current Plan' : paying === plan.id ? (<><span style={{ width: 11, height: 11, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />Opening…</>) : computed.isTrial ? 'Choose this plan' : samePlan ? `Switch to ${getPeriod(period).label.split(' · ')[0]}` : isDowngrade ? 'Downgrade to ' + plan.name : 'Upgrade to ' + plan.name}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--card-2)', borderRadius: 10, border: '1px solid var(--line)', fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', lineHeight: 1.6, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 14, lineHeight: 1 }}>ℹ</span><span>Need a custom plan or annual billing? Email <strong style={{ color: 'var(--tx)' }}>support@HaloHelm.com</strong>. Plans renew automatically; you can change anytime.</span>
              </div>
            </div>
          </>
        )}
      </OkShell>
    </>
  );
}

SubscriptionV2.getLayout = (page) => page;
