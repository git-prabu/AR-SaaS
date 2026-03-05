// pages/admin/offers.js
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getAllOffers, createOffer, deleteOffer } from '../../lib/db';
import toast from 'react-hot-toast';

export default function AdminOffers() {
  const { userData }              = useAuth();
  const [offers, setOffers]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState({ title: '', description: '', startDate: '', endDate: '' });
  const [saving, setSaving]       = useState(false);

  const rid = userData?.restaurantId;

  useEffect(() => {
    if (!rid) return;
    getAllOffers(rid).then(o => { setOffers(o); setLoading(false); });
  }, [rid]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rid || !form.title || !form.endDate) return;
    setSaving(true);
    try {
      await createOffer(rid, form);
      toast.success('Offer created!');
      setForm({ title: '', description: '', startDate: '', endDate: '' });
      setShowForm(false);
      const updated = await getAllOffers(rid);
      setOffers(updated);
    } catch {
      toast.error('Failed to create offer');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this offer?')) return;
    await deleteOffer(rid, id);
    setOffers(o => o.filter(x => x.id !== id));
    toast.success('Offer deleted');
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <AdminLayout>
      <Head><title>Offers — Advert Radical</title></Head>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display font-bold text-2xl">Offers & Promotions</h1>
            <p className="text-text-secondary text-sm mt-1">Active offers display as banners on your menu page.</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-5 py-2.5 rounded-xl font-medium text-sm text-white"
            style={{ background: 'linear-gradient(135deg, #FF6B35, #FFB347)' }}
          >
            {showForm ? '✕ Cancel' : '+ New Offer'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="bg-bg-surface border border-brand/20 rounded-2xl p-6 mb-8 space-y-4">
            <h2 className="font-display font-semibold text-lg">Create Offer</h2>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Title *</label>
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Weekend Special — 20% Off"
                required
                className="w-full px-4 py-3 bg-bg-raised border border-bg-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand/50 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Description</label>
              <input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Show this banner to avail the offer at checkout"
                className="w-full px-4 py-3 bg-bg-raised border border-bg-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand/50 transition-all"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Start Date</label>
                <input
                  type="date"
                  value={form.startDate}
                  min={today}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  className="w-full px-4 py-3 bg-bg-raised border border-bg-border rounded-xl text-sm text-text-primary focus:outline-none focus:border-brand/50 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">End Date *</label>
                <input
                  type="date"
                  value={form.endDate}
                  min={form.startDate || today}
                  onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                  required
                  className="w-full px-4 py-3 bg-bg-raised border border-bg-border rounded-xl text-sm text-text-primary focus:outline-none focus:border-brand/50 transition-all"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl font-medium text-sm text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #FF6B35, #FFB347)' }}
            >
              {saving ? 'Saving…' : 'Create Offer'}
            </button>
          </form>
        )}

        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 skeleton" />)}</div>
        ) : offers.length === 0 ? (
          <div className="text-center py-16 text-text-muted">
            <div className="text-4xl mb-3">🎁</div>
            <p>No offers yet. Create one to appear as a banner on your menu.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {offers.map(offer => {
              const isActive = offer.endDate >= today && (!offer.startDate || offer.startDate <= today);
              return (
                <div key={offer.id} className="bg-bg-surface border border-bg-border rounded-2xl p-5 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">🎉</div>
                    <div>
                      <div className="font-medium text-sm">{offer.title}</div>
                      {offer.description && (
                        <div className="text-xs text-text-secondary mt-0.5">{offer.description}</div>
                      )}
                      <div className="text-xs text-text-muted mt-1.5">
                        {offer.startDate && `${offer.startDate} → `}{offer.endDate}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                      isActive
                        ? 'bg-green-400/10 text-green-400 border-green-400/20'
                        : 'bg-bg-raised text-text-muted border-bg-border'
                    }`}>
                      {isActive ? 'Active' : 'Expired'}
                    </span>
                    <button
                      onClick={() => handleDelete(offer.id)}
                      className="text-text-muted hover:text-red-400 transition-colors text-sm"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

AdminOffers.getLayout = (page) => page;
