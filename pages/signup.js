import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { adminAuth } from '../lib/firebase';
import { createRestaurant, createUserDoc, getRestaurantBySubdomain } from '../lib/db';
import toast, { Toaster } from 'react-hot-toast';

const PLAN_MAP = {
  starter: { label: 'Starter', price: '₹999/mo', maxItems: 20, maxStorageMB: 1000 },
  growth:  { label: 'Growth',  price: '₹2,499/mo', maxItems: 60, maxStorageMB: 3000 },
  pro:     { label: 'Pro',     price: '₹4,999/mo', maxItems: 150, maxStorageMB: 10000 },
};

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}

export default function Signup() {
  const router = useRouter();
  const { plan: planKey } = router.query;
  const plan = PLAN_MAP[planKey] || PLAN_MAP.starter;
  const activePlanKey = PLAN_MAP[planKey] ? planKey : 'starter';

  // Form fields
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [subdomainEdited, setSubdomainEdited] = useState(false);
  const [city, setCity] = useState('');

  // State
  const [step, setStep] = useState('form'); // 'form' | 'creating' | 'done'
  const [error, setError] = useState('');
  const [subdomainStatus, setSubdomainStatus] = useState(null); // null | 'checking' | 'available' | 'taken'

  // Auto-generate subdomain from restaurant name
  useEffect(() => {
    if (!subdomainEdited && restaurantName) {
      setSubdomain(slugify(restaurantName));
    }
  }, [restaurantName, subdomainEdited]);

  // Check subdomain availability (debounced)
  useEffect(() => {
    if (!subdomain || subdomain.length < 3) { setSubdomainStatus(null); return; }
    setSubdomainStatus('checking');
    const t = setTimeout(async () => {
      try {
        const existing = await getRestaurantBySubdomain(subdomain);
        setSubdomainStatus(existing ? 'taken' : 'available');
      } catch {
        setSubdomainStatus(null);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [subdomain]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!ownerName.trim()) { setError('Enter your name'); return; }
    if (!email.trim()) { setError('Enter your email'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (!restaurantName.trim()) { setError('Enter your restaurant name'); return; }
    if (!subdomain || subdomain.length < 3) { setError('Subdomain must be at least 3 characters'); return; }
    if (subdomainStatus === 'taken') { setError('This subdomain is already taken'); return; }

    setStep('creating');

    try {
      // 1. Create Firebase Auth account
      const cred = await createUserWithEmailAndPassword(adminAuth, email.trim(), password);
      const uid = cred.user.uid;

      // 2. Create restaurant document
      const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      const ref = await createRestaurant({
        name: restaurantName.trim(),
        subdomain: subdomain.trim().toLowerCase(),
        ownerName: ownerName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        city: city.trim(),
        ownerUid: uid,
        plan: activePlanKey,
        maxItems: plan.maxItems,
        maxStorageMB: plan.maxStorageMB,
        isActive: true,
        paymentStatus: 'trial',
        trialEndsAt: trialEnd,
      });

      // 3. Create user document (links user to restaurant)
      await createUserDoc(uid, {
        role: 'restaurant',
        email: email.trim(),
        name: ownerName.trim(),
        restaurantId: ref.id,
      });

      setStep('done');
      toast.success('Restaurant created!');

      // 4. Redirect to admin dashboard
      setTimeout(() => {
        router.push('/admin');
      }, 1500);
    } catch (err) {
      console.error('Signup error:', err);
      setStep('form');
      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Try signing in instead.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password is too weak. Use at least 6 characters.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Invalid email address.');
      } else {
        setError(err.message || 'Something went wrong. Please try again.');
      }
    }
  };

  const inputStyle = {
    width: '100%', padding: '13px 16px', background: 'rgba(255,255,255,0.06)',
    border: '1.5px solid rgba(255,245,232,0.1)', borderRadius: 12, fontSize: 14,
    color: '#FFF5E8', fontFamily: 'Inter,sans-serif', outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  };
  const labelStyle = {
    display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(255,245,232,0.45)',
    letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6,
  };

  return (
    <>
      <Head>
        <title>Start Your Free Trial | Advert Radical</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Poppins:wght@600;700;800;900&display=swap" rel="stylesheet" />
      </Head>
      <Toaster position="top-center" />

      <div style={{ minHeight: '100vh', background: '#0C0A08', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', fontFamily: 'Inter,sans-serif' }}>
        <div style={{ width: '100%', maxWidth: 480 }}>

          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <Link href="/" style={{ textDecoration: 'none' }}>
              <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 900, fontSize: 22 }}>
                <span style={{ color: '#FFF5E8' }}>Advert </span>
                <span style={{ color: '#F79B3D' }}>Radical</span>
              </span>
            </Link>
          </div>

          {/* Plan Badge */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 20px', borderRadius: 99, background: 'rgba(247,155,61,0.1)', border: '1px solid rgba(247,155,61,0.25)' }}>
              <span style={{ fontSize: 13, color: 'rgba(255,245,232,0.5)' }}>Selected plan:</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#F79B3D' }}>{plan.label} — {plan.price}</span>
            </div>
          </div>

          {/* Creating / Done states */}
          {step === 'creating' && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ width: 48, height: 48, border: '3.5px solid #F79B3D', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 24px' }} />
              <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 18, color: '#FFF5E8', marginBottom: 8 }}>Setting up your restaurant...</div>
              <div style={{ fontSize: 13, color: 'rgba(255,245,232,0.4)' }}>This will just take a moment</div>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          )}

          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
              <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 22, color: '#FFF5E8', marginBottom: 8 }}>You're all set!</div>
              <div style={{ fontSize: 14, color: 'rgba(255,245,232,0.5)', marginBottom: 8 }}>Your 14-day free trial has started.</div>
              <div style={{ fontSize: 13, color: 'rgba(255,245,232,0.35)' }}>Redirecting to your dashboard...</div>
            </div>
          )}

          {/* Form */}
          {step === 'form' && (
            <form onSubmit={handleSubmit}>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,245,232,0.07)', borderRadius: 20, padding: '28px 24px' }}>

                <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 20, color: '#FFF5E8', marginBottom: 4, textAlign: 'center' }}>Start your free trial</div>
                <div style={{ fontSize: 13, color: 'rgba(255,245,232,0.4)', textAlign: 'center', marginBottom: 24 }}>14 days free. No credit card required.</div>

                {error && (
                  <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(224,90,58,0.12)', border: '1px solid rgba(224,90,58,0.3)', color: '#E05A3A', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
                    {error}
                  </div>
                )}

                {/* Owner Name */}
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Your Name</label>
                  <input value={ownerName} onChange={e => setOwnerName(e.target.value)}
                    placeholder="e.g. Prabu" style={inputStyle} required />
                </div>

                {/* Email */}
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com" style={inputStyle} required />
                </div>

                {/* Password */}
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Min. 6 characters" style={inputStyle} required minLength={6} />
                </div>

                {/* Phone */}
                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>Phone <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="e.g. 9876543210" style={inputStyle} />
                </div>

                <div style={{ height: 1, background: 'rgba(255,245,232,0.07)', margin: '0 -24px 20px' }} />

                {/* Restaurant Name */}
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Restaurant Name</label>
                  <input value={restaurantName} onChange={e => setRestaurantName(e.target.value)}
                    placeholder="e.g. The Spot" style={inputStyle} required />
                </div>

                {/* Subdomain */}
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Your Menu URL</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 0, background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,245,232,0.1)', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ padding: '13px 0 13px 14px', fontSize: 13, color: 'rgba(255,245,232,0.3)', whiteSpace: 'nowrap', flexShrink: 0 }}>advertradical.com/restaurant/</div>
                    <input
                      value={subdomain}
                      onChange={e => { setSubdomain(slugify(e.target.value)); setSubdomainEdited(true); }}
                      placeholder="your-restaurant"
                      style={{ ...inputStyle, border: 'none', background: 'transparent', borderRadius: 0, padding: '13px 14px 13px 0' }}
                      required minLength={3} maxLength={30}
                    />
                  </div>
                  {subdomainStatus === 'checking' && <div style={{ fontSize: 11, color: 'rgba(255,245,232,0.35)', marginTop: 4 }}>Checking availability...</div>}
                  {subdomainStatus === 'available' && <div style={{ fontSize: 11, color: '#2D8B4E', fontWeight: 600, marginTop: 4 }}>✓ Available</div>}
                  {subdomainStatus === 'taken' && <div style={{ fontSize: 11, color: '#E05A3A', fontWeight: 600, marginTop: 4 }}>✗ Already taken — try another</div>}
                </div>

                {/* City */}
                <div style={{ marginBottom: 24 }}>
                  <label style={labelStyle}>City <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
                  <input value={city} onChange={e => setCity(e.target.value)}
                    placeholder="e.g. Chennai" style={inputStyle} />
                </div>

                {/* Submit */}
                <button type="submit" disabled={subdomainStatus === 'taken' || subdomainStatus === 'checking'}
                  style={{
                    width: '100%', padding: '16px', borderRadius: 14, border: 'none', cursor: 'pointer',
                    background: 'linear-gradient(135deg,#E05A3A,#F79B3D)', color: '#fff',
                    fontSize: 16, fontWeight: 700, fontFamily: 'Poppins,sans-serif',
                    boxShadow: '0 6px 24px rgba(224,90,58,0.4)',
                    opacity: (subdomainStatus === 'taken' || subdomainStatus === 'checking') ? 0.5 : 1,
                    transition: 'opacity 0.2s',
                  }}>
                  Start 14-Day Free Trial →
                </button>
              </div>

              {/* Sign in link */}
              <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'rgba(255,245,232,0.35)' }}>
                Already have an account?{' '}
                <Link href="/admin/login" style={{ color: '#F79B3D', fontWeight: 600, textDecoration: 'none' }}>Sign in</Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
