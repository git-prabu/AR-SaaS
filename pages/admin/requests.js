// pages/admin/requests.js
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getRequests, submitRequest } from '../../lib/db';
import { uploadFile, buildImagePath, fileSizeMB } from '../../lib/storage';
import toast from 'react-hot-toast';

const BLANK = {
  name: '', description: '', category: '',
  ingredients: '', calories: '', protein: '', carbs: '', fats: '',
};

export default function AdminRequests() {
  const { userData }          = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(BLANK);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [submitting, setSubmitting]     = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [filter, setFilter] = useState('all');

  const rid = userData?.restaurantId;

  useEffect(() => {
    if (!rid) return;
    getRequests(rid).then(r => { setRequests(r); setLoading(false); });
  }, [rid]);

  const handleImageChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (fileSizeMB(f) > 5) { toast.error('Image must be under 5MB'); return; }
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rid) return;
    if (!form.name.trim()) { toast.error('Item name is required'); return; }

    setSubmitting(true);
    try {
      let imageURL = null;
      if (imageFile) {
        const path = buildImagePath(rid, imageFile.name);
        imageURL   = await uploadFile(imageFile, path, setUploadProgress);
      }

      const ingredients = form.ingredients
        ? form.ingredients.split(',').map(s => s.trim()).filter(Boolean)
        : [];

      await submitRequest(rid, {
        name:        form.name.trim(),
        description: form.description.trim(),
        category:    form.category.trim(),
        ingredients,
        nutritionalData: {
          calories: Number(form.calories) || null,
          protein:  Number(form.protein)  || null,
          carbs:    Number(form.carbs)    || null,
          fats:     Number(form.fats)     || null,
        },
        imageURL,
      });

      toast.success("Request submitted! We'll review it shortly.");
      setForm(BLANK);
      setImageFile(null);
      setImagePreview(null);
      setShowForm(false);
      // Refresh
      const updated = await getRequests(rid);
      setRequests(updated);
    } catch (err) {
      toast.error('Failed to submit request. Try again.');
      console.error(err);
    } finally {
      setSubmitting(false);
      setUploadProgress(0);
    }
  };

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);

  return (
    <AdminLayout>
      <Head><title>Requests — Advert Radical</title></Head>
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display font-bold text-2xl">Menu Requests</h1>
            <p className="text-text-secondary text-sm mt-1">
              Submit items for AR listing. Our team will 3D-scan and publish them.
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-5 py-2.5 rounded-xl font-medium text-sm text-white transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #FF6B35, #FFB347)' }}
          >
            {showForm ? '✕ Cancel' : '+ New Request'}
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-bg-surface border border-brand/20 rounded-2xl p-6 mb-8">
            <h2 className="font-display font-semibold text-lg mb-5">New Item Request</h2>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Item Name *" required>
                  <input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Butter Chicken"
                    required
                    className="input-field"
                  />
                </Field>
                <Field label="Category">
                  <input
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    placeholder="e.g. Main Course"
                    className="input-field"
                  />
                </Field>
              </div>

              <Field label="Description">
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description of the dish…"
                  rows={2}
                  className="input-field resize-none"
                />
              </Field>

              <Field label="Ingredients (comma-separated)">
                <input
                  value={form.ingredients}
                  onChange={e => setForm(f => ({ ...f, ingredients: e.target.value }))}
                  placeholder="Chicken, Butter, Cream, Tomato, Spices"
                  className="input-field"
                />
              </Field>

              <div className="grid grid-cols-4 gap-3">
                {['calories', 'protein', 'carbs', 'fats'].map(n => (
                  <Field key={n} label={n.charAt(0).toUpperCase() + n.slice(1)}>
                    <input
                      type="number"
                      value={form[n]}
                      onChange={e => setForm(f => ({ ...f, [n]: e.target.value }))}
                      placeholder="0"
                      min="0"
                      className="input-field"
                    />
                  </Field>
                ))}
              </div>

              <Field label="Food Photo">
                <div
                  onClick={() => document.getElementById('img-upload').click()}
                  className="border-2 border-dashed border-bg-border rounded-xl p-6 text-center cursor-pointer hover:border-brand/40 transition-all"
                >
                  {imagePreview ? (
                    <img src={imagePreview} alt="Preview" className="max-h-32 mx-auto rounded-lg object-cover" />
                  ) : (
                    <>
                      <div className="text-3xl mb-2">📷</div>
                      <div className="text-sm text-text-secondary">Click to upload image (max 5MB)</div>
                    </>
                  )}
                  <input id="img-upload" type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                </div>
              </Field>

              {uploadProgress > 0 && uploadProgress < 100 && (
                <div className="w-full h-1.5 bg-bg-raised rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${uploadProgress}%`, background: 'linear-gradient(90deg, #FF6B35, #FFB347)' }}
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-xl font-semibold text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #FF6B35, #FFB347)' }}
              >
                {submitting ? 'Submitting…' : 'Submit Request'}
              </button>
            </form>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-2 mb-5">
          {['all', 'pending', 'approved', 'rejected'].map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                filter === s
                  ? 'bg-brand text-white'
                  : 'bg-bg-surface border border-bg-border text-text-secondary hover:text-text-primary'
              }`}
            >
              {s} {s === 'all' ? `(${requests.length})` : `(${requests.filter(r => r.status === s).length})`}
            </button>
          ))}
        </div>

        {/* Requests list */}
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-20 skeleton" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-text-muted">
            <div className="text-4xl mb-3">📭</div>
            <p>No requests yet. Add your first menu item above!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(req => (
              <div key={req.id} className="bg-bg-surface border border-bg-border rounded-2xl p-4 flex items-start gap-4">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-bg-raised flex-shrink-0">
                  {req.imageURL
                    ? <img src={req.imageURL} alt={req.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-xl">🍽️</div>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm">{req.name}</div>
                      {req.category && (
                        <div className="text-xs text-text-muted mt-0.5">{req.category}</div>
                      )}
                    </div>
                    <StatusBadge status={req.status} />
                  </div>
                  {req.description && (
                    <p className="text-xs text-text-secondary mt-1 line-clamp-2">{req.description}</p>
                  )}
                  <div className="text-xs text-text-muted mt-1.5">
                    Submitted {req.createdAt?.seconds
                      ? new Date(req.createdAt.seconds * 1000).toLocaleDateString()
                      : 'recently'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .input-field {
          width: 100%;
          padding: 10px 14px;
          background: #18181D;
          border: 1px solid #27272E;
          border-radius: 10px;
          color: #F2F2EE;
          font-size: 14px;
          font-family: 'DM Sans', sans-serif;
          transition: border-color 0.2s;
          outline: none;
        }
        .input-field:focus {
          border-color: rgba(255,107,53,0.5);
          box-shadow: 0 0 0 3px rgba(255,107,53,0.08);
        }
        .input-field::placeholder { color: #55555F; }
      `}</style>
    </AdminLayout>
  );
}

AdminRequests.getLayout = (page) => page;

function Field({ label, children, required }) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1.5">
        {label}{required && <span className="text-brand ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    pending:  'bg-yellow-400/10 text-yellow-400 border-yellow-400/20',
    approved: 'bg-green-400/10  text-green-400  border-green-400/20',
    rejected: 'bg-red-400/10    text-red-400    border-red-400/20',
  };
  return (
    <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles.pending} capitalize`}>
      {status}
    </span>
  );
}
