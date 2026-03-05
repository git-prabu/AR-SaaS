// pages/index.js — Advert Radical marketing homepage
import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';

const plans = [
  {
    name: 'Basic',
    price: '₹999',
    per: '/ 6 months',
    items: 10,
    storage: '500MB',
    tag: null,
  },
  {
    name: 'Pro',
    price: '₹2,499',
    per: '/ 6 months',
    items: 40,
    storage: '2GB',
    tag: 'Popular',
  },
  {
    name: 'Premium',
    price: '₹4,999',
    per: '/ 6 months',
    items: 100,
    storage: '5GB',
    tag: 'Unlimited',
  },
];

const features = [
  {
    icon: '🥗',
    title: 'AR Menu Viewing',
    desc: 'Customers scan your QR code and see menu items float in real space with full 3D models.',
  },
  {
    icon: '📊',
    title: 'Analytics Dashboard',
    desc: 'Track visits, item views, repeat customers, and AR interactions in real time.',
  },
  {
    icon: '🔗',
    title: 'Your Own Subdomain',
    desc: 'Every restaurant gets a dedicated URL — spot.advertradical.com — professional and shareable.',
  },
  {
    icon: '📱',
    title: 'No App Required',
    desc: 'Powered by WebAR. Customers just scan — no downloads, no friction.',
  },
  {
    icon: '🔔',
    title: 'Offers & Promotions',
    desc: 'Push limited-time offers that appear as banners on your live menu page.',
  },
  {
    icon: '🔒',
    title: 'Secure & Scalable',
    desc: 'Firebase-backed infrastructure with plan enforcement, storage limits, and payment protection.',
  },
];

export default function HomePage() {
  const [email, setEmail] = useState('');

  return (
    <>
      <Head>
        <title>Advert Radical — AR Menus for Restaurants</title>
        <meta name="description" content="Give your restaurant an AR-powered menu. Customers scan, see food in 3D, and order with confidence." />
      </Head>

      <div className="min-h-screen bg-bg-base text-text-primary font-body overflow-x-hidden">
        {/* NAV */}
        <nav className="fixed top-0 left-0 right-0 z-50 border-b border-bg-border bg-bg-base/80 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
            <span className="font-display font-800 text-xl tracking-tight">
              Advert <span className="gradient-text">Radical</span>
            </span>
            <div className="hidden md:flex items-center gap-8 text-sm text-text-secondary">
              <a href="#features" className="hover:text-text-primary transition-colors">Features</a>
              <a href="#plans" className="hover:text-text-primary transition-colors">Plans</a>
              <Link href="/admin/login" className="hover:text-text-primary transition-colors">
                Restaurant Login
              </Link>
              <Link
                href="/superadmin/login"
                className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-light transition-colors"
              >
                Admin
              </Link>
            </div>
          </div>
        </nav>

        {/* HERO */}
        <section className="pt-40 pb-24 px-6 text-center relative">
          {/* Glow blob */}
          <div className="absolute top-32 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-brand/10 blur-3xl pointer-events-none" />

          <div className="relative max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand/30 bg-brand/10 text-brand text-xs font-medium mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
              WebAR Menu Platform for Restaurants
            </div>

            <h1 className="font-display text-5xl md:text-7xl font-bold leading-none tracking-tight mb-6">
              Your menu,{' '}
              <span className="gradient-text">alive in 3D</span>
            </h1>

            <p className="text-text-secondary text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
              Give every dish a story. Customers scan your QR code, point their phone at the table,
              and watch food materialize in augmented reality — with nutrients and ingredients on display.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/admin/login"
                className="px-8 py-4 bg-brand text-white font-semibold rounded-xl hover:bg-brand-light transition-all ar-pulse shadow-brand-glow"
              >
                Get Your Restaurant Online →
              </Link>
              <a
                href="#features"
                className="px-8 py-4 bg-bg-raised border border-bg-border text-text-primary font-medium rounded-xl hover:border-brand/40 transition-all"
              >
                See How It Works
              </a>
            </div>
          </div>
        </section>

        {/* DEMO PREVIEW */}
        <section className="px-6 pb-24">
          <div className="max-w-4xl mx-auto bg-bg-surface rounded-2xl border border-bg-border overflow-hidden shadow-card">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-bg-border">
              <div className="flex gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-500/60" />
                <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <span className="w-3 h-3 rounded-full bg-green-500/60" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="px-4 py-1 bg-bg-raised rounded-md text-xs text-text-muted font-mono">
                  spot.advertradical.com
                </div>
              </div>
            </div>
            {/* Mock menu preview */}
            <div className="p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-brand/20 flex items-center justify-center text-2xl">🍜</div>
                <div>
                  <div className="font-display font-bold text-xl">Spot Restaurant</div>
                  <div className="text-text-secondary text-sm">Bengaluru, Karnataka</div>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {['Butter Chicken', 'Biryani', 'Paneer Tikka', 'Dal Makhani', 'Gulab Jamun', 'Lassi'].map((item, i) => (
                  <div key={item} className="bg-bg-raised rounded-xl p-3 border border-bg-border card-lift cursor-pointer">
                    <div className="w-full h-20 rounded-lg bg-gradient-to-br from-brand/20 to-brand-amber/10 mb-2 flex items-center justify-center text-2xl">
                      {['🍗', '🍛', '🧀', '🥘', '🍬', '🥛'][i]}
                    </div>
                    <div className="text-sm font-medium truncate">{item}</div>
                    <div className="text-xs text-brand mt-1">View in AR →</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="px-6 pb-24">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="font-display text-3xl md:text-5xl font-bold mb-4">
                Everything your restaurant needs
              </h2>
              <p className="text-text-secondary text-lg">One platform. Full AR experience.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {features.map((f) => (
                <div
                  key={f.title}
                  className="p-6 bg-bg-surface rounded-2xl border border-bg-border hover:border-brand/30 transition-all card-lift"
                >
                  <div className="text-3xl mb-4">{f.icon}</div>
                  <h3 className="font-display font-semibold text-lg mb-2">{f.title}</h3>
                  <p className="text-text-secondary text-sm leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PLANS */}
        <section id="plans" className="px-6 pb-24">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="font-display text-3xl md:text-5xl font-bold mb-4">Simple pricing</h2>
              <p className="text-text-secondary text-lg">6-month subscriptions. Cancel anytime.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {plans.map((p) => (
                <div
                  key={p.name}
                  className={`relative p-6 rounded-2xl border transition-all ${
                    p.tag === 'Popular'
                      ? 'border-brand bg-brand/5 shadow-brand-glow'
                      : 'border-bg-border bg-bg-surface'
                  }`}
                >
                  {p.tag && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-brand text-white text-xs font-semibold rounded-full">
                      {p.tag}
                    </div>
                  )}
                  <div className="font-display font-bold text-lg mb-1">{p.name}</div>
                  <div className="flex items-end gap-1 mb-4">
                    <span className="text-3xl font-display font-bold">{p.price}</span>
                    <span className="text-text-muted text-sm mb-1">{p.per}</span>
                  </div>
                  <ul className="space-y-2 mb-6 text-sm text-text-secondary">
                    <li className="flex items-center gap-2">
                      <span className="text-brand">✓</span> {p.items} AR menu items
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-brand">✓</span> {p.storage} storage
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-brand">✓</span> Analytics dashboard
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-brand">✓</span> QR code generator
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-brand">✓</span> Subdomain included
                    </li>
                  </ul>
                  <button className={`w-full py-3 rounded-xl font-medium text-sm transition-all ${
                    p.tag === 'Popular'
                      ? 'bg-brand text-white hover:bg-brand-light'
                      : 'bg-bg-raised border border-bg-border hover:border-brand/40 text-text-primary'
                  }`}>
                    Get Started
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="border-t border-bg-border px-6 py-10">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-text-muted text-sm">
            <span className="font-display font-bold text-text-secondary">
              Advert <span className="gradient-text">Radical</span>
            </span>
            <span>© {new Date().getFullYear()} Advert Radical. All rights reserved.</span>
            <div className="flex gap-6">
              <a href="#" className="hover:text-text-secondary transition-colors">Privacy</a>
              <a href="#" className="hover:text-text-secondary transition-colors">Terms</a>
              <Link href="/admin/login" className="hover:text-text-secondary transition-colors">Login</Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
