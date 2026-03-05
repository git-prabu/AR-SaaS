// pages/admin/login.js
import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import { getUserData } from '../../lib/db';
import toast from 'react-hot-toast';

export default function AdminLogin() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const { signIn, signOut }     = useAuth();
  const router                  = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      const cred = await signIn(email, password);
      // Check role
      const userData = await getUserData(cred.user.uid);

      if (!userData || userData.role !== 'restaurant') {
        // Wrong role — sign them out immediately
        await signOut();
        toast.error('Access denied. This portal is for restaurant accounts only.');
        setLoading(false);
        return;
      }

      toast.success('Welcome back!');
      router.push('/admin');
    } catch (err) {
      const msg = err.code === 'auth/invalid-credential'
        ? 'Invalid email or password.'
        : 'Login failed. Please try again.';
      toast.error(msg);
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Restaurant Login — Advert Radical</title>
      </Head>
      <div className="min-h-screen bg-bg-base font-body flex items-center justify-center px-4 relative">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-brand/8 blur-3xl pointer-events-none" />

        <div className="relative w-full max-w-sm">
          <div className="text-center mb-8">
            <Link href="/" className="font-display font-bold text-2xl">
              Advert <span className="gradient-text">Radical</span>
            </Link>
            <p className="text-text-secondary text-sm mt-2">Restaurant Admin Portal</p>
          </div>

          <div className="bg-bg-surface border border-bg-border rounded-2xl p-8">
            <h1 className="font-display font-bold text-xl mb-6">Sign in</h1>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@restaurant.com"
                  required
                  className="w-full px-4 py-3 bg-bg-raised border border-bg-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/20 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-3 bg-bg-raised border border-bg-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/20 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: loading ? '#555' : 'linear-gradient(135deg, #FF6B35, #FFB347)' }}
              >
                {loading ? 'Signing in…' : 'Sign in →'}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-text-muted mt-6">
            Not a restaurant yet?{' '}
            <Link href="/#plans" className="text-brand hover:underline">
              Get started
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
