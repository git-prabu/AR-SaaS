// pages/superadmin/login.js
import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import { getUserData } from '../../lib/db';
import toast from 'react-hot-toast';

export default function SuperAdminLogin() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const { signIn, signOut }     = useAuth();
  const router                  = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const cred = await signIn(email, password);
      // Check role
      const userData = await getUserData(cred.user.uid);

      if (!userData || userData.role !== 'superadmin') {
        // Wrong role — sign them out immediately
        await signOut();
        toast.error('Access denied. This portal is for Super Admins only.');
        setLoading(false);
        return;
      }

      toast.success('Welcome, Admin!');
      router.push('/superadmin');
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
      <Head><title>Super Admin Login — Advert Radical</title></Head>
      <div className="min-h-screen bg-bg-base font-body flex items-center justify-center px-4 relative">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-brand/6 blur-3xl pointer-events-none" />

        <div className="relative w-full max-w-sm">
          <div className="text-center mb-8">
            <Link href="/" className="font-display font-bold text-2xl">
              Advert <span className="gradient-text">Radical</span>
            </Link>
            <p className="text-brand text-xs mt-1 font-medium uppercase tracking-wider">Super Admin Portal</p>
          </div>

          <div className="bg-bg-surface border border-brand/20 rounded-2xl p-8">
            <h1 className="font-display font-bold text-xl mb-6">Admin Sign In</h1>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Email</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  placeholder="admin@advertradical.com"
                  className="w-full px-4 py-3 bg-bg-raised border border-bg-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand/50 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Password</label>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)} required
                  placeholder="••••••••"
                  className="w-full px-4 py-3 bg-bg-raised border border-bg-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand/50 transition-all"
                />
              </div>
              <button
                type="submit" disabled={loading}
                className="w-full py-3 rounded-xl font-semibold text-white disabled:opacity-50"
                style={{ background: loading ? '#555' : 'linear-gradient(135deg, #FF6B35, #FFB347)' }}
              >
                {loading ? 'Signing in…' : 'Sign in →'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
