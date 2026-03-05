// pages/superadmin/restaurants.js
import Head from 'next/head';
import { useEffect, useState } from 'react';
import SuperAdminLayout from '../../components/layout/SuperAdminLayout';
import { getAllRestaurants, createRestaurant, updateRestaurant } from '../../lib/db';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import toast from 'react-hot-toast';

const BLANK = { name: '', subdomain: '', email: '', password: '' };

export default function SuperAdminRestaurants() {
  const [restaurants, setRestaurants] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [form,        setForm]        = useState(BLANK);
  const [saving,      setSaving]      = useState(false);
  const [search,      setSearch]      = useState('');

  const load = () => {
    getAllRestaurants().then(r => { setRestaurants(r); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name || !form.subdomain || !form.email || !form.password) {
      toast.error('All fields required'); return;
    }

    // Validate subdomain format
    if (!/^[a-z0-9-]+$/.test(form.subdomain)) {
      toast.error('Subdomain: lowercase letters, numbers, hyphens only');
      return;
    }

    setSaving(true);
    try {
      // Create Firebase Auth user for restaurant admin
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      const uid  = cred.user.uid;

      // Create restaurant doc
      const restaurantRef = await createRestaurant({
        name:      form.name,
        subdomain: form.subdomain.toLowerCase(),
        isActive:  true,
      });

      // Create user doc linked to restaurant
      await setDoc(doc(db, 'users', uid), {
        email:          form.email,
        role:           'restaurant',
        restaurantId:   restaurantRef.id,
        restaurantName: form.name,
        createdAt:      serverTimestamp(),
      });

      toast.success(`${form.name} created! Login: ${form.email}`);
      setForm(BLANK);
      setShowForm(false);
      load();
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        toast.error('Email already in use');
      } else {
        toast.error('Failed: ' + err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (r) => {
    await updateRestaurant(r.id, { isActive: !r.isActive });
    toast.success(`${r.name} ${r.isActive ? 'deactivated' : 'activated'}`);
    load();
  };

  const filtered = restaurants.filter(r =>
    r.name?.toLowerCase().includes(search.toLowerCase()) ||
    r.subdomain?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SuperAdminLayout>
      <Head><title>Restaurants — Super Admin</title></Head>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display font-bold text-2xl">Restaurants</h1>
            <p className="text-text-secondary text-sm mt-1">{restaurants.length} total</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-5 py-2.5 rounded-xl font-medium text-sm text-white"
            style={{ background: 'linear-gradient(135deg, #FF6B35, #FFB347)' }}
          >
            {showForm ? '✕ Cancel' : '+ Add Restaurant'}
          </button>
        </div>

        {/* Create form */}
        {showForm && (
          <form onSubmit={handleCreate} className="bg-bg-surface border border-brand/20 rounded-2xl p-6 mb-8 space-y-4">
            <h2 className="font-display font-semibold text-lg">Create Restaurant Account</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <FormField label="Restaurant Name *">
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Spot Restaurant"
                  required
                  className="input-style"
                />
              </FormField>
              <FormField label="Subdomain *" hint="e.g. 'spot' → spot.advertradical.com">
                <input
                  value={form.subdomain}
                  onChange={e => setForm(f => ({ ...f, subdomain: e.target.value.toLowerCase() }))}
                  placeholder="spot"
                  required
                  pattern="[a-z0-9-]+"
                  className="input-style"
                />
              </FormField>
              <FormField label="Admin Email *">
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="admin@spot.com"
                  required
                  className="input-style"
                />
              </FormField>
              <FormField label="Temporary Password *">
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Min 8 characters"
                  minLength={8}
                  required
                  className="input-style"
                />
              </FormField>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl font-medium text-sm text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #FF6B35, #FFB347)' }}
            >
              {saving ? 'Creating…' : 'Create Restaurant'}
            </button>
          </form>
        )}

        {/* Search */}
        <div className="mb-5">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or subdomain…"
            className="w-full max-w-sm px-4 py-2.5 bg-bg-surface border border-bg-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand/50 transition-all"
          />
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-16 skeleton" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-text-muted">
            <div className="text-4xl mb-3">🏪</div>
            <p>No restaurants found.</p>
          </div>
        ) : (
          <div className="bg-bg-surface border border-bg-border rounded-2xl overflow-hidden">
            <div className="grid grid-cols-5 gap-4 px-5 py-3 border-b border-bg-border text-xs font-medium text-text-muted uppercase tracking-wider">
              <span className="col-span-2">Restaurant</span>
              <span>Plan</span>
              <span>Items</span>
              <span>Status</span>
            </div>
            {filtered.map(r => (
              <div
                key={r.id}
                className="grid grid-cols-5 gap-4 px-5 py-4 border-b border-bg-border last:border-0 items-center hover:bg-bg-raised/50 transition-colors"
              >
                <div className="col-span-2 min-w-0">
                  <div className="font-medium text-sm truncate">{r.name}</div>
                  <div className="text-xs text-text-muted truncate">{r.subdomain}.advertradical.com</div>
                </div>
                <div>
                  <span className="text-xs text-text-secondary capitalize px-2 py-1 rounded-lg bg-bg-raised border border-bg-border">
                    {r.plan || 'basic'}
                  </span>
                </div>
                <div className="text-sm text-text-secondary">
                  {r.itemsUsed || 0} / {r.maxItems || 10}
                </div>
                <div>
                  <button
                    onClick={() => toggleActive(r)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                      r.isActive
                        ? 'bg-green-400/10 text-green-400 border-green-400/20 hover:bg-red-400/10 hover:text-red-400 hover:border-red-400/20'
                        : 'bg-red-400/10 text-red-400 border-red-400/20 hover:bg-green-400/10 hover:text-green-400 hover:border-green-400/20'
                    }`}
                  >
                    {r.isActive ? 'Active' : 'Inactive'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .input-style {
          width: 100%;
          padding: 10px 14px;
          background: #18181D;
          border: 1px solid #27272E;
          border-radius: 10px;
          color: #F2F2EE;
          font-size: 14px;
          font-family: 'DM Sans', sans-serif;
          outline: none;
          transition: border-color 0.2s;
        }
        .input-style:focus { border-color: rgba(255,107,53,0.5); }
        .input-style::placeholder { color: #55555F; }
      `}</style>
    </SuperAdminLayout>
  );
}

SuperAdminRestaurants.getLayout = (page) => page;

function FormField({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1">{label}</label>
      {children}
      {hint && <div className="text-xs text-text-muted mt-1">{hint}</div>}
    </div>
  );
}
